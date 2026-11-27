// Smoke transport engine: wind-grid trajectories, fire-to-city linking, attribution and forecast correction.
const { km, nearestDistrict, stateOf, isHome } = require('./places');
const { aqiSeries, category } = require('./aqi');

const HOUR = 3600e3;
// 10 m wind under-reads the speed at which smoke moves inside the mixed layer; scale it up a little
const TRANSPORT_FACTOR = 1.3;
const REACH_KM = 30;      // a trajectory passing this close counts as reaching the city
const SMOKE_LIFE_H = 8;   // e-folding time of a fire's effect after its smoke arrives
const AQI_PER_FRP = 0.45; // AQI points per MW of fire power at zero distance (screening-level constant)
const DENSITY_FRP = { low: 8, medium: 18, high: 30 }; // fire-power equivalent for citizen photo reports

function windAt(g, lat, lon, t) {
  const fi = (arr, x) => {
    const c = Math.max(arr[0], Math.min(arr[arr.length - 1], x));
    let i = 0; while (i < arr.length - 2 && arr[i + 1] < c) i++;
    return [i, (c - arr[i]) / (arr[i + 1] - arr[i])];
  };
  const [i, fy] = fi(g.lats, lat), [j, fx] = fi(g.lons, lon);
  let k = 0; const tc = Math.max(g.times[0], Math.min(g.times[g.times.length - 1], t));
  while (k < g.times.length - 2 && g.times[k + 1] <= tc) k++;
  const ft = (tc - g.times[k]) / (g.times[k + 1] - g.times[k] || 1);
  const bil = (F, kk) => {
    const a = F[kk][i][j] * (1 - fx) + F[kk][i][j + 1] * fx;
    const b = F[kk][i + 1][j] * (1 - fx) + F[kk][i + 1][j + 1] * fx;
    return a * (1 - fy) + b * fy;
  };
  const u = bil(g.u, k) * (1 - ft) + bil(g.u, k + 1) * ft;
  const v = bil(g.v, k) * (1 - ft) + bil(g.v, k + 1) * ft;
  return { u, v };
}

// Follow an air parcel hour by hour. dir = -1 traces back where the air came from; +1 follows smoke forward.
function trajectory(g, lat, lon, t0, hours, dir) {
  const pts = [{ lat, lon, t: t0, k: 0 }];
  let p = { lat, lon }, t = t0;
  for (let k = 1; k <= hours; k++) {
    // midpoint (RK2) step for a smoother path
    const w1 = windAt(g, p.lat, p.lon, t);
    const half = move(p, w1, dir * 0.5);
    const w2 = windAt(g, half.lat, half.lon, t + dir * HOUR / 2);
    p = move(p, w2, dir);
    t += dir * HOUR;
    pts.push({ lat: p.lat, lon: p.lon, t, k });
  }
  return pts;
}
function move(p, w, hrs) {
  const dNorth = w.v * TRANSPORT_FACTOR * hrs, dEast = w.u * TRANSPORT_FACTOR * hrs;
  return { lat: p.lat + dNorth / 111.2, lon: p.lon + dEast / (111.2 * Math.cos(p.lat * Math.PI / 180)) };
}

// Forward smoke paths are the expensive part. Each source's path depends only on the wind grid, so
// compute it once per grid and reuse it for every city and every request.
const pathCache = new WeakMap();
function forwardPath(grid, lat, lon, ts) {
  let m = pathCache.get(grid);
  if (!m) { m = new Map(); pathCache.set(grid, m); }
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${ts}`;
  let p = m.get(key);
  if (!p) { p = trajectory(grid, lat, lon, ts, 36, +1); m.set(key, p); }
  return p;
}

// Satellite detections that sit in the same ~5 km cell in the same hour are one fire front:
// merge them (fire power adds up) so thousands of pixels become a few hundred smoke sources.
function clusterFires(fires) {
  const cells = new Map();
  for (const f of fires) {
    const key = `${Math.round(f.lat * 20)},${Math.round(f.lon * 20)},${Math.floor(f.ts / HOUR)}`;
    const c = cells.get(key);
    if (c) { c.latSum += f.lat * f.frp; c.lonSum += f.lon * f.frp; c.frp += f.frp; c.n++; c.ts = Math.min(c.ts, f.ts); }
    else cells.set(key, { latSum: f.lat * f.frp, lonSum: f.lon * f.frp, frp: f.frp, n: 1, ts: f.ts });
  }
  return [...cells.values()].map((c) => ({ kind: 'satellite', lat: c.latSum / c.frp, lon: c.lonSum / c.frp, ts: c.ts, frp: c.frp, n: c.n }));
}

// Wind ensemble for the forecast range: each member turns the whole wind field by a few degrees and
// scales its speed, a simple stand-in for wind-forecast error. Members are built once per wind grid.
const ENSEMBLE = [[0, 1], [-15, 1], [15, 1], [0, 0.8], [0, 1.2], [-10, 0.85], [10, 0.85], [-10, 1.15], [10, 1.15], [-20, 1], [20, 1]];
const memberCache = new WeakMap();
function ensembleGrids(grid) {
  let m = memberCache.get(grid);
  if (m) return m;
  m = ENSEMBLE.map(([deg, scale]) => {
    if (deg === 0 && scale === 1) return grid;
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    const turn = (U, V) => U.map((plane, k) => plane.map((row, i) => row.map((u, j) => scale * (u * c + V[k][i][j] * s))));
    const turnV = (U, V) => V.map((plane, k) => plane.map((row, i) => row.map((v, j) => scale * (-U[k][i][j] * s + v * c))));
    return { lats: grid.lats, lons: grid.lons, times: grid.times, u: turn(grid.u, grid.v), v: turnV(grid.u, grid.v) };
  });
  memberCache.set(grid, m);
  return m;
}

const quantile = (arr, q) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

// Default spread of CAMS error (observed / CAMS − 1) by lead time, used until the forecast ledger has enough
// scored forecasts to replace it. Wide on purpose: CAMS PM over India is known to be uncertain.
function defaultCamsError(leadH) {
  const widen = Math.min(0.2, Math.max(0, leadH) * 0.005);
  return { q10: -0.3 - widen, q90: 0.35 + widen, source: 'default' };
}

function closestApproach(path, target) {
  let best = { d: Infinity };
  for (const q of path) { const d = km(q, target); if (d < best.d) best = { d, t: q.t, k: q.k }; }
  return best;
}

// Main analysis for a place
function analyse({ place, fires, reports, grid, air, stations, now, camsError = defaultCamsError }) {
  const nowH = Math.floor(now / HOUR) * HOUR;
  const back = trajectory(grid, place.lat, place.lon, nowH, 36, -1);

  // Every fire (satellite) and every citizen report becomes a smoke source
  const sources = [
    ...clusterFires(fires.filter((f) => f.ts >= now - 48 * HOUR && f.ts <= now && f.frp > 0)),
    // A citizen report counts in proportion to its trust score; reports below the cut-off are left out entirely
    ...reports.filter((r) => r.analysis && r.analysis.is_pollution_event && r.ts >= now - 48 * HOUR && r.ts <= now && !(r.trust && r.trust.used_in_forecast === false))
      .map((r) => ({ kind: 'citizen', lat: r.lat, lon: r.lon, ts: r.ts, frp: (DENSITY_FRP[r.analysis.smoke_density] || 15) * (r.trust ? r.trust.score : r.analysis.unverified ? 0.5 : 1), n: 1, id: r.id })),
  ];

  const links = [];
  for (const s of sources) {
    if (km(s, place) > 450) continue; // too far to matter within 36 h
    const path = forwardPath(grid, s.lat, s.lon, s.ts);
    const ca = closestApproach(path, place);
    if (ca.d > REACH_KM) continue;
    const w = s.frp * Math.exp(-Math.pow(ca.d / 15, 2));
    const d = nearestDistrict(s), st = stateOf(s);
    links.push({ ...s, district: d.name, district_hi: d.hi, state: st.state, state_hi: st.state_hi, arrival: ca.t, travel_h: ca.k, miss_km: +ca.d.toFixed(1), weight: w,
      path: path.slice(0, ca.k + 1).map((q) => [+q.lat.toFixed(3), +q.lon.toFixed(3)]) });
  }

  const effect = (l, t) => (t < l.arrival ? 0 : l.weight * AQI_PER_FRP * Math.exp(-(t - l.arrival) / (SMOKE_LIFE_H * HOUR)));

  // Current attribution among fire districts
  const byDistrict = new Map();
  let fireNow = 0;
  for (const l of links) {
    const e = effect(l, now);
    if (e <= 0.05) continue;
    fireNow += e;
    const d = byDistrict.get(l.district) || { district: l.district, district_hi: l.district_hi, state: l.state, state_hi: l.state_hi, effect: 0, satellite: 0, citizen: 0, travel: [] };
    d.effect += e; d[l.kind] += l.n; d.travel.push(l.travel_h);
    byDistrict.set(l.district, d);
  }
  const attribution = [...byDistrict.values()].sort((a, b) => b.effect - a.effect).map((d) => ({
    district: d.district, district_hi: d.district_hi, state: d.state, state_hi: d.state_hi, outside_mp: !isHome(d.state),
    share: fireNow ? Math.round((100 * d.effect) / fireNow) : 0,
    aqi_points: Math.round(d.effect), satellite_fires: d.satellite, citizen_reports: d.citizen,
    travel_h: Math.round(d.travel.reduce((a, b) => a + b, 0) / d.travel.length),
  }));

  // Forecast: CAMS model forecast, plus the smoke from fires only citizens saw (CAMS cannot know about those)
  const cams = aqiSeries(air.times, air.pm25, air.pm10);
  const citizenLinks = links.filter((l) => l.kind === 'citizen');

  // Forecast range: the citizen-fire smoke is re-traced on every wind-ensemble member, and the CAMS error
  // spread (learned from the ledger where possible) is added on top
  const citizenSources = sources.filter((s) => s.kind === 'citizen' && km(s, place) <= 450);
  const memberLinks = ensembleGrids(grid).map((g) => {
    const out = [];
    for (const s of citizenSources) {
      const ca = closestApproach(forwardPath(g, s.lat, s.lon, s.ts), place);
      if (ca.d <= REACH_KM) out.push({ arrival: ca.t, weight: s.frp * Math.exp(-Math.pow(ca.d / 15, 2)) });
    }
    return out;
  });
  let errSource = 'default';
  const forecast = cams.filter((p) => p.t >= nowH - 24 * HOUR && p.t <= nowH + 48 * HOUR).map((p) => {
    const future = p.t > now - HOUR;
    const extra = future ? citizenLinks.reduce((a, l) => a + effect(l, p.t), 0) : 0;
    const point = { t: p.t, cams: p.aqi, corrected: Math.min(500, Math.round(p.aqi + extra)) };
    if (future) {
      const extras = memberLinks.map((ls) => ls.reduce((a, l) => a + effect(l, p.t), 0));
      const e = camsError((p.t - nowH) / HOUR);
      errSource = e.source;
      point.lo = Math.max(0, Math.round(p.aqi * (1 + e.q10) + quantile(extras, 0.1)));
      point.hi = Math.min(500, Math.round(p.aqi * (1 + e.q90) + quantile(extras, 0.9)));
      point.lo = Math.min(point.lo, point.corrected); point.hi = Math.max(point.hi, point.corrected);
    }
    return point;
  });

  // Ground truth now: CPCB stations within 25 km, else the model value
  const near = stations.filter((s) => km(s, place) <= 25);
  const camsNow = (forecast.find((p) => p.t >= nowH) || forecast[forecast.length - 1] || { corrected: null }).corrected;
  const aqiNow = near.length ? Math.round(near.reduce((a, s) => a + s.aqi, 0) / near.length) : camsNow;
  const future = forecast.filter((p) => p.t > now && p.t <= now + 24 * HOUR);
  const peak = future.reduce((m, p) => (p.corrected > (m ? m.corrected : -1) ? p : m), null);

  const upcoming = links.filter((l) => l.arrival > now && l.arrival <= now + 24 * HOUR);

  // Smoke by the state the fires burn in: now, and arriving within 24 hours
  const stateMap = new Map();
  const bump = (l, key, v) => {
    const x = stateMap.get(l.state) || { state: l.state, state_hi: l.state_hi, aqi_points_now: 0, aqi_points_incoming: 0, fires: 0 };
    x[key] += v; x.fires += l.n; stateMap.set(l.state, x);
  };
  for (const l of links) { const e = effect(l, now); if (e > 0.05) bump(l, 'aqi_points_now', e); }
  for (const l of upcoming) bump(l, 'aqi_points_incoming', l.weight * AQI_PER_FRP);
  const by_state = [...stateMap.values()].map((x) => ({ ...x, aqi_points_now: Math.round(x.aqi_points_now), aqi_points_incoming: Math.round(x.aqi_points_incoming), share_now: fireNow ? Math.round((100 * x.aqi_points_now) / fireNow) : 0 }))
    .filter((x) => x.aqi_points_now > 0 || x.aqi_points_incoming > 0).sort((a, b) => b.aqi_points_now + b.aqi_points_incoming - a.aqi_points_now - a.aqi_points_incoming);
  const incoming = new Map();
  for (const l of upcoming) {
    const d = incoming.get(l.district) || { district: l.district, district_hi: l.district_hi, aqi_points: 0, satellite: 0, citizen: 0 };
    d.aqi_points += l.weight * AQI_PER_FRP; d[l.kind] += l.n; incoming.set(l.district, d);
  }

  return {
    place, generated_at: now,
    aqi_now: { value: aqiNow, source: near.length ? `CPCB, ${near.length} station${near.length > 1 ? 's' : ''}` : 'CAMS model', ...(aqiNow != null ? { category: category(aqiNow) } : {}) },
    peak_24h: peak ? { value: peak.corrected, t: peak.t, cams: peak.cams, lo: peak.lo, hi: peak.hi, category: category(peak.corrected) } : null,
    forecast_range: { members: ENSEMBLE.length, cams_error: errSource, note: errSource === 'ledger' ? 'Range calibrated from this app\'s own scored forecasts' : 'Default range until 30+ forecasts have been scored against CPCB' },
    fire_influence_now: Math.round(fireNow),
    attribution,
    by_state,
    upcoming: {
      fires: upcoming.reduce((a, l) => a + l.n, 0),
      citizen_only: upcoming.filter((l) => l.kind === 'citizen').length,
      first_arrival: upcoming.length ? Math.min(...upcoming.map((l) => l.arrival)) : null,
      by_district: [...incoming.values()].sort((a, b) => b.aqi_points - a.aqi_points).map((d) => ({ ...d, aqi_points: Math.round(d.aqi_points) })),
    },
    back_trajectory: back.map((q) => ({ lat: +q.lat.toFixed(3), lon: +q.lon.toFixed(3), t: q.t, k: q.k })),
    smoke_paths: links.sort((a, b) => b.weight - a.weight).slice(0, 60).map((l) => ({ kind: l.kind, district: l.district, ts: l.ts, arrival: l.arrival, travel_h: l.travel_h, path: l.path })),
    forecast,
    near_stations: near.map((s) => ({ station: s.station, aqi: s.aqi, dominant: s.dominant })),
  };
}

module.exports = { analyse, trajectory, windAt, clusterFires, defaultCamsError, quantile, ensembleGrids };

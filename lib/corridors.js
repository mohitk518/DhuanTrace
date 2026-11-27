// Economic corridor forecasts: the worst air along each industrial corridor over the next 48 hours,
// and spike alerts when it moves into a worse CPCB category or jumps sharply.
const { km } = require('./places');
const { category } = require('./aqi');

const HOUR = 3600e3;

// Waypoints are approximate town and industrial-area centres (from the region pack)
const CORRIDORS = require('./region').R.corridors;

// Points every ~12 km along the corridor, each named after its nearest stop
function samplePoints(c) {
  const pts = [];
  for (let i = 0; i < c.stops.length - 1; i++) {
    const [n1, la1, lo1] = c.stops[i], [n2, la2, lo2] = c.stops[i + 1];
    const d = km({ lat: la1, lon: lo1 }, { lat: la2, lon: lo2 });
    const steps = Math.max(1, Math.round(d / 12));
    for (let k = 0; k < steps; k++) {
      const f = k / steps, lat = la1 + (la2 - la1) * f, lon = lo1 + (lo2 - lo1) * f;
      pts.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3), name: f < 0.5 ? n1 : n2 });
    }
  }
  const [nl, lal, lol] = c.stops[c.stops.length - 1];
  pts.push({ lat: lal, lon: lol, name: nl });
  return pts.slice(0, 8);
}

const catIndex = (a) => [50, 100, 200, 300, 400, Infinity].findIndex((b) => a <= b);
const istStr = (ms) => new Date(ms + 5.5 * HOUR).toISOString().replace('T', ' ').slice(0, 16) + ' IST';

async function forecastCorridor(c, analyseAt, now) {
  const pts = samplePoints(c);
  const analyses = await Promise.all(pts.map((p) => analyseAt({ id: 'point', name: `${c.name} near ${p.name}`, hi: p.name, lat: p.lat, lon: p.lon })));
  // Hourly worst point along the corridor
  const hours = new Map();
  analyses.forEach((a, i) => {
    for (const f of a.forecast) {
      if (f.t < now - HOUR || f.t > now + 48 * HOUR) continue;
      const h = hours.get(f.t);
      if (!h || f.corrected > h.aqi) hours.set(f.t, { t: f.t, aqi: f.corrected, cams: f.cams, point: i });
    }
  });
  const series = [...hours.values()].sort((a, b) => a.t - b.t);
  if (!series.length) return { ...c, points: pts, series: [], alerts: [] };

  const nowPt = series[0];
  const peak = series.reduce((m, p) => (p.aqi > m.aqi ? p : m), nowPt);
  const alerts = [];
  let lastCat = catIndex(nowPt.aqi), announced = new Set();
  for (let i = 1; i < series.length; i++) {
    const p = series[i], ci = catIndex(p.aqi);
    if (ci > lastCat && !announced.has(ci)) {
      alerts.push({ type: 'category', t: p.t, aqi: p.aqi, from: category(series[i - 1].aqi).name, to: category(p.aqi).name, near: pts[p.point].name });
      announced.add(ci);
    }
    lastCat = Math.max(lastCat, ci);
    const back = series.find((q) => q.t >= p.t - 6 * HOUR);
    if (back && p.aqi - back.aqi >= 50 && !alerts.some((a) => a.type === 'jump' && Math.abs(a.t - p.t) < 6 * HOUR)) {
      alerts.push({ type: 'jump', t: p.t, aqi: p.aqi, rise: p.aqi - back.aqi, near: pts[p.point].name });
    }
  }

  // What drives the peak: farm-fire smoke expected at the peak point, and where it comes from
  const pa = analyses[peak.point];
  const fireShare = peak.aqi ? Math.round((100 * Math.max(0, peak.aqi - peak.cams)) / peak.aqi) : 0;
  const drivers = pa.upcoming.by_district.slice(0, 2).map((d) => d.district);
  const status = peak.aqi > 200 ? 'warning' : peak.aqi > 100 ? 'watch' : 'ok';
  const text = alerts.length
    ? `${c.name}: AQI expected to reach ${peak.aqi} (${category(peak.aqi).name}) near ${pts[peak.point].name} around ${istStr(peak.t)}, up from ${nowPt.aqi} now.` +
      (drivers.length ? ` Farm-fire smoke from ${drivers.join(' and ')} adds to it.` : '')
    : `${c.name}: no category change expected in the next 48 h; peak ${peak.aqi} (${category(peak.aqi).name}) near ${pts[peak.point].name}.`;

  return {
    id: c.id, name: c.name, note: c.note, stops: c.stops.map(([name, lat, lon]) => ({ name, lat, lon })),
    points: pts, status, now: { aqi: nowPt.aqi, category: category(nowPt.aqi) },
    peak: { aqi: peak.aqi, t: peak.t, near: pts[peak.point].name, category: category(peak.aqi), smoke_share_pct: fireShare },
    alerts: alerts.slice(0, 4), text, series: series.map((p) => ({ t: p.t, aqi: p.aqi })),
  };
}

async function forecastAll(analyseAt) {
  const now = Date.now();
  const out = [];
  for (const c of CORRIDORS) out.push(await forecastCorridor(c, analyseAt, now));
  const rank = { warning: 2, watch: 1, ok: 0 };
  out.sort((a, b) => rank[b.status] - rank[a.status] || (b.peak ? b.peak.aqi : 0) - (a.peak ? a.peak.aqi : 0));
  return { generated_at: now, corridors: out };
}

module.exports = { forecastAll, forecastCorridor, CORRIDORS, samplePoints };

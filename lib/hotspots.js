// Hidden hotspot detector: finds pollution the models cannot explain.
// Observed AQI (CPCB stations, calibrated citizen sensors) minus expected AQI (CAMS model + traced farm-fire smoke)
// leaves a residual. Places whose residual is unusually high against all others, on a robust z-score, point to a
// local source the satellites and the model miss: a factory, burning garbage, construction dust.
const src = require('./sources');
const reportsStore = require('./reports');
const sensors = require('./sensors');
const { km, nearestDistrict } = require('./places');
const { aqiSeries, category } = require('./aqi');
const satevidence = require('./satevidence');

const HOUR = 3600e3;

// Industrial areas of the region (approximate centres, from the region pack) used only as supporting evidence
const INDUSTRIAL = require('./region').R.industrial.map(([name, lat, lon]) => ({ name, lat, lon }));

const LOCAL_SOURCES = ['garbage_burning', 'industrial_emission', 'construction_dust', 'vehicle_exhaust'];
const LABEL = { garbage_burning: 'garbage burning', industrial_emission: 'industrial emission', construction_dust: 'construction dust', vehicle_exhaust: 'vehicle exhaust', crop_residue_burning: 'crop residue burning' };

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

async function expectedAt(p, analyseAt, now) {
  const air = await src.getAirForecast(+p.lat.toFixed(2), +p.lon.toFixed(2));
  const cams = aqiSeries(air.times, air.pm25, air.pm10).filter((x) => x.t <= now).pop();
  const a = await analyseAt({ id: 'point', name: p.name, hi: p.name, lat: p.lat, lon: p.lon });
  return { cams: cams ? cams.aqi : null, fire: a.fire_influence_now };
}

// analyseAt(place) is the server's cached smoke analysis for any place
async function detect(analyseAt) {
  const now = Date.now();
  const stations = (await src.getStations()).filter((s) => s.aqi != null).map((s) => ({ kind: 'CPCB station', name: s.station, lat: s.lat, lon: s.lon, observed: s.aqi }));
  const sens = sensors.all(now).filter((r) => r.aqi != null).map((r) => ({ kind: r.example ? 'citizen sensor (example)' : 'citizen sensor', name: r.device, lat: r.lat, lon: r.lon, observed: r.aqi, calibrated: r.calibration_basis > 0 }));
  const points = [...stations, ...sens].slice(0, 40);

  const rows = [];
  for (let i = 0; i < points.length; i += 4) {
    const out = await Promise.all(points.slice(i, i + 4).map(async (p) => {
      const e = await expectedAt(p, analyseAt, now);
      if (e.cams == null) return null;
      const expected = e.cams + e.fire;
      return { ...p, cams: e.cams, fire_smoke: e.fire, expected, residual: p.observed - expected };
    }));
    rows.push(...out.filter(Boolean));
  }
  if (!rows.length) return { generated_at: now, points_checked: 0, hotspots: [] };

  const med = median(rows.map((r) => r.residual));
  const mad = median(rows.map((r) => Math.abs(r.residual - med))) * 1.4826 || 20;
  const reports = reportsStore.all(now).filter((r) => r.ts > now - 24 * HOUR && r.analysis && r.analysis.is_pollution_event && !(r.trust && r.trust.score < 0.4));
  const fires = (await src.getFires()).filter((f) => f.ts > now - 24 * HOUR);

  const hotspots = [];
  for (const r of rows) {
    const z = (r.residual - med) / mad;
    if (!(r.residual >= 40 && z >= 2) && !(r.residual >= 25 && z >= 1.5)) continue;
    const nearReports = reports.filter((x) => km(x, r) <= 10);
    const localReports = nearReports.filter((x) => LOCAL_SOURCES.includes(x.analysis.source_type));
    const industry = INDUSTRIAL.map((z2) => ({ ...z2, d: km(z2, r) })).filter((z2) => z2.d <= 12).sort((a, b) => a.d - b.d)[0];
    const nearFires = fires.filter((f) => km(f, r) <= 10).length;
    const agreeing = rows.filter((o) => o !== r && km(o, r) <= 8 && o.residual >= 25).length;

    const types = {};
    for (const x of localReports) types[x.analysis.source_type] = (types[x.analysis.source_type] || 0) + 1;
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    const likely = topType ? LABEL[topType[0]] : industry ? 'industrial emission (suspected)' : 'unknown local source';

    let conf = Math.min(0.6, z / 5);
    if (localReports.length) conf += 0.15;
    if (industry) conf += 0.1;
    if (agreeing) conf += 0.1;
    if (r.kind.startsWith('citizen sensor') && !r.calibrated) conf -= 0.1;
    conf = Math.max(0.1, Math.min(0.95, conf));

    const evidence = [
      `${r.kind} reads AQI ${r.observed}; the model expects about ${Math.round(r.expected)} (CAMS ${r.cams} + farm-fire smoke ${Math.round(r.fire_smoke)}).`,
      `Unexplained excess: +${Math.round(r.residual)} AQI points, ${z.toFixed(1)} times the typical spread across ${rows.length} measuring points.`,
    ];
    if (localReports.length) evidence.push(`${localReports.length} citizen photo report${localReports.length > 1 ? 's' : ''} within 10 km in the last 24 h show ${Object.keys(types).map((t) => LABEL[t]).join(', ')}.`);
    if (industry) evidence.push(`${industry.name} is ${industry.d.toFixed(1)} km away (approximate location).`);
    if (agreeing) evidence.push(`${agreeing} other measuring point${agreeing > 1 ? 's' : ''} within 8 km also read high.`);
    if (nearFires) evidence.push(`${nearFires} satellite fire detection${nearFires > 1 ? 's' : ''} within 10 km; their traced smoke is already subtracted.`);

    hotspots.push({
      kind: 'unexplained excess', lat: r.lat, lon: r.lon, district: nearestDistrict(r).name, near: industry && industry.d <= 5 ? industry.name : `${nearestDistrict(r).name} (nearest district HQ)`, point: r.name, point_kind: r.kind,
      observed: r.observed, expected: Math.round(r.expected), excess: Math.round(r.residual), z: +z.toFixed(2),
      likely_source: likely, confidence: +conf.toFixed(2), severity: category(r.observed), evidence,
    });
  }

  // Clusters of citizen reports of local (non-farm) sources where no instrument is present
  const used = new Set();
  for (const x of reports.filter((y) => LOCAL_SOURCES.includes(y.analysis.source_type))) {
    if (used.has(x.id) || hotspots.some((h) => km(h, x) <= 5) || rows.some((p) => km(p, x) <= 5)) continue;
    const group = reports.filter((y) => !used.has(y.id) && LOCAL_SOURCES.includes(y.analysis.source_type) && km(y, x) <= 5);
    if (group.length < 2) continue;
    group.forEach((y) => used.add(y.id));
    const lat = group.reduce((a, y) => a + y.lat, 0) / group.length, lon = group.reduce((a, y) => a + y.lon, 0) / group.length;
    const kinds = [...new Set(group.map((y) => LABEL[y.analysis.source_type]))];
    hotspots.push({
      kind: 'citizen report cluster', lat, lon, district: nearestDistrict({ lat, lon }).name, near: `${nearestDistrict({ lat, lon }).name} (nearest district HQ)`, point: `${group.length} citizen reports`, point_kind: 'citizen reports',
      observed: null, expected: null, excess: null, z: null, likely_source: kinds.join(', '), confidence: +Math.min(0.8, 0.35 + 0.1 * group.length).toFixed(2),
      severity: null, evidence: [`${group.length} citizen photo reports within 5 km in the last 24 h show ${kinds.join(', ')}.`, 'No monitoring station or sensor nearby to measure it: send an inspector or place a sensor.'],
    });
  }

  // Satellite evidence: does NASA's aerosol or NO2 layer also show more pollution over the spot than around it?
  // NASA GIBS can take a minute, so the list never waits: known results are used, the rest are checked in the
  // background (one spot at a time) and appear on the next refresh.
  const waiting = [];
  for (const h of hotspots.slice(0, 6)) {
    const s = satevidence.peek(h, now);
    if (!s) { h.satellite = { pending: true, note: 'Satellite check running in the background; it appears here within a few minutes.' }; waiting.push(h); continue; }
    h.satellite = s;
    if (s.unavailable) continue;
    const line = satevidence.sentence(s);
    if (line) h.evidence.push(line);
    if (s.supports) h.confidence = +Math.min(0.95, h.confidence + 0.1).toFixed(2);
    else if (s.clear_no_excess) h.confidence = +Math.max(0.1, h.confidence - 0.05).toFixed(2);
  }
  if (waiting.length) satevidence.queue(waiting);

  hotspots.sort((a, b) => b.confidence - a.confidence || (b.excess || 0) - (a.excess || 0));
  return { generated_at: now, points_checked: rows.length, median_residual: Math.round(med), spread: Math.round(mad), hotspots };
}

module.exports = { detect, INDUSTRIAL };

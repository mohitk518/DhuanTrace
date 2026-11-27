// Offline tests for the A–E features: hidden hotspots, corridors, federated model, citizen sensors, alert log.
const os = require('os'), path = require('path');
process.env.DATA_DIR = path.join(os.tmpdir(), `dt-features-${Date.now()}`);
process.env.DEMO_MODE = '1';

const HOUR = 3600e3;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

(async () => {
  const src = require('../lib/sources');
  const { analyse } = require('../lib/engine');
  const reports = require('../lib/reports');

  // The server's analysis, rebuilt here on sample data
  const analyseAt = async (place) => {
    const now = Date.now();
    const [fires, stations, grid, air] = await Promise.all([src.getFires(), src.getStations(), src.getWindGrid(), src.getAirForecast(place.lat, place.lon)]);
    return analyse({ place, fires, reports: reports.all(now), grid, air, stations, now });
  };

  // ---------- D: sensors ----------
  const sensors = require('../lib/sensors');
  const s1 = await sensors.submit({ lat: 22.72, lon: 75.87, pm25: 100, device: 'test-meter' });
  const s2 = await sensors.submit({ lat: 22.72, lon: 75.87, pm25: 120, device: 'test-meter' });
  assert(s1.factor === 1 && s1.calibration_basis === 0, 'D: first reading of a device stays uncalibrated');
  assert(s1.station && Math.abs(s2.factor - s1.station.pm25 / 100) < 0.01 && s2.calibration_basis === 1, `D: second reading calibrated from the first (factor ${s2.factor})`);
  assert(Math.abs(s2.pm25_cal - 120 * s2.factor) < 0.2 && s2.aqi > 0, 'D: calibrated PM2.5 and AQI computed');
  let threw = 0;
  for (const bad of [{ lat: 10, lon: 10, pm25: 5 }, { lat: 22.7, lon: 75.8, pm25: -3 }, { lat: 22.7, lon: 75.8, pm25: 'abc' }, { lat: 22.7, lon: 75.8, pm25: 50, pm10: 5000 }]) {
    try { await sensors.submit(bad); } catch (e) { if (e.code === 400) threw++; }
  }
  assert(threw === 4, 'D: out-of-region and impossible values are refused');

  // ---------- A: hidden hotspots ----------
  const hot = await require('../lib/hotspots').detect(analyseAt);
  const pith = hot.hotspots.find((h) => h.point === 'pithampur-01');
  assert(hot.points_checked >= 12, `A: ${hot.points_checked} measuring points checked`);
  assert(pith && pith.excess > 40 && pith.z >= 2, `A: high reading near Pithampur flagged (+${pith && pith.excess}, z ${pith && pith.z})`);
  assert(pith && /Pithampur industrial area/.test(pith.near) && pith.evidence.some((e) => e.includes('Pithampur industrial area')), 'A: nearby industrial area used as place name and evidence');
  assert(hot.hotspots.every((h) => h.confidence > 0 && h.confidence <= 0.95), 'A: confidence stays within 0–95%');
  const bhopalKolar = hot.hotspots.find((h) => h.point === 'bhopal-kolar-01');
  assert(!bhopalKolar, 'A: a normal reading is not flagged');

  // ---------- B: corridors ----------
  const { forecastCorridor, CORRIDORS, samplePoints } = require('../lib/corridors');
  const now = Date.now(), h0 = Math.floor(now / HOUR) * HOUR;
  const fakeAnalyse = async () => ({
    forecast: Array.from({ length: 50 }, (_, k) => ({ t: h0 + (k - 1) * HOUR, cams: 150, corrected: k < 20 ? 150 : k < 24 ? 150 + (k - 19) * 25 : 270 })),
    upcoming: { by_district: [{ district: 'Dhar', aqi_points: 40 }] },
  });
  const c = await forecastCorridor(CORRIDORS[0], fakeAnalyse, now);
  assert(c.status === 'warning' && c.peak.aqi === 270, `B: rising corridor gets a warning with peak ${c.peak.aqi}`);
  assert(c.alerts.some((a) => a.type === 'category' && a.from === 'Moderate' && a.to === 'Poor'), 'B: category change Moderate → Poor announced');
  assert(c.alerts.some((a) => a.type === 'jump' && a.rise >= 50), 'B: sharp jump announced');
  assert(/Dhar/.test(c.text), 'B: alert names the fire district driving the peak');
  const flat = await forecastCorridor(CORRIDORS[0], async () => ({ forecast: Array.from({ length: 50 }, (_, k) => ({ t: h0 + (k - 1) * HOUR, cams: 80, corrected: 80 })), upcoming: { by_district: [] } }), now);
  assert(flat.status === 'ok' && flat.alerts.length === 0, 'B: steady clean corridor gets no alert');
  assert(CORRIDORS.every((x) => { const p = samplePoints(x); return p.length >= 2 && p.length <= 8; }), 'B: every corridor sampled at 2–8 points');

  // ---------- C: federated ----------
  const fed = require('../lib/federated');
  const sim = fed.train({ simulate: true });
  assert(sim.status === 'trained' && sim.nodes === 8, 'C: simulation trains 8 city nodes');
  assert(sim.summary.mae_federated < sim.summary.mae_cams, `C: shared model beats CAMS alone (±${sim.summary.mae_federated} vs ±${sim.summary.mae_cams})`);
  assert(sim.summary.mae_unseen_city < sim.summary.mae_unseen_cams, `C: helps a city it never trained on (±${sim.summary.mae_unseen_city} vs ±${sim.summary.mae_unseen_cams})`);
  assert(sim.history.length === 25 && sim.history[24].mae <= sim.history[0].mae, 'C: error does not grow over training rounds');
  assert(fed.train().status === 'collecting', 'C: live mode waits for real samples instead of faking them');
  assert(fed.correct(100, 10, now) === null, 'C: no correction applied before a live model exists');
  let bad = 0;
  for (const u of [{ node: 'x', weights: [1, 2] }, { node: 'x', weights: [1, 2, 3, 4, 'a'] }, { node: '', weights: [0, 0, 0, 0, 0] }, { node: 'x', weights: [0, 0, 0, 0, 1e9] }]) {
    try { fed.addExternal(u); } catch (e) { if (e.code === 400) bad++; }
  }
  const ok = fed.addExternal({ node: 'Rajasthan node', weights: [0.2, 0.1, 0.3, 0, 0.1], samples: 500 });
  assert(bad === 4 && ok.accepted && fed.stats().external_nodes === 1, 'C: other states can post valid weights; bad ones are refused');

  // ---------- E: alert log ----------
  const alerts = require('../lib/alerts');
  const place = { id: 'indore', name: 'Indore', lat: 22.72, lon: 75.86 };
  const a0 = await analyseAt(place);
  const a = alerts.create({ place, analysis: a0, draft: { to: 'Collector', subject: 'Test alert', body: 'Body', by: 'template' }, lang: 'en' });
  assert(a.status === 'drafted' && a.at_alert.aqi != null && a.at_alert.cams != null, 'E: alert saved with AQI and model value at alert time');
  alerts.setStatus(a.id, 'sent'); alerts.setStatus(a.id, 'action_taken', 'team sent');
  let refused = false; try { alerts.setStatus(a.id, 'done'); } catch (e) { refused = e.code === 400; }
  assert(refused, 'E: unknown status refused');
  let list = await alerts.list(analyseAt);
  assert(list[0].status === 'action_taken' && list[0].outcome.state === 'too early', 'E: outcome waits 6 hours after action');
  // Pretend the action was 7 hours ago and the air improved by 40 while the model expected +10
  a.history[a.history.length - 1].at = Date.now() - 7 * HOUR;
  const later = async () => ({ ...a0, aqi_now: { value: a.at_alert.aqi - 40 }, generated_at: Date.now(), forecast: [{ t: Date.now() - 1000, cams: a.at_alert.cams + 10, corrected: 0 }] });
  list = await alerts.list(later);
  const o = list[0].outcome;
  assert(o.state === 'measured' && o.observed_change === -40 && o.model_expected_change === 10 && o.effect === -50 && o.verdict === 'improved beyond weather', 'E: outcome separates the action from weather (−40 observed vs +10 expected)');
})();

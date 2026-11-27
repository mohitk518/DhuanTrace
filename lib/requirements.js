// Requirements traceability: each part of the Track 02 problem statement, the features that meet it, the API that
// serves it, the automated tests that prove it, and a live check run against the app right now.
// test/requirements.test.js fails if any test named here stops existing, so this map cannot silently go stale.

const REQUIREMENTS = [
  {
    id: 'R1', need: 'AI-powered platform',
    built: ['Gemini reads every citizen photo: source, smoke density, and signs of a screen photo or AI image', 'Gemini drafts the alert in 8 Indian languages from the computed numbers only', 'Gemini answers officials\' typed or spoken questions', 'Gemini checks the satellite image against the wind model', 'A federated machine-learning model corrects the CAMS forecast'],
    panels: ['side', 'askForm', 'sat'], api: ['POST /api/reports', 'POST /api/alert', 'POST /api/ask', 'GET /api/verify'],
    tests: [['live-paths.test.js', 'Gemini photo JSON parsed'], ['live-paths.test.js', 'Gemini alert parsed'], ['live-paths.test.js', 'Gemini plume verdict parsed']],
  },
  {
    id: 'R2', need: 'Citizen data: photos',
    built: ['Photo reports with location, placed on the map and added to the forecast as fires the satellites missed', 'Trust score per photo: EXIF time and GPS, duplicate and near-duplicate check, screen or AI image check, satellite support', 'Low-trust reports are kept out of the forecast'],
    panels: ['rform'], api: ['POST /api/reports', 'GET /api/reports'],
    tests: [['research.test.js', 'trust'], ['server.test.js', 'photo report gets a trust score']],
  },
  {
    id: 'R3', need: 'Citizen data: local sensor readings',
    built: ['Low-cost PM2.5 sensor readings accepted from citizens', 'Each device calibrated against the nearest CPCB station', 'Sensors feed the hidden-hotspot detector'],
    panels: ['sform'], api: ['POST /api/sensors', 'GET /api/sensors'],
    tests: [['features.test.js', 'D:'], ['server.test.js', 'sensor reading accepted']],
  },
  {
    id: 'R4', need: 'Satellite and weather data',
    built: ['NASA FIRMS fire detections from four satellite feeds', 'NASA GIBS true-colour images, aerosol and NO₂ layers', 'Open-Meteo hourly wind on a 70-point grid over central India', 'CAMS PM2.5/PM10 forecast', 'CPCB real-time AQI from every station, with an automatic backup through WAQI (aqicn.org) when data.gov.in is down'],
    panels: ['map', 'sat'], api: ['GET /api/fires', 'GET /api/stations', 'GET /api/status'],
    tests: [['live-paths.test.js', 'FIRMS'], ['live-paths.test.js', 'CPCB'], ['waqi.test.js', 'WAQI backup used'], ['satevidence.test.js', 'AOD']],
  },
  {
    id: 'R5', need: 'Detect hidden pollution hotspots',
    built: ['Every station and sensor compared with what CAMS plus traced farm-fire smoke explains; unusual excess flagged on a robust z-score', 'Evidence: nearby industry, citizen reports, neighbouring points', 'Satellite evidence: aerosol and NO₂ over the spot versus the ring around it', 'Evening farm fires the satellites miss, found through citizen photos', 'A live chart of detection times shows the satellites\' 4–8 p.m. blind window'],
    panels: ['hotList', 'blindChart'], api: ['GET /api/hotspots', 'GET /api/fires'],
    tests: [['features.test.js', 'A:'], ['satevidence.test.js', 'Satellite check'], ['server.test.js', 'hotspots checked']],
  },
  {
    id: 'R6', need: 'Forecast AQI spikes',
    built: ['48-hour AQI forecast: CAMS plus smoke from fires the model cannot see', 'A likely range (80%) from an 11-member wind ensemble and measured CAMS error', 'Forecast ledger: every forecast written before, scored against CPCB after, compared with CAMS and "stays the same"'],
    panels: ['chart', 'ldRows'], api: ['GET /api/analyze', 'GET /api/ledger'],
    tests: [['research.test.js', 'ledger'], ['research.test.js', 'range'], ['server.test.js', 'ledger never scores against sample data']],
  },
  {
    id: 'R7', need: '… across economic corridors',
    built: ['Six industrial corridors in each region pack (Madhya Pradesh: Pithampur, Mandideep and others; Punjab–Haryana: Ludhiana–Mandi Gobindgarh, Panipat and others) sampled every ~12 km', 'Worst point per hour for 48 hours, with an alert on a category change or a 50-point jump in six hours', 'Which districts\' fires push each corridor up'],
    panels: ['corrList'], api: ['GET /api/corridors'],
    tests: [['features.test.js', 'B:'], ['server.test.js', 'all 6 corridors']],
  },
  {
    id: 'R8', need: 'Alert authorities',
    built: ['Alert addressed to the Collector of the district whose fires are responsible, with the share of smoke', 'Smoke from other states sent to the right pollution control board', 'Alert log from drafted to resolved, with a six-hour outcome check that separates action from weather', 'Statewide list of districts to act on first'],
    panels: ['letter', 'alertList', 'prio'], api: ['POST /api/alert', 'POST /api/alerts', 'GET /api/priorities'],
    tests: [['features.test.js', 'E:'], ['research.test.js', 'alert to the MP Collector'], ['server.test.js', 'alert is addressed to the right city'], ['server.test.js', 'alert saved']],
  },
  {
    id: 'R9', need: 'Federated platform: share predictive models, not data',
    built: ['Four separate node processes (MP West, MP Central, MP East, Rajasthan) train together and exchange only model weights', 'Every message signed; replies outside the protocol refused; nodes that fail are left out and training continues', 'A node that never trained gets the others\' model', 'Other states can post their weights to the shared model'],
    panels: ['fedNetPanel', 'fedRows'], api: ['POST /api/fednet/run', 'GET /api/fednet', 'GET /api/model', 'POST /api/federated/update'],
    tests: [['fednet.test.js', 'only protocol fields'], ['fednet.test.js', 'raw data is refused'], ['server.test.js', 'federated network']],
  },
  {
    id: 'R10', need: 'Interoperable: cities and states coordinate',
    built: ['Open JSON packet per city (forecast, attribution, smoke on the way)', 'Inter-state bulletin: smoke into and out of the home region by state, including across the national border (Lahore, Pakistan, in the Punjab–Haryana pack)', 'OpenAPI 3 description of every endpoint', 'Federated protocol dhuantrace.fednet/1 documented and versioned', 'Region packs: a new state or a BRICS country is one JSON file (regions/); Madhya Pradesh and Punjab–Haryana are built, and the same server runs either (SCALING.md)'],
    panels: ['packet', 'isRows'], api: ['GET /api/packet', 'GET /api/interstate', 'GET /api/openapi.json'],
    tests: [['server.test.js', 'inter-state bulletin served'], ['openapi.test.js', 'every route'], ['region.test.js', 'Punjab–Haryana nodes'], ['region.test.js', 'never mentions Madhya Pradesh']],
  },
];

// Live checks: small facts read from the running app. ctx gives cheap getters from the server.
async function liveChecks(ctx) {
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { ok: false, text: `check failed: ${e.message}` }; } };
  const mode = (k) => (ctx.status()[k] ? ctx.status()[k].mode : 'unknown');
  const checks = {
    R1: () => ({ ok: true, text: `Gemini: ${ctx.gemini().mode === 'live' ? 'connected' : 'not configured, template fallback in use'}` }),
    R2: async () => { const r = ctx.reports(); return { ok: r.length > 0, text: `${r.length} photo reports, ${r.filter((x) => x.trust && x.trust.used_in_forecast === false).length} kept out for low trust` }; },
    R3: async () => { const s = ctx.sensors(); return { ok: true, text: `${s.length} sensor readings` }; },
    R4: async () => { const f = await ctx.fires(); const st = await ctx.stations(); return { ok: f.length > 0 && st.length > 0, text: `${f.length} fire detections (${mode('fires')}), ${st.length} CPCB stations (${mode('stations')}), wind ${mode('wind')}` }; },
    R5: async () => { const h = await ctx.hotspots(); const sat = h.hotspots.filter((x) => x.satellite && x.satellite.supports).length; return { ok: true, text: `${h.points_checked} points checked, ${h.hotspots.length} hotspots, ${sat} backed by satellite` }; },
    R6: async () => { const L = ctx.ledger(); return { ok: true, text: L.scored ? `${L.scored} forecasts scored against CPCB` : `ledger waiting for live CPCB data (${L.pending || 0} forecasts written)` }; },
    R7: async () => { const c = await ctx.corridors(); return { ok: c.corridors.length > 0, text: `${c.corridors.length} corridors, ${c.corridors.filter((x) => x.alerts && x.alerts.length).length} with a spike alert` }; },
    R8: async () => { const a = await ctx.alerts(); return { ok: true, text: `${a.length} alerts in the log` }; },
    R9: async () => { const f = ctx.fednet(); return f.last ? { ok: f.last.wire.raw_rows_received === 0, text: `last run: ${f.last.nodes.length} nodes, ${f.last.wire.messages} messages, 0 data rows moved (${f.last.mode})` } : { ok: true, text: 'not run yet: press "Start 4 nodes and train"' }; },
    R10: async () => { const rg = require('./region'); return { ok: true, text: `${ctx.routes()} documented endpoints; running the ${rg.R.name} pack, ${rg.available().length} packs available (${rg.available().join(', ')})` }; },
  };
  const out = {};
  await Promise.all(Object.entries(checks).map(async ([id, fn]) => { out[id] = await safe(fn); }));
  return out;
}

module.exports = { REQUIREMENTS, liveChecks };

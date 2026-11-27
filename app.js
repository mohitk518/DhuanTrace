// DhuanTrace app: API routes, static files and the hourly jobs. Started by server.js after saved data is restored.
const http = require('http');
const fs = require('fs');
const path = require('path');

const src = require('./lib/sources');
const { analyse } = require('./lib/engine');
const { CITIES, DISTRICTS, km, nearestDistrict, isHome, stateOf } = require('./lib/places');
const region = require('./lib/region');
const { draftAlert, templateAlert, askCopilot, templateAnswer, geminiStatus, geminiReason, LANGS } = require('./lib/gemini');
const { sampleReports } = require('./lib/sample');
const { category } = require('./lib/aqi');
const research = require('./lib/research');
const hotspots = require('./lib/hotspots');
const corridors = require('./lib/corridors');
const federated = require('./lib/federated');
const alertLog = require('./lib/alerts');
const sensors = require('./lib/sensors');
const ledger = require('./lib/ledger');
const interstate = require('./lib/interstate');
const fedlauncher = require('./lib/fedlauncher');
const requirements = require('./lib/requirements');
const openapi = require('./lib/openapi');
const guard = require('./lib/guard');
const satevidence = require('./lib/satevidence');
const gcs = require('./lib/gcs');
const crypto = require('crypto');

// Short-lived cache for the heavier statewide computations
const heavy = new Map();
async function cachedHeavy(key, ms, fn) {
  const hit = heavy.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await fn();
  heavy.set(key, { at: Date.now(), value });
  return value;
}

const PORT = +process.env.PORT || 8080;
const ROUTE_COUNT = openapi.operationCount();
const STARTED = Date.now();
const HOUR = 3600e3;
const STATIC = path.join(__dirname, 'static');

// ---------- citizen reports store ----------
const store = require('./lib/reports');
const allReports = (now) => store.all(now);
const publicReport = store.toPublic;

// ---------- helpers ----------
const istStr = (ms) => new Date(ms + 5.5 * HOUR).toISOString().replace('T', ' ').slice(0, 16) + ' IST';
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readJson(req, limit = 8e6) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    const declared = +req.headers['content-length'] || 0;
    if (declared > limit) { req.resume(); return reject(Object.assign(new Error(`Body is too large (${Math.round(limit / 1e3)} kB max)`), { code: 413 })); }
    let size = 0, failed = false; const chunks = [];
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > limit) { failed = true; req.resume(); reject(Object.assign(new Error(`Body is too large (${Math.round(limit / 1e3)} kB max)`), { code: 413 })); } else chunks.push(c);
    });
    req.on('end', () => {
      if (failed) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      if (!/^application\/json\b/i.test(type)) return reject(Object.assign(new Error('Send the body as application/json'), { code: 415 }));
      try { const v = JSON.parse(text); if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0; resolve(v); }
      catch { reject(Object.assign(new Error('Body is not a valid JSON object'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}
function placeFrom(q) {
  if (q.get('city')) {
    const c = CITIES.find((x) => x.id === q.get('city').toLowerCase());
    if (!c) throw Object.assign(new Error('Unknown city'), { code: 404 });
    return c;
  }
  const lat = +q.get('lat'), lon = +q.get('lon');
  if (q.get('lat') == null || q.get('lon') == null || !isFinite(lat) || !isFinite(lon)) throw Object.assign(new Error('Give ?city=indore or ?lat=..&lon=..'), { code: 400 });
  // The wind grid and fire search cover central India; outside it the smoke maths would be meaningless
  const B = region.R.analysis_bounds;
  if (lat < B.s || lat > B.n || lon < B.w || lon > B.e) throw Object.assign(new Error(`This point is outside the area this DhuanTrace node covers (${region.R.name}, about ${B.s}–${B.n}°N, ${B.w}–${B.e}°E).`), { code: 400 });
  const d = nearestDistrict({ lat, lon });
  const name = String(q.get('name') || '').replace(/[<>]/g, '').slice(0, 80);
  return { id: 'point', name: name || `Near ${d.name}`, hi: name || `${d.hi} के पास`, lat, lon };
}
const analysisCache = new Map();
async function runAnalysis(place) {
  const key = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}:${store.getVersion()}`;
  const hit = analysisCache.get(key);
  // The smoke maths depends only on the location, so it is shared; the place's name and id are the caller's own
  // (corridor points sit on city centres, and a city must never inherit a corridor point's name)
  if (hit && Date.now() - hit.at < 5 * 60e3) return { ...hit.value, place };
  const value = await computeAnalysis(place);
  analysisCache.set(key, { at: Date.now(), value });
  return value;
}
async function computeAnalysis(place) {
  const now = Date.now();
  const [fires, stations, grid, air] = await Promise.all([src.getFires(), src.getStations(), src.getWindGrid(), src.getAirForecast(place.lat, place.lon)]);
  const a = analyse({ place, fires, reports: allReports(now), grid, air, stations, now, camsError: ledger.camsError });
  // Station readings are only CPCB when the CPCB feed is live; otherwise say plainly that they are sample values,
  // so alerts, answers and packets never present demo numbers as official readings
  if (src.status.stations && src.status.stations.mode === 'live' && src.status.stations.source === 'waqi' && /^CPCB/.test(a.aqi_now.source || '')) {
    a.aqi_now.source = a.aqi_now.source.replace(/^CPCB/, 'CPCB via WAQI (converted)');
  }
  if (!(src.status.stations && src.status.stations.mode === 'live') && /^CPCB/.test(a.aqi_now.source || '')) {
    a.aqi_now.source = a.aqi_now.source.replace(/^CPCB/, 'sample stations (not live CPCB)');
    a.aqi_now.sample = true;
  }
  // Once the cities' shared (federated) model has been trained on live CPCB data, show its corrected forecast too.
  // It is a separate line: the main forecast stays CAMS + traced smoke, so the two can be compared.
  if (federated.correct(100, 0, now) != null) {
    for (const p of a.forecast) {
      const fixed = federated.correct(p.cams, a.fire_influence_now, p.t);
      if (fixed != null) p.shared_model = Math.min(500, fixed + (p.corrected - p.cams));
    }
    a.shared_model = { applied: true, trained_at: federated.stats().last_model };
  }
  return a;
}
function alertFacts(a) {
  return {
    city: a.place.name, city_hi: a.place.hi, home_state: stateOf(a.place).state, issued: istStr(a.generated_at),
    aqi_now: a.aqi_now.value, aqi_now_category: a.aqi_now.category?.name, aqi_source: a.aqi_now.source,
    peak_aqi: a.peak_24h?.value, peak_time: a.peak_24h ? istStr(a.peak_24h.t) : null, peak_category: a.peak_24h?.category.name,
    farm_fire_aqi_points_now: a.fire_influence_now,
    // The alert goes to the MP district that can act; smoke from across the border is reported separately
    // Only districts whose smoke adds at least 1 AQI point count; otherwise no Collector is blamed for a trace
    top_district: a.attribution.find((d) => !d.outside_mp && d.aqi_points >= 1) || null, other_districts: a.attribution.filter((d) => !d.outside_mp && d.aqi_points >= 1).slice(1, 3),
    smoke_from_other_states: (a.fire_influence_now >= 1 ? (a.by_state || []) : []).filter((x) => !isHome(x.state) && x.share_now > 0).map((x) => ({ state: x.state, state_hi: x.state_hi, share_of_fire_smoke_pct: x.share_now })),
    forecast_range_24h_peak: a.peak_24h && a.peak_24h.lo != null ? `${a.peak_24h.lo}–${a.peak_24h.hi}` : null,
    smoke_on_the_way_next_24h: a.upcoming.fires, of_which_seen_only_by_citizens: a.upcoming.citizen_only,
    first_arrival: a.upcoming.first_arrival ? istStr(a.upcoming.first_arrival) : null,
  };
}

// Statewide ranking: which districts' fires put smoke into the most people's air, now and in the next 24 h
async function priorities() {
  const results = await Promise.all(CITIES.map((c) => runAnalysis(c).then((a) => ({ c, a }))));
  const map = new Map();
  const touch = (d) => {
    if (!map.has(d.district)) map.set(d.district, { district: d.district, district_hi: d.district_hi, people: 0, cities: [], aqi_points_now: 0, aqi_points_incoming: 0, satellite_fires: 0, citizen_reports: 0, score: 0 });
    return map.get(d.district);
  };
  for (const { c, a } of results) {
    for (const d of a.attribution) {
      if (d.aqi_points < 1) continue;
      const x = touch(d);
      x.aqi_points_now += d.aqi_points; x.satellite_fires = Math.max(x.satellite_fires, d.satellite_fires); x.citizen_reports = Math.max(x.citizen_reports, d.citizen_reports);
      if (!x.cities.includes(c.name)) { x.cities.push(c.name); x.people += c.pop; }
      x.score += d.aqi_points * c.pop;
    }
    for (const d of a.upcoming.by_district) {
      if (d.aqi_points < 1) continue;
      const x = touch(d);
      x.aqi_points_incoming += d.aqi_points; x.citizen_reports = Math.max(x.citizen_reports, d.citizen);
      if (!x.cities.includes(c.name)) { x.cities.push(c.name); x.people += c.pop; }
      x.score += d.aqi_points * c.pop;
    }
  }
  // Only MP districts: fires across the border are for that state to act on (see the inter-state panel)
  const districts = [...map.values()].filter((d) => !/^Outside /.test(d.district) && !/\(/.test(d.district)).sort((a, b) => b.score - a.score).slice(0, 8)
    .map(({ score, ...d }) => ({ ...d, people_lakh: +(d.people / 1e5).toFixed(1), aqi_points_now: Math.round(d.aqi_points_now), aqi_points_incoming: Math.round(d.aqi_points_incoming) }));
  return { generated_at: Date.now(), cities_checked: CITIES.length, population_note: 'Census 2011 urban population, approximate', districts };
}

// ---------- routes ----------
async function api(req, res, url) {
  const q = url.searchParams, p = url.pathname;

  if (p === '/api/health') return send(res, 200, { ok: true });

  // Hourly jobs, called by Cloud Scheduler on Cloud Run. Protected by a shared token (JOB_TOKEN).
  if (p === '/api/jobs/hourly' && req.method === 'POST') {
    const want = String(process.env.JOB_TOKEN || ''), got = String(req.headers['x-job-token'] || '');
    const ok = want.length >= 16 && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
    if (!ok) return send(res, 403, { error: want ? 'Wrong or missing x-job-token.' : 'Set JOB_TOKEN (16+ characters) to allow scheduled jobs.' });
    return send(res, 200, await hourlyJobs());
  }

  if (p === '/api/openapi.json') return send(res, 200, openapi.spec(`${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`));

  // System health: every data source's mode, request metrics per route, uptime and version
  if (p === '/api/system') {
    const sources = { ...src.status, gemini: geminiStatus() };
    const degraded = Object.entries(sources).filter(([, v]) => v && v.mode !== 'live').map(([k]) => k);
    return send(res, 200, {
      ok: true, version: require('./package.json').version, node: process.version, started_at: STARTED, uptime_s: Math.round((Date.now() - STARTED) / 1000),
      memory_mb: Math.round(process.memoryUsage().rss / 1e6), demo_mode: process.env.DEMO_MODE === '1',
      sources, degraded, data_dir_writable: require('./lib/datastore').writable(),
      storage: gcs.enabled() ? { kind: 'Google Cloud Storage', ...gcs.status } : { kind: 'local folder', note: 'Set GCS_BUCKET on Cloud Run so saved data survives restarts' },
      scheduled_jobs: { last_run: lastJobs, trigger: process.env.JOB_TOKEN ? 'Cloud Scheduler (POST /api/jobs/hourly) and the in-app timer' : 'in-app timer' },
      requests: guard.metrics(), rate_limits: guard.LIMITS,
    });
  }

  if (p === '/api/status') {
    await Promise.allSettled([src.getFires(), src.getStations(), src.getWindGrid()]);
    return send(res, 200, { sources: { ...src.status, gemini: geminiStatus() }, languages: LANGS, now: Date.now() });
  }

  if (p === '/api/cities') return send(res, 200, CITIES);

  // Which region pack this node runs (regions/<REGION>.json): name, home states, boards, counts
  if (p === '/api/region') return send(res, 200, region.summary());

  // Problem statement -> features -> API -> tests, with a live check of each against the running app
  if (p === '/api/requirements') {
    const ctx = {
      status: () => src.status, gemini: geminiStatus, reports: () => allReports(Date.now()).map(publicReport), sensors: () => sensors.all(),
      fires: () => src.getFires(), stations: () => src.getStations(), ledger: () => ledger.metrics(), fednet: () => fedlauncher.status(),
      alerts: () => alertLog.list(runAnalysis),
      hotspots: () => cachedHeavy(`hotspots:${store.getVersion()}:${sensors.all().length}:${satevidence.getVersion()}`, 10 * 60e3, () => hotspots.detect(runAnalysis)),
      corridors: () => cachedHeavy(`corridors:${store.getVersion()}`, 10 * 60e3, () => corridors.forecastAll(runAnalysis)),
      routes: () => ROUTE_COUNT,
    };
    return send(res, 200, { track: 'Track 02 · Clean Air & Climate Resilience', requirements: requirements.REQUIREMENTS, live: await requirements.liveChecks(ctx), checked_at: Date.now() });
  }

  if (p === '/api/fires') {
    const hours = Math.min(48, +q.get('hours') || 48), now = Date.now();
    const fires = (await src.getFires()).filter((f) => f.ts >= now - hours * HOUR);
    return send(res, 200, fires.map((f) => ({ ...f, district: nearestDistrict(f).name })));
  }

  if (p === '/api/stations') {
    const st = await src.getStations();
    return send(res, 200, st.map((s) => ({ ...s, category: category(s.aqi) })));
  }

  if (p === '/api/analyze') return send(res, 200, await runAnalysis(placeFrom(q)));

  if (p === '/api/reports' && req.method === 'GET') return send(res, 200, allReports(Date.now()).map(publicReport));

  if (p === '/api/reports' && req.method === 'POST') {
    const b = await readJson(req);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.image || '');
    if (!m) return send(res, 400, { error: 'Attach a JPEG, PNG or WebP photo.' });
    const { report, nearby, afterSatellitePass } = await store.submit({ base64: m[2], mime: m[1], lat: +b.lat, lon: +b.lon, channel: 'web', exifHead: typeof b.exif_head === 'string' ? b.exif_head : null, phash: typeof b.phash === 'string' ? b.phash.toLowerCase() : null });
    return send(res, 201, { ...publicReport(report), satellite_fires_within_10km: nearby, after_satellite_pass: afterSatellitePass });
  }

  const photo = /^\/api\/reports\/([\w-]+)\/photo$/.exec(p);
  if (photo) {
    const r = store.find(photo[1]);
    if (!r || !r.photo) return send(res, 404, { error: 'No photo' });
    const mm = /^data:([^;]+);base64,(.+)$/.exec(r.photo);
    return send(res, 200, Buffer.from(mm[2], 'base64'), mm[1]);
  }

  if (p === '/api/alert' && req.method === 'POST') {
    const b = await readJson(req, 1e5);
    const qs = new URLSearchParams(b.city ? { city: b.city } : { lat: b.lat, lon: b.lon, name: b.name || '' });
    const a = await runAnalysis(placeFrom(qs));
    const facts = alertFacts(a), lang = LANGS[b.lang] ? b.lang : 'en';
    try { return send(res, 200, { ...(await draftAlert(facts, lang)), by: 'gemini', facts }); }
    catch (e) { return send(res, 200, { ...templateAlert(facts, lang === 'hi' ? 'hi' : 'en'), by: 'template', reason: geminiReason(e).en, note: e.message, facts }); }
  }

  if (p === '/api/alerts' && req.method === 'GET') return send(res, 200, await alertLog.list(runAnalysis));
  if (p === '/api/alerts' && req.method === 'POST') {
    const b = await readJson(req, 1e5);
    if (!b.subject || !b.body) return send(res, 400, { error: 'Draft the alert first, then save it.' });
    const place = placeFrom(new URLSearchParams(b.city ? { city: b.city } : { lat: b.lat, lon: b.lon, name: b.name || '' }));
    const a = alertLog.create({ place, analysis: await runAnalysis(place), draft: b, lang: b.lang });
    return send(res, 201, a);
  }
  const alertStatus = /^\/api\/alerts\/([\w-]+)\/status$/.exec(p);
  if (alertStatus && req.method === 'POST') {
    const b = await readJson(req, 1e4);
    return send(res, 200, alertLog.setStatus(alertStatus[1], b.status, b.note));
  }

  if (p === '/api/interstate') return send(res, 200, await cachedHeavy(`interstate:${store.getVersion()}`, 10 * 60e3, () => interstate.compute(runAnalysis)));

  if (p === '/api/ledger') return send(res, 200, { mode: src.status.stations ? src.status.stations.mode : 'sample', ...ledger.metrics() });

  if (p === '/api/priorities') return send(res, 200, await priorities());

  if (p === '/api/verify') {
    const district = String(q.get('district') || '').trim();
    if (!district) return send(res, 400, { error: `Give ?district=${require('./lib/region').R.sample.fire_districts[0] || 'name'}` });
    return send(res, 200, await research.verifyDistrict(district));
  }

  if (p === '/api/skill') return send(res, 200, await research.forecastSkill());

  if (p === '/api/hotspots') return send(res, 200, await cachedHeavy(`hotspots:${store.getVersion()}:${sensors.all().length}:${satevidence.getVersion()}`, 10 * 60e3, () => hotspots.detect(runAnalysis)));

  if (p === '/api/corridors') return send(res, 200, await cachedHeavy(`corridors:${store.getVersion()}`, 10 * 60e3, () => corridors.forecastAll(runAnalysis)));

  if (p === '/api/federated' && req.method === 'GET') {
    const simulate = q.get('simulate') === '1';
    return send(res, 200, { ...(await cachedHeavy(`fed:${simulate}:${federated.stats().samples}:${federated.stats().external_nodes}`, 10 * 60e3, async () => federated.train({ simulate }))), collection: federated.stats() });
  }
  if (p === '/api/federated/update' && req.method === 'POST') {
    const r = federated.addExternal(await readJson(req, 1e4));
    heavy.clear();
    return send(res, 201, r);
  }
  // Federated learning across separate node processes that exchange only weights (lib/fednet.js)
  if (p === '/api/fednet' && req.method === 'GET') return send(res, 200, fedlauncher.status());
  if (p === '/api/fednet/run' && req.method === 'POST') return send(res, 200, await fedlauncher.runNetwork({ basePort: PORT + 11 }));

  if (p === '/api/model') {
    const m = await cachedHeavy(`fed:false:${federated.stats().samples}:${federated.stats().external_nodes}`, 10 * 60e3, async () => federated.train());
    const { per_node, history, ...shared } = m;
    return send(res, 200, shared);
  }

  if (p === '/api/sensors' && req.method === 'GET') return send(res, 200, sensors.all());
  if (p === '/api/sensors' && req.method === 'POST') {
    const b = await readJson(req, 1e4);
    const r = await sensors.submit(b);
    heavy.clear();
    return send(res, 201, r);
  }

  if (p === '/api/ask' && req.method === 'POST') {
    const b = await readJson(req, 1e5);
    const question = String(b.question || '').trim().slice(0, 400);
    if (!question) return send(res, 400, { error: 'Type or speak a question first.' });
    const qs = new URLSearchParams(b.city ? { city: b.city } : { lat: b.lat, lon: b.lon, name: b.name || '' });
    const a = await runAnalysis(placeFrom(qs));
    const pr = await priorities();
    const facts = { ...alertFacts(a), smoke_arriving_next_24h_by_district: a.upcoming.by_district.slice(0, 4), statewide_priority_fire_districts: pr.districts.slice(0, 5), now: istStr(Date.now()) };
    const lang = LANGS[b.lang] ? b.lang : 'en';
    try { return send(res, 200, { ...(await askCopilot(facts, question, lang)), by: 'gemini' }); }
    catch (e) { const why = geminiReason(e); return send(res, 200, { answer: templateAnswer(facts, lang === 'hi' ? 'hi' : 'en', why), follow_ups: [], by: 'template', reason: why.en, note: e.message }); }
  }

  if (p === '/api/packet') {
    const a = await runAnalysis(placeFrom(q));
    return send(res, 200, {
      schema: 'open-clean-air-packet/0.1', issued_by: `DhuanTrace node: ${a.place.name}`, issued_at: new Date(a.generated_at).toISOString(),
      location: { name: a.place.name, lat: a.place.lat, lon: a.place.lon },
      aqi_now: { value: a.aqi_now.value, category: a.aqi_now.category?.name, source: a.aqi_now.source, scale: 'CPCB NAQI' },
      forecast: a.forecast.filter((f) => f.t > a.generated_at).filter((_, i) => i % 3 === 0).map((f) => ({ t: new Date(f.t).toISOString(), aqi: f.corrected, cams_aqi: f.cams })),
      attribution: a.attribution.map((d) => ({ source: 'farm_fire', district: d.district, share_of_fire_smoke_pct: d.share, satellite_fires: d.satellite_fires, citizen_reports: d.citizen_reports, travel_h: d.travel_h })),
      smoke_on_the_way: a.upcoming,
      method: { trajectories: 'Open-Meteo hourly 10 m wind grid, RK2, 36 h', forecast: 'CAMS PM2.5/PM10 (Open-Meteo) + citizen-reported fire correction', aqi: 'CPCB NAQI breakpoints, 24 h mean' },
      shared_model: { endpoint: '/api/model', schema: 'dhuantrace-bias-model/1', contribute: 'POST /api/federated/update with {node, weights, samples}' },
      licence: 'CC-BY-4.0',
    });
  }

  return send(res, 404, { error: 'Not found' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const t0 = process.hrtime.bigint();
  guard.securityHeaders(res, url.pathname);
  res.on('finish', () => guard.record(req.method, url.pathname, res.statusCode, Number(process.hrtime.bigint() - t0) / 1e6));
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' }); return res.end(); }
      if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST' });
      const limited = guard.rateLimit(req, url.pathname);
      if (limited) { res.setHeader('retry-after', String(limited)); return send(res, 429, { error: `Too many requests from your address. Try again in ${limited} s.` }); }
      return await api(req, res, url);
    }
    let f = path.normalize(path.join(STATIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!f.startsWith(STATIC)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(f, (err, data) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, data, TYPES[path.extname(f)] || 'application/octet-stream');
    });
  } catch (e) {
    const code = Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (code >= 500) {
      // Details go to the log only; the caller gets a reference, not the internals
      const ref = Math.random().toString(36).slice(2, 10);
      guard.log('error', { ref, method: req.method, path: url.pathname, message: e.message, stack: String(e.stack || '').split('\n').slice(0, 4).join(' | ') });
      if (!res.headersSent) send(res, code, { error: code === 503 ? e.message : `Something went wrong on the server (ref ${ref}).` });
    } else if (!res.headersSent) send(res, code, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`DhuanTrace running on http://localhost:${PORT}`);
  // Warm the heavy statewide computations in the background, so the first visitor does not wait for them
  setTimeout(async () => {
    try {
      await priorities();
      await cachedHeavy(`hotspots:${store.getVersion()}:${sensors.all().length}:${satevidence.getVersion()}`, 10 * 60e3, () => hotspots.detect(runAnalysis));
      await cachedHeavy(`corridors:${store.getVersion()}`, 10 * 60e3, () => corridors.forecastAll(runAnalysis));
    } catch (e) { console.error('warm-up failed:', e.message); }
  }, 1500).unref();
});

// Hourly jobs while the app runs: score and write the forecast ledger, then log federated samples.
// On a laptop a timer runs them; on Cloud Run (where idle instances get no CPU) Cloud Scheduler calls
// POST /api/jobs/hourly. Both are safe to repeat: forecasts and samples are keyed by hour.
let jobsRunning = null;
async function hourlyJobs() {
  if (jobsRunning) return jobsRunning;
  jobsRunning = (async () => {
    const out = { at: Date.now(), stations: null, ledger: null, federated: null, errors: [] };
    try {
      await src.getStations(); // sets the live/sample status even if nobody has opened the page yet
      out.stations = src.status.stations ? src.status.stations.mode : 'unknown';
      if (out.stations === 'live') {
        analysisCache.clear();
        const analyses = [];
        for (const c of CITIES) analyses.push(await runAnalysis(c));
        const observed = {};
        for (const a of analyses) if (/^CPCB/.test(a.aqi_now.source || '')) observed[a.place.id] = a.aqi_now.value;
        const s = ledger.score(observed);
        const w = ledger.record(analyses);
        out.ledger = { scored: s.scored, missed: s.missed, written: w };
        if (s.scored || w) console.log(`forecast ledger: scored ${s.scored}, wrote ${w} new forecasts`);
      } else out.ledger = { skipped: 'station data is not live' };
    } catch (e) { out.errors.push(`ledger: ${e.message}`); console.error('forecast ledger failed:', e.message); }
    try {
      const r = await federated.logSamples(runAnalysis);
      out.federated = r;
      // Retrain the shared model as soon as new live samples arrive, so the corrected forecast stays current
      if (r.logged) { const m = federated.train(); heavy.clear(); analysisCache.clear(); out.federated.retrained = m.status === 'trained'; if (m.status === 'trained') console.log(`federated model retrained on ${m.samples} samples from ${m.nodes} cities`); }
    } catch (e) { out.errors.push(`federated: ${e.message}`); console.error('federated logging failed:', e.message); }
    lastJobs = out;
    return out;
  })();
  try { return await jobsRunning; } finally { jobsRunning = null; }
}
let lastJobs = null;

// Stop cleanly: end the federated node processes and copy pending data to Cloud Storage first
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
  if (stopping) return; stopping = true;
  fedlauncher.stopLocalNodes();
  await Promise.race([gcs.flush(require('./lib/datastore').dir()), new Promise((r) => setTimeout(r, 8000))]);
  process.exit(0);
});
// First run shortly after start, then every hour a few minutes after the hour (CPCB updates hourly)
setTimeout(hourlyJobs, 20e3).unref();
function scheduleHourly() {
  const next = Math.ceil((Date.now() + 1) / HOUR) * HOUR + 5 * 60e3;
  setTimeout(() => { hourlyJobs(); scheduleHourly(); }, next - Date.now()).unref();
}
scheduleHourly();

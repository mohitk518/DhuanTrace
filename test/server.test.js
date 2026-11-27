// End-to-end test: starts the real server on sample data and calls its API like the web page does.
const { spawn } = require('child_process');
const os = require('os'), path = require('path');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const env = { ...process.env, PORT: String(PORT), DEMO_MODE: '1', DATA_DIR: path.join(os.tmpdir(), `dt-server-${Date.now()}`), GEMINI_API_KEY: '', FIRMS_MAP_KEY: '', DATA_GOV_API_KEY: '', WAQI_TOKEN: '', GCS_BUCKET: '', JOB_TOKEN: 'test-job-token-1234567890' };
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = '';
srv.stderr.on('data', (d) => { errors += d; });

const base = `http://127.0.0.1:${PORT}`;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  try {
    // Corridor points sit on city centres; a city must keep its own name afterwards
    await get('/api/corridors');
    const a = await get('/api/analyze?city=indore');
    assert(a.body.place.name === 'Indore' && a.body.place.id === 'indore', `city keeps its name after corridor analysis (got "${a.body.place.name}")`);
    const al = await post('/api/alert', { city: 'indore', lang: 'en' });
    assert(al.status === 200 && al.body.facts.city === 'Indore' && !/Pithampur near/.test(al.body.cc), 'alert is addressed to the right city');

    const endpoints = ['/api/status', '/api/fires?hours=24', '/api/stations', '/api/reports', '/api/priorities', '/api/skill', '/api/hotspots', '/api/corridors', '/api/federated?simulate=1', '/api/federated', '/api/model', '/api/sensors', '/api/alerts', '/api/packet?city=bhopal', '/api/analyze?lat=23.1&lon=77.2', '/api/ledger', '/api/interstate'];
    const bad = [];
    for (const e of endpoints) { const r = await get(e); if (r.status !== 200) bad.push(`${e} → ${r.status}`); }
    assert(!bad.length, `all ${endpoints.length} read endpoints answer 200${bad.length ? ': ' + bad.join(', ') : ''}`);

    const h = (await get('/api/hotspots')).body;
    assert(h.points_checked > 0 && Array.isArray(h.hotspots), `hotspots checked ${h.points_checked} points, flagged ${h.hotspots.length}`);
    const c = (await get('/api/corridors')).body;
    assert(c.corridors.length === 6 && c.corridors.every((x) => x.peak && x.series.length > 24), 'all 6 corridors have a 48 h forecast');
    const f = (await get('/api/federated?simulate=1')).body;
    assert(f.status === 'trained' && f.summary.mae_federated < f.summary.mae_cams, 'federated simulation beats CAMS alone');

    const s = await post('/api/sensors', { lat: 22.72, lon: 75.87, pm25: 88, device: 'e2e-meter' });
    assert(s.status === 201 && s.body.aqi > 0, 'sensor reading accepted');
    const sb = await post('/api/sensors', { lat: 1, lon: 1, pm25: 8 });
    assert(sb.status === 400, 'sensor outside MP refused with 400');

    const saved = await post('/api/alerts', { city: 'indore', lang: 'en', to: al.body.to, cc: al.body.cc, subject: al.body.subject, body: al.body.body, by: al.body.by });
    const st = await post(`/api/alerts/${saved.body.id}/status`, { status: 'acknowledged', note: 'seen' });
    const list = (await get('/api/alerts')).body;
    assert(saved.status === 201 && st.body.status === 'acknowledged' && list[0].place.name === 'Indore', 'alert saved, status changed, listed under Indore');
    const nf = await post('/api/alerts/does-not-exist/status', { status: 'sent' });
    assert(nf.status === 404, 'unknown alert gives 404');
    // Photo report the way the page sends it: resized image, the start of the original file for EXIF, and a fingerprint
    const jpeg = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'exif_gps_sehore.jpg'));
    const body = { image: 'data:image/jpeg;base64,' + jpeg.toString('base64'), exif_head: jpeg.toString('base64'), phash: '0123456789abcdef', lat: 23.2, lon: 77.09 };
    const rep1 = await post('/api/reports', body);
    assert(rep1.status === 201 && rep1.body.trust && rep1.body.trust.reasons.some((x) => x.signal === 'gps_match'), `photo report gets a trust score with its EXIF GPS checked (${rep1.body.trust && rep1.body.trust.score})`);
    const rep2 = await post('/api/reports', body);
    assert(rep2.body.trust.reasons.some((x) => x.signal === 'duplicate') && rep2.body.trust.score < rep1.body.trust.score, 'sending the same photo again lowers its trust');
    const an = (await get('/api/analyze?city=indore')).body;
    assert(an.forecast.some((p) => p.lo != null) && an.forecast_range && an.by_state, 'analysis carries the forecast range and smoke by state');
    assert(!/^CPCB/.test(an.aqi_now.source) && /sample/.test(an.aqi_now.source) && /sample/.test(al.body.facts.aqi_source), `sample station values are never labelled CPCB ("${an.aqi_now.source}")`);
    const L = (await get('/api/ledger')).body;
    assert(L.scored === 0 && /CPCB/.test(L.note), 'ledger never scores against sample data');
    const I = (await get('/api/interstate')).body;
    assert(I.schema === 'dhuantrace.interstate/1', 'inter-state bulletin served');
    const fn = await post('/api/fednet/run', {});
    const fs2 = (await get('/api/fednet')).body;
    assert(fn.status === 200 && fn.body.nodes.length === 4 && fn.body.wire.raw_rows_received === 0 && fs2.local_nodes.every((c) => c.alive && c.pid !== srv.pid), 'federated network: 4 separate node processes trained together over HTTP');
    // Security, validation and system endpoints
    const page = await fetch(base + '/');
    assert(/default-src 'self'/.test(page.headers.get('content-security-policy') || '') && page.headers.get('x-content-type-options') === 'nosniff', 'page is served with a content security policy and nosniff');
    const apiH = await fetch(base + '/api/cities');
    assert(apiH.headers.get('access-control-allow-origin') === '*', 'read API is open to other cities\' tools (CORS)');
    const wrongType = await fetch(base + '/api/sensors', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'pm25=5' });
    assert(wrongType.status === 415, 'a write that is not JSON gets 415');
    const big = await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'x'.repeat(2e5) }) });
    assert(big.status === 413, 'an oversized body gets 413');
    const notObj = await fetch(base + '/api/sensors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[1,2]' });
    assert(notObj.status === 400, 'a JSON body that is not an object gets 400');
    const far = await get('/api/analyze?lat=51.5&lon=-0.1');
    assert(far.status === 400 && /outside the area/.test(far.body.error), 'a point outside central India is refused with a clear reason');
    const opt = await fetch(base + '/api/reports', { method: 'OPTIONS' });
    assert(opt.status === 204, 'CORS preflight answered');
    const sys = (await get('/api/system')).body;
    assert(sys.ok && sys.sources.fires && sys.requests['GET /api/analyze'].count >= 2 && sys.requests['GET /api/analyze'].p95_ms != null && sys.data_dir_writable, 'system health lists sources, per-route request counts and latency');
    const oa = (await get('/api/openapi.json')).body;
    assert(oa.openapi === '3.1.0' && oa.paths['/api/fednet/run'] && oa.servers[0].url.startsWith('http://127.0.0.1'), 'OpenAPI description served with this server\'s address');
    const rq = (await get('/api/requirements')).body;
    assert(rq.requirements.length === 10 && Object.keys(rq.live).length === 10 && /3 nodes|4 nodes/.test(rq.live.R9.text), `requirements map with a live check for each (R9: "${rq.live.R9.text}")`);
    // A city with only a trace of farm-fire smoke must not get an alert blaming a district
    let quiet = null;
    for (const c of (await get('/api/cities')).body) { const x = (await get(`/api/analyze?city=${c.id}`)).body; if (x.fire_influence_now < 1) { quiet = c; break; } }
    if (quiet) { const qa = (await post('/api/alert', { city: quiet.id, lang: 'en' })).body; assert(qa.facts.top_district === null && !qa.facts.smoke_from_other_states.length, `no district blamed when farm-fire smoke is under 1 AQI point (${quiet.name})`); }
    else console.log('skip: every sample city has noticeable smoke');
    // Scheduled jobs endpoint (Cloud Scheduler)
    const j0 = await fetch(base + '/api/jobs/hourly', { method: 'POST' });
    const j1 = await fetch(base + '/api/jobs/hourly', { method: 'POST', headers: { 'x-job-token': 'test-job-token-1234567890' } });
    const jb = await j1.json();
    assert(j0.status === 403 && j1.status === 200 && jb.stations === 'sample' && jb.ledger.skipped, 'hourly jobs run only with the right token; ledger skips sample data');
    const sys2 = (await get('/api/system')).body;
    assert(sys2.storage.kind === 'local folder' && sys2.scheduled_jobs.last_run && /Cloud Scheduler/.test(sys2.scheduled_jobs.trigger), 'system health shows storage and the last scheduled run');
    // Rate limit last: /api/ask allows 12 per minute per address
    const codes = [];
    for (let i = 0; i < 14; i++) codes.push((await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status);
    const lim = await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert(codes.slice(0, 10).every((c) => c === 400) && lim.status === 429 && +lim.headers.get('retry-after') > 0, 'too many writes from one address get 429 with Retry-After');
    assert(!errors.trim(), `server wrote no errors${errors.trim() ? ': ' + errors.trim().slice(0, 300) : ''}`);
  } finally { srv.kill(); }
})();

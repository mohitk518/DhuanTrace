// Region packs: every pack in regions/ is checked for consistency, then the whole server is started on the
// Punjab–Haryana pack to prove that a second state runs with no code change (scale across states, BRICS rule).
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const DIR = path.join(__dirname, '..', 'regions');
const inBox = (b, lat, lon) => lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e;

// 1. Static checks on every pack
const { validate } = require('../lib/region');
const packs = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
assert(packs.length >= 2, `${packs.length} region packs found (${packs.join(', ')})`);
for (const f of packs) {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  let ok = true; try { validate(r, f); } catch (e) { ok = false; console.error(e.message); }
  assert(ok, `${f}: all required keys present and every city is a district`);
  assert(r.id === f.slice(0, -5), `${f}: id matches the file name`);
  const b = r.analysis_bounds;
  const outD = r.districts.filter(([, , lat, lon]) => !inBox(b, lat, lon));
  assert(!outD.length, `${f}: all ${r.districts.length} districts inside the analysis area${outD.length ? ': ' + outD.map((d) => d[0]).join(', ') : ''}`);
  const homes = new Set(r.home_states.map((h) => h.state));
  assert(r.districts.every((d) => d[4] == null || homes.has(d[4])), `${f}: every district belongs to a home state`);
  assert(r.home_states.every((h) => h.board_en && h.board_hi && Array.isArray(h.cpcb) && h.cpcb.length), `${f}: every home state names its pollution control board and CPCB state key`);
  assert(r.cities.every((c) => r.pop[c] > 0), `${f}: every city has a population`);
  const badStops = r.corridors.flatMap((c) => c.stops.filter(([, lat, lon]) => !inBox(b, lat, lon)).map((s) => `${c.id}/${s[0]}`));
  assert(r.corridors.length > 0 && !badStops.length, `${f}: ${r.corridors.length} corridors, all stops inside the analysis area${badStops.length ? ': ' + badStops.join(', ') : ''}`);
  const fr = Object.values(r.fed_regions);
  assert(fr.length >= 3 && fr.every((x) => x.name && x.state && Array.isArray(x.cities) && x.cities.length), `${f}: ${fr.length} federated regions, each with a name, state and cities`);
  const g = r.grid;
  assert(g.lats.length * g.lons.length <= 100 && g.lats.every((x) => x >= b.s && x <= b.n) && g.lons.every((x) => x >= b.w && x <= b.e), `${f}: wind grid ${g.lats.length}×${g.lons.length} inside the analysis area`);
}

// 2. The server on the Punjab–Haryana pack
const PORT = 19000 + Math.floor(Math.random() * 800);
const env = { ...process.env, REGION: 'punjab-haryana', PORT: String(PORT), DEMO_MODE: '1', DATA_DIR: path.join(os.tmpdir(), `dt-region-${Date.now()}`), GEMINI_API_KEY: '', FIRMS_MAP_KEY: '', DATA_GOV_API_KEY: '', WAQI_TOKEN: '', GCS_BUCKET: '', FED_PEERS: '' };
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = ''; srv.stderr.on('data', (d) => { errors += d; });
const base = `http://127.0.0.1:${PORT}`;
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));

(async () => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  try {
    const reg = (await get('/api/region')).body;
    assert(reg.id === 'punjab-haryana' && reg.home_states.length === 2 && reg.available.includes('mp'), `server runs the ${reg.name} pack; packs available: ${reg.available.join(', ')}`);
    const cities = (await get('/api/cities')).body;
    const list = Array.isArray(cities) ? cities : cities.cities;
    assert(list.length === 12 && list.some((c) => c.id === 'ludhiana') && !list.some((c) => c.id === 'indore'), 'city picker lists Punjab and Haryana cities, not MP');

    const a = await get('/api/analyze?city=ludhiana');
    assert(a.status === 200 && a.body.place.name === 'Ludhiana' && a.body.forecast && a.body.forecast.length > 24, 'Ludhiana gets a 48 h forecast');
    const al = await post('/api/alert', { city: 'ludhiana', lang: 'en' });
    const letter = JSON.stringify(al.body);
    assert(al.status === 200 && al.body.facts.city === 'Ludhiana' && !/Madhya Pradesh|MP Pollution/.test(letter), 'alert for Ludhiana never mentions Madhya Pradesh');
    assert(/Punjab|Haryana/.test(letter), 'alert names Punjab or Haryana (state or pollution control board)');
    const alh = await post('/api/alert', { city: 'ludhiana', lang: 'hi' });
    assert(alh.status === 200 && /पंजाब प्रदूषण नियंत्रण बोर्ड/.test(JSON.stringify(alh.body)), 'Hindi alert copies the Punjab Pollution Control Board, in Hindi');
    const alg = await post('/api/alert', { city: 'gurugram', lang: 'en' });
    assert(alg.status === 200 && alg.body.facts.home_state === 'Haryana', 'a Gurugram alert is filed under Haryana');

    const pr = (await get('/api/priorities')).body;
    const names = (pr.districts || pr.priorities || []).map((d) => d.district || d.name);
    const allowed = new Set(JSON.parse(fs.readFileSync(path.join(DIR, 'punjab-haryana.json'), 'utf8')).districts.map((d) => d[0]));
    assert(names.length > 0 && names.every((n) => allowed.has(n)), `priorities list only Punjab/Haryana districts (${names.slice(0, 3).join(', ')}…)`);
    const c = (await get('/api/corridors')).body;
    assert(c.corridors.length === 6 && c.corridors.some((x) => /Gobindgarh/.test(x.name)) && c.corridors.every((x) => x.series.length > 24), 'the 6 Punjab–Haryana corridors get a 48 h forecast');
    const h = (await get('/api/hotspots')).body;
    assert(h.points_checked > 0, `hotspots checked ${h.points_checked} points in the new region`);
    const is = (await get('/api/interstate')).body;
    const states = JSON.stringify(is);
    assert(/Punjab and Haryana/.test(states) && !/Madhya Pradesh/.test(states), 'inter-state bulletin is issued by the Punjab–Haryana node');
    const out = await get('/api/analyze?lat=31.55&lon=74.34');
    assert(out.status === 200, 'a point across the border (Lahore) can be analysed: smoke crosses national borders');

    const fn = await post('/api/fednet/run', {});
    const nodes = (fn.body.nodes || []).map((n) => n.region);
    assert(fn.status === 200 && nodes.length === 4 && nodes.includes('haryana') && fn.body.wire.raw_rows_received === 0, `federated network runs 4 Punjab–Haryana nodes (${nodes.join(', ')}), 0 data rows moved`);
  } catch (e) {
    assert(false, `region server test crashed: ${e.stack}`);
  } finally {
    srv.kill();
    if (errors.trim() && process.exitCode) console.error(errors);
  }
})();

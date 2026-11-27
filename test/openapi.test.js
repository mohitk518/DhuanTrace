// The OpenAPI description and the requirements map must match the code: no undocumented route, no dead path,
// no requirement pointing at a test, panel or endpoint that does not exist.
const fs = require('fs'), path = require('path');
const { spec, paths } = require('../lib/openapi');
const { REQUIREMENTS } = require('../lib/requirements');

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

// Routes in server.js: exact paths (with method when given) and the two id routes
const routes = new Set();
for (const m of server.matchAll(/p === '(\/api\/[^']+)'(?: && req\.method === '([A-Z]+)')?/g)) routes.add(`${(m[2] || 'GET').toLowerCase()} ${m[1]}`);
if (/\\\/api\\\/reports\\\/\(\[\\w-\]\+\)\\\/photo/.test(server)) routes.add('get /api/reports/{id}/photo');
if (/\\\/api\\\/alerts\\\/\(\[\\w-\]\+\)\\\/status/.test(server)) routes.add('post /api/alerts/{id}/status');
const documented = new Set(Object.entries(paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)));

const missing = [...routes].filter((r) => !documented.has(r));
const dead = [...documented].filter((r) => !routes.has(r));
assert(routes.size >= 30, `found ${routes.size} routes in app.js`);
assert(!missing.length, `every route is documented${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);
assert(!dead.length, `every documented path exists in the server${dead.length ? ' — dead: ' + dead.join(', ') : ''}`);

const s = spec('http://localhost:8080');
const refs = JSON.stringify(s).match(/#\/components\/schemas\/\w+/g) || [];
assert(s.openapi === '3.1.0' && refs.every((r) => s.components.schemas[r.split('/').pop()]), `OpenAPI 3.1, all ${refs.length} schema references resolve`);
const ops = Object.values(s.paths).flatMap((o) => Object.values(o));
assert(ops.every((o) => o.summary && o.responses && Object.keys(o.responses).length && o.tags && o.tags.length), `all ${ops.length} operations have a summary, tag and responses`);
assert(Object.entries(s.paths).every(([p, o]) => !o.post || o.post.responses[429]), 'every write documents its rate limit (429)');

// Requirements map
const html = fs.readFileSync(path.join(root, 'static', 'index.html'), 'utf8');
const testText = Object.fromEntries(fs.readdirSync(__dirname).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(__dirname, f), 'utf8')]));
const badTests = [], badPanels = [], badApi = [];
for (const r of REQUIREMENTS) {
  for (const [file, text] of r.tests) if (!testText[file] || !testText[file].includes(text)) badTests.push(`${r.id}: ${file} "${text}"`);
  for (const id of r.panels) if (!html.includes(`id="${id}"`)) badPanels.push(`${r.id}: #${id}`);
  for (const a of r.api) { const [m, p] = a.split(' '); if (!documented.has(`${m.toLowerCase()} ${p}`)) badApi.push(`${r.id}: ${a}`); }
}
assert(REQUIREMENTS.length === 10 && REQUIREMENTS.every((r) => r.built.length && r.tests.length), 'all 10 Track 02 requirements have features and tests');
assert(!badTests.length, `every test named in the requirements map exists${badTests.length ? ' — ' + badTests.join('; ') : ''}`);
assert(!badPanels.length, `every panel named in the requirements map is on the page${badPanels.length ? ' — ' + badPanels.join('; ') : ''}`);
assert(!badApi.length, `every endpoint named in the requirements map is documented${badApi.length ? ' — ' + badApi.join('; ') : ''}`);

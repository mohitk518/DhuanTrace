// Cloud Storage persistence: restore at start, debounced upload after saves, token from the metadata server
const fs = require('fs'), os = require('os'), path = require('path');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const dir = path.join(os.tmpdir(), `dt-gcs-${Date.now()}`);
process.env.DATA_DIR = dir; process.env.GCS_BUCKET = 'my-bucket'; process.env.GCS_PREFIX = 'dhuantrace/';

const bucketStore = new Map([['dhuantrace/ledger.json', '[{"id":"a"}]'], ['dhuantrace/reports.json', '[]'], ['dhuantrace/../evil.json', 'x'], ['dhuantrace/notes.txt', 'x']]);
const calls = []; let tokenCalls = 0;
const fake = async (url, opts = {}) => {
  url = String(url); calls.push({ url, opts });
  const ok = (body, extra = {}) => ({ ok: true, status: 200, json: async () => body, arrayBuffer: async () => Buffer.from(String(body)), ...extra });
  if (url.startsWith('http://metadata.google.internal')) { tokenCalls++; if (opts.headers['Metadata-Flavor'] !== 'Google') throw new Error('no flavor header'); return ok({ access_token: 'tok-1', expires_in: 3600 }); }
  if (opts.headers && opts.headers.Authorization !== 'Bearer tok-1') return { ok: false, status: 401 };
  if (url.includes('/storage/v1/b/my-bucket/o?prefix=')) return ok({ items: [...bucketStore.keys()].map((name) => ({ name })) });
  const dl = /\/o\/([^?]+)\?alt=media$/.exec(url);
  if (dl) { const v = bucketStore.get(decodeURIComponent(dl[1])); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(v) }; }
  const up = /\/upload\/storage\/v1\/b\/my-bucket\/o\?uploadType=media&name=([^&]+)$/.exec(url);
  if (up) { bucketStore.set(decodeURIComponent(up[1]), String(opts.body)); return ok({}); }
  throw new Error('unexpected ' + url);
};

(async () => {
  const gcs = require('../lib/gcs');
  gcs._setFetch(fake);
  const n = await gcs.restore(dir, { fetchFn: fake });
  assert(n === 2 && fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8') === '[{"id":"a"}]', 'saved data restored from the bucket at start-up');
  assert(!fs.existsSync(path.join(dir, '..', 'evil.json')) && !fs.existsSync(path.join(dir, 'notes.txt')), 'only plain .json names are restored (no path tricks)');

  const db = require('../lib/datastore');
  db.save('alerts.json', [{ id: 1 }]); db.save('alerts.json', [{ id: 1 }, { id: 2 }]);
  const before = calls.filter((c) => c.url.includes('/upload/')).length;
  await new Promise((r) => setTimeout(r, 3400));
  const ups = calls.filter((c) => c.url.includes('/upload/'));
  assert(before === 0 && ups.length === 1 && bucketStore.get('dhuantrace/alerts.json') === '[{"id":1},{"id":2}]', 'two quick saves become one upload of the latest version');
  assert(tokenCalls === 1 && gcs.status.uploaded === 1, 'access token from the metadata server is reused');

  db.save('ledger.json', [{ id: 'b' }]);
  await gcs.flush(dir);
  assert(bucketStore.get('dhuantrace/ledger.json') === '[{"id":"b"}]', 'shutdown flushes pending uploads at once');
})();

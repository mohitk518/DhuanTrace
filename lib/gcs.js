// Google Cloud Storage persistence for Cloud Run, where the local disk is wiped on every restart.
// When GCS_BUCKET is set: at start-up every saved file is restored from the bucket into DATA_DIR, and every
// save is copied back to the bucket a few seconds later (writes to the same file are merged). On Cloud Run the
// access token comes from the metadata server of the service's own account, so no key file is needed.
// Zero dependencies: plain Cloud Storage JSON API over fetch.
const fs = require('fs');
const path = require('path');

const bucket = () => (process.env.GCS_BUCKET || '').trim();
const prefix = () => (process.env.GCS_PREFIX || 'dhuantrace/').replace(/^\/+/, '');
const enabled = () => !!bucket();
const API = 'https://storage.googleapis.com';
const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

let token = null; // { value, until }
async function accessToken(fetchFn = fetch) {
  if (process.env.GCS_TOKEN) return process.env.GCS_TOKEN; // for local testing with `gcloud auth print-access-token`
  if (token && Date.now() < token.until - 60e3) return token.value;
  const r = await fetchFn(METADATA_TOKEN, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`metadata server: HTTP ${r.status}`);
  const j = await r.json();
  token = { value: j.access_token, until: Date.now() + (j.expires_in || 300) * 1000 };
  return token.value;
}

const status = { enabled: false, bucket: null, restored: 0, uploaded: 0, failed: 0, last_error: null, last_upload: null };

// Download every object under the prefix into dir. Called once before the app loads its data.
async function restore(dir, { fetchFn = fetch } = {}) {
  status.enabled = enabled(); status.bucket = bucket() || null;
  if (!enabled()) return 0;
  const auth = { Authorization: `Bearer ${await accessToken(fetchFn)}` };
  fs.mkdirSync(dir, { recursive: true });
  let pageToken = '', n = 0;
  do {
    const list = await fetchFn(`${API}/storage/v1/b/${encodeURIComponent(bucket())}/o?prefix=${encodeURIComponent(prefix())}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers: auth, signal: AbortSignal.timeout(15000) });
    if (!list.ok) throw new Error(`listing gs://${bucket()}: HTTP ${list.status}`);
    const j = await list.json();
    for (const item of j.items || []) {
      const name = item.name.slice(prefix().length);
      if (!/^[\w.-]+\.json$/.test(name)) continue; // only our own flat JSON files
      const r = await fetchFn(`${API}/storage/v1/b/${encodeURIComponent(bucket())}/o/${encodeURIComponent(item.name)}?alt=media`, { headers: auth, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`downloading ${item.name}: HTTP ${r.status}`);
      fs.writeFileSync(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
      n++;
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  status.restored = n;
  return n;
}

// Debounced upload after each save
const pending = new Map(); // name -> timer
const inflight = new Set();
let fetchImpl = fetch;
function scheduleUpload(dir, name, delayMs = 3000) {
  if (!enabled()) return;
  clearTimeout(pending.get(name));
  pending.set(name, setTimeout(() => { pending.delete(name); upload(dir, name); }, delayMs));
}
async function upload(dir, name) {
  const p = (async () => {
    try {
      const body = fs.readFileSync(path.join(dir, name));
      const r = await fetchImpl(`${API}/upload/storage/v1/b/${encodeURIComponent(bucket())}/o?uploadType=media&name=${encodeURIComponent(prefix() + name)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${await accessToken(fetchImpl)}`, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      status.uploaded++; status.last_upload = Date.now();
    } catch (e) { status.failed++; status.last_error = `${name}: ${e.message}`; console.error(JSON.stringify({ severity: 'ERROR', message: `Cloud Storage upload failed for ${name}: ${e.message}` })); }
  })();
  inflight.add(p); p.finally(() => inflight.delete(p));
  return p;
}
// Upload everything still waiting (Cloud Run sends SIGTERM about 10 s before stopping an instance)
async function flush(dir) {
  for (const [name, t] of pending) { clearTimeout(t); pending.delete(name); upload(dir, name); }
  await Promise.allSettled([...inflight]);
}

module.exports = { restore, scheduleUpload, flush, status, enabled, _setFetch: (f) => { fetchImpl = f; }, _reset: () => { token = null; pending.clear(); Object.assign(status, { restored: 0, uploaded: 0, failed: 0, last_error: null }); } };

// DhuanTrace server: zero-dependency Node.js (22+). Serves the app and the JSON API.
// On Cloud Run (GCS_BUCKET set) the saved data is first restored from Cloud Storage, then the app starts.
try { process.loadEnvFile(); } catch {} // reads .env when present (local runs)
const path = require('path');
const gcs = require('./lib/gcs');

(async () => {
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  if (gcs.enabled()) {
    try { const n = await gcs.restore(dir); console.log(`restored ${n} data files from gs://${process.env.GCS_BUCKET}`); }
    catch (e) { gcs.status.last_error = `restore: ${e.message}`; console.error(`Cloud Storage restore failed, starting with local data: ${e.message}`); }
  }
  require('./app');
})();

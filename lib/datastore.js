// Small JSON persistence for reports, sensor readings, alerts and the federated model.
// Files live in DATA_DIR (default: the project's data/ folder), written atomically.
const fs = require('fs');
const path = require('path');

const DIR = () => process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR(), name), 'utf8')); } catch { return fallback; }
}

function save(name, value) {
  try {
    fs.mkdirSync(DIR(), { recursive: true });
    const file = path.join(DIR(), name), tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file);
    require('./gcs').scheduleUpload(DIR(), name); // copied to Cloud Storage when GCS_BUCKET is set
  } catch (e) { console.error(`could not save ${name}: ${e.message}`); }
}

// Can the app still write its data? Shown on the system health page
function writable() {
  try { fs.mkdirSync(DIR(), { recursive: true }); fs.accessSync(DIR(), fs.constants.W_OK); return true; } catch { return false; }
}

module.exports = { load, save, writable, dir: DIR };

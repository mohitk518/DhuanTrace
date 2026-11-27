// Citizen photo reports: store, Gemini classification and persistence.
const crypto = require('crypto');
const db = require('./datastore');
const src = require('./sources');
const { km, nearestDistrict } = require('./places');
const { classifyPhoto } = require('./gemini');
const { sampleReports } = require('./sample');
const { readExif } = require('./exif');
const trust = require('./trust');

const HOUR = 3600e3;
let reports = db.load('reports.json', []);
let version = 0;
function save() { db.save('reports.json', reports.slice(0, 300)); }

const istStr = (ms) => new Date(ms + 5.5 * HOUR).toISOString().replace('T', ' ').slice(0, 16) + ' IST';
const { R: REGION } = require('./region');
// Inside the region pack's box (the home region plus a band across its borders)
const inRegion = (lat, lon) => isFinite(lat) && isFinite(lon) && lat >= REGION.bbox.s && lat <= REGION.bbox.n && lon >= REGION.bbox.w && lon <= REGION.bbox.e;

function all(now = Date.now()) {
  const own = reports.filter((r) => r.ts > now - 72 * HOUR);
  const examples = process.env.EXAMPLE_REPORTS === '0' ? [] : sampleReports(now);
  return [...own, ...examples];
}

const toPublic = (r) => ({
  // Public location is rounded to about 1 km, so a report never points at someone's house or field exactly
  id: r.id, example: !!r.example, channel: r.channel || 'web', lat: Math.round(r.lat * 100) / 100, lon: Math.round(r.lon * 100) / 100, location_precision_km: 1, ts: r.ts,
  district: nearestDistrict(r).name, analysis: r.analysis, has_photo: !!r.photo, trust: r.trust || null,
});

// Classify a photo with Gemini and store it as a report. Throws on bad input.
// exifHead: base64 of the first bytes of the ORIGINAL file (the browser re-encodes the photo, which drops EXIF);
// phash: 16-hex-digit perceptual fingerprint computed by the browser from the image
async function submit({ base64, mime, lat, lon, channel = 'web', exifHead = null, phash = null }) {
  if (!inRegion(lat, lon)) throw Object.assign(new Error(`Pick a location inside ${REGION.name} first.`), { code: 400 });
  if (!/^image\/(jpeg|png|webp)$/.test(mime) || !base64) throw Object.assign(new Error('Attach a JPEG, PNG or WebP photo.'), { code: 400 });
  const ts = Date.now();
  const fires = await src.getFires();
  const nearby = fires.filter((f) => f.ts > ts - 24 * HOUR && km(f, { lat, lon }) < 10).length;
  let analysis;
  try {
    analysis = await classifyPhoto({ base64, mime, lat, lon, localTime: istStr(ts), nearbyFires: nearby });
  } catch (e) {
    analysis = { is_pollution_event: true, source_type: 'unverified', visible_fire: false, smoke_density: 'medium', confidence: 0, explanation: `Not checked: ${require('./gemini').geminiReason(e).en}.`, explanation_hi: `जाँच नहीं हुई: ${require('./gemini').geminiReason(e).hi}।`, unverified: true };
  }
  const dataUrl = `data:${mime};base64,${base64}`;
  let exif = null;
  if (typeof exifHead === 'string' && exifHead.length < 200000) { try { exif = readExif(Buffer.from(exifHead, 'base64')); } catch { exif = null; } }
  const sha256 = crypto.createHash('sha256').update(base64).digest('hex');
  const r = {
    id: crypto.randomUUID(), channel, lat, lon, ts, analysis, satellite_fires_within_10km: nearby, photo: dataUrl.length < 1.6e6 ? dataUrl : null,
    sha256, phash: /^[0-9a-f]{16}$/.test(phash || '') ? phash : null,
    exif: exif ? { taken_at: exif.taken_at ?? null, taken_zone: exif.taken_zone ?? null, lat: exif.lat ?? null, lon: exif.lon ?? null, camera: [exif.make, exif.model].filter(Boolean).join(' ') || null } : null,
  };
  r.trust = trust.assess(r, reports.filter((p) => p.ts > ts - 30 * 24 * HOUR));
  reports.unshift(r); version++; save();
  return { report: r, nearby, afterSatellitePass: new Date(ts + 5.5 * HOUR).getUTCHours() >= 15 };
}

const find = (id) => reports.find((x) => x.id === id);
const getVersion = () => version;

module.exports = { all, toPublic, submit, find, getVersion, inRegion };

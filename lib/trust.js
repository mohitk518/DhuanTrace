// Trust score for citizen photo reports: how much a report should count in forecasts and hotspots.
// Every signal is listed with its effect, so an official can see why a report was trusted or not.
// Missing evidence (no EXIF, no GPS) is neutral: many apps strip it, and honest reporters should not be penalised.
const { km } = require('./places');

const HOUR = 3600e3;

function hamming(a, b) {
  if (!/^[0-9a-f]{16}$/.test(a || '') || !/^[0-9a-f]{16}$/.test(b || '')) return null;
  let x = BigInt('0x' + a) ^ BigInt('0x' + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

// Rough sun state from the Indian Standard Time hour (sunrise ~06:00, sunset ~18:15 in central India in autumn)
function expectedLight(ts) {
  const h = new Date(ts + 5.5 * HOUR).getUTCHours() + new Date(ts + 5.5 * HOUR).getUTCMinutes() / 60;
  if (h >= 7 && h < 17.5) return 'day';
  if ((h >= 5.5 && h < 7) || (h >= 17.5 && h < 19)) return 'dusk';
  return 'night';
}

/**
 * @param r   { lat, lon, ts, analysis, sha256, phash, exif, satellite_fires_within_10km }
 * @param prior earlier reports (same shape) to check for duplicates
 */
function assess(r, prior = []) {
  const reasons = [];
  let score = 0.6;
  const add = (effect, signal, text) => { score += effect; reasons.push({ signal, effect: +effect.toFixed(2), text }); };
  const a = r.analysis || {};

  // 1. Same photo sent before (exact bytes or a near copy by perceptual hash)
  const exact = prior.find((p) => p.sha256 && p.sha256 === r.sha256);
  let near = null;
  if (!exact && r.phash) {
    for (const p of prior) { const d = hamming(p.phash, r.phash); if (d != null && d <= 6) { near = { p, d }; break; } }
  }
  if (exact) add(-0.45, 'duplicate', `The same photo was already reported ${Math.round((r.ts - exact.ts) / HOUR)} h ago.`);
  else if (near) add(-0.35, 'near_duplicate', `Nearly the same photo was already reported (${near.d} of 64 fingerprint bits differ).`);

  // 2. Capture time from EXIF
  const ex = r.exif || null;
  if (ex && ex.taken_at) {
    const age = (r.ts - ex.taken_at) / HOUR;
    if (age < -1) add(-0.2, 'time_future', 'The photo says it was taken in the future: the camera clock or the file was changed.');
    else if (age <= 6) add(0.15, 'time_fresh', `Taken ${age < 1 ? 'less than an hour' : Math.round(age) + ' h'} before it was sent.`);
    else if (age <= 48) add(-0.05, 'time_old', `Taken ${Math.round(age)} h before it was sent.`);
    else add(-0.3, 'time_stale', `Taken ${Math.round(age / 24)} days before it was sent: probably not a current fire.`);
  } else reasons.push({ signal: 'time_missing', effect: 0, text: 'No capture time in the photo (common when apps strip it).' });

  // 3. Capture place from EXIF GPS
  if (ex && ex.lat != null && ex.lon != null) {
    const d = km({ lat: ex.lat, lon: ex.lon }, r);
    if (d <= 5) add(0.1, 'gps_match', `Photo GPS is ${d.toFixed(1)} km from the reported spot.`);
    else if (d <= 25) add(-0.05, 'gps_near', `Photo GPS is ${d.toFixed(0)} km from the reported spot.`);
    else add(-0.3, 'gps_far', `Photo GPS is ${d.toFixed(0)} km from the reported spot: taken somewhere else.`);
  } else reasons.push({ signal: 'gps_missing', effect: 0, text: 'No GPS in the photo.' });

  // 4. What Gemini sees
  if (a.unverified) add(-0.2, 'not_checked', 'Not checked by Gemini.');
  const au = a.authenticity || {};
  if (au.photo_of_screen_or_print) add(-0.35, 'screen_photo', 'Looks like a photo of a screen or a printout.');
  if (au.looks_ai_generated_or_stock) add(-0.35, 'synthetic', 'Looks AI-generated or like a stock image.');
  if (au.scene === 'indoor') add(-0.15, 'indoor', 'Scene looks indoor.');
  if (au.lighting && au.lighting !== 'unclear') {
    const when = ex && ex.taken_at ? ex.taken_at : r.ts, want = expectedLight(when);
    const clash = (au.lighting === 'day' && want === 'night') || (au.lighting === 'night' && want === 'day');
    if (clash) add(-0.15, 'light_mismatch', `The photo shows ${au.lighting}, but it is ${want} at that time.`);
  }

  // 5. Satellite corroboration for burning
  if (a.source_type === 'crop_residue_burning' && r.satellite_fires_within_10km > 0) {
    add(0.1, 'satellite_support', `${r.satellite_fires_within_10km} satellite fire detection${r.satellite_fires_within_10km > 1 ? 's' : ''} within 10 km in the last 24 h.`);
  }

  score = Math.max(0.05, Math.min(1, score));
  const level = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
  return { score: +score.toFixed(2), level, reasons, used_in_forecast: score >= 0.25 };
}

module.exports = { assess, hamming, expectedLight };

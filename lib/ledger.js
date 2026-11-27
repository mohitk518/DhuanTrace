// Forecast ledger: out-of-sample accuracy.
// Every hour, for each city with CPCB stations, the app writes down its forecast for 3, 6, 12 and 24 hours ahead
// BEFORE the time comes. When that hour arrives it records what CPCB actually measured. Scores compare three
// forecasts on exactly the same cases: CAMS alone, DhuanTrace, and persistence (AQI stays as it is now), which is
// the baseline any forecast has to beat. Nothing is back-filled or re-scored later.
const db = require('./datastore');
const { defaultCamsError, quantile } = require('./engine');

const HOUR = 3600e3;
const LEADS = [3, 6, 12, 24];
const MIN_BUCKET = 20, MIN_POOLED = 30;

let entries = db.load('ledger.json', []);
const save = () => db.save('ledger.json', entries.slice(-20000));
const catIndex = (a) => [50, 100, 200, 300, 400, Infinity].findIndex((b) => a <= b);

// analyses: [{ place, aqi_now, forecast }] for the cities; only cities whose AQI comes from CPCB are used
function record(analyses, now = Date.now()) {
  const issued = Math.floor(now / HOUR) * HOUR;
  let added = 0;
  for (const a of analyses) {
    if (!a || !a.aqi_now || !/^CPCB/.test(a.aqi_now.source || '') || a.aqi_now.value == null) continue;
    for (const lead of LEADS) {
      const target = issued + lead * HOUR;
      const f = a.forecast.find((p) => p.t === target);
      if (!f) continue;
      const id = `${a.place.id}:${issued}:${lead}`;
      if (entries.some((e) => e.id === id)) continue;
      entries.push({ id, city: a.place.name, city_id: a.place.id, issued, target, lead, persistence: a.aqi_now.value, cams: f.cams, dt: f.corrected, lo: f.lo ?? null, hi: f.hi ?? null, obs: null });
      added++;
    }
  }
  if (added) save();
  return added;
}

// observed: { city_id: CPCB AQI now }. Scores forecasts whose target hour has just arrived (within 90 minutes);
// a target that passed without an observation is marked missed rather than guessed.
function score(observed, now = Date.now()) {
  let scored = 0, missed = 0;
  for (const e of entries) {
    if (e.obs != null || e.missed || e.target > now) continue;
    if (now - e.target <= 90 * 60e3 && observed[e.city_id] != null) { e.obs = observed[e.city_id]; e.scored_at = now; scored++; }
    else if (now - e.target > 90 * 60e3) { e.missed = true; missed++; }
  }
  if (scored || missed) save();
  return { scored, missed };
}

function metricsFor(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const mae = (k) => Math.round((10 * rows.reduce((a, r) => a + Math.abs(r[k] - r.obs), 0)) / n) / 10;
  const hit = (k) => Math.round((100 * rows.filter((r) => catIndex(r[k]) === catIndex(r.obs)).length) / n);
  const ranged = rows.filter((r) => r.lo != null && r.hi != null);
  const m = {
    n, mae_dhuantrace: mae('dt'), mae_cams: mae('cams'), mae_persistence: mae('persistence'),
    bias_dhuantrace: Math.round(rows.reduce((a, r) => a + (r.dt - r.obs), 0) / n),
    category_hit_dhuantrace: hit('dt'), category_hit_cams: hit('cams'), category_hit_persistence: hit('persistence'),
    range_coverage: ranged.length ? Math.round((100 * ranged.filter((r) => r.obs >= r.lo && r.obs <= r.hi).length) / ranged.length) : null,
  };
  // Skill: how much of the persistence error DhuanTrace removes (positive = better than persistence)
  m.skill_vs_persistence = m.mae_persistence ? Math.round(100 * (1 - m.mae_dhuantrace / m.mae_persistence)) : null;
  m.skill_vs_cams = m.mae_cams ? Math.round(100 * (1 - m.mae_dhuantrace / m.mae_cams)) : null;
  return m;
}

function metrics() {
  const scored = entries.filter((e) => e.obs != null);
  const pending = entries.filter((e) => e.obs == null && !e.missed).length;
  return {
    written: entries.length, scored: scored.length, pending, missed: entries.filter((e) => e.missed).length,
    cities: [...new Set(scored.map((e) => e.city))],
    first_issued: entries.length ? Math.min(...entries.map((e) => e.issued)) : null,
    overall: metricsFor(scored),
    by_lead: LEADS.map((lead) => ({ lead, ...metricsFor(scored.filter((e) => e.lead === lead)) })),
    recent: scored.slice(-12).reverse().map(({ city, issued, target, lead, dt, cams, persistence, lo, hi, obs }) => ({ city, issued, target, lead, dt, cams, persistence, lo, hi, obs })),
    error_model: camsError(12).source,
    note: 'Forecasts are written before the target hour and scored once against the CPCB reading at that hour. Only cities with a CPCB station within 25 km are used.',
  };
}

// CAMS error spread (observed / CAMS − 1) for a lead time, learned from scored forecasts; default until enough data
function camsError(leadH) {
  const scored = entries.filter((e) => e.obs != null && e.cams > 0);
  const nearest = LEADS.reduce((b, l) => (Math.abs(l - leadH) < Math.abs(b - leadH) ? l : b), LEADS[0]);
  const bucket = scored.filter((e) => e.lead === nearest);
  const pick = bucket.length >= MIN_BUCKET ? bucket : scored.length >= MIN_POOLED ? scored : null;
  if (!pick) return defaultCamsError(leadH);
  const rel = pick.map((e) => e.obs / e.cams - 1);
  // A pooled estimate still widens with lead time, like the default does
  const widen = pick === bucket ? 0 : Math.min(0.2, Math.max(0, leadH - 12) * 0.005);
  return { q10: quantile(rel, 0.1) - widen, q90: quantile(rel, 0.9) + widen, source: 'ledger', n: pick.length };
}

// For tests only
const _reset = (list = []) => { entries = list; };

module.exports = { record, score, metrics, camsError, LEADS, _reset };

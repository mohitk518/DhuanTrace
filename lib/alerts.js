// Alert workflow: drafted alerts are logged, move through statuses, and get an outcome check.
// The outcome compares how much AQI changed after the alert with how much the CAMS model alone expected it to change,
// so a change caused by weather is not credited to the action (a simple difference-in-differences against the model).
const crypto = require('crypto');
const db = require('./datastore');

const HOUR = 3600e3;
const STATUSES = ['drafted', 'sent', 'acknowledged', 'action_taken', 'resolved'];
const LABEL = { drafted: 'Drafted', sent: 'Sent', acknowledged: 'Acknowledged', action_taken: 'Action taken', resolved: 'Resolved' };
let alerts = db.load('alerts.json', []);
const save = () => db.save('alerts.json', alerts.slice(0, 500));

const camsNow = (a) => {
  const f = a.forecast.filter((p) => p.t <= a.generated_at).pop();
  return f ? f.cams : null;
};

function create({ place, analysis, draft, lang }) {
  const now = Date.now();
  const a = {
    id: crypto.randomUUID(), created_at: now, status: 'drafted', lang,
    place: { name: place.name, lat: place.lat, lon: place.lon, city: place.id !== 'point' ? place.id : null },
    to: String(draft.to || '').slice(0, 300), cc: String(draft.cc || '').slice(0, 300),
    subject: String(draft.subject || '').slice(0, 300), body: String(draft.body || '').slice(0, 4000), by: String(draft.by || 'template').slice(0, 20),
    at_alert: { aqi: analysis.aqi_now.value, cams: camsNow(analysis), top_district: analysis.attribution[0] ? analysis.attribution[0].district : null },
    history: [{ status: 'drafted', at: now, note: '' }],
  };
  alerts.unshift(a); save();
  return a;
}

function setStatus(id, status, note) {
  const a = alerts.find((x) => x.id === id);
  if (!a) throw Object.assign(new Error('No such alert.'), { code: 404 });
  if (!STATUSES.includes(status)) throw Object.assign(new Error(`Status must be one of: ${STATUSES.join(', ')}.`), { code: 400 });
  a.status = status;
  a.history.push({ status, at: Date.now(), note: String(note || '').slice(0, 500) });
  save();
  return a;
}

// Outcome: needs at least 6 hours after the action; analyseAt(place) gives the current analysis
async function outcome(a, analyseAt) {
  const acted = [...a.history].reverse().find((h) => h.status === 'action_taken' || h.status === 'resolved');
  if (!acted) return { state: 'waiting for action' };
  if (Date.now() - acted.at < 6 * HOUR) return { state: 'too early', ready_at: acted.at + 6 * HOUR };
  const now = await analyseAt({ id: a.place.city || 'point', name: a.place.name, hi: a.place.name, lat: a.place.lat, lon: a.place.lon });
  const obs = now.aqi_now.value, cams = camsNow(now);
  if (obs == null || cams == null || a.at_alert.aqi == null || a.at_alert.cams == null) return { state: 'no data' };
  const observed = obs - a.at_alert.aqi, expected = cams - a.at_alert.cams, effect = observed - expected;
  return {
    state: 'measured', observed_change: Math.round(observed), model_expected_change: Math.round(expected), effect: Math.round(effect),
    verdict: effect <= -15 ? 'improved beyond weather' : effect >= 15 ? 'worse than weather explains' : 'no clear effect',
    note: 'Screening check: one location, model as the control. Not proof of cause.',
  };
}

async function list(analyseAt) {
  const out = [];
  for (const a of alerts.slice(0, 50)) out.push({ ...a, status_label: LABEL[a.status], outcome: await outcome(a, analyseAt).catch(() => ({ state: 'no data' })) });
  return out;
}

module.exports = { create, setStatus, list, STATUSES, LABEL };

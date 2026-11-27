// Federated learning of a forecast bias correction.
// Each city node learns, from its own CPCB stations, how far the CAMS model is off (observed AQI minus CAMS AQI)
// as a linear function of a few features. Nodes share only their model weights; the coordinator averages them
// (FedAvg, weighted by sample count). Other states can post their own weights to join the average.
const db = require('./datastore');
const src = require('./sources');
const { CITIES, km, nearestDistrict } = require('./places');
const { aqiSeries } = require('./aqi');

const HOUR = 3600e3;
const FEATURES = ['bias', 'cams_aqi/100', 'fire_smoke/50', 'sin(hour)', 'cos(hour)'];
const D = FEATURES.length;
const ROUNDS = 25, LOCAL_STEPS = 15, LR = 0.15, RIDGE = 0.01;

let samples = db.load('fed_samples.json', []);
let external = db.load('fed_external.json', []); // weights posted by other states' nodes

function nodeFor(p) {
  let best = null, bd = Infinity;
  for (const c of CITIES) { const d = km(c, p); if (d < bd) { bd = d; best = c; } }
  return bd <= 60 ? best.name : nearestDistrict(p).name;
}

function features(cams, fire, t) {
  const h = new Date(t + 5.5 * HOUR).getUTCHours();
  return [1, cams / 100, fire / 50, Math.sin((2 * Math.PI * h) / 24), Math.cos((2 * Math.PI * h) / 24)];
}

// Record one sample per live station per hour: target = (observed − CAMS) / 100
async function logSamples(analyseAt) {
  if (!src.status.stations || src.status.stations.mode !== 'live') return { logged: 0, reason: 'CPCB data is not live' };
  const now = Date.now(), hour = Math.floor(now / HOUR) * HOUR;
  const stations = (await src.getStations()).filter((s) => s.aqi != null).slice(0, 40);
  let logged = 0;
  for (const s of stations) {
    if (samples.some((x) => x.station === s.station && x.t === hour)) continue;
    const air = await src.getAirForecast(+s.lat.toFixed(2), +s.lon.toFixed(2));
    const cams = aqiSeries(air.times, air.pm25, air.pm10).filter((x) => x.t <= now).pop();
    if (!cams || !cams.aqi) continue;
    const a = await analyseAt({ id: 'point', name: s.station, hi: s.station, lat: s.lat, lon: s.lon });
    samples.push({ node: nodeFor(s), station: s.station, t: hour, cams: cams.aqi, fire: a.fire_influence_now, obs: s.aqi });
    logged++;
  }
  samples = samples.filter((x) => x.t > now - 30 * 24 * HOUR).slice(-20000);
  db.save('fed_samples.json', samples);
  return { logged };
}

// Simulated history for demo mode only: each city has its own true bias pattern plus noise.
// `cities` = [{name, ci}] where ci picks the city's bias pattern; the default is the first 8 MP cities.
function simulatedSamples(now, cities = CITIES.slice(0, 8).map((c, ci) => ({ name: c.name, ci })), seed0 = 7) {
  let seed = seed0; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
  const out = [];
  cities.forEach(({ ci, ...c }) => {
    const offset = 15 + ci * 6, fireGain = 0.3 + 0.05 * ci, diurnal = 12 + ci * 2;
    for (let k = 0; k < 72; k++) {
      const t = Math.floor(now / HOUR) * HOUR - (72 - k) * HOUR, h = new Date(t + 5.5 * HOUR).getUTCHours();
      const cams = 70 + 40 * rnd() + 20 * Math.cos((2 * Math.PI * (h - 22)) / 24);
      const fire = Math.max(0, 30 * rnd() - 8);
      const obs = cams + offset + fireGain * fire + diurnal * Math.cos((2 * Math.PI * (h - 23)) / 24) + 12 * gauss();
      out.push({ node: c.name, station: `${c.name} (simulated)`, t, cams: +cams.toFixed(1), fire: +fire.toFixed(1), obs: +obs.toFixed(1) });
    }
  });
  return out;
}

const dot = (w, x) => w.reduce((a, wi, i) => a + wi * x[i], 0);
const toXY = (rows) => rows.map((r) => ({ x: features(r.cams, r.fire, r.t), y: (r.obs - r.cams) / 100 }));

function localTrain(w0, data, steps = LOCAL_STEPS) {
  const w = [...w0];
  for (let s = 0; s < steps; s++) {
    const g = new Array(D).fill(0);
    for (const { x, y } of data) { const e = dot(w, x) - y; for (let i = 0; i < D; i++) g[i] += (2 * e * x[i]) / data.length; }
    for (let i = 0; i < D; i++) w[i] -= LR * (g[i] + 2 * RIDGE * w[i]);
  }
  return w;
}

// Mean absolute error in AQI points; w = null means "CAMS alone" (no correction)
const mae = (w, data) => (data.length ? (100 * data.reduce((a, { x, y }) => a + Math.abs((w ? dot(w, x) : 0) - y), 0)) / data.length : null);

function split(rows) {
  const s = [...rows].sort((a, b) => a.t - b.t);
  const cut = s.length >= 8 ? Math.floor(s.length * 0.75) : s.length;
  return { train: toXY(s.slice(0, cut)), test: toXY(s.slice(cut)) };
}

function fedAvg(nodes, rounds = ROUNDS, onRound) {
  let w = new Array(D).fill(0);
  const ext = external.filter((e) => Array.isArray(e.weights) && e.weights.length === D);
  for (let r = 1; r <= rounds; r++) {
    const updates = nodes.map((n) => ({ w: localTrain(w, n.train), n: n.train.length }));
    for (const e of ext) updates.push({ w: e.weights, n: e.samples });
    const total = updates.reduce((a, u) => a + u.n, 0);
    w = new Array(D).fill(0).map((_, i) => updates.reduce((a, u) => a + (u.w[i] * u.n) / total, 0));
    if (onRound) onRound(r, w);
  }
  return w;
}

let lastModel = db.load('fed_model.json', null);

function train({ simulate = false } = {}) {
  const now = Date.now();
  const rows = simulate ? simulatedSamples(now) : samples;
  const byNode = new Map();
  for (const r of rows) { if (!byNode.has(r.node)) byNode.set(r.node, []); byNode.get(r.node).push(r); }
  const nodes = [...byNode.entries()].map(([name, rs]) => ({ name, rows: rs.length, stations: new Set(rs.map((x) => x.station)).size, ...split(rs) }))
    .filter((n) => n.train.length >= 4);
  if (nodes.length < 2) {
    return { mode: simulate ? 'simulation' : 'live', status: 'collecting', samples: rows.length, nodes: nodes.length,
      note: 'Federated training starts once at least 2 city nodes have 4 or more hourly samples each. The app logs one sample per CPCB station every hour while it runs with live CPCB data.' };
  }

  const history = [];
  const allTest = nodes.flatMap((n) => n.test);
  const global = fedAvg(nodes, ROUNDS, (r, w) => history.push({ round: r, mae: +mae(w, allTest).toFixed(1) }));

  const perNode = nodes.map((n) => {
    const local = localTrain(new Array(D).fill(0), n.train, ROUNDS * LOCAL_STEPS);
    // Leave this city out entirely, train on the others, and test on this city: does sharing help a city with no history?
    const others = nodes.filter((o) => o !== n);
    const unseen = fedAvg(others, ROUNDS);
    const all = [...n.train, ...n.test];
    return {
      node: n.name, stations: n.stations, samples: n.rows,
      mae_cams: +mae(null, n.test.length ? n.test : n.train).toFixed(1),
      mae_local: +mae(local, n.test.length ? n.test : n.train).toFixed(1),
      mae_federated: +mae(global, n.test.length ? n.test : n.train).toFixed(1),
      mae_unseen_city: +mae(unseen, all).toFixed(1), mae_unseen_cams: +mae(null, all).toFixed(1),
      local_weights: local.map((v) => +v.toFixed(4)),
    };
  });

  const avg = (k) => +(perNode.reduce((a, p) => a + p[k] * p.samples, 0) / perNode.reduce((a, p) => a + p.samples, 0)).toFixed(1);
  const model = {
    schema: 'dhuantrace-bias-model/1', mode: simulate ? 'simulation' : 'live', status: 'trained', trained_at: now,
    target: 'observed CPCB AQI minus CAMS-based AQI, divided by 100', features: FEATURES,
    weights: global.map((v) => +v.toFixed(4)), rounds: ROUNDS, local_steps: LOCAL_STEPS,
    nodes: perNode.length, external_nodes: external.length, samples: rows.length,
    summary: { mae_cams: avg('mae_cams'), mae_local: avg('mae_local'), mae_federated: avg('mae_federated'), mae_unseen_city: avg('mae_unseen_city'), mae_unseen_cams: avg('mae_unseen_cams') },
    history, per_node: perNode,
    how_to_use: 'corrected_aqi = cams_aqi + 100 * dot(weights, [1, cams_aqi/100, fire_smoke/50, sin(2*pi*hour/24), cos(2*pi*hour/24)]) with hour in IST',
  };
  if (!simulate) { lastModel = model; db.save('fed_model.json', model); }
  return model;
}

// Weights shared by another state's node join the average (validated, capped)
function addExternal({ node, weights, samples: n }) {
  node = String(node || '').replace(/[^\w .()-]/g, '').slice(0, 60);
  if (!node) throw Object.assign(new Error('Give a node name.'), { code: 400 });
  if (!Array.isArray(weights) || weights.length !== D || !weights.every((v) => Number.isFinite(v) && Math.abs(v) < 50)) {
    throw Object.assign(new Error(`weights must be ${D} finite numbers in this order: ${FEATURES.join(', ')}`), { code: 400 });
  }
  n = Math.max(1, Math.min(100000, Math.floor(+n || 1)));
  external = external.filter((e) => e.node !== node);
  external.push({ node, weights, samples: n, at: Date.now() });
  db.save('fed_external.json', external.slice(-50));
  return { accepted: true, node, samples: n, external_nodes: external.length };
}

// Apply the current shared model to a CAMS value
function correct(cams, fire, t) {
  if (!lastModel || lastModel.status !== 'trained') return null;
  return Math.max(0, Math.round(cams + 100 * dot(lastModel.weights, features(cams, fire, t))));
}

const stats = () => ({ samples: samples.length, nodes: new Set(samples.map((s) => s.node)).size, external_nodes: external.length, last_model: lastModel ? lastModel.trained_at : null });

const allSamples = () => samples;

module.exports = { logSamples, train, addExternal, correct, stats, FEATURES, simulatedSamples, allSamples,
  // building blocks shared with the networked federation (lib/fednet.js)
  localTrain, mae, toXY, split, D, ROUNDS, LOCAL_STEPS };

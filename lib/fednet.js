// Networked federated learning: separate node processes (one per region or state) that hold their own data and
// exchange only model weights with a coordinator over HTTP. Every message is signed (HMAC-SHA256), every reply is
// checked against a whitelist of fields, and the coordinator counts exactly what crossed the wire.
//
// Protocol dhuantrace.fednet/1 (all POST bodies JSON, all requests signed):
//   GET  /fed/info      -> { schema, node, region, mode, cities, train_rows, test_rows, features }
//   POST /fed/train     { round, weights }            -> { node, round, weights, samples }
//   POST /fed/evaluate  { weights } | { local: true } | { weights, on: 'all' }
//                                                     -> { node, rows, mae_cams, mae_model }
const crypto = require('crypto');
const fed = require('./federated');
const { CITIES, NEIGHBOUR_CITIES } = require('./places');

const SCHEMA = 'dhuantrace.fednet/1';
const MAX_SKEW_MS = 5 * 60e3;
const PERSONAL_STEPS = 30;

// ---------- regions (who holds which cities' data) ----------
// One federated node per region of the pack (from the region pack)
const REGIONS = require('./region').R.fed_regions;
// Each city keeps a fixed bias pattern in simulation, so results do not depend on how regions are drawn
const ALL_CITY_NAMES = [...CITIES.map((c) => c.name), ...NEIGHBOUR_CITIES.map((c) => c.name)];

// A node's own rows: live CPCB samples for its cities when there are enough, otherwise labelled simulation
function regionRows(regionKey, { mode = 'auto', now = Date.now() } = {}) {
  const r = REGIONS[regionKey];
  if (!r) throw new Error(`Unknown region ${regionKey}. Use one of: ${Object.keys(REGIONS).join(', ')}`);
  const live = fed.allSamples().filter((x) => r.cities.includes(x.node));
  if (mode === 'live' || (mode === 'auto' && live.length >= 16)) return { mode: 'live', rows: live };
  const cities = r.cities.map((name) => ({ name, ci: ALL_CITY_NAMES.indexOf(name) }));
  const seed = 11 + Object.keys(REGIONS).indexOf(regionKey) * 101;
  return { mode: 'simulation', rows: fed.simulatedSamples(now, cities, seed) };
}

// ---------- signing ----------
const sign = (secret, ts, body) => crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
function verify(secret, ts, body, sig) {
  if (!secret || !sig || !ts) return false;
  if (Math.abs(Date.now() - +ts) > MAX_SKEW_MS) return false;
  const want = Buffer.from(sign(secret, ts, body), 'hex'), got = Buffer.from(String(sig), 'hex');
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const validWeights = (w) => Array.isArray(w) && w.length === fed.D && w.every((v) => Number.isFinite(v) && Math.abs(v) < 50);

// ---------- node side ----------
function createNode({ regionKey, secret, mode = 'auto', log = () => {} }) {
  const region = REGIONS[regionKey];
  const { mode: dataMode, rows } = regionRows(regionKey, { mode });
  const { train, test } = fed.split(rows);
  const all = [...train, ...test];
  const info = () => ({ schema: SCHEMA, node: region.name, region: regionKey, state: region.state, mode: dataMode, cities: region.cities, train_rows: train.length, test_rows: test.length, features: fed.FEATURES });

  function handle(method, path, bodyText) {
    const body = bodyText ? JSON.parse(bodyText) : {};
    if (method === 'GET' && path === '/fed/info') return info();
    if (method === 'POST' && path === '/fed/train') {
      if (!validWeights(body.weights)) throw Object.assign(new Error('bad weights'), { code: 400 });
      const w = fed.localTrain(body.weights, train);
      log(`round ${body.round}: got ${fed.D} global weights, trained on ${train.length} own rows, sent back ${fed.D} weights (no data)`);
      return { node: region.name, round: body.round | 0, weights: w.map((v) => +v.toFixed(6)), samples: train.length };
    }
    if (method === 'POST' && path === '/fed/evaluate') {
      if (body.local) {
        const w = fed.localTrain(new Array(fed.D).fill(0), train, fed.ROUNDS * fed.LOCAL_STEPS);
        log(`baseline: trained alone, error on my own held-out rows ${fed.mae(w, test).toFixed(1)}`);
        return { node: region.name, rows: test.length, mae_cams: +fed.mae(null, test).toFixed(2), mae_model: +fed.mae(w, test).toFixed(2) };
      }
      if (!validWeights(body.weights)) throw Object.assign(new Error('bad weights'), { code: 400 });
      if (body.personalise) {
        // Start from the shared model and take a few steps on this node's own rows (personalised federated learning)
        const w = fed.localTrain(body.weights, train, PERSONAL_STEPS);
        log(`personalised: shared model + ${PERSONAL_STEPS} steps on my own rows, error ${fed.mae(w, test).toFixed(1)}`);
        return { node: region.name, rows: test.length, mae_cams: +fed.mae(null, test).toFixed(2), mae_model: +fed.mae(w, test).toFixed(2) };
      }
      const set = body.on === 'all' ? all : test;
      const m = fed.mae(body.weights, set);
      log(`${body.on === 'all' ? 'new-member test' : 'check'}: shared model error ${m.toFixed(1)} on ${set.length} of my rows (only the error number is sent)`);
      return { node: region.name, rows: set.length, mae_cams: +fed.mae(null, set).toFixed(2), mae_model: +m.toFixed(2) };
    }
    throw Object.assign(new Error('Not found'), { code: 404 });
  }

  // Node-side HTTP handler: rejects anything unsigned or stale
  function httpHandler(req, res) {
    const chunks = [];
    req.on('data', (c) => { if (chunks.reduce((a, b) => a + b.length, 0) < 1e5) chunks.push(c); });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/health') return reply(200, { ok: true, node: region.name });
      if (!verify(secret, req.headers['x-dt-ts'], text, req.headers['x-dt-signature'])) { log(`refused an unsigned or tampered request to ${path}`); return reply(401, { error: 'bad signature' }); }
      try { reply(200, handle(req.method, path, text)); } catch (e) { reply(e.code || 400, { error: e.message }); }
    });
  }
  return { info, handle, httpHandler };
}

// ---------- coordinator side ----------
// Replies may contain only these fields: anything else (e.g. raw rows) is refused and reported
const ALLOWED = {
  '/fed/info': ['schema', 'node', 'region', 'state', 'mode', 'cities', 'train_rows', 'test_rows', 'features'],
  '/fed/train': ['node', 'round', 'weights', 'samples'],
  '/fed/evaluate': ['node', 'rows', 'mae_cams', 'mae_model'],
};

function makeClient(secret, wire, timeoutMs = 5000) {
  return async function call(url, path, payload) {
    const body = payload ? JSON.stringify(payload) : '';
    const ts = String(Date.now());
    const r = await fetch(url.replace(/\/$/, '') + path, {
      method: payload ? 'POST' : 'GET', body: payload ? body : undefined,
      headers: { 'content-type': 'application/json', 'x-dt-ts': ts, 'x-dt-signature': sign(secret, ts, body) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    wire.messages++; wire.bytes_sent += Buffer.byteLength(body); wire.bytes_received += Buffer.byteLength(text);
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    const obj = JSON.parse(text);
    const extra = Object.keys(obj).filter((k) => !ALLOWED[path].includes(k));
    for (const k of Object.keys(obj)) wire.fields_received.add(k);
    if (extra.length) { wire.refused_fields.push(...extra); throw new Error(`${path} sent fields outside the protocol: ${extra.join(', ')}`); }
    return obj;
  };
}

function average(updates) {
  const total = updates.reduce((a, u) => a + u.samples, 0);
  return new Array(fed.D).fill(0).map((_, i) => updates.reduce((a, u) => a + (u.weights[i] * u.samples) / total, 0));
}

async function run({ peers, secret, rounds = fed.ROUNDS, log = () => {} }) {
  if (!secret) throw new Error('A shared secret (FED_SECRET) is needed to sign messages.');
  const started = Date.now();
  const wire = { messages: 0, bytes_sent: 0, bytes_received: 0, fields_received: new Set(), refused_fields: [] };
  const call = makeClient(secret, wire);
  const events = [];
  const note = (m) => { events.push({ t: Date.now() - started, m }); log(m); };

  // 1. Who is there
  const nodes = [];
  for (const url of peers) {
    try { const i = await call(url, '/fed/info'); nodes.push({ url, ...i }); note(`${i.node} joined: ${i.train_rows + i.test_rows} rows kept at the node (${i.mode})`); }
    catch (e) { note(`${url} did not answer (${e.message}); continuing without it`); }
  }
  if (nodes.length < 2) throw Object.assign(new Error('At least 2 nodes must answer to run federated learning.'), { code: 503 });

  // 2. Each node alone (baseline): only error numbers come back
  for (const n of nodes) {
    try { const e = await call(n.url, '/fed/evaluate', { local: true }); n.mae_cams = e.mae_cams; n.mae_local = e.mae_model; n.test_rows = e.rows; }
    catch (e) { note(`${n.node}: baseline failed (${e.message})`); }
  }

  // 3. Federated rounds: send global weights, get local weights back, average by sample count
  async function fedRounds(members, R, onRound) {
    let w = new Array(fed.D).fill(0);
    for (let r = 1; r <= R; r++) {
      const settled = await Promise.allSettled(members.map((n) => call(n.url, '/fed/train', { round: r, weights: w })));
      const updates = [];
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled' && validWeights(s.value.weights) && s.value.samples > 0) updates.push(s.value);
        else note(`round ${r}: ${members[i].node} missed this round (${s.status === 'rejected' ? s.reason.message : 'invalid update'})`);
      });
      if (!updates.length) throw new Error(`round ${r}: no node sent an update`);
      w = average(updates);
      if (onRound) await onRound(r, w, updates.length);
    }
    return w;
  }

  const history = [];
  const global = await fedRounds(nodes, rounds, async (r, w, got) => {
    if (r === 1 || r % 5 === 0 || r === rounds) {
      const ev = await Promise.allSettled(nodes.map((n) => call(n.url, '/fed/evaluate', { weights: w })));
      const ok = ev.filter((e) => e.status === 'fulfilled').map((e) => e.value);
      const rows = ok.reduce((a, e) => a + e.rows, 0);
      const m = rows ? ok.reduce((a, e) => a + e.mae_model * e.rows, 0) / rows : null;
      history.push({ round: r, nodes_answered: got, mae: m == null ? null : +m.toFixed(1) });
      note(`round ${r}: ${got} nodes sent weights; shared model error ${m == null ? 'n/a' : m.toFixed(1)} AQI points`);
    }
  });
  for (const n of nodes) {
    try {
      n.mae_federated = (await call(n.url, '/fed/evaluate', { weights: global })).mae_model;
      n.mae_personalised = (await call(n.url, '/fed/evaluate', { weights: global, personalise: true })).mae_model;
    } catch (e) { note(`${n.node}: final check failed (${e.message})`); }
  }

  // 4. A new member: train on the others only, then test on the node that never took part
  for (const n of nodes) {
    const others = nodes.filter((o) => o !== n);
    if (others.length < 1) continue;
    try {
      const w = await fedRounds(others, Math.min(rounds, 15));
      const e = await call(n.url, '/fed/evaluate', { weights: w, on: 'all' });
      n.mae_new_member = e.mae_model; n.mae_new_member_cams = e.mae_cams;
      note(`${n.node} as a new member (never trained): error ${e.mae_model} with the others' model vs ${e.mae_cams} with CAMS alone`);
    } catch (e) { note(`${n.node}: new-member test failed (${e.message})`); }
  }

  const wavg = (k) => { const ok = nodes.filter((n) => n[k] != null && n.test_rows); const t = ok.reduce((a, n) => a + n.test_rows, 0); return t ? +(ok.reduce((a, n) => a + n[k] * n.test_rows, 0) / t).toFixed(1) : null; };
  const modes = new Set(nodes.map((n) => n.mode));
  return {
    schema: SCHEMA, ran_at: started, took_ms: Date.now() - started,
    mode: modes.size === 1 ? [...modes][0] : 'mixed',
    nodes: nodes.map(({ url, schema, features, ...n }) => ({ ...n, address: url })),
    unreachable: peers.length - nodes.length,
    rounds, history, weights: global.map((v) => +v.toFixed(4)), features: fed.FEATURES,
    summary: { mae_cams: wavg('mae_cams'), mae_local: wavg('mae_local'), mae_federated: wavg('mae_federated'), mae_personalised: wavg('mae_personalised') },
    wire: {
      messages: wire.messages, bytes_sent: wire.bytes_sent, bytes_received: wire.bytes_received,
      fields_received: [...wire.fields_received].sort(), refused_fields: wire.refused_fields,
      raw_rows_received: 0, signed: 'HMAC-SHA256 on every request; nodes refuse unsigned or older than 5 minutes',
    },
    events,
  };
}

module.exports = { SCHEMA, REGIONS, regionRows, createNode, run, sign, verify, makeClient, ALLOWED };

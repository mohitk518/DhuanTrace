// Starts the federated network for the app: either the nodes named in FED_PEERS (other machines or states),
// or, for a one-click demo, four local node processes (separate PIDs, ports and memory) started from fednode.js.
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fednet = require('./fednet');
const db = require('./datastore');

const children = []; // { region, port, pid, proc, log[] }
let secret = process.env.FED_SECRET || null;
let running = null;
let last = db.load('fednet.json', null);

const peersFromEnv = () => String(process.env.FED_PEERS || '').split(',').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));

async function waitHealthy(url, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url + '/health', { signal: AbortSignal.timeout(800) }); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function startLocalNodes(basePort) {
  if (children.length && children.every((c) => c.proc.exitCode == null)) return children;
  stopLocalNodes();
  if (!secret) secret = crypto.randomBytes(24).toString('hex');
  Object.keys(fednet.REGIONS).forEach((region, i) => {
    const port = basePort + i;
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'fednode.js')], {
      env: { ...process.env, FED_REGION: region, FED_SECRET: secret, PORT: String(port), FED_DATA: process.env.FED_DATA || 'auto' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const c = { region, port, pid: proc.pid, proc, log: [] };
    const push = (d) => { for (const line of String(d).split('\n')) if (line.trim()) { c.log.push({ t: Date.now(), line: line.trim() }); if (c.log.length > 200) c.log.shift(); } };
    proc.stdout.on('data', push); proc.stderr.on('data', push);
    children.push(c);
  });
  const ok = await Promise.all(children.map((c) => waitHealthy(`http://127.0.0.1:${c.port}`)));
  if (!ok.some(Boolean)) throw Object.assign(new Error('The local nodes did not start.'), { code: 503 });
  return children;
}

function stopLocalNodes() {
  for (const c of children) { try { c.proc.kill(); } catch {} }
  children.length = 0;
}
process.on('exit', stopLocalNodes);

// Run one federated training over the network. Only one run at a time.
async function runNetwork({ basePort }) {
  if (running) return running;
  running = (async () => {
    let peers = peersFromEnv(), where = 'FED_PEERS';
    if (!peers.length) { await startLocalNodes(basePort); peers = children.map((c) => `http://127.0.0.1:${c.port}`); where = 'local node processes'; }
    const result = await fednet.run({ peers, secret });
    await new Promise((r) => setTimeout(r, 300)); // let the nodes' last log lines arrive
    last = { ...result, network: where };
    db.save('fednet.json', last);
    return last;
  })();
  try { return await running; } finally { running = null; }
}

const status = () => ({
  last,
  peers_configured: peersFromEnv().length,
  local_nodes: children.map((c) => ({ region: c.region, node: fednet.REGIONS[c.region].name, port: c.port, pid: c.pid, alive: c.proc.exitCode == null, log: c.log.slice(-200) })),
  running: !!running,
});

module.exports = { runNetwork, status, stopLocalNodes, startLocalNodes };

// Networked federated learning: real HTTP nodes on this machine, signed messages, privacy whitelist, faults.
const http = require('http');
const os = require('os'), path = require('path');
process.env.DATA_DIR = path.join(os.tmpdir(), `dt-fednet-${Date.now()}`);
const fednet = require('../lib/fednet');

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const SECRET = 'test-secret-123';

function serve(handler) {
  return new Promise((resolve) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` })); });
}

(async () => {
  const servers = [];
  try {
    // Signing
    const ts = String(Date.now()), body = '{"a":1}';
    const sig = fednet.sign(SECRET, ts, body);
    assert(fednet.verify(SECRET, ts, body, sig), 'a correctly signed message is accepted');
    assert(!fednet.verify(SECRET, ts, '{"a":2}', sig), 'a changed body is refused');
    assert(!fednet.verify('other', ts, body, sig), 'a message signed with another secret is refused');
    const old = String(Date.now() - 10 * 60e3);
    assert(!fednet.verify(SECRET, old, body, fednet.sign(SECRET, old, body)), 'a message older than 5 minutes is refused (replay)');

    // A node only ever answers with protocol fields
    const west = fednet.createNode({ regionKey: 'mp-west', secret: SECRET, mode: 'simulation' });
    const tr = west.handle('POST', '/fed/train', JSON.stringify({ round: 1, weights: [0, 0, 0, 0, 0] }));
    assert(Object.keys(tr).every((k) => fednet.ALLOWED['/fed/train'].includes(k)) && tr.weights.length === 5, 'a node answers a training round with only node, round, weights and samples');
    let threw = false; try { west.handle('POST', '/fed/train', JSON.stringify({ weights: [1, 2] })); } catch { threw = true; }
    assert(threw, 'a node refuses malformed weights');

    // Real network: 4 honest nodes
    for (const r of Object.keys(fednet.REGIONS)) servers.push(await serve(fednet.createNode({ regionKey: r, secret: SECRET, mode: 'simulation' }).httpHandler));
    const unsigned = await fetch(servers[0].url + '/fed/info');
    assert(unsigned.status === 401, 'a node refuses an unsigned request with 401');

    const res = await fednet.run({ peers: servers.map((x) => x.url), secret: SECRET, rounds: 10 });
    assert(res.nodes.length === 4 && res.unreachable === 0, 'all 4 nodes took part');
    const allowed = new Set(Object.values(fednet.ALLOWED).flat());
    assert(res.wire.fields_received.every((f) => allowed.has(f)) && !res.wire.fields_received.some((f) => /obs|rows$|^x$|^y$|station/.test(f) && f !== 'rows' && f !== 'train_rows' && f !== 'test_rows'), `coordinator received only protocol fields (${res.wire.fields_received.join(', ')})`);
    assert(res.wire.messages > 40 && res.wire.bytes_received < 200e3, `${res.wire.messages} messages, ${(res.wire.bytes_received / 1024).toFixed(1)} KB received: weights and scores only`);
    const nm = res.nodes.filter((n) => n.mae_new_member != null);
    assert(nm.length === 4 && nm.every((n) => n.mae_new_member < n.mae_new_member_cams), 'every node, as a new member that never trained, does better with the others\' model than with CAMS alone');
    assert(res.summary.mae_personalised <= res.summary.mae_federated, 'shared model plus own tuning is at least as good as the plain shared model');
    assert(res.mode === 'simulation', 'simulated history is labelled as simulation');

    // Faults: one node down, one node with the wrong secret, one node that leaks data
    const wrong = await serve(fednet.createNode({ regionKey: 'mp-east', secret: 'wrong', mode: 'simulation' }).httpHandler);
    const leaky = fednet.createNode({ regionKey: 'rajasthan', secret: SECRET, mode: 'simulation' });
    const leak = await serve((req, res2) => {
      // Wraps an honest node but adds raw rows to training replies
      const orig = res2.end.bind(res2);
      res2.end = (txt) => { try { const o = JSON.parse(txt); if (o.weights) o.rows_dump = [{ obs: 180, cams: 120 }]; return orig(JSON.stringify(o)); } catch { return orig(txt); } };
      leaky.httpHandler(req, res2);
    });
    servers.push(wrong, leak);
    const res2 = await fednet.run({ peers: [servers[0].url, servers[1].url, 'http://127.0.0.1:1', wrong.url, leak.url], secret: SECRET, rounds: 5 });
    assert(res2.unreachable === 2, 'a node that is down and a node with the wrong secret are left out; the run continues');
    assert(res2.wire.refused_fields.includes('rows_dump') && res2.events.some((e) => /missed this round/.test(e.m)), 'a node that sends raw data is refused in that round and reported');
    assert(res2.nodes.length === 3 && res2.summary.mae_federated != null, 'training still completes with the honest nodes');

    let err = null; try { await fednet.run({ peers: [servers[0].url], secret: SECRET }); } catch (e) { err = e; }
    assert(err && err.code === 503, 'fewer than 2 nodes gives a clear error');
  } finally { for (const x of servers) x.s.close(); }
})();

// One federated node: a separate process that keeps its region's data and only ever sends model weights.
// Run:  FED_REGION=mp-west FED_SECRET=... PORT=8091 node fednode.js
// Regions: mp-west, mp-central, mp-east, rajasthan (see lib/fednet.js)
try { process.loadEnvFile(); } catch {}
const http = require('http');
const { createNode, REGIONS } = require('./lib/fednet');

const regionKey = process.env.FED_REGION || 'mp-west';
const secret = process.env.FED_SECRET;
const port = +process.env.PORT || 8091;
if (!REGIONS[regionKey]) { console.error(`Unknown FED_REGION ${regionKey}. Use one of: ${Object.keys(REGIONS).join(', ')}`); process.exit(1); }
if (!secret) { console.error('Set FED_SECRET (the same value on the coordinator and every node).'); process.exit(1); }

const node = createNode({ regionKey, secret, mode: process.env.FED_DATA || 'auto', log: (m) => console.log(`[${REGIONS[regionKey].name}] ${m}`) });
const i = node.info();
http.createServer(node.httpHandler).listen(port, () => {
  console.log(`[${i.node}] pid ${process.pid}, port ${port}: holding ${i.train_rows + i.test_rows} rows for ${i.cities.join(', ')} (${i.mode}). Data never leaves this process.`);
});

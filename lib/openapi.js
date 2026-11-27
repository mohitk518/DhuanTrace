// OpenAPI 3.1 description of the DhuanTrace API, so other cities, states and tools can connect to it.
// test/openapi.test.js checks that every route in server.js is described here and every path here exists.
const pkg = require('../package.json');

const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
const num = { type: 'number' }, int = { type: 'integer' }, str = { type: 'string' }, bool = { type: 'boolean' };
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const q = (name, description, schema = str, required = false) => ({ name, in: 'query', required, description, schema });
const placeParams = [q('city', 'City id, e.g. indore (see /api/cities)'), q('lat', 'Latitude, instead of city', num), q('lon', 'Longitude, instead of city', num), q('name', 'Display name for a lat/lon point')];
const errors = { 400: json(ref('Error'), 'Invalid input'), 404: json(ref('Error'), 'Not found') };
const post = { 413: json(ref('Error'), 'Body too large'), 415: json(ref('Error'), 'Body must be JSON'), 429: json(ref('Error'), 'Too many requests from this address; see Retry-After') };
const body = (schema, required = true) => ({ required, content: { 'application/json': { schema } } });

const paths = {
  '/api/health': { get: { tags: ['System'], summary: 'Liveness check', responses: { 200: json(obj({ ok: bool })) } } },
  '/api/jobs/hourly': { post: { tags: ['System'], summary: 'Run the hourly jobs (forecast ledger, federated samples). Called by Cloud Scheduler with the x-job-token header', parameters: [{ name: 'x-job-token', in: 'header', required: true, schema: str }], responses: { 200: json(obj({ at: int, stations: str, ledger: { type: 'object' }, federated: { type: 'object' }, errors: { type: 'array', items: str } })), 403: json(ref('Error'), 'Missing or wrong token'), ...post } } },
  '/api/system': { get: { tags: ['System'], summary: 'Health of every data source, request metrics, uptime and version', responses: { 200: json(ref('System')) } } },
  '/api/status': { get: { tags: ['System'], summary: 'Live or sample mode of each data source', responses: { 200: json(obj({ sources: { type: 'object' }, languages: { type: 'object' }, now: int })) } } },
  '/api/openapi.json': { get: { tags: ['System'], summary: 'This description', responses: { 200: json({ type: 'object' }) } } },
  '/api/requirements': { get: { tags: ['System'], summary: 'Track 02 requirements traced to features, API, tests and a live check', responses: { 200: json(obj({ track: str, requirements: { type: 'array' }, live: { type: 'object' } })) } } },
  '/api/region': { get: { tags: ['System'], summary: 'The region pack this node runs: name, home states and their pollution boards, counts, available packs', responses: { 200: json(obj({ id: str, name: str, home_states: { type: 'array', items: { type: 'object' } }, districts: int, cities: int, available: { type: 'array', items: str } })) } } },
  '/api/cities': { get: { tags: ['Air'], summary: 'The cities of the active region pack, with population', responses: { 200: json({ type: 'array', items: ref('Place') }) } } },
  '/api/fires': { get: { tags: ['Air'], summary: 'Satellite fire detections (NASA FIRMS) with district', parameters: [q('hours', 'Look back 1–48 hours', int)], responses: { 200: json({ type: 'array', items: ref('Fire') }) } } },
  '/api/stations': { get: { tags: ['Air'], summary: 'CPCB stations with current AQI and category', responses: { 200: json({ type: 'array', items: { type: 'object' } }) } } },
  '/api/analyze': { get: { tags: ['Air'], summary: 'Smoke attribution by district and state, 48 h forecast with range, smoke on the way', parameters: placeParams, responses: { 200: json(ref('Analysis')), ...errors } } },
  '/api/priorities': { get: { tags: ['Action'], summary: 'Home-region districts whose fires put smoke into the most people\'s air', responses: { 200: json({ type: 'object' }) } } },
  '/api/hotspots': { get: { tags: ['Air'], summary: 'Hidden hotspots: pollution CAMS and traced smoke cannot explain, with evidence and satellite check', responses: { 200: json(ref('Hotspots')) } } },
  '/api/corridors': { get: { tags: ['Air'], summary: '48 h worst-point forecast for six industrial corridors with spike alerts', responses: { 200: json({ type: 'object' }) } } },
  '/api/ledger': { get: { tags: ['Accuracy'], summary: 'Forecast ledger: forecasts written before and scored against CPCB after', responses: { 200: json({ type: 'object' }) } } },
  '/api/skill': { get: { tags: ['Accuracy'], summary: 'Model AQI versus each CPCB station right now', responses: { 200: json({ type: 'object' }) } } },
  '/api/verify': { get: { tags: ['Accuracy'], summary: 'Gemini reads the NASA true-colour image over a district\'s fires and checks the smoke direction', parameters: [q('district', 'District name in the active region pack', str, true)], responses: { 200: json({ type: 'object' }), ...errors } } },
  '/api/interstate': { get: { tags: ['Sharing'], summary: 'Open bulletin: farm-fire smoke into and out of the home region by state (schema dhuantrace.interstate/1)', responses: { 200: json({ type: 'object' }) } } },
  '/api/packet': { get: { tags: ['Sharing'], summary: 'Open city forecast packet (schema open-clean-air-packet/0.1)', parameters: placeParams, responses: { 200: json({ type: 'object' }), ...errors } } },
  '/api/model': { get: { tags: ['Sharing'], summary: 'Shared bias-correction model trained by the cities (weights only)', responses: { 200: json(ref('Model')) } } },
  '/api/federated': { get: { tags: ['Sharing'], summary: 'Federated training report per city node', parameters: [q('simulate', '1 for the labelled simulation', str)], responses: { 200: json({ type: 'object' }) } } },
  '/api/federated/update': { post: { tags: ['Sharing'], summary: 'Another state posts its model weights to join the average', requestBody: body(obj({ node: str, weights: { type: 'array', items: num, minItems: 5, maxItems: 5 }, samples: int }, ['node', 'weights'])), responses: { 201: json(obj({ accepted: bool, node: str, samples: int, external_nodes: int })), ...errors, ...post } } },
  '/api/fednet': { get: { tags: ['Sharing'], summary: 'Federated network: last run and the node processes', responses: { 200: json({ type: 'object' }) } } },
  '/api/fednet/run': { post: { tags: ['Sharing'], summary: 'Train over the network of separate nodes (protocol dhuantrace.fednet/1); only weights and error scores cross the wire', responses: { 200: json(ref('FedNetRun')), 503: json(ref('Error'), 'Fewer than 2 nodes answered'), ...post } } },
  '/api/reports': {
    get: { tags: ['Citizens'], summary: 'Citizen photo reports (last 48 h) with Gemini reading and trust score', responses: { 200: json({ type: 'array', items: ref('Report') }) } },
    post: { tags: ['Citizens'], summary: 'Send a photo report', requestBody: body(obj({ image: { type: 'string', description: 'data:image/jpeg|png|webp;base64,…' }, lat: num, lon: num, exif_head: { type: 'string', description: 'base64 of the first 128 KB of the original file, for EXIF time and GPS' }, phash: { type: 'string', description: '64-bit dHash as 16 hex digits' } }, ['image', 'lat', 'lon'])), responses: { 201: json(ref('Report')), ...errors, ...post } },
  },
  '/api/reports/{id}/photo': { get: { tags: ['Citizens'], summary: 'The reported photo', parameters: [{ name: 'id', in: 'path', required: true, schema: str }], responses: { 200: { description: 'Image', content: { 'image/*': {} } }, 404: errors[404] } } },
  '/api/sensors': {
    get: { tags: ['Citizens'], summary: 'Citizen sensor readings, calibrated against CPCB', responses: { 200: json({ type: 'array', items: { type: 'object' } }) } },
    post: { tags: ['Citizens'], summary: 'Send a PM2.5 (and PM10) reading', requestBody: body(obj({ lat: num, lon: num, pm25: { type: 'number', minimum: 0, maximum: 999 }, pm10: { type: 'number', minimum: 0, maximum: 1999 }, device: { type: 'string', maxLength: 40 } }, ['lat', 'lon', 'pm25'])), responses: { 201: json({ type: 'object' }), ...errors, ...post } },
  },
  '/api/alert': { post: { tags: ['Action'], summary: 'Draft an alert for the responsible district Collector (Gemini, template fallback)', requestBody: body(obj({ city: str, lat: num, lon: num, lang: { type: 'string', description: 'en, hi, mr, gu, bn, ta, te, ur' } })), responses: { 200: json({ type: 'object' }), ...errors, ...post } } },
  '/api/alerts': {
    get: { tags: ['Action'], summary: 'Alert log with outcome checks', responses: { 200: json({ type: 'array', items: { type: 'object' } }) } },
    post: { tags: ['Action'], summary: 'Save a drafted alert to the log', requestBody: body(obj({ city: str, lang: str, to: str, cc: str, subject: str, body: str, by: str }, ['subject', 'body'])), responses: { 201: json({ type: 'object' }), ...errors, ...post } },
  },
  '/api/alerts/{id}/status': { post: { tags: ['Action'], summary: 'Move an alert to sent, acknowledged, action_taken or resolved', parameters: [{ name: 'id', in: 'path', required: true, schema: str }], requestBody: body(obj({ status: { type: 'string', enum: ['sent', 'acknowledged', 'action_taken', 'resolved'] }, note: str }, ['status'])), responses: { 200: json({ type: 'object' }), ...errors, ...post } } },
  '/api/ask': { post: { tags: ['Action'], summary: 'Ask a question in any listed language; answered from the computed numbers only', requestBody: body(obj({ question: { type: 'string', maxLength: 400 }, city: str, lang: str }, ['question'])), responses: { 200: json(obj({ answer: str, follow_ups: { type: 'array', items: str }, by: str })), ...errors, ...post } } },
};

const schemas = {
  Error: obj({ error: str }, ['error']),
  Place: obj({ id: str, name: str, hi: str, lat: num, lon: num, pop: int }),
  Fire: obj({ lat: num, lon: num, ts: { type: 'integer', description: 'ms since epoch, UTC' }, frp: { type: 'number', description: 'fire radiative power, MW' }, source: str, district: str }),
  Analysis: obj({ place: ref('Place'), aqi_now: { type: 'object' }, peak_24h: obj({ value: int, t: int, lo: int, hi: int }), attribution: { type: 'array', items: obj({ district: str, state: str, outside_mp: bool, share: num }) }, by_state: { type: 'array', items: { type: 'object' } }, forecast: { type: 'array', items: obj({ t: int, cams: num, corrected: num, lo: num, hi: num }) }, upcoming: { type: 'object' } }),
  Hotspots: obj({ points_checked: int, hotspots: { type: 'array', items: obj({ lat: num, lon: num, district: str, likely_source: str, confidence: num, excess: num, evidence: { type: 'array', items: str }, satellite: { type: 'object', description: 'aod and no2: over_spot, around, ratio, verdict (supports | weak | no_local_excess | no_data | unavailable), date, source' } }) } }),
  Report: obj({ id: str, lat: num, lon: num, ts: int, district: str, analysis: { type: 'object' }, trust: obj({ score: num, level: str, used_in_forecast: bool, reasons: { type: 'array', items: { type: 'object' } } }) }),
  Model: obj({ schema: { const: 'dhuantrace-bias-model/1' }, features: { type: 'array', items: str }, weights: { type: 'array', items: num }, how_to_use: str }),
  FedNetRun: obj({ schema: { const: 'dhuantrace.fednet/1' }, mode: str, nodes: { type: 'array', items: { type: 'object' } }, summary: { type: 'object' }, wire: obj({ messages: int, bytes_sent: int, bytes_received: int, fields_received: { type: 'array', items: str }, raw_rows_received: int }) }),
  System: obj({ ok: bool, version: str, uptime_s: int, sources: { type: 'object' }, requests: { type: 'object' } }),
};

function spec(serverUrl) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'DhuanTrace API', version: pkg.version, license: { name: pkg.license },
      description: 'Farm-fire smoke attribution, AQI forecasts, hidden hotspots, corridor alerts and a federated model for Madhya Pradesh and its neighbours by default; other regions run from region packs (REGION). Reads are open; writes are rate-limited per address. Screening-level estimates, not an official forecast.',
    },
    servers: [{ url: serverUrl || '/' }],
    tags: ['Air', 'Accuracy', 'Citizens', 'Action', 'Sharing', 'System'].map((name) => ({ name })),
    paths,
    components: { schemas },
  };
}

// Number of method+path operations, shown in the requirements map
const operationCount = () => Object.values(paths).reduce((a, p) => a + Object.keys(p).length, 0);

module.exports = { spec, paths, operationCount };

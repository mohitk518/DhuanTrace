// Request guard: security headers, per-address rate limits for writes, request metrics and structured logs.
const HOUR = 3600e3;

// Content Security Policy: only the sources the page really uses
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://gibs.earthdata.nasa.gov https://cdnjs.cloudflare.com",
  "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'",
].join('; ');

function securityHeaders(res, path) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('permissions-policy', 'geolocation=(self), microphone=(self), camera=(self)');
  if (path.startsWith('/api/')) res.setHeader('access-control-allow-origin', '*'); // open data for other cities' tools
  else res.setHeader('content-security-policy', CSP);
}

// ---------- rate limits (token bucket per address and bucket) ----------
// per minute; bursts up to the same number
const LIMITS = { '/api/reports': 10, '/api/sensors': 30, '/api/alert': 12, '/api/ask': 12, '/api/fednet/run': 4, '/api/federated/update': 10, default_write: 60 };
const buckets = new Map();

function clientAddress(req) {
  // Cloud Run puts the caller first in x-forwarded-for; locally it is the socket address
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket.remoteAddress || 'unknown';
}

// Returns 0 when allowed, otherwise the seconds to wait
function rateLimit(req, path, now = Date.now()) {
  if (req.method !== 'POST') return 0;
  const key = Object.keys(LIMITS).find((k) => k !== 'default_write' && (path === k || path.startsWith(k + '/'))) || 'default_write';
  const per = LIMITS[key], id = `${clientAddress(req)}|${key}`;
  let b = buckets.get(id);
  if (!b) { b = { tokens: per, at: now }; buckets.set(id, b); }
  b.tokens = Math.min(per, b.tokens + ((now - b.at) / 60e3) * per); b.at = now;
  if (b.tokens >= 1) { b.tokens -= 1; return 0; }
  return Math.ceil(((1 - b.tokens) / per) * 60);
}
// forget idle addresses
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.at > 10 * 60e3) buckets.delete(k); }, 60e3).unref();

// ---------- metrics ----------
const routes = new Map();
function routeKey(method, path) {
  if (!path.startsWith('/api/')) return 'static files';
  return `${method} ${path.replace(/\/api\/reports\/[\w-]+\/photo/, '/api/reports/{id}/photo').replace(/\/api\/alerts\/[\w-]+\/status/, '/api/alerts/{id}/status')}`;
}
function record(method, path, status, ms) {
  const k = routeKey(method, path);
  let r = routes.get(k);
  if (!r) { r = { count: 0, errors_4xx: 0, errors_5xx: 0, rate_limited: 0, ms: [] }; routes.set(k, r); }
  r.count++; if (status === 429) r.rate_limited++; else if (status >= 500) r.errors_5xx++; else if (status >= 400) r.errors_4xx++;
  r.ms.push(ms); if (r.ms.length > 200) r.ms.shift();
  if (process.env.LOG_REQUESTS === '1') log('request', { method, path, status, ms: +ms.toFixed(1) });
}
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
function metrics() {
  const out = {};
  for (const [k, r] of [...routes.entries()].sort((a, b) => b[1].count - a[1].count)) out[k] = { count: r.count, p50_ms: pct(r.ms, 0.5), p95_ms: pct(r.ms, 0.95), errors_4xx: r.errors_4xx, errors_5xx: r.errors_5xx, rate_limited: r.rate_limited };
  return out;
}

// One JSON object per line, readable by Cloud Logging
function log(level, fields) {
  const line = JSON.stringify({ severity: level === 'error' ? 'ERROR' : 'INFO', time: new Date().toISOString(), ...fields });
  (level === 'error' ? console.error : console.log)(line);
}

module.exports = { securityHeaders, rateLimit, record, metrics, log, LIMITS, CSP, clientAddress, _buckets: buckets, HOUR };

// Load test (zero dependencies): many simultaneous users reading the app for a fixed time.
// Usage: node scripts/loadtest.js [baseUrl] [users] [seconds]
// Mix of what a visitor's page asks for: city analysis, fires, stations, priorities, packets, the page itself.
const base = process.argv[2] || 'http://localhost:8080';
const users = +process.argv[3] || 50;
const seconds = +process.argv[4] || 20;
const cities = ['indore', 'bhopal', 'gwalior', 'jabalpur', 'ujjain', 'sagar', 'dewas', 'ratlam', 'satna', 'rewa', 'katni', 'singrauli'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const paths = () => pick([
  `/api/analyze?city=${pick(cities)}`, `/api/analyze?city=${pick(cities)}`, `/api/packet?city=${pick(cities)}`,
  '/api/fires?hours=24', '/api/stations', '/api/priorities', '/api/reports', '/api/hotspots', '/api/corridors', '/', '/api/health',
]);

(async () => {
  const lat = [], errors = {}; let done = 0;
  const end = Date.now() + seconds * 1000;
  await fetch(base + '/api/priorities'); // warm the caches once, as a running server would be
  const t0 = Date.now();
  await Promise.all(Array.from({ length: users }, async () => {
    while (Date.now() < end) {
      const p = paths(), s = performance.now();
      try {
        const r = await fetch(base + p); await r.arrayBuffer();
        if (!r.ok) errors[r.status] = (errors[r.status] || 0) + 1;
      } catch (e) { errors[e.cause?.code || e.name] = (errors[e.cause?.code || e.name] || 0) + 1; }
      lat.push(performance.now() - s); done++;
    }
  }));
  const secs = (Date.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const q = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))].toFixed(0);
  const result = { users, seconds: +secs.toFixed(1), requests: done, per_second: +(done / secs).toFixed(0), p50_ms: +q(0.5), p95_ms: +q(0.95), p99_ms: +q(0.99), errors };
  console.log(JSON.stringify(result, null, 2));
})();

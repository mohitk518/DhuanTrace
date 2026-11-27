// Data-source cache: callers asking for the same data at once share one request, and a failed refresh keeps the
// last live result (labelled with its age) instead of dropping to sample data.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `dt-cache-${Date.now()}`);
process.env.DEMO_MODE = '0';
const HOUR = 3600e3;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

let windCalls = 0, mode = 'ok';
global.fetch = async (url) => {
  const u = new URL(url);
  if (u.host === 'api.open-meteo.com') {
    windCalls++;
    await new Promise((r) => setTimeout(r, 50));
    if (mode === 'limit') return new Response('{"error":true,"reason":"Minutely API request limit exceeded"}', { status: 429 });
    const la = u.searchParams.get('latitude').split(','), s = Math.floor(Date.now() / HOUR) * HOUR - 48 * HOUR;
    const time = Array.from({ length: 120 }, (_, k) => new Date(s + k * HOUR).toISOString().slice(0, 16));
    const one = { hourly: { time, wind_speed_10m: time.map(() => 12), wind_direction_10m: time.map(() => 270) } };
    return new Response(JSON.stringify(la.map(() => one)), { status: 200 });
  }
  return new Response('not mocked', { status: 404 });
};

const sources = require('../lib/sources');

(async () => {
  const grids = await Promise.all(Array.from({ length: 8 }, () => sources.getWindGrid()));
  assert(windCalls === 1, `8 callers asking for the wind at once make 1 request to Open-Meteo (made ${windCalls})`);
  assert(grids.every((g) => g === grids[0]) && sources.status.wind.mode === 'live', 'all 8 get the same live grid');

  // 40 minutes later the refresh hits Open-Meteo's per-minute limit
  const e = sources.cache.get('wind'); e.at -= 40 * 60e3; sources.cache.get('wind:live').liveAt -= 40 * 60e3;
  mode = 'limit'; windCalls = 0;
  const kept = await sources.getWindGrid();
  assert(kept === grids[0], 'a failed refresh keeps the last live wind grid instead of sample data');
  assert(sources.status.wind.mode === 'live' && /40 min ago/.test(sources.status.wind.note) && /429/.test(sources.status.wind.note), `status says live, its age and why the refresh failed ("${sources.status.wind.note.slice(0, 90)}…")`);

  // After 2 minutes it tries again; once the limit clears it is fresh again
  sources.cache.get('wind').at -= 3 * 60e3; mode = 'ok'; windCalls = 0;
  await sources.getWindGrid();
  assert(windCalls === 1 && sources.status.wind.mode === 'live' && !/min ago/.test(sources.status.wind.note), 'the next retry after 2 minutes fetches fresh wind');

  // Too old to keep: after 6 hours a failure shows sample data, clearly labelled
  sources.cache.get('wind').at -= 2 * 3600e3; sources.cache.get('wind:live').liveAt -= 7 * 3600e3; mode = 'limit';
  await sources.getWindGrid();
  assert(sources.status.wind.mode === 'sample', 'live data older than 6 hours is not passed off as current; sample data is labelled');
})();

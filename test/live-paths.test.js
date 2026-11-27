// Offline test of the live code paths: fakes each external API with responses in its documented format.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `dt-live-${Date.now()}`);
process.env.FIRMS_MAP_KEY = 'test'; process.env.DATA_GOV_API_KEY = 'test'; process.env.GEMINI_API_KEY = 'test';
const HOUR = 3600e3;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);

let seed = 42; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const firmsCsv = (() => {
  const rows = ['latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight'];
  const t = new Date(now - 9 * HOUR);
  const d = t.toISOString().slice(0, 10), hm = t.toISOString().slice(11, 16).replace(':', '');
  for (let i = 0; i < 40; i++) rows.push(`${(23.1 + rand() * 0.4).toFixed(5)},${(76.9 + rand() * 0.6).toFixed(5)},330.1,0.4,0.37,${d},${+hm},N,VIIRS,${i % 5 ? 'n' : 'h'},2.0NRT,290.2,${(3 + rand() * 30).toFixed(2)},D`);
  rows.push(`23.2,77.0,300,0.4,0.4,${d},${+hm},N,VIIRS,l,2.0NRT,290,1.2,D`); // low confidence, should be dropped
  return rows.join('\n');
})();

const cpcb = { records: [
  { country: 'India', state: 'Madhya_Pradesh', city: 'Indore', station: 'Chhoti Gwaltoli, Indore - MPPCB', last_update: '28-09-2026 21:00:00', latitude: '22.7179', longitude: '75.8687', pollutant_id: 'PM2.5', min_value: '60', max_value: '160', avg_value: '132' },
  { country: 'India', state: 'Madhya_Pradesh', city: 'Indore', station: 'Chhoti Gwaltoli, Indore - MPPCB', last_update: '28-09-2026 21:00:00', latitude: '22.7179', longitude: '75.8687', pollutant_id: 'PM10', min_value: '50', max_value: '120', avg_value: '98' },
  { country: 'India', state: 'Madhya_Pradesh', city: 'Bhopal', station: 'T T Nagar, Bhopal - MPPCB', last_update: '28-09-2026 21:00:00', latitude: '23.2332', longitude: '77.4003', pollutant_id: 'PM2.5', min_value: '40', max_value: '150', avg_value: '118' },
  { country: 'India', state: 'Madhya_Pradesh', city: 'Bhopal', station: 'T T Nagar, Bhopal - MPPCB', last_update: '28-09-2026 21:00:00', latitude: '23.2332', longitude: '77.4003', pollutant_id: 'OZONE', min_value: '5', max_value: '40', avg_value: 'NA' },
] };

function meteoTimes() { const s = Math.floor(now / HOUR) * HOUR - 48 * HOUR; return Array.from({ length: 96 }, (_, k) => iso(s + k * HOUR)); }
function wind(lats, lons) {
  const time = meteoTimes();
  return lats.map((la, i) => ({ latitude: la, longitude: lons[i], hourly: { time, wind_speed_10m: time.map(() => 10), wind_direction_10m: time.map(() => 65) } }));
}
function air() { const s = Math.floor(now / HOUR) * HOUR - 24 * HOUR; const time = Array.from({ length: 96 }, (_, k) => iso(s + k * HOUR)); return { hourly: { time, pm2_5: time.map((_, k) => 40 + 10 * Math.sin(k / 4)), pm10: time.map((_, k) => 80 + 15 * Math.sin(k / 4)) } }; }

const calls = [];
global.fetch = async (url, opts = {}) => {
  url = String(url); calls.push(url.split('?')[0]);
  const ok = (body, type = 'json') => ({ ok: true, status: 200, text: async () => (type === 'json' ? JSON.stringify(body) : body), json: async () => body });
  if (url.includes('firms.modaps')) return ok(firmsCsv, 'text');
  if (url.includes('api.data.gov.in')) return ok(url.includes('Madhya_Pradesh') ? cpcb : { records: [] });
  if (url.includes('air-quality-api')) return ok(air());
  if (url.includes('api.open-meteo.com')) {
    const q = new URL(url).searchParams;
    return ok(wind(q.get('latitude').split(',').map(Number), q.get('longitude').split(',').map(Number)));
  }
  if (url.includes('gibs.earthdata.nasa.gov')) {
    const q = new URL(url).searchParams;
    if (q.get('CRS') !== 'EPSG:4326' || !/^\d{4}-\d{2}-\d{2}$/.test(q.get('TIME'))) throw new Error('bad GIBS query');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => jpeg };
  }
  if (url.includes('generativelanguage')) {
    const body = JSON.parse(opts.body);
    const isPhoto = body.contents[0].parts.some((p) => p.inlineData);
    if (opts.headers['x-goog-api-key'] !== 'test') throw new Error('api key header missing');
    const isPlume = body.contents[0].parts[0].text.includes('remote-sensing');
    const out = isPlume
      ? { image_usable: true, smoke_visible: true, plume_bearing_deg: 250, cloud_cover: 'none', agrees_with_model: true, confidence: 0.8, explanation: 'Grey streaks run west-southwest from the fire cluster.', explanation_hi: 'धुआँ पश्चिम की ओर।' }
      : isPhoto
      ? { is_pollution_event: true, source_type: 'crop_residue_burning', visible_fire: true, smoke_density: 'high', confidence: 0.88, explanation: 'Flames along a field edge.', explanation_hi: 'खेत के किनारे आग।' }
      : { to: 'District Collector, Sehore', cc: 'MPPCB', subject: 'Test', body: 'Grounded body' };
    return ok({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(out) + '\n```' }] } }] });
  }
  throw new Error('unexpected URL ' + url);
};

(async () => {
  const src = require('../lib/sources');
  const { analyse } = require('../lib/engine');
  const g = require('../lib/gemini');
  const { CITIES } = require('../lib/places');
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

  const fires = await src.getFires();
  assert(src.status.fires.mode === 'live', 'FIRMS parsed as live');
  assert(fires.length === 160, `4 feeds x 40 fires, low confidence dropped (got ${fires.length})`);
  assert(Math.abs(fires[0].ts - (now - 9 * HOUR)) < 2 * 60e3, 'FIRMS UTC time parsed correctly');

  const st = await src.getStations();
  assert(src.status.stations.mode === 'live' && st.length === 2, 'CPCB stations grouped (2)');
  const ind = st.find((s) => s.city === 'Indore');
  assert(ind.aqi === 132 && ind.dominant === 'PM2.5', 'station AQI = highest sub-index');

  const grid = await src.getWindGrid();
  assert(src.status.wind.mode === 'live' && grid.u.length === 96 && grid.u[0].length === 7 && grid.u[0][0].length === 10, 'wind grid shape 96x7x10');
  // wind FROM 65 deg means air moves toward 245 deg: west-southwest, so u<0 and v<0
  assert(grid.u[0][0][0] < 0 && grid.v[0][0][0] < 0, 'wind direction converted to motion correctly');

  const indore = CITIES.find((c) => c.id === 'indore');
  const airF = await src.getAirForecast(indore.lat, indore.lon);
  assert(src.status.forecast.mode === 'live', 'CAMS forecast live');

  const a = analyse({ place: indore, fires, reports: [], grid, air: airF, stations: st, now });
  assert(a.aqi_now.value === 132, 'AQI now uses nearby CPCB station');
  assert(a.back_trajectory.length === 37, 'back trajectory 36 h');
  const last = a.back_trajectory[36];
  assert(last.lat > indore.lat && last.lon > indore.lon, 'back trajectory points upwind (ENE of Indore)');
  assert(a.attribution.length > 0, `fires ENE of Indore are attributed (${a.attribution.map((d) => d.district + ' ' + d.share + '%').join(', ')})`);
  assert(a.forecast.length > 40, 'forecast series present');
  const { clusterFires } = require('../lib/engine');
  const cl = clusterFires(fires);
  const n = cl.reduce((x, c) => x + c.n, 0), frp = cl.reduce((x, c) => x + c.frp, 0), frp0 = fires.reduce((x, f) => x + f.frp, 0);
  assert(cl.length < fires.length && n === fires.length && Math.abs(frp - frp0) < 1e-6, `clustering merges ${fires.length} detections into ${cl.length} sources, keeping every fire and all fire power`);

  const photo = await g.classifyPhoto({ base64: 'AAAA', mime: 'image/jpeg', lat: 23.2, lon: 77.1, localTime: 'x', nearbyFires: 3 });
  assert(photo.source_type === 'crop_residue_burning' && photo.model === 'gemini-3.7-flash', 'Gemini photo JSON parsed (fenced JSON handled)');
  const al = await g.draftAlert({ city: 'Indore' }, 'hi');
  assert(al.subject === 'Test', 'Gemini alert parsed');
  assert(g.geminiStatus().mode === 'live', 'Gemini status live');

  // a citizen report in the evening upwind should raise the corrected forecast above CAMS
  const rep = [{ id: 'r1', lat: 23.25, lon: 77.2, ts: now - 2 * HOUR, analysis: { is_pollution_event: true, smoke_density: 'high' } }];
  const b = analyse({ place: indore, fires, reports: rep, grid, air: airF, stations: st, now });
  const bump = b.forecast.some((p) => p.corrected > p.cams);
  assert(bump && b.upcoming.citizen_only >= 1, `citizen report adds smoke CAMS lacks (upcoming citizen-only: ${b.upcoming.citizen_only})`);
  const research = require('../lib/research');
  const { nearestDistrict } = require('../lib/places');
  const d = nearestDistrict(fires[0]).name;
  const v = await research.verifyDistrict(d);
  assert(v.image.startsWith('data:image/jpeg;base64,') && v.fires.length > 0, `satellite image fetched for ${d} with ${v.fires.length} fire markers`);
  assert(v.fires.every((f) => f.x >= 0 && f.x <= 100 && f.y >= 0 && f.y <= 100), 'fire markers fall inside the image');
  assert(Math.abs(v.model_bearing_deg - 245) < 3, `model smoke bearing matches wind from 65 deg (got ${v.model_bearing_deg})`);
  assert(v.result.agrees_with_model === true && v.result.model === 'gemini-3.7-flash', 'Gemini plume verdict parsed');
  const k = await research.forecastSkill();
  assert(k.n === 2 && k.mae != null && k.same_category_pct != null, `forecast skill computed (n=${k.n}, MAE=${k.mae}, bias=${k.bias})`);
  const fed = require('../lib/federated');
  const analyseAt = async (place) => analyse({ place, fires, reports: [], grid, air: await src.getAirForecast(place.lat, place.lon), stations: st, now });
  const log1 = await fed.logSamples(analyseAt), log2 = await fed.logSamples(analyseAt);
  assert(log1.logged === 2 && log2.logged === 0 && fed.stats().nodes === 2, `federated: one sample per live station per hour (${log1.logged} logged, repeat skipped)`);
  console.log('external hosts called:', [...new Set(calls.map((c) => new URL(c).host))].join(', '));
})();

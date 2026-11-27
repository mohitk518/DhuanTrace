// Research features: satellite verification of smoke plumes and live forecast skill against CPCB sensors.
const src = require('./sources');
const { windAt } = require('./engine');
const { nearestDistrict } = require('./places');
const { aqiSeries, category } = require('./aqi');
const { verifyPlume } = require('./gemini');

const HOUR = 3600e3;
const memo = new Map();

async function fetchImage(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const type = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok || !type.startsWith('image/')) throw new Error(`NASA GIBS returned ${res.status} ${type}: ${buf.toString('utf8', 0, 160)}`);
      return buf;
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
  }
  throw lastErr;
}

function gibsUrl(bbox, date, size = 768) {
  // WMS 1.3.0 with EPSG:4326 takes the box as minLat,minLon,maxLat,maxLon
  return 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0'
    + '&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&STYLES=&CRS=EPSG:4326'
    + `&BBOX=${bbox.s.toFixed(4)},${bbox.w.toFixed(4)},${bbox.n.toFixed(4)},${bbox.e.toFixed(4)}`
    + `&WIDTH=${size}&HEIGHT=${size}&FORMAT=image/jpeg&TIME=${date}`;
}

// Satellite check for one district's most recent daytime fire cluster
async function verifyDistrict(district) {
  const now = Date.now();
  const fires = (await src.getFires()).filter((f) => f.ts > now - 48 * HOUR && nearestDistrict(f).name === district);
  if (!fires.length) throw Object.assign(new Error(`No fire detections in ${district} in the last 48 hours.`), { code: 404 });
  // The VIIRS afternoon pass over central India is roughly 07:00–09:30 UTC; use the latest such day
  const day = fires.filter((f) => { const h = new Date(f.ts).getUTCHours(); return h >= 5 && h <= 11; });
  const pool = day.length ? day : fires;
  const latest = Math.max(...pool.map((f) => f.ts));
  const date = new Date(latest).toISOString().slice(0, 10);
  const sameDay = pool.filter((f) => new Date(f.ts).toISOString().slice(0, 10) === date);

  const key = `${district}:${date}:${sameDay.length}`;
  const hit = memo.get(key);
  if (hit && now - hit.at < (hit.value.result && hit.value.result.unavailable ? 2 * 60e3 : HOUR)) return hit.value; // a Gemini failure is retried after 2 minutes

  const c = { lat: sameDay.reduce((a, f) => a + f.lat, 0) / sameDay.length, lon: sameDay.reduce((a, f) => a + f.lon, 0) / sameDay.length };
  const half = 0.45, halfLon = half / Math.cos((c.lat * Math.PI) / 180);
  const bbox = { s: c.lat - half, n: c.lat + half, w: c.lon - halfLon, e: c.lon + halfLon };
  const inBox = sameDay.filter((f) => f.lat > bbox.s && f.lat < bbox.n && f.lon > bbox.w && f.lon < bbox.e)
    .sort((a, b) => b.frp - a.frp).slice(0, 25)
    .map((f) => ({ x: +(((f.lon - bbox.w) / (bbox.e - bbox.w)) * 100).toFixed(1), y: +(((bbox.n - f.lat) / (bbox.n - bbox.s)) * 100).toFixed(1), frp: f.frp }));

  const grid = await src.getWindGrid();
  const w = windAt(grid, c.lat, c.lon, latest);
  const modelBearing = ((Math.atan2(w.u, w.v) * 180) / Math.PI + 360) % 360;

  const img = await fetchImage(gibsUrl(bbox, date));
  const base64 = img.toString('base64');
  let result;
  try {
    result = await verifyPlume({ base64, bbox, date, fires: inBox.map(({ x, y }) => ({ x, y })), modelBearing, district });
  } catch (e) {
    result = { unavailable: true, note: `${require('./gemini').geminiReason(e).en}. The satellite image is still shown; try the check again in a minute.`, detail: e.message };
  }
  const value = {
    district, date, bbox, center: c, fires: inBox, fire_count: sameDay.length,
    model_bearing_deg: Math.round(modelBearing), wind_speed_kmh: +Math.hypot(w.u, w.v).toFixed(1),
    image: `data:image/jpeg;base64,${base64}`, source: 'NASA GIBS, VIIRS S-NPP corrected reflectance (true colour)',
    sample_fires: src.status.fires && src.status.fires.mode !== 'live', result,
  };
  memo.set(key, { at: now, value });
  return value;
}

// Forecast skill: CAMS-based AQI at each CPCB station versus what the station reports now
async function forecastSkill() {
  const hit = memo.get('skill');
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.value;
  const now = Date.now();
  const stations = (await src.getStations()).filter((s) => s.aqi != null).slice(0, 24);
  const rows = [];
  for (let i = 0; i < stations.length; i += 4) {
    const batch = stations.slice(i, i + 4);
    const out = await Promise.all(batch.map(async (s) => {
      const air = await src.getAirForecast(+s.lat.toFixed(2), +s.lon.toFixed(2));
      const series = aqiSeries(air.times, air.pm25, air.pm10).filter((p) => p.t <= now);
      const m = series[series.length - 1];
      if (!m || !m.aqi) return null;
      return { station: s.station, city: s.city, cpcb: s.aqi, model: m.aqi, diff: m.aqi - s.aqi };
    }));
    rows.push(...out.filter(Boolean));
  }
  const n = rows.length;
  const idx = (a) => [50, 100, 200, 300, 400, Infinity].findIndex((b) => a <= b);
  const value = {
    mode: src.status.stations ? src.status.stations.mode : 'sample',
    n,
    mae: n ? Math.round(rows.reduce((a, r) => a + Math.abs(r.diff), 0) / n) : null,
    bias: n ? Math.round(rows.reduce((a, r) => a + r.diff, 0) / n) : null,
    same_category_pct: n ? Math.round((100 * rows.filter((r) => idx(r.cpcb) === idx(r.model)).length) / n) : null,
    within_one_category_pct: n ? Math.round((100 * rows.filter((r) => Math.abs(idx(r.cpcb) - idx(r.model)) <= 1).length) / n) : null,
    stations: rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).map((r) => ({ ...r, cpcb_category: category(r.cpcb).name, model_category: category(r.model).name })),
    generated_at: now,
  };
  memo.set('skill', { at: now, value });
  return value;
}

module.exports = { verifyDistrict, forecastSkill, gibsUrl };

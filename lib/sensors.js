// Citizen low-cost sensor readings (PM2.5), calibrated device by device against the nearest CPCB station.
const crypto = require('crypto');
const db = require('./datastore');
const src = require('./sources');
const { km, nearestDistrict } = require('./places');
const { subIndex, concFromIndex, category } = require('./aqi');
const { sampleSensors } = require('./sample');

const HOUR = 3600e3;
const MATCH_KM = 25;
let readings = db.load('sensors.json', []);
const save = () => db.save('sensors.json', readings.slice(0, 2000));

const { R: REGION } = require('./region');
// Inside the region pack's box (the home region plus a band across its borders)
const inRegion = (lat, lon) => isFinite(lat) && isFinite(lon) && lat >= REGION.bbox.s && lat <= REGION.bbox.n && lon >= REGION.bbox.w && lon <= REGION.bbox.e;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// PM2.5 concentration the station implies, from its PM2.5 sub-index when present, else its overall AQI
function stationPm25(s) {
  const pm = s.pollutants && (s.pollutants['PM2.5'] ?? s.pollutants.PM25 ?? s.pollutants.pm25);
  return concFromIndex('pm25', pm != null ? pm : s.aqi);
}

function nearestStation(stations, p) {
  let best = null, bd = Infinity;
  for (const s of stations) { const d = km(s, p); if (d < bd) { bd = d; best = s; } }
  return best && bd <= MATCH_KM ? { station: best, km: bd } : null;
}

// Calibration factor for a device: median ratio of station PM2.5 to the device's raw PM2.5, bounded to 0.3–3
function deviceFactor(device) {
  const ratios = readings.filter((r) => r.device === device && r.station && r.pm25_raw > 5).map((r) => r.station.pm25 / r.pm25_raw);
  if (!ratios.length) return { factor: 1, basis: 0 };
  return { factor: +Math.min(3, Math.max(0.3, median(ratios))).toFixed(3), basis: ratios.length };
}

async function submit({ lat, lon, pm25, pm10, device }) {
  lat = +lat; lon = +lon; pm25 = +pm25; pm10 = pm10 == null || pm10 === '' ? null : +pm10;
  if (!inRegion(lat, lon)) throw Object.assign(new Error(`Pick the sensor location inside ${REGION.name} on the map.`), { code: 400 });
  if (!isFinite(pm25) || pm25 < 0 || pm25 > 999) throw Object.assign(new Error('PM2.5 must be a number between 0 and 999 µg/m³.'), { code: 400 });
  if (pm10 != null && (!isFinite(pm10) || pm10 < 0 || pm10 > 1999)) throw Object.assign(new Error('PM10 must be a number between 0 and 1999 µg/m³.'), { code: 400 });
  device = String(device || '').trim().replace(/[^\w .-]/g, '').slice(0, 40) || 'unnamed-sensor';

  const stations = await src.getStations();
  const near = nearestStation(stations, { lat, lon });
  const r = {
    id: crypto.randomUUID(), device, lat, lon, ts: Date.now(), pm25_raw: pm25, pm10,
    station: near ? { name: near.station.station, km: +near.km.toFixed(1), aqi: near.station.aqi, pm25: +stationPm25(near.station).toFixed(1) } : null,
  };
  // Calibrate with this device's earlier readings only, so a reading never checks itself
  const { factor, basis } = deviceFactor(device);
  readings.unshift(r);
  r.factor = factor; r.calibration_basis = basis;
  r.pm25_cal = +(pm25 * factor).toFixed(1);
  r.aqi = subIndex('pm25', r.pm25_cal);
  save();
  return decorate(r);
}

function decorate(r) {
  return { ...r, district: nearestDistrict(r).name, category: category(r.aqi) };
}

function all(now = Date.now()) {
  const own = readings.filter((r) => r.ts > now - 24 * HOUR).map(decorate);
  const examples = process.env.EXAMPLE_REPORTS === '0' ? [] : sampleSensors(now).map((r) => decorate({ ...r, example: true }));
  return [...own, ...examples];
}

module.exports = { submit, all, deviceFactor, stationPm25 };

// Sample data used when an API key is missing or a live source fails.
// Shapes match the live sources exactly, so the rest of the app cannot tell the difference
// except through the "mode" flag that the UI shows to the viewer.
const { DISTRICTS, CITIES, NEIGHBOUR_TOWNS } = require('./places');
const { R: REGION } = require('./region');

const HOUR = 3600e3;
const IST = 5.5 * HOUR;

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Midnight IST of the day containing ms
function istMidnight(ms) {
  const d = new Date(ms + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST;
}

// Districts with sample fires, including some across the border (from the region pack)
const FIRE_DISTRICTS = REGION.sample.fire_districts;
const placeFor = (name) => DISTRICTS.find((x) => x.name === name) || NEIGHBOUR_TOWNS.find((x) => x.name === name);

function sampleFires(now) {
  const out = [];
  for (let day = 0; day < 2; day++) {
    const mid = istMidnight(now) - day * 24 * HOUR;
    const R = rng(Math.floor(mid / HOUR));
    for (const [name, n] of FIRE_DISTRICTS) {
      const d = placeFor(name);
      for (let i = 0; i < n; i++) {
        // Satellite detections sit at the VIIRS afternoon overpass, about 13:00–14:30 IST
        const ts = mid + (13 + R() * 1.5) * HOUR;
        if (ts > now) continue;
        out.push({
          lat: +(d.lat + (R() - 0.5) * 0.55).toFixed(4), lon: +(d.lon + (R() - 0.5) * 0.6).toFixed(4),
          ts, frp: +(4 + R() * 36).toFixed(1), confidence: R() < 0.8 ? 'n' : 'h', source: 'VIIRS_SNPP_NRT',
        });
      }
    }
  }
  return out;
}

function sampleReports(now) {
  const mid = istMidnight(now);
  const R = rng(Math.floor(mid / HOUR) + 7);
  const base = REGION.sample.reports;
  const out = [];
  for (const [name, h, type, density, text] of base) {
    let ts = mid + h * HOUR;
    if (ts > now) ts -= 24 * HOUR; // before today's evening, show yesterday's reports
    const d = DISTRICTS.find((x) => x.name === name);
    out.push({
      id: 'example-' + name.toLowerCase(), example: true,
      lat: +(d.lat + (R() - 0.5) * 0.3).toFixed(4), lon: +(d.lon + (R() - 0.5) * 0.3).toFixed(4), ts,
      analysis: { is_pollution_event: true, source_type: type, visible_fire: type === 'crop_residue_burning', smoke_density: density, confidence: +(0.78 + R() * 0.17).toFixed(2), explanation: text },
    });
  }
  return out;
}

function sampleStations(now) {
  const R = rng(Math.floor(now / HOUR));
  const base = REGION.sample.stations || {};
  return CITIES.map((c) => ({
    station: c.name + ' (sample station)', city: c.name, lat: c.lat + 0.02, lon: c.lon + 0.02,
    aqi: Math.round((base[c.name] || 120) * (0.9 + R() * 0.25)), dominant: 'PM2.5', updated: new Date(now).toISOString(),
    pollutants: {},
  }));
}

function sampleWindGrid(now) {
  const { lats, lons } = REGION.grid;
  const start = Math.floor(now / HOUR) * HOUR - 48 * HOUR;
  const times = [], u = [], v = [];
  for (let k = 0; k < 97; k++) {
    const t = start + k * HOUR; times.push(t);
    const hh = t / HOUR;
    const U = [], V = [];
    for (const la of lats) {
      const ur = [], vr = [];
      for (const lo of lons) {
        const from = (60 + 25 * Math.sin(hh / 6) + (la - (REGION.grid.center || [23, 78])[0]) * 6 + (lo - (REGION.grid.center || [23, 78])[1]) * 2) * Math.PI / 180;
        const spd = 9 * (1 + 0.35 * Math.sin(hh / 4 + lo / 3));
        ur.push(-spd * Math.sin(from)); vr.push(-spd * Math.cos(from));
      }
      U.push(ur); V.push(vr);
    }
    u.push(U); v.push(V);
  }
  return { lats, lons, times, u, v };
}

function sampleAir(lat, lon, now) {
  const start = Math.floor(now / HOUR) * HOUR - 24 * HOUR;
  const times = [], pm25 = [], pm10 = [];
  const R = rng(Math.round(lat * 100 + lon * 10));
  const lvl = 38 + R() * 30;
  for (let k = 0; k < 24 + 48; k++) {
    const t = start + k * HOUR; times.push(t);
    const h = new Date(t + IST).getUTCHours();
    const diurnal = 1 + 0.35 * Math.cos(((h - 22) / 24) * 2 * Math.PI);
    const trend = 1 + 0.004 * k;
    const p = lvl * diurnal * trend * (0.93 + R() * 0.14);
    pm25.push(+p.toFixed(1)); pm10.push(+(p * 1.8).toFixed(1));
  }
  return { times, pm25, pm10 };
}

// Example citizen sensor readings near industrial areas (clearly marked as examples in the app)
function sampleSensors(now) {
  const base = REGION.sample.sensors;
  const R = rng(Math.floor(now / HOUR) + 11);
  const { subIndex } = require('./aqi');
  return base.map(([device, lat, lon, pm]) => {
    const raw = +(pm * (0.9 + R() * 0.2)).toFixed(1), factor = 0.82;
    const cal = +(raw * factor).toFixed(1);
    return { id: 'example-' + device, device, lat, lon, ts: now - Math.floor(R() * 3) * HOUR, pm25_raw: raw, pm10: null, station: null, factor, calibration_basis: 6, pm25_cal: cal, aqi: subIndex('pm25', cal) };
  });
}

module.exports = { sampleSensors, sampleFires, sampleReports, sampleStations, sampleWindGrid, sampleAir, istMidnight, HOUR, IST };

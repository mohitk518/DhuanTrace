// Live data sources with caching and automatic fallback to sample data.
const { BBOX, CITIES } = require('./places');
const { R, isHome } = require('./region');
const S = require('./sample');

const HOUR = 3600e3;
const env = (k) => (process.env[k] || '').trim();
const DEMO = () => env('DEMO_MODE') === '1';

// status[source] = { mode: 'live' | 'sample', note }
const status = {};
const cache = new Map();

// A result that fell back to sample data is kept for only 2 minutes, so a brief outage heals itself.
// Callers that ask for the same key at the same moment share one request (the wind grid alone is 70 points,
// and a page load asks for it from several places, which used to trip Open-Meteo's per-minute limit).
// If a refresh fails but a live result from the last 6 hours exists, that result is kept and labelled with its age.
const { AsyncLocalStorage } = require('async_hooks');
const run = new AsyncLocalStorage();
const inflight = new Map();
const KEEP_LIVE_MS = 6 * 3600e3;
const statusKey = (key) => (key.startsWith('air:') ? 'forecast' : key);
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.fallback ? 120e3 : ttlMs)) return hit.value;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const state = { fallback: false };
    const before = status[statusKey(key)];
    const value = await run.run(state, fn);
    const lastLive = cache.get(key + ':live');
    if (state.fallback && lastLive && Date.now() - lastLive.liveAt < KEEP_LIVE_MS) {
      const mins = Math.round((Date.now() - lastLive.liveAt) / 60e3);
      const failed = status[statusKey(key)] && status[statusKey(key)].note;
      status[statusKey(key)] = { mode: 'live', note: `${(lastLive.note || (before && before.note) || 'Live data')}; last updated ${mins} min ago (the latest refresh failed: ${String(failed || '').slice(0, 120)})` };
      cache.set(key, { at: Date.now(), value: lastLive.value, fallback: true });
      return lastLive.value;
    }
    cache.set(key, { at: Date.now(), value, fallback: state.fallback });
    if (!state.fallback) cache.set(key + ':live', { value, liveAt: Date.now(), note: status[statusKey(key)] && status[statusKey(key)].note });
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
const fellBack = () => { const st = run.getStore(); if (st) st.fallback = true; };

async function getText(url, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || 20000) });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 160)}`);
        if (res.status >= 500 || res.status === 429) { lastErr = err; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
        throw err;
      }
      return text;
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'TypeError') { lastErr = e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      throw e;
    }
  }
  throw lastErr;
}

// ---------- NASA FIRMS active fires ----------
function parseFirmsCsv(text, source) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 1 || !/latitude/i.test(lines[0])) throw new Error('FIRMS did not return CSV: ' + text.slice(0, 120));
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const ix = (n) => head.indexOf(n);
  const iLat = ix('latitude'), iLon = ix('longitude'), iDate = ix('acq_date'), iTime = ix('acq_time'), iFrp = ix('frp'), iConf = ix('confidence');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < head.length - 1) continue;
    const hhmm = String(c[iTime]).trim().padStart(4, '0');
    const ts = Date.parse(`${c[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`); // FIRMS times are UTC
    const lat = +c[iLat], lon = +c[iLon];
    if (!isFinite(ts) || !isFinite(lat) || !isFinite(lon)) continue;
    out.push({ lat, lon, ts, frp: +c[iFrp] || 1, confidence: (c[iConf] || '').trim(), source });
  }
  return out;
}

async function getFires() {
  return cached('fires', 15 * 60e3, async () => {
    const key = env('FIRMS_MAP_KEY');
    if (!key || DEMO()) {
      fellBack(); status.fires = { mode: 'sample', note: key ? 'Demo mode is on' : 'Add FIRMS_MAP_KEY for live NASA fire data' };
      return S.sampleFires(Date.now());
    }
    const sources = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'];
    const area = `${BBOX.w},${BBOX.s},${BBOX.e},${BBOX.n}`;
    const results = await Promise.allSettled(sources.map((src) =>
      getText(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${src}/${area}/2`).then((t) => parseFirmsCsv(t, src))));
    const ok = results.filter((r) => r.status === 'fulfilled');
    if (!ok.length) {
      fellBack(); status.fires = { mode: 'sample', note: 'NASA FIRMS failed: ' + results[0].reason.message };
      return S.sampleFires(Date.now());
    }
    const fires = ok.flatMap((r) => r.value).filter((f) => f.confidence !== 'l' && f.confidence !== 'low');
    status.fires = { mode: 'live', note: `${fires.length} detections from ${ok.length} satellite feeds, last 48 h` };
    return fires;
  });
}

// ---------- CPCB real-time AQI via data.gov.in ----------
const AQI_RESOURCE = '3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69';

function normaliseRecord(r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) o[k.toLowerCase().replace(/\s+/g, '_')] = v;
  return o;
}

async function cpcbStations(key) {
  // Each home state of the region pack, trying its spellings in turn (data.gov.in uses Madhya_Pradesh style names)
  let records = [];
  for (const home of R.home_states) {
    for (const st of home.cpcb || [home.state]) {
      const url = `https://api.data.gov.in/resource/${AQI_RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=2000&filters[state]=${encodeURIComponent(st)}`;
      const j = JSON.parse(await getText(url));
      const got = (j.records || []).map(normaliseRecord);
      if (got.length) { records.push(...got); break; }
    }
  }
  if (!records.length) throw new Error(`No ${R.name} records returned`);
  const byStation = new Map();
  for (const r of records) {
    const name = r.station;
    if (!byStation.has(name)) byStation.set(name, { station: name, city: r.city, lat: +r.latitude, lon: +r.longitude, updated: r.last_update, pollutants: {} });
    const avg = parseFloat(r.avg_value ?? r.pollutant_avg);
    if (isFinite(avg)) byStation.get(name).pollutants[r.pollutant_id] = avg;
  }
  return [...byStation.values()].map((s) => {
    // data.gov.in reports each pollutant as a CPCB sub-index; the station AQI is the highest one
    const entries = Object.entries(s.pollutants);
    const top = entries.sort((a, b) => b[1] - a[1])[0];
    return { ...s, aqi: top ? Math.round(top[1]) : null, dominant: top ? top[0] : null };
  }).filter((s) => s.aqi != null && isFinite(s.lat));
}

// ---------- Backup: the same CPCB stations through the World Air Quality Index Project (aqicn.org) ----------
// WAQI publishes each pollutant on the US EPA AQI scale. We turn the PM2.5 and PM10 values back into
// concentrations with the EPA breakpoints WAQI uses, then into CPCB NAQI sub-indices. The result is close to
// CPCB's own AQI but not identical (other pollutants and averaging differ), and is labelled as converted.
const EPA = {
  pm25: [[0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500]],
  pm10: [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400], [505, 604, 401, 500]],
};
function concFromUsAqi(pollutant, aqi) {
  if (aqi == null || !isFinite(aqi) || aqi < 0) return null;
  for (const [clo, chi, ilo, ihi] of EPA[pollutant]) if (aqi <= ihi) return clo + ((Math.max(aqi, ilo) - ilo) * (chi - clo)) / (ihi - ilo);
  return EPA[pollutant][EPA[pollutant].length - 1][1];
}
const MP_BOUNDS = R.waqi_bounds; // lat1, lon1, lat2, lon2 of the region's home states
async function waqiStations(token, now = Date.now()) {
  const { stateOf, CITIES: cities } = require('./places');
  const { subIndex } = require('./aqi');
  const q = (path) => `https://api.waqi.info${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

  // Turn one WAQI feed reply into a station in the app's format (or null if stale, outside MP or without PM)
  function toStation(d, fallback = {}) {
    const iaqi = d.iaqi || {};
    const geo = (d.city && d.city.geo) || [];
    const lat = +(geo[0] ?? fallback.lat), lon = +(geo[1] ?? fallback.lon);
    if (!isFinite(lat) || !isFinite(lon) || !isHome(stateOf({ lat, lon }).state)) return null;
    const t = Date.parse((d.time && d.time.iso) || '') || null;
    if (!t || now - t > 6 * HOUR) return null; // stale station: leave it out
    const pollutants = {};
    const pm25 = subIndex('pm25', concFromUsAqi('pm25', iaqi.pm25 && +iaqi.pm25.v));
    const pm10 = subIndex('pm10', concFromUsAqi('pm10', iaqi.pm10 && +iaqi.pm10.v));
    if (pm25 != null) pollutants['PM2.5'] = pm25;
    if (pm10 != null) pollutants['PM10'] = pm10;
    const top = Object.entries(pollutants).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const name = String((d.city && d.city.name) || fallback.name || `WAQI ${d.idx}`).replace(/, India$/, '');
    return { uid: d.idx ?? fallback.uid, station: name, city: name.split(',').pop().trim() || name, lat, lon, updated: new Date(t + 5.5 * HOUR).toISOString().replace('T', ' ').slice(0, 16) + ' IST', pollutants, aqi: top[1], dominant: top[0], via: 'WAQI' };
  }
  const feed = async (path) => { const j = JSON.parse(await getText(q(path), { timeout: 15000 })); if (j.status !== 'ok') throw new Error(`WAQI: ${typeof j.data === 'string' ? j.data : 'bad reply'}`); return j.data; };

  const out = new Map(), diag = [];
  // 1. Every station inside Madhya Pradesh's box
  try {
    const list = JSON.parse(await getText(q(`/v2/map/bounds?latlng=${MP_BOUNDS.join(',')}&networks=all`)));
    if (list.status !== 'ok') throw new Error(`WAQI: ${typeof list.data === 'string' ? list.data : 'bad reply'}`);
    const all = Array.isArray(list.data) ? list.data : [];
    const inMp = all.filter((x) => isFinite(+x.lat) && isFinite(+x.lon) && isHome(stateOf({ lat: +x.lat, lon: +x.lon }).state)).slice(0, 40);
    diag.push(`box: ${all.length} stations, ${inMp.length} in ${R.short}`);
    for (let i = 0; i < inMp.length; i += 6) {
      const batch = await Promise.allSettled(inMp.slice(i, i + 6).map(async (x) => toStation(await feed(`/feed/@${x.uid}/`), { lat: +x.lat, lon: +x.lon, uid: x.uid, name: x.station && x.station.name })));
      for (const b of batch) if (b.status === 'fulfilled' && b.value) out.set(String(b.value.uid), b.value);
    }
  } catch (e) { if (/Invalid key|over quota/i.test(e.message)) throw e; diag.push(`box: ${e.message}`); }
  // 2. Also the nearest station to each city (covers cities the box listing missed)
  if (out.size < cities.length) {
    const batch = await Promise.allSettled(cities.map(async (c) => toStation(await feed(`/feed/geo:${c.lat};${c.lon}/`))));
    let added = 0;
    for (const b of batch) if (b.status === 'fulfilled' && b.value && !out.has(String(b.value.uid))) { out.set(String(b.value.uid), b.value); added++; }
    diag.push(`nearest to each city: ${added} more`);
  }
  if (!out.size) throw new Error(`WAQI had no fresh PM readings for ${R.name} (${diag.join('; ')})`);
  return [...out.values()].map(({ uid, ...s }) => s);
}

// CPCB first; if it fails or has no key, the WAQI backup; if both fail, labelled sample data
async function getStations() {
  return cached('stations', 15 * 60e3, async () => {
    const key = env('DATA_GOV_API_KEY'), token = env('WAQI_TOKEN');
    if (DEMO() || (!key && !token)) {
      fellBack(); status.stations = { mode: 'sample', note: DEMO() ? 'Demo mode is on' : 'Add DATA_GOV_API_KEY (or WAQI_TOKEN as a backup) for live CPCB AQI' };
      return S.sampleStations(Date.now());
    }
    let cpcbError = key ? null : 'no DATA_GOV_API_KEY';
    if (key) {
      try {
        const stations = await cpcbStations(key);
        status.stations = { mode: 'live', source: 'cpcb', note: `${stations.length} CPCB stations in ${R.name} (data.gov.in)` };
        return stations;
      } catch (e) { cpcbError = e.message; }
    }
    if (token) {
      try {
        const stations = await waqiStations(token);
        status.stations = { mode: 'live', source: 'waqi', note: `${stations.length} CPCB stations via the World Air Quality Index Project (WAQI, aqicn.org), PM converted from US AQI to CPCB NAQI. Backup in use because data.gov.in: ${String(cpcbError).slice(0, 120)}` };
        return stations;
      } catch (e) {
        fellBack(); status.stations = { mode: 'sample', note: `CPCB (${String(cpcbError).slice(0, 80)}) and WAQI backup (${e.message.slice(0, 80)}) both failed` };
        return S.sampleStations(Date.now());
      }
    }
    fellBack(); status.stations = { mode: 'sample', note: 'CPCB API failed: ' + cpcbError + '. Add WAQI_TOKEN for an automatic backup.' };
    return S.sampleStations(Date.now());
  });
}

// ---------- Open-Meteo hourly wind on a 1-degree grid ----------
async function getWindGrid() {
  return cached('wind', 30 * 60e3, async () => {
    if (DEMO()) { fellBack(); status.wind = { mode: 'sample', note: 'Demo mode is on' }; return S.sampleWindGrid(Date.now()); }
    const { lats, lons } = R.grid;
    const la = [], lo = [];
    for (const a of lats) for (const b of lons) { la.push(a); lo.push(b); }
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${la.join(',')}&longitude=${lo.join(',')}&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&past_days=2&forecast_days=3&timezone=GMT`;
      let j = JSON.parse(await getText(url, { timeout: 30000 }));
      if (!Array.isArray(j)) j = [j];
      if (j.length !== la.length) throw new Error(`expected ${la.length} grid points, got ${j.length}`);
      const times = j[0].hourly.time.map((t) => Date.parse(t + ':00Z'));
      const u = [], v = [];
      for (let k = 0; k < times.length; k++) {
        const U = [], V = [];
        for (let i = 0; i < lats.length; i++) {
          const ur = [], vr = [];
          for (let jj = 0; jj < lons.length; jj++) {
            const h = j[i * lons.length + jj].hourly;
            const spd = h.wind_speed_10m[k] ?? 0, from = ((h.wind_direction_10m[k] ?? 0) * Math.PI) / 180;
            // Wind direction is where the wind comes FROM; air moves the opposite way
            ur.push(-spd * Math.sin(from)); vr.push(-spd * Math.cos(from));
          }
          U.push(ur); V.push(vr);
        }
        u.push(U); v.push(V);
      }
      status.wind = { mode: 'live', note: `Open-Meteo hourly 10 m wind, ${R.grid.lats.length * R.grid.lons.length}-point grid` };
      return { lats, lons, times, u, v };
    } catch (e) {
      fellBack(); status.wind = { mode: 'sample', note: 'Open-Meteo wind failed: ' + e.message };
      return S.sampleWindGrid(Date.now());
    }
  });
}

// ---------- Open-Meteo air-quality forecast (CAMS model) for one point ----------
async function getAirForecast(lat, lon) {
  const k = `air:${lat.toFixed(2)},${lon.toFixed(2)}`;
  return cached(k, 30 * 60e3, async () => {
    if (DEMO()) { fellBack(); status.forecast = { mode: 'sample', note: 'Demo mode is on' }; return S.sampleAir(lat, lon, Date.now()); }
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10&past_days=1&forecast_days=3&timezone=GMT`;
      const j = JSON.parse(await getText(url));
      const times = j.hourly.time.map((t) => Date.parse(t + ':00Z'));
      status.forecast = { mode: 'live', note: 'Open-Meteo CAMS PM2.5/PM10 forecast' };
      return { times, pm25: j.hourly.pm2_5, pm10: j.hourly.pm10 };
    } catch (e) {
      fellBack(); status.forecast = { mode: 'sample', note: 'Air-quality forecast failed: ' + e.message };
      return S.sampleAir(lat, lon, Date.now());
    }
  });
}

module.exports = { concFromUsAqi, waqiStations, getFires, getStations, getWindGrid, getAirForecast, status, parseFirmsCsv, cache };

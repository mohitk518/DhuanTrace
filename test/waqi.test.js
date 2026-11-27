// Backup AQI source: when data.gov.in fails, the same CPCB stations come from WAQI (aqicn.org), converted to CPCB NAQI
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `dt-waqi-${Date.now()}`);
process.env.DATA_GOV_API_KEY = 'test'; process.env.WAQI_TOKEN = 'tok'; process.env.DEMO_MODE = '0';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const HOUR = 3600e3, now = Date.now();
const istIso = (ms) => new Date(ms + 5.5 * HOUR).toISOString().slice(0, 19) + '+05:30';

let cpcbDown = true;
const STATIONS = {
  101: { pm25: 150, pm10: 80, t: now - HOUR, name: 'T T Nagar, Bhopal, India', lat: 23.2332, lon: 77.4003 },
  102: { pm25: 100, t: now - HOUR, name: 'Chhoti Gwaltoli, Indore, India', lat: 22.7179, lon: 75.8687 },
  103: { pm25: 90, t: now - 30 * HOUR, name: 'Mahakaleshwar, Ujjain, India', lat: 23.18, lon: 75.78 },
  105: { pm25: 120, t: now - 2 * HOUR, name: 'Marhatal, Jabalpur, India', lat: 23.17, lon: 79.93 },
};
const feedData = (uid, d) => ({ idx: uid, city: { name: d.name, geo: [d.lat, d.lon] }, time: { iso: istIso(d.t) }, iaqi: { pm25: { v: d.pm25 }, ...(d.pm10 ? { pm10: { v: d.pm10 } } : {}) } });
const calls = [];
global.fetch = async (url) => {
  url = String(url); calls.push(url);
  const reply = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  if (url.includes('api.data.gov.in')) return cpcbDown ? reply(403, 'Forbidden') : reply(200, { records: [{ state: 'Madhya_Pradesh', city: 'Bhopal', station: 'T T Nagar, Bhopal - MPPCB', last_update: 'x', latitude: '23.23', longitude: '77.40', pollutant_id: 'PM2.5', avg_value: '118' }] });
  if (url.includes('api.waqi.info/v2/map/bounds')) {
    if (!url.includes('token=tok')) return reply(200, { status: 'error', data: 'Invalid key' });
    return reply(200, { status: 'ok', data: [
      { lat: 23.2332, lon: 77.4003, uid: 101, aqi: '150', station: { name: 'T T Nagar, Bhopal, India', time: istIso(now - HOUR) } },
      { lat: 22.7179, lon: 75.8687, uid: 102, aqi: '100', station: { name: 'Chhoti Gwaltoli, Indore, India', time: istIso(now - HOUR) } },
      { lat: 23.18, lon: 75.78, uid: 103, aqi: '90', station: { name: 'Ujjain (stale), India', time: istIso(now - 30 * HOUR) } },
      { lat: 25.18, lon: 75.83, uid: 104, aqi: '120', station: { name: 'Kota, Rajasthan, India', time: istIso(now - HOUR) } },
    ] });
  }
  const feed = /\/feed\/@(\d+)\//.exec(url);
  if (feed) {
    const uid = +feed[1];
    const d = STATIONS[uid];
    if (!d) return reply(200, { status: 'error', data: 'Unknown station' });
    return reply(200, { status: 'ok', data: feedData(uid, d) });
  }
  // Nearest station to a point: Jabalpur's is only reachable this way (the box listing misses it)
  const geo = /\/feed\/geo:([\d.]+);([\d.]+)\//.exec(url);
  if (geo) {
    const lat = +geo[1], lon = +geo[2];
    let best = null, bd = Infinity;
    for (const [uid, d] of Object.entries(STATIONS)) { const dd = Math.hypot(d.lat - lat, d.lon - lon); if (dd < bd) { bd = dd; best = [uid, d]; } }
    return reply(200, { status: 'ok', data: feedData(+best[0], best[1]) });
  }
  throw new Error('unexpected ' + url);
};

(async () => {
  const src = require('../lib/sources');
  const { subIndex } = require('../lib/aqi');

  assert(Math.abs(src.concFromUsAqi('pm25', 150) - 55.4) < 0.01 && Math.abs(src.concFromUsAqi('pm25', 100) - 35.4) < 0.01, 'US AQI turned back into PM2.5 concentration (EPA breakpoints)');
  assert(subIndex('pm25', src.concFromUsAqi('pm25', 150)) === 92, 'US AQI 150 for PM2.5 is CPCB NAQI 92 (55.4 µg/m³)');

  const st = await src.getStations();
  assert(src.status.stations.mode === 'live' && src.status.stations.source === 'waqi', `data.gov.in down → WAQI backup used ("${src.status.stations.note.slice(0, 60)}…")`);
  assert(st.length === 3 && st.every((s) => s.via === 'WAQI') && !st.some((s) => /Ujjain|Kota/.test(s.station)), `stale station and the one in Rajasthan are left out (${st.map((x) => x.city).join(', ')})`);
  assert(st.some((s) => s.city === 'Jabalpur'), 'a city the box listing missed is found through its nearest station');
  const bpl = st.find((s) => /Bhopal/.test(s.station));
  assert(bpl.pollutants['PM2.5'] === 92 && bpl.pollutants.PM10 === 109 && bpl.aqi === 109 && bpl.dominant === 'PM10' && bpl.city === 'Bhopal', 'each pollutant converted (PM2.5 92, PM10 109); station AQI = the highest, like CPCB');
  assert(/WAQI/.test(src.status.stations.note) && /aqicn\.org/.test(src.status.stations.note), 'the page credits the World Air Quality Index Project (required by its terms)');

  // data.gov.in back: CPCB is used again, backup not called
  cpcbDown = false; src.cache.clear(); calls.length = 0;
  await src.getStations();
  assert(src.status.stations.source === 'cpcb' && !calls.some((u) => u.includes('waqi')), 'when data.gov.in works, it is used first and WAQI is not called');

  // both down → labelled sample
  cpcbDown = true; process.env.WAQI_TOKEN = 'wrong'; src.cache.clear();
  const s3 = await src.getStations();
  assert(src.status.stations.mode === 'sample' && /both failed/.test(src.status.stations.note) && s3.length > 0, 'both sources down → labelled sample data, with both reasons');
})();

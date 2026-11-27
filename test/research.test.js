// Offline tests for the reliability features: forecast ledger (1), photo trust (2), forecast range (3),
// inter-state smoke (4). Run: node test/research.test.js
const os = require('os'), path = require('path'), fs = require('fs');
process.env.DATA_DIR = path.join(os.tmpdir(), `dt-research-${Date.now()}`);
process.env.DEMO_MODE = '1';

const HOUR = 3600e3;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n));

(async () => {
  const src = require('../lib/sources');
  const engine = require('../lib/engine');
  const S = require('../lib/sample');
  const now = Date.now(), h0 = Math.floor(now / HOUR) * HOUR;

  // ================= 3. Forecast range =================
  const grid = S.sampleWindGrid(now);
  const members = engine.ensembleGrids(grid);
  const w0 = engine.windAt(grid, 23, 78, now), w1 = engine.windAt(members[1], 23, 78, now), w4 = engine.windAt(members[4], 23, 78, now);
  const deg = (w) => (Math.atan2(w.u, w.v) * 180) / Math.PI;
  assert(members[0] === grid && Math.abs(deg(w1) - deg(w0) + 15) < 0.01 && Math.abs(Math.hypot(w4.u, w4.v) / Math.hypot(w0.u, w0.v) - 1.2) < 1e-9,
    '3: ensemble members turn the wind (−15°) and scale its speed (×1.2); member 0 is the real wind');
  const indore = { id: 'indore', name: 'Indore', lat: 22.72, lon: 75.86 };
  const citizen = [{ id: 'r', lat: 22.95, lon: 76.4, ts: now - 2 * HOUR, analysis: { is_pollution_event: true, smoke_density: 'high' } }];
  const air = S.sampleAir(indore.lat, indore.lon, now);
  const a = engine.analyse({ place: indore, fires: [], reports: citizen, grid, air, stations: [], now });
  const fut = a.forecast.filter((p) => p.t > now - HOUR);
  assert(fut.length > 24 && fut.every((p) => p.lo <= p.corrected && p.corrected <= p.hi), `3: every future hour has a range around the forecast (${fut.length} hours)`);
  assert(a.forecast.filter((p) => p.t <= now - HOUR).every((p) => p.lo == null), '3: past hours carry no range');
  assert(fut[fut.length - 1].hi - fut[fut.length - 1].lo > fut[0].hi - fut[0].lo, '3: range widens further ahead');
  assert(a.forecast_range.cams_error === 'default' && a.peak_24h.lo != null, '3: default spread used and reported until the ledger has data');
  const narrow = engine.analyse({ place: indore, fires: [], reports: citizen, grid, air, stations: [], now, camsError: () => ({ q10: -0.05, q90: 0.05, source: 'ledger' }) });
  const nf = narrow.forecast.filter((p) => p.t > now - HOUR);
  assert(nf[5].hi - nf[5].lo < fut[5].hi - fut[5].lo && narrow.forecast_range.cams_error === 'ledger', '3: a calibrated (narrower) error model narrows the range');

  // ================= 1. Forecast ledger =================
  const ledger = require('../lib/ledger');
  ledger._reset([]);
  const fake = (id, cpcb, aqiNow) => ({
    place: { id, name: id }, aqi_now: { value: aqiNow, source: cpcb ? 'CPCB, 1 station' : 'CAMS model' },
    forecast: [3, 6, 12, 24].map((L) => ({ t: h0 + L * HOUR, cams: 100, corrected: 110, lo: 80, hi: 140 })),
  });
  assert(ledger.record([fake('indore', true, 120), fake('nostation', false, 90)], now) === 4, '1: records 4 lead times, only for cities with a CPCB station');
  assert(ledger.record([fake('indore', true, 120)], now) === 0, '1: the same forecast is never written twice');
  assert(ledger.metrics().pending === 4 && ledger.metrics().scored === 0, '1: forecasts wait until their hour');
  const r3 = ledger.score({ indore: 115 }, h0 + 3 * HOUR + 10 * 60e3);
  assert(r3.scored === 1, '1: the 3-hour forecast is scored when its hour arrives');
  const r6 = ledger.score({ indore: 150 }, h0 + 8 * HOUR);
  assert(r6.scored === 0 && r6.missed === 1, '1: a target missed by over 90 min is marked missed, not guessed');
  // Hand-made history with known answers: obs 100 every time; DhuanTrace 110, CAMS 80, persistence 130
  const hist = [];
  for (let k = 0; k < 40; k++) hist.push({ id: `x${k}`, city: 'Bhopal', city_id: 'bhopal', issued: h0 - (k + 30) * HOUR, target: h0 - (k + 27) * HOUR, lead: 3, persistence: 130, cams: 80, dt: 110, lo: k < 30 ? 90 : 120, hi: 150, obs: 100 });
  ledger._reset(hist);
  const m = ledger.metrics().overall;
  assert(m.n === 40 && m.mae_dhuantrace === 10 && m.mae_cams === 20 && m.mae_persistence === 30, `1: errors computed exactly (±${m.mae_dhuantrace}, ±${m.mae_cams}, ±${m.mae_persistence})`);
  assert(m.skill_vs_persistence === 67 && m.skill_vs_cams === 50 && m.bias_dhuantrace === 10, '1: skill vs persistence (+67%) and vs CAMS (+50%) and bias (+10)');
  // obs 100 is Satisfactory; DhuanTrace 110 and persistence 130 are Moderate; CAMS 80 is Satisfactory
  assert(m.range_coverage === 75 && m.category_hit_dhuantrace === 0 && m.category_hit_cams === 100 && m.category_hit_persistence === 0, '1: range coverage (75%) and CPCB category hits');
  const e = ledger.camsError(3);
  assert(e.source === 'ledger' && Math.abs(e.q10 - 0.25) < 1e-9 && Math.abs(e.q90 - 0.25) < 1e-9, '1→3: range calibrated from scored forecasts (CAMS 80 vs obs 100 → +25%)');
  ledger._reset([]);
  assert(ledger.camsError(3).source === 'default', '1→3: default spread when there is too little history');

  // ================= 2. Photo trust =================
  const { readExif } = require('../lib/exif');
  const trust = require('../lib/trust');
  const ex = readExif(fixture('exif_gps_sehore.jpg'));
  assert(ex && ex.lat === 23.2 && ex.lon === 77.09 && ex.taken_at === Date.UTC(2026, 8, 28, 12, 40), '2: EXIF time (with its +05:30 offset) and GPS read from a JPEG');
  const old = readExif(fixture('exif_old_no_zone.jpg'));
  assert(old && old.taken_at === Date.UTC(2026, 8, 20, 1, 30) && old.taken_zone === 'assumed IST' && old.lat == null, '2: time without a zone is read as IST');
  assert(readExif(fixture('no_exif.jpg')) === null && readExif(Buffer.from('not a jpeg')) === null && readExif(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 2])) === null, '2: missing or broken EXIF returns nothing, never crashes');
  // Big-endian TIFF built by hand: DateTimeOriginal only
  const be = (() => {
    const dt = Buffer.from('2026:09:28 17:30:00\0', 'latin1');
    const t = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4 + dt.length);
    t.write('MM', 0, 'latin1'); t.writeUInt16BE(42, 2); t.writeUInt32BE(8, 4);
    t.writeUInt16BE(1, 8); t.writeUInt16BE(0x8769, 10); t.writeUInt16BE(4, 12); t.writeUInt32BE(1, 14); t.writeUInt32BE(26, 18); t.writeUInt32BE(0, 22);
    t.writeUInt16BE(1, 26); t.writeUInt16BE(0x9003, 28); t.writeUInt16BE(2, 30); t.writeUInt32BE(dt.length, 32); t.writeUInt32BE(44, 36); t.writeUInt32BE(0, 40);
    dt.copy(t, 44);
    const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]);
    const len = Buffer.alloc(2); len.writeUInt16BE(app1.length + 2);
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1, Buffer.from([0xff, 0xd9])]);
  })();
  assert(readExif(be).taken_at === Date.UTC(2026, 8, 28, 12, 0), '2: big-endian (Motorola) EXIF read too');

  const base = { lat: 23.2, lon: 77.1, ts: Date.UTC(2026, 8, 28, 13, 0), sha256: 'a'.repeat(64), phash: '0f0f0f0f0f0f0f0f', satellite_fires_within_10km: 3,
    analysis: { is_pollution_event: true, source_type: 'crop_residue_burning', authenticity: { lighting: 'day', scene: 'rural' } } };
  const good = trust.assess({ ...base, exif: { taken_at: base.ts - 20 * 60e3, lat: 23.21, lon: 77.1 } });
  assert(good.level === 'high' && good.score >= 0.9 && good.used_in_forecast, `2: fresh photo, matching GPS, satellite support → high trust (${good.score})`);
  const none = trust.assess({ ...base, satellite_fires_within_10km: 0, exif: null });
  assert(none.score === 0.6 && none.reasons.every((r) => r.effect === 0), '2: no EXIF is neutral, not a penalty');
  const stale = trust.assess({ ...base, exif: { taken_at: base.ts - 9 * 24 * HOUR } });
  assert(stale.score < good.score && stale.reasons.some((r) => r.signal === 'time_stale'), '2: a 9-day-old photo loses trust');
  const far = trust.assess({ ...base, exif: { taken_at: base.ts - 600e3, lat: 25.4, lon: 78.5 } });
  assert(far.reasons.some((r) => r.signal === 'gps_far') && far.score < good.score, '2: photo taken 280 km away loses trust');
  const dup = trust.assess({ ...base, ts: base.ts + 3 * HOUR }, [{ ...base }]);
  assert(dup.reasons.some((r) => r.signal === 'duplicate') && dup.score < none.score, '2: the exact same photo sent again is caught');
  const nearCopy = trust.assess({ ...base, sha256: 'b'.repeat(64), phash: '0f0f0f0f0f0f0f0e' }, [{ ...base }]);
  assert(nearCopy.reasons.some((r) => r.signal === 'near_duplicate'), '2: a resized/recompressed copy (1 fingerprint bit apart) is caught');
  const differ = trust.assess({ ...base, sha256: 'c'.repeat(64), phash: 'f0f0f0f0f0f0f0f0' }, [{ ...base }]);
  assert(!differ.reasons.some((r) => /duplicate/.test(r.signal)), '2: a different photo is not flagged');
  const faked = trust.assess({ ...base, exif: null, analysis: { ...base.analysis, authenticity: { photo_of_screen_or_print: true, looks_ai_generated_or_stock: true, lighting: 'day' } } });
  assert(faked.level === 'low' && !faked.used_in_forecast, `2: screen photo that looks AI-made → low trust, left out of the forecast (${faked.score})`);
  const night = trust.assess({ ...base, ts: Date.UTC(2026, 8, 28, 17, 0), exif: null, analysis: { ...base.analysis, authenticity: { lighting: 'day' } } });
  assert(night.reasons.some((r) => r.signal === 'light_mismatch'), '2: daylight photo sent at 22:30 IST is flagged');
  assert(trust.hamming('ffffffffffffffff', '0000000000000000') === 64 && trust.hamming('zz', '00') === null, '2: fingerprint distance');

  // Trust changes how much a report counts
  // A report 25 km upwind of Indore, one hour old, so its smoke is clearly measurable
  const withTrust = (score) => [{ ...citizen[0], lat: 22.8, lon: 76.1, ts: now - HOUR, trust: { score, used_in_forecast: score >= 0.25 } }];
  const hi = engine.analyse({ place: indore, fires: [], reports: withTrust(1), grid, air, stations: [], now });
  const lo = engine.analyse({ place: indore, fires: [], reports: withTrust(0.6), grid, air, stations: [], now });
  const off = engine.analyse({ place: indore, fires: [], reports: withTrust(0.1), grid, air, stations: [], now });
  const extra = (x) => x.forecast.reduce((s, p) => s + (p.corrected - p.cams), 0);
  assert(extra(hi) > extra(lo) && extra(lo) > 0 && extra(off) === 0, `2: smoke from a report scales with its trust, and low-trust reports add none (${extra(hi)} > ${extra(lo)} > ${extra(off)})`);

  // ================= 4. Inter-state smoke =================
  const P = require('../lib/places');
  const st = (lat, lon) => P.stateOf({ lat, lon }).state;
  assert(st(25.45, 78.6) === 'Uttar Pradesh' && st(25.2, 75.9) === 'Rajasthan' && st(21.15, 79.1) === 'Maharashtra' && st(22.8, 74.3) === 'Gujarat' && st(22.1, 82.1) === 'Chhattisgarh', '4: fires near Jhansi, Kota, Nagpur, Dahod and Bilaspur are placed in their states');
  assert(['Datia', 'Neemuch', 'Indore', 'Bhopal', 'Singrauli'].every((d) => { const x = P.DISTRICTS.find((y) => y.name === d); return st(x.lat, x.lon) === 'Madhya Pradesh'; }), '4: MP district headquarters stay in MP');
  assert(P.nearestDistrict({ lat: 25.45, lon: 78.6 }).name === 'Jhansi (Uttar Pradesh)', '4: a fire near Jhansi is no longer counted as Datia district');

  const reports = require('../lib/reports');
  const analyseAt = async (place) => {
    const [fires, stations, g, ai] = await Promise.all([src.getFires(), src.getStations(), src.getWindGrid(), src.getAirForecast(place.lat, place.lon)]);
    return engine.analyse({ place, fires, reports: reports.all(now), grid: g, air: ai, stations, now });
  };
  const I = await require('../lib/interstate').compute(analyseAt);
  assert(I.schema === 'dhuantrace.interstate/1' && I.cities_checked.neighbours === 8 && I.states.length > 0, `4: bulletin built (${I.states.map((s) => s.state).join(', ')})`);
  assert(I.states.every((s) => s.state !== 'Madhya Pradesh') && I.states.some((s) => s.into_mp && s.into_mp.aqi_points_now + s.into_mp.aqi_points_incoming > 0), '4: smoke into MP from a neighbouring state is found');

  // Alerts go to an MP district, and name smoke from other states separately
  const g = require('../lib/gemini');
  const facts = { city: 'Ujjain', city_hi: 'उज्जैन', aqi_now: 150, peak_aqi: 170, top_district: { district: 'Dewas', district_hi: 'देवास', share: 60, satellite_fires: 9, citizen_reports: 0, travel_h: 3 },
    smoke_from_other_states: [{ state: 'Uttar Pradesh', state_hi: 'उत्तर प्रदेश', share_of_fire_smoke_pct: 30 }] };
  const en = g.templateAlert(facts, 'en');
  assert(en.to === 'District Collector, Dewas' && /30% from Uttar Pradesh/.test(en.body) && /Uttar Pradesh Pollution Control Board/.test(en.body), '4: alert to the MP Collector, with the UP share passed to the pollution boards');
  const onlyOther = g.templateAlert({ ...facts, top_district: null }, 'en');
  assert(/MP Pollution Control Board/.test(onlyOther.to) && !/Collector/.test(onlyOther.to), '4: smoke only from another state → addressed to the MP Pollution Control Board, not a Collector');
})();

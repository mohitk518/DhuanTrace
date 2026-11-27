// Satellite evidence for hidden hotspots: does the satellite also see more aerosol or NO2 over the spot than
// around it? Reads NASA GIBS data layers as PNG images and turns each pixel's colour back into its value using
// the layer's published colour map. Every decoding is checked: if the pixel colours do not match the colour map
// exactly, the result is refused rather than guessed.
//
// Measures: aerosol optical depth (MODIS MAIAC 1 km, falling back to MODIS value-added AOD) and OMI tropospheric
// NO2 column (0.25°). Both are daily daytime snapshots of the whole air column, not ground-level readings.
const { decodePng } = require('./png');

const GIBS = 'https://gibs.earthdata.nasa.gov';
const DEG = Math.PI / 180;

const PRODUCTS = {
  aod: {
    label: 'aerosol (haze and smoke particles)', measure: 'aerosol optical depth', unit: '', scale: 1, digits: 2,
    layers: [
      { layer: 'MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth', name: 'MODIS MAIAC aerosol optical depth', res: '1 km', colormaps: ['MODIS_VIIRS_AOD', 'MODIS_Combined_Value_Added_AOD'] },
      { layer: 'MODIS_Combined_Value_Added_AOD', name: 'MODIS value-added aerosol optical depth', res: 'about 10 km', colormaps: ['MODIS_Combined_Value_Added_AOD'] },
    ],
    inner: 0.10, ring: [0.30, 0.60], size: 96, days: 4, supports: 1.15,
  },
  no2: {
    label: 'nitrogen dioxide (combustion gas from traffic, industry, burning)', measure: 'tropospheric NO₂ column', unit: '×10¹⁵ molecules/cm²', scale: 1e-15, digits: 1,
    layers: [{ layer: 'OMI_Nitrogen_Dioxide_Tropo_Column', name: 'Aura OMI tropospheric NO₂', res: '0.25° (about 27 km)', colormaps: ['OMI_Nitrogen_Dioxide_Tropo_Column'] }],
    inner: 0.15, ring: [0.35, 0.75], size: 48, days: 7, supports: 1.2,
  },
};

// ---------- colour maps ----------
function parseRange(s) {
  const m = /^\[([^,\]]+)(?:,([^\])]+))?[\])]$/.exec(String(s || '').trim());
  if (!m) return null;
  const num = (t) => (/-INF/i.test(t) ? -Infinity : /INF/i.test(t) ? Infinity : parseFloat(t));
  const a = num(m[1]), b = m[2] == null ? a : num(m[2]);
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
  if (!Number.isFinite(a)) return Math.min(0, b);
  if (!Number.isFinite(b)) return a;
  return (a + b) / 2;
}

// colour "r,g,b" -> value; entries without a value (no data, transparent) are left out
function parseColormap(xml) {
  const map = new Map();
  for (const m of String(xml).matchAll(/<ColorMapEntry\b([^>]*)\/?>/g)) {
    const attr = (k) => { const x = new RegExp(`\\b${k}="([^"]*)"`).exec(m[1]); return x ? x[1] : null; };
    if (attr('nodata') === 'true' || attr('transparent') === 'true') continue;
    const v = parseRange(attr('value') || attr('sourceValue'));
    if (attr('rgb') && v != null && Number.isFinite(v)) map.set(attr('rgb').replace(/\s/g, ''), v);
  }
  return map;
}

const cmCache = new Map();
async function colormap(name, fetchFn) {
  if (cmCache.has(name)) return cmCache.get(name);
  const r = await fetchFn(`${GIBS}/colormaps/v1.3/${name}.xml`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`colour map ${name}: HTTP ${r.status}`);
  const m = parseColormap(await r.text());
  if (m.size < 10) throw new Error(`colour map ${name} has no usable entries`);
  cmCache.set(name, m);
  return m;
}

// ---------- images ----------
const box = (lat, lon, r) => ({ s: lat - r, n: lat + r, w: lon - r / Math.cos(lat * DEG), e: lon + r / Math.cos(lat * DEG) });
function wmsUrl(layer, b, date, size, format = 'image/png') {
  return `${GIBS}/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&STYLES=&CRS=EPSG:4326`
    + `&BBOX=${b.s.toFixed(4)},${b.w.toFixed(4)},${b.n.toFixed(4)},${b.e.toFixed(4)}&WIDTH=${size}&HEIGHT=${size}&FORMAT=${encodeURIComponent(format)}&TRANSPARENT=TRUE&TIME=${date}`;
}

// Read one image: mean value inside the spot and in the ring around it
function measure(img, cm, lat, lon, spec) {
  const b = box(lat, lon, spec.ring[1]);
  let inner = [], ring = [], innerTotal = 0, ringTotal = 0, matched = 0, unmatched = 0;
  for (let y = 0; y < img.height; y++) {
    const plat = b.n - ((y + 0.5) / img.height) * (b.n - b.s);
    for (let x = 0; x < img.width; x++) {
      const plon = b.w + ((x + 0.5) / img.width) * (b.e - b.w);
      const d = Math.hypot(plat - lat, (plon - lon) * Math.cos(lat * DEG)); // degrees of latitude
      const zone = d <= spec.inner ? 'in' : d >= spec.ring[0] && d <= spec.ring[1] ? 'ring' : null;
      if (!zone) continue;
      if (zone === 'in') innerTotal++; else ringTotal++;
      const [r, g, bl, a] = img.rgba(x, y);
      if (a === 0) continue; // no data: cloud, no overpass, water
      const v = cm.get(`${r},${g},${bl}`);
      if (v == null) { unmatched++; continue; }
      matched++;
      (zone === 'in' ? inner : ring).push(v);
    }
  }
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  return {
    match_rate: matched + unmatched ? matched / (matched + unmatched) : null,
    inner_mean: mean(inner), ring_mean: mean(ring),
    inner_coverage: innerTotal ? inner.length / innerTotal : 0, ring_coverage: ringTotal ? ring.length / ringTotal : 0,
  };
}

const istDate = (ms) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);

// NASA GIBS can be slow: one retry on a timeout or network error, 45 s each
async function fetchPng(url, fetchFn) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try { r = await fetchFn(url, { signal: AbortSignal.timeout(45000) }); }
    catch (e) { lastErr = e; if (attempt === 0) { await new Promise((ok) => setTimeout(ok, 1500)); continue; } throw e; }
    const type = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok || !type.startsWith('image/png')) throw new Error(`NASA GIBS returned ${r.status} ${type}`);
    return decodePng(buf);
  }
  throw lastErr;
}

// Check one product over one point: newest day with enough clear pixels over the spot, within `days` days
async function checkProduct(key, lat, lon, now, fetchFn) {
  const spec = PRODUCTS[key];
  const tried = [];
  for (const L of spec.layers) {
    for (let d = 0; d < spec.days; d++) {
      const date = istDate(now - d * 86400e3);
      let img;
      try { img = await fetchPng(wmsUrl(L.layer, box(lat, lon, spec.ring[1]), date, spec.size), fetchFn); }
      catch (e) { tried.push(`${L.layer} ${date}: ${e.message}`); if (/fetch failed|ENOTFOUND|ECONN|abort|timeout/i.test(e.message)) return unavailable(key, e.message); continue; }
      let m = null, cmName = null;
      for (const name of L.colormaps) {
        let cm; try { cm = await colormap(name, fetchFn); } catch (e) { tried.push(e.message); continue; }
        const r = measure(img, cm, lat, lon, spec);
        if (r.match_rate == null || r.match_rate >= 0.9) { m = r; cmName = name; break; }
        tried.push(`${L.layer} with colour map ${name}: only ${Math.round(r.match_rate * 100)}% of pixels match, refused`);
      }
      if (!m) break; // colours do not decode with any known map: try the next layer
      if (m.inner_coverage < 0.25 || m.ring_coverage < 0.2 || m.inner_mean == null || m.ring_mean == null) { tried.push(`${date}: too few clear pixels`); continue; }
      const ratio = m.ring_mean > 0 ? m.inner_mean / m.ring_mean : null;
      const verdict = ratio == null ? 'no_data' : ratio >= spec.supports ? 'supports' : ratio < 1.05 ? 'no_local_excess' : 'weak';
      const f = (v) => +(v * spec.scale).toFixed(spec.digits);
      return {
        product: key, measure: spec.measure, label: spec.label, unit: spec.unit, source: `NASA GIBS · ${L.name} (${L.res})`, layer: L.layer, colormap: cmName, date,
        over_spot: f(m.inner_mean), around: f(m.ring_mean), ratio: ratio == null ? null : +ratio.toFixed(2),
        coverage_spot: +m.inner_coverage.toFixed(2), coverage_around: +m.ring_coverage.toFixed(2), decode_check: +m.match_rate.toFixed(3),
        verdict,
        image: wmsUrl(L.layer, box(lat, lon, spec.ring[1]), date, 256),
        spot_radius_km: Math.round(spec.inner * 111), ring_km: spec.ring.map((r) => Math.round(r * 111)),
      };
    }
  }
  return { product: key, measure: spec.measure, verdict: 'no_data', note: `No clear satellite view in the last ${spec.days} days (cloud, no overpass or no retrieval).`, tried: tried.slice(-4) };
}
const unavailable = (key, why) => ({ product: key, measure: PRODUCTS[key].measure, verdict: 'unavailable', note: `NASA GIBS could not be reached (${why}).` });

// Results are cached per spot and day: complete results for 6 hours, results where NASA could not be reached
// for 15 minutes (so the page shows what is known and tries again later without hammering NASA)
const cache = new Map();
let version = 0;
const keyOf = (lat, lon, now) => `${lat.toFixed(2)},${lon.toFixed(2)}:${istDate(now)}`;
function peek({ lat, lon }, now = Date.now()) {
  const hit = cache.get(keyOf(lat, lon, now));
  return hit && now - hit.at < hit.ttl ? hit.value : null;
}
async function check({ lat, lon }, { now = Date.now(), fetchFn = fetch } = {}) {
  const k = keyOf(lat, lon, now);
  const hit = peek({ lat, lon }, now);
  if (hit) return hit;
  const aod = await checkProduct('aod', lat, lon, now, fetchFn);
  const no2 = await checkProduct('no2', lat, lon, now, fetchFn);
  const value = { aod, no2, supports: [aod, no2].some((x) => x.verdict === 'supports'), clear_no_excess: [aod, no2].every((x) => x.verdict === 'no_local_excess'), checked_at: now };
  const failed = [aod, no2].some((x) => x.verdict === 'unavailable');
  cache.set(k, { at: now, ttl: failed ? 15 * 60e3 : 6 * 3600e3, value });
  version++;
  return value;
}

// Background queue: the hotspot list never waits for NASA. One spot at a time, results land in the cache.
const queued = new Map(); // key -> point
let worker = null;
function queue(points, { fetchFn = fetch } = {}) {
  for (const p of points) { const k = keyOf(p.lat, p.lon, Date.now()); if (!peek(p) && !queued.has(k)) queued.set(k, { lat: p.lat, lon: p.lon }); }
  if (!worker && queued.size) {
    worker = (async () => {
      while (queued.size) {
        const [k, p] = queued.entries().next().value;
        try { await check(p, { fetchFn }); } catch (e) { cache.set(k, { at: Date.now(), ttl: 15 * 60e3, value: { unavailable: true, note: `Satellite check failed: ${e.message}` } }); version++; }
        queued.delete(k);
      }
    })().finally(() => { worker = null; });
  }
  return worker;
}
const pending = () => queued.size;
const getVersion = () => version;

// One sentence of evidence for the hotspot card
function sentence(s) {
  const one = (x) => {
    if (x.verdict === 'supports') return `the satellite sees ${Math.round((x.ratio - 1) * 100)}% more ${x.measure} over the spot than in the ring around it (${x.over_spot} vs ${x.around}${x.unit ? ' ' + x.unit : ''}, ${x.date})`;
    if (x.verdict === 'weak') return `a slight ${x.measure} excess over the spot (${Math.round((x.ratio - 1) * 100)}%, ${x.date})`;
    if (x.verdict === 'no_local_excess') return `no ${x.measure} excess over the spot (${x.date})`;
    return null;
  };
  const parts = [one(s.aod), one(s.no2)].filter(Boolean);
  return parts.length ? `Satellite check: ${parts.join('; ')}.` : null;
}

module.exports = { check, peek, queue, pending, getVersion, checkProduct, parseColormap, parseRange, measure, wmsUrl, box, sentence, PRODUCTS, _cache: cache, _cmCache: cmCache };

// Satellite evidence for hotspots: PNG decoding, colour-map decoding with its self-check, and fallbacks (all offline)
const zlib = require('zlib');
const { decodePng, encodePng } = require('../lib/png');
const sat = require('../lib/satevidence');

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

// Palette PNG encoder (GIBS serves palette PNGs), 8-bit indices, with a tRNS chunk
function palettePng(w, h, colors, alpha, idx) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = y % 2 ? 2 : 0; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = idx(x, y); }
  // apply "up" filter on odd rows so the decoder's filter handling is exercised
  for (let y = h - 1; y >= 1; y -= 2) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (raw[y * (w + 1) + 1 + x] - idx(x, y - 1)) & 255;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(colors.flat())), chunk('tRNS', Buffer.from(alpha)), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- decoding ----------
const rgba = decodePng(encodePng(3, 2, (x, y) => [x * 10, y * 20, 7, 255]));
assert(rgba.width === 3 && rgba.rgba(2, 1).join() === '20,20,7,255', 'RGBA PNG decodes pixel for pixel');
const pal = decodePng(palettePng(4, 4, [[0, 0, 0], [10, 200, 50], [30, 200, 50]], [0, 255, 255], (x, y) => (x + y) % 3));
assert(pal.rgba(1, 0).join() === '10,200,50,255' && pal.rgba(0, 0)[3] === 0 && pal.rgba(1, 1).join() === '30,200,50,255', 'palette PNG with transparency and row filters decodes');
let bad = false; try { decodePng(Buffer.from('not a png')); } catch { bad = true; }
assert(bad, 'a non-PNG reply is refused');

assert(sat.parseRange('[1.06e+14,2.12e+14)') === 1.59e14, 'value range midpoint');
assert(sat.parseRange('[2.00e+16,+INF)') === 2e16 && sat.parseRange('[-INF,0.00e+00)') === 0 && sat.parseRange('[5]') === 5, 'open-ended and single-value ranges');
const cmXml = `<ColorMap title="No Data"><ColorMapEntry rgb="255,0,255" transparent="true" nodata="true" ref="0"/></ColorMap><ColorMap>
${Array.from({ length: 100 }, (_, i) => `<ColorMapEntry rgb="${i},200,50" transparent="false" sourceValue="[${i * 50},${(i + 1) * 50})" value="[${(i * 0.05).toFixed(2)},${((i + 1) * 0.05).toFixed(2)})" ref="${i + 1}"/>`).join('\n')}</ColorMap>`;
const cm = sat.parseColormap(cmXml);
assert(cm.size === 100 && Math.abs(cm.get('30,200,50') - 1.525) < 1e-9 && !cm.has('255,0,255'), 'GIBS colour map parsed; no-data entry left out');

// ---------- mocked NASA GIBS ----------
// The image follows the real request's bounding box: value index 30 (AOD 1.525) within the spot, 10 (0.525) around
function makeFetch({ cloudyOn = null, maiacColours = 'right', down = false, calls = [] } = {}) {
  return async (url) => {
    calls.push(url);
    if (down) throw new TypeError('fetch failed');
    if (url.includes('/colormaps/')) {
      if (url.includes('OMI_Nitrogen')) return new Response(cmXml.replace(/value="\[([\d.]+),([\d.]+)\)"/g, (_, a, b) => `value="[${a}e+16,${b}e+16)"`));
      return new Response(cmXml);
    }
    const q = new URL(url).searchParams;
    const [s, w, n, e] = q.get('BBOX').split(',').map(Number), size = +q.get('WIDTH'), date = q.get('TIME'), layer = q.get('LAYERS');
    const lat = (s + n) / 2, lon = (w + e) / 2;
    const png = encodePng(size, size, (x, y) => {
      const plat = n - ((y + 0.5) / size) * (n - s), plon = w + ((x + 0.5) / size) * (e - w);
      const d = Math.hypot(plat - lat, (plon - lon) * Math.cos(lat * Math.PI / 180));
      if (cloudyOn === date && d < 0.2) return [0, 0, 0, 0];
      const i = d <= 0.12 ? 30 : 10;
      if (layer.includes('MAIAC') && maiacColours === 'wrong') return [i, 123, 45, 255];
      return [i, 200, 50, 255];
    });
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  };
}

(async () => {
  const now = Date.UTC(2026, 8, 29, 6, 0);
  sat._cmCache.clear();
  const s1 = await sat.check({ lat: 22.61, lon: 75.68 }, { now, fetchFn: makeFetch() });
  assert(s1.aod.verdict === 'supports' && s1.aod.ratio > 2 && s1.aod.layer.includes('MAIAC') && s1.aod.decode_check === 1, `AOD over the spot read back from the image: ${s1.aod.over_spot} vs ${s1.aod.around} around (ratio ${s1.aod.ratio})`);
  assert(s1.no2.verdict === 'supports' && s1.no2.unit.includes('10¹⁵') && s1.no2.over_spot > 10, `NO2 converted to ×10¹⁵ molecules/cm² (${s1.no2.over_spot} vs ${s1.no2.around})`);
  assert(s1.supports && /Satellite check: the satellite sees \d+% more aerosol optical depth/.test(sat.sentence(s1)), 'evidence sentence for the hotspot card');
  assert(s1.aod.image.startsWith('https://gibs.earthdata.nasa.gov/wms/') && s1.aod.image.includes('WIDTH=256'), 'a picture link is given for the page');

  sat._cache.clear();
  const s2 = await sat.check({ lat: 23.1, lon: 77.53 }, { now, fetchFn: makeFetch({ maiacColours: 'wrong' }) });
  assert(s2.aod.layer === 'MODIS_Combined_Value_Added_AOD' && s2.aod.verdict === 'supports', 'colours that do not match the colour map are refused, and the next layer is used instead');

  sat._cache.clear();
  const calls = [];
  const s3 = await sat.check({ lat: 22.96, lon: 76.07 }, { now, fetchFn: makeFetch({ cloudyOn: '2026-09-29', calls }) });
  assert(s3.aod.date === '2026-09-28' && calls.some((u) => u.includes('TIME=2026-09-29')), 'a cloudy day over the spot falls back to the day before');

  sat._cache.clear();
  const s4 = await sat.check({ lat: 23.2, lon: 77.4 }, { now, fetchFn: makeFetch({ down: true }) });
  assert(s4.aod.verdict === 'unavailable' && !s4.supports && sat.sentence(s4) === null, 'NASA unreachable: no evidence claimed, nothing invented');
  const failedEntry = [...sat._cache.values()][0];
  assert(failedEntry && failedEntry.ttl === 15 * 60e3 && sat.peek({ lat: 23.2, lon: 77.4 }, now + 16 * 60e3) === null, 'a failed check is kept only 15 minutes, then retried');

  // Background queue: the hotspot list never waits; results land in the cache
  sat._cache.clear();
  const v0 = sat.getVersion();
  assert(sat.peek({ lat: 22.7, lon: 75.9 }) === null, 'nothing known yet for a new spot');
  const w = sat.queue([{ lat: 22.7, lon: 75.9 }, { lat: 22.7, lon: 75.9 }], { fetchFn: makeFetch() });
  assert(sat.pending() === 1, 'the same spot is queued only once');
  await w;
  const got = sat.peek({ lat: 22.7, lon: 75.9 });
  assert(got && got.aod.verdict === 'supports' && sat.getVersion() > v0 && sat.pending() === 0, 'background check fills the cache and bumps the version, so the list refreshes');

  // A spot with no excess: same value everywhere
  sat._cache.clear();
  const flat = async (url) => url.includes('/colormaps/') ? new Response(cmXml) : new Response(encodePng(+new URL(url).searchParams.get('WIDTH'), +new URL(url).searchParams.get('WIDTH'), () => [20, 200, 50, 255]), { headers: { 'content-type': 'image/png' } });
  const s5 = await sat.check({ lat: 24.0, lon: 78.0 }, { now, fetchFn: flat });
  assert(s5.aod.verdict === 'no_local_excess' && s5.clear_no_excess, 'uniform haze gives "no local excess", which lowers the hotspot\'s confidence');
})();

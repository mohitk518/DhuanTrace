// Minimal PNG decoder (no dependencies): 8-bit greyscale, RGB, RGBA and palette images (1/2/4/8-bit palette).
// Used to read NASA GIBS data layers pixel by pixel, where each colour stands for a measured value.
const zlib = require('zlib');

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let off = 8, ihdr = null, palette = null, trns = null; const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('PNG without IHDR');
  const { w, h, depth, color, interlace } = ihdr;
  if (interlace) throw new Error('interlaced PNG is not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels || (color !== 3 && depth !== 8) || (color === 3 && ![1, 2, 4, 8].includes(depth))) throw new Error(`PNG colour type ${color} depth ${depth} not supported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (channels * depth) >> 3), stride = Math.ceil((w * channels * depth) / 8);
  const out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  // rgba(x, y) -> [r, g, b, a]
  function rgba(x, y) {
    const row = y * stride;
    if (color === 3) {
      const bit = x * depth, byte = out[row + (bit >> 3)], idx = depth === 8 ? byte : (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      return [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255];
    }
    const i = row + x * channels;
    if (color === 0) return [out[i], out[i], out[i], 255];
    if (color === 4) return [out[i], out[i], out[i], out[i + 1]];
    if (color === 2) return [out[i], out[i + 1], out[i + 2], 255];
    return [out[i], out[i + 1], out[i + 2], out[i + 3]];
  }
  return { width: w, height: h, rgba };
}

// Encoder for tests and fixtures: RGBA, filter 0
function encodePng(w, h, pixel) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = pixel(x, y); p.forEach((v, k) => { raw[y * (w * 4 + 1) + 1 + x * 4 + k] = v; }); }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { decodePng, encodePng };

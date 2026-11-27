// Minimal EXIF reader for JPEG: capture time and GPS position, the two fields that tell whether a citizen photo
// is fresh and was taken where it was reported. EXIF is easy to strip or edit, so these are trust signals, not proof.
// No dependencies: walks the APP1 segment's TIFF structure directly.

function readExif(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not a JPEG
  let off = 2;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1];
    if (marker === 0xda || marker === 0xd9) return null; // image data starts: no EXIF before it
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xe1 && buf.toString('latin1', off + 4, off + 10) === 'Exif\0\0') {
      try { return parseTiff(buf.subarray(off + 10, off + 2 + len)); } catch { return null; }
    }
    off += 2 + len;
  }
  return null;
}

function parseTiff(t) {
  const le = t.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  if (u16(2) !== 42) return null;

  const readIfd = (ifdOff) => {
    const tags = {};
    if (!ifdOff || ifdOff + 2 > t.length) return tags;
    const n = u16(ifdOff);
    for (let i = 0; i < n; i++) {
      const e = ifdOff + 2 + i * 12;
      if (e + 12 > t.length) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
      const dataOff = size * count <= 4 ? e + 8 : u32(e + 8);
      if (dataOff + size * count > t.length) continue;
      if (type === 2) tags[tag] = t.toString('latin1', dataOff, dataOff + count).replace(/\0+$/, '');
      else if (type === 3) tags[tag] = count === 1 ? u16(dataOff) : Array.from({ length: count }, (_, k) => u16(dataOff + 2 * k));
      else if (type === 4) tags[tag] = u32(dataOff);
      else if (type === 5) tags[tag] = Array.from({ length: count }, (_, k) => { const d = u32(dataOff + 8 * k + 4); return d ? u32(dataOff + 8 * k) / d : 0; });
    }
    return tags;
  };

  const ifd0 = readIfd(u32(4));
  const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
  const gps = ifd0[0x8825] ? readIfd(ifd0[0x8825]) : {};

  const out = { make: ifd0[0x010f] || null, model: ifd0[0x0110] || null, software: ifd0[0x0131] || null };
  const dt = exif[0x9003] || exif[0x9004] || ifd0[0x0132];
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt || '');
  if (m) {
    // EXIF time has no zone; use the photo's own offset when it records one, else assume Indian Standard Time
    const offTag = exif[0x9011] || exif[0x9010] || '';
    const om = /^([+-])(\d{2}):(\d{2})$/.exec(offTag);
    const offMin = om ? (om[1] === '-' ? -1 : 1) * (+om[2] * 60 + +om[3]) : 330;
    out.taken_at = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offMin * 60e3;
    out.taken_zone = om ? offTag : 'assumed IST';
  }
  const dms = (v) => (Array.isArray(v) && v.length === 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null);
  const lat = dms(gps[2]), lon = dms(gps[4]);
  if (lat != null && lon != null && (lat || lon)) {
    out.lat = +(gps[1] === 'S' ? -lat : lat).toFixed(6);
    out.lon = +(gps[3] === 'W' ? -lon : lon).toFixed(6);
  }
  return out;
}

module.exports = { readExif };

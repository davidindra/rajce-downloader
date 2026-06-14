// zip.js — minimal, dependency-free ZIP writer (STORE method, no compression).
// Album media is already compressed, so storing is the right choice and avoids
// bundling a large library. Handles UTF-8 names and sub-folder paths.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// DOS date/time for "now".
function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}

export class ZipWriter {
  constructor() {
    this.entries = [];
  }

  // data: Uint8Array
  add(path, data) {
    this.entries.push({ name: path.replace(/\\/g, "/"), data });
  }

  get count() {
    return this.entries.length;
  }

  generateBlob() {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime();
    const FLAG_UTF8 = 0x0800;

    const parts = [];
    const central = [];
    let offset = 0;

    for (const e of this.entries) {
      const nameBytes = enc.encode(e.name);
      const crc = crc32(e.data);
      const size = e.data.length;

      const local = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(local);
      lv.setUint32(0, 0x04034b50, true); // local file header signature
      lv.setUint16(4, 20, true); // version needed
      lv.setUint16(6, FLAG_UTF8, true); // flags
      lv.setUint16(8, 0, true); // compression: store
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true); // compressed size
      lv.setUint32(22, size, true); // uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true); // extra len
      new Uint8Array(local, 30).set(nameBytes);

      parts.push(new Uint8Array(local), e.data);

      const cd = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(cd);
      cv.setUint32(0, 0x02014b50, true); // central dir signature
      cv.setUint16(4, 20, true); // version made by
      cv.setUint16(6, 20, true); // version needed
      cv.setUint16(8, FLAG_UTF8, true);
      cv.setUint16(10, 0, true); // store
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true); // extra len
      cv.setUint16(32, 0, true); // comment len
      cv.setUint16(34, 0, true); // disk number start
      cv.setUint16(36, 0, true); // internal attrs
      cv.setUint32(38, 0, true); // external attrs
      cv.setUint32(42, offset, true); // local header offset
      new Uint8Array(cd, 46).set(nameBytes);
      central.push(new Uint8Array(cd));

      offset += local.byteLength + size;
    }

    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const cdOffset = offset;

    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true); // EOCD signature
    ev.setUint16(4, 0, true); // disk number
    ev.setUint16(6, 0, true); // cd start disk
    ev.setUint16(8, this.entries.length, true); // entries this disk
    ev.setUint16(10, this.entries.length, true); // total entries
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdOffset, true);
    ev.setUint16(20, 0, true); // comment len

    return new Blob([...parts, ...central, new Uint8Array(eocd)], { type: "application/zip" });
  }
}

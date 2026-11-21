(function (root) {
  'use strict';

  function exifTime(data) {
    const prefix = data.byteLength >= 6 && data.getUint32(0) === 0x45786966 && data.getUint16(4) === 0;
    const base = prefix ? 6 : 0;
    if (base + 8 > data.byteLength) return null;
    const order = data.getUint16(base);
    if (order !== 0x4949 && order !== 0x4d4d) return null;
    const little = order === 0x4949;
    if (data.getUint16(base + 2,little) !== 42) return null;

    function entry(offset,tag) {
      const start = base + offset;
      if (start + 2 > data.byteLength) return -1;
      const count = data.getUint16(start,little);
      if (start + 2 + count*12 > data.byteLength) return -1;
      for (let i=0;i<count;i++) {
        const item = start + 2 + i*12;
        if (data.getUint16(item,little) === tag) return item;
      }
      return -1;
    }
    const first = data.getUint32(base + 4,little);
    const pointer = entry(first,0x8769);
    const exif = pointer >= 0 ? data.getUint32(pointer + 8,little) : first;
    const original = entry(exif,0x9003);
    if (original < 0 || data.getUint16(original + 2,little) !== 2 ||
        data.getUint32(original + 4,little) < 19) return null;
    const offset = base + data.getUint32(original + 8,little);
    if (offset + 19 > data.byteLength) return null;
    const raw = String.fromCharCode(...new Uint8Array(data.buffer,data.byteOffset + offset,19));
    const date = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/);
    if (!date) return null;
    const [,year,month,day,clock] = date;
    const time = [year,month,day].join('-') + 'T' + clock;
    const check = new Date(time + 'Z');
    return Number.isFinite(check.getTime()) && check.toISOString().slice(0,19) === time ? time : null;
  }

  function readCaptureTime(buffer) {
    const data = new DataView(buffer);
    if (data.byteLength < 12) return null;
    const chunk = (start,end) => exifTime(new DataView(buffer,start,end - start));
    if (data.getUint16(0) === 0xffd8) {
      let start = 2;
      while (start + 4 <= data.byteLength && data.getUint8(start) === 0xff) {
        const marker = data.getUint8(++start);
        if (marker === 0xff) continue;
        start++;
        if (marker === 0xd9 || marker === 0xda || start + 2 > data.byteLength) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const length = data.getUint16(start), end = start + length;
        if (length < 2 || end > data.byteLength) break;
        if (marker === 0xe1) {
          const time = chunk(start + 2,end);
          if (time) return time;
        }
        start = end;
      }
      return null;
    }
    const png = data.getUint32(0) === 0x89504e47 && data.getUint32(4) === 0x0d0a1a0a;
    const webp = data.getUint32(0) === 0x52494646 && data.getUint32(8) === 0x57454250;
    if (!png && !webp) return null;
    for (let i=png ? 8 : 12;i+8<=data.byteLength;) {
      const length = data.getUint32(i+(png ? 0 : 4),webp);
      const type = data.getUint32(i+(png ? 4 : 0));
      const end = i+8+length;
      if (end > data.byteLength) break;
      if (type === (png ? 0x65584966 : 0x45584946)) return chunk(i+8,end);
      i = end + (png ? 4 : length%2);
    }
    return null;
  }

  async function fromFile(file) {
    if (!file || file.size > 20*1024*1024) return null;
    try { return readCaptureTime(await file.arrayBuffer()); }
    catch (_) { return null; }
  }

  root.LynnPhotoDates = {fromFile, readCaptureTime};
})(typeof window !== 'undefined' ? window : globalThis);

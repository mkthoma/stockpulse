// CommonJS icon generator using only Node.js built-ins (no canvas dep)
'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcBuf   = Buffer.concat([typeBytes, data]);
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crc32(crcBuf))]);
}

function makePNG(size, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.concat([
    uint32BE(size), uint32BE(size),
    Buffer.from([8, 2, 0, 0, 0]) // bitdepth=8, colortype=RGB, compression=0, filter=0, interlace=0
  ]);

  // Raw scanlines: filter byte (0) + RGB pixels
  const scanlines = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter type None
    for (let x = 0; x < size; x++) {
      // Circle mask
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const inside = Math.sqrt(dx * dx + dy * dy) <= size / 2 - 0.5;

      // Chart line (simple upward line in top-right area)
      const progress = x / size;
      const lineY    = Math.round(size * (0.7 - progress * 0.45));
      const onLine   = inside && Math.abs(y - lineY) <= Math.max(1, size * 0.07);

      if (!inside)      { row.push(240, 240, 240); }  // outside circle — light gray
      else if (onLine)  { row.push(255, 255, 255); }  // line — white
      else              { row.push(r, g, b); }         // background — brand green
    }
    scanlines.push(...row);
  }

  const raw  = Buffer.from(scanlines);
  const comp = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))]);
}

const SIZES = [16, 48, 128];
// Brand green: #065F46 → r=6, g=95, b=70
for (const s of SIZES) {
  const buf  = makePNG(s, 6, 95, 70);
  const dest = path.join(__dirname, `${s}.png`);
  fs.writeFileSync(dest, buf);
  console.log(`Generated ${dest} (${buf.length} bytes)`);
}

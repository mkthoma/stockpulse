/**
 * Run with Node.js to generate PNG icons:
 *   node icons/generate.js
 *
 * Requires: npm install canvas
 */

const { createCanvas } = require('canvas');
const fs               = require('fs');
const path             = require('path');

const SIZES = [16, 48, 128];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext('2d');

  // Background circle
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#065F46');
  grad.addColorStop(1, '#059669');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Simple chart line
  const pad  = size * 0.2;
  const pts  = [
    [pad,          size * 0.65],
    [size * 0.35,  size * 0.50],
    [size * 0.55,  size * 0.60],
    [size - pad,   size * 0.25]
  ];

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth   = Math.max(1.5, size * 0.08);
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();

  // Up arrow dot at end
  const [lx, ly] = pts[pts.length - 1];
  ctx.fillStyle = '#34D399';
  ctx.beginPath();
  ctx.arc(lx, ly, Math.max(2, size * 0.09), 0, Math.PI * 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}

for (const size of SIZES) {
  const buf  = drawIcon(size);
  const dest = path.join(__dirname, `${size}.png`);
  fs.writeFileSync(dest, buf);
  console.log(`Generated ${dest}`);
}

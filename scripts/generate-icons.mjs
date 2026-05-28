import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "extension", "icons");
mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon-${size}.png`), renderPng(size));
}

console.log("Generated PNG icons.");

function renderPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = size / 128;

  fillRoundedRect(rgba, size, 0, 0, size, size, 24 * scale, [21, 25, 31, 255]);
  fillRoundedRect(rgba, size, 10 * scale, 38 * scale, 82 * scale, 42 * scale, 19 * scale, [79, 209, 197, 255]);
  fillRoundedRect(rgba, size, 36 * scale, 48 * scale, 82 * scale, 42 * scale, 19 * scale, [246, 200, 95, 255]);
  fillTriangle(rgba, size, [
    [40 * scale, 78 * scale],
    [40 * scale, 95 * scale],
    [58 * scale, 78 * scale]
  ], [79, 209, 197, 255]);
  fillTriangle(rgba, size, [
    [88 * scale, 89 * scale],
    [88 * scale, 106 * scale],
    [70 * scale, 89 * scale]
  ], [246, 200, 95, 255]);
  drawArrow(rgba, size, scale, [21, 25, 31, 255]);

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const scanlineStart = y * (size * 4 + 1);
    scanlines[scanlineStart] = 0;
    rgba.copy(scanlines, scanlineStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const chunks = [
    chunk("IHDR", Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", zlib.deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ];

  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function fillRoundedRect(buffer, size, x, y, width, height, radius, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
      if (insideRoundedRect(px + 0.5, py + 0.5, x, y, width, height, radius)) {
        setPixel(buffer, size, px, py, color);
      }
    }
  }
}

function insideRoundedRect(px, py, x, y, width, height, radius) {
  const cx = Math.max(x + radius, Math.min(px, x + width - radius));
  const cy = Math.max(y + radius, Math.min(py, y + height - radius));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function fillTriangle(buffer, size, points, color) {
  const minX = Math.floor(Math.min(...points.map((point) => point[0])));
  const maxX = Math.ceil(Math.max(...points.map((point) => point[0])));
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (insideTriangle(x + 0.5, y + 0.5, points)) setPixel(buffer, size, x, y, color);
    }
  }
}

function insideTriangle(x, y, points) {
  const [a, b, c] = points;
  const area = edge(a, b, c);
  const s = edge(a, b, [x, y]) / area;
  const t = edge(b, c, [x, y]) / area;
  const u = edge(c, a, [x, y]) / area;
  return s >= 0 && t >= 0 && u >= 0;
}

function edge(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function drawArrow(buffer, size, scale, color) {
  fillRoundedRect(buffer, size, 48 * scale, 60 * scale, 34 * scale, 8 * scale, 4 * scale, color);
  fillTriangle(buffer, size, [
    [82 * scale, 52 * scale],
    [98 * scale, 64 * scale],
    [82 * scale, 76 * scale]
  ], color);
}

function setPixel(buffer, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (Math.floor(y) * size + Math.floor(x)) * 4;
  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
  buffer[index + 3] = color[3];
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([u32(data.length), typeBuffer, data, u32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

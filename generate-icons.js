// Generator ikon PNG (16/32/48/128) bez zależności — czysty Node (zlib).
// Rysuje schowek na niebieskim, zaokrąglonym tle. Uruchom: node generate-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

function setPx(buf, size, x, y, c) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  const sa = c[3] / 255;
  const ba = buf[i + 3] / 255;
  const outA = sa + ba * (1 - sa);
  if (outA === 0) { buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0; return; }
  buf[i] = Math.round((c[0] * sa + buf[i] * ba * (1 - sa)) / outA);
  buf[i + 1] = Math.round((c[1] * sa + buf[i + 1] * ba * (1 - sa)) / outA);
  buf[i + 2] = Math.round((c[2] * sa + buf[i + 2] * ba * (1 - sa)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

function roundRect(buf, size, x, y, w, h, r, c) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.ceil(x + w), y1 = Math.ceil(y + h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const cx = Math.min(Math.max(px + 0.5, x + r), x + w - r);
      const cy = Math.min(Math.max(py + 0.5, y + r), y + h - r);
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) setPx(buf, size, px, py, c);
    }
  }
}

// prosta belka z PŁASKIMI końcami (ostre rogi) — punkt wewnątrz prostokąta obróconego
function insideBar(px, py, x1, y1, x2, y2, h) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((px - x1) * dx + (py - y1) * dy) / len2;
  if (t < 0 || t > 1) return false; // płaskie końce zamiast zaokrąglonych
  const dist = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  return dist <= h;
}

// logo „X" — dwie krzyżujące się belki, antyaliasing przez supersampling 4x4
function drawX(buf, size, c) {
  const s = size, h = s * 0.072, N = 4;
  const A = [s * 0.30, s * 0.28, s * 0.70, s * 0.72]; // ↘
  const B = [s * 0.70, s * 0.28, s * 0.30, s * 0.72]; // ↙
  const lo = Math.floor(s * 0.16), hi = Math.ceil(s * 0.84);
  for (let py = lo; py < hi; py++) {
    for (let px = lo; px < hi; px++) {
      let hit = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const fx = px + (sx + 0.5) / N, fy = py + (sy + 0.5) / N;
          if (insideBar(fx, fy, A[0], A[1], A[2], A[3], h) ||
              insideBar(fx, fy, B[0], B[1], B[2], B[3], h)) hit++;
        }
      }
      if (hit) setPx(buf, size, px, py, [c[0], c[1], c[2], Math.round(c[3] * hit / (N * N))]);
    }
  }
}

function drawIcon(size) {
  const s = size;
  const buf = Buffer.alloc(s * s * 4); // przezroczyste tło
  roundRect(buf, s, 0, 0, s, s, s * 0.22, BLACK); // czarne zaokrąglone tło — brand X
  drawX(buf, s, WHITE);
  return buf;
}

// ---- enkoder PNG (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, color type 6 (RGBA)
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filtr 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePNG(size, drawIcon(size));
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png  (${png.length} B)`);
}
console.log("Gotowe.");

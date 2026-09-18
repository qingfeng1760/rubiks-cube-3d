#!/usr/bin/env node
/* 生成应用图标：纯 Node（zlib 手写 PNG + 经典 32bpp ICO），零第三方依赖。
 * 产物：src-tauri/icons/icon.png（512）、icon-256.png、icon.ico（256，供 exe 资源嵌入）
 * 图形：深色圆角底 + 2×2 魔方贴纸（红/绿/黄/蓝），4×4 超采样抗锯齿。 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- 绘图 ---------- */
function insideRounded(x, y, s) {
  if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) return false;
  const r = Math.min(s.r, (s.x1 - s.x0) / 2, (s.y1 - s.y0) / 2);
  const cx = [s.x0 + r, s.x1 - r], cy = [s.y0 + r, s.y1 - r];
  const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  if (x < cx[0] && y < cy[0]) return d2(x, y, cx[0], cy[0]) <= r * r;
  if (x > cx[1] && y < cy[0]) return d2(x, y, cx[1], cy[0]) <= r * r;
  if (x < cx[0] && y > cy[1]) return d2(x, y, cx[0], cy[1]) <= r * r;
  if (x > cx[1] && y > cy[1]) return d2(x, y, cx[1], cy[1]) <= r * r;
  return true;
}

function shapes(size) {
  const list = [{
    x0: size * 0.03, y0: size * 0.03, x1: size * 0.97, y1: size * 0.97,
    r: size * 0.22, color: [23, 26, 51, 255] // 深色底 #171a33
  }];
  const pad = size * 0.20, gap = size * 0.07;
  const cell = (size - pad * 2 - gap) / 2;
  const colors = [[232, 68, 58], [46, 204, 113], [247, 215, 22], [47, 126, 247]];
  for (let i = 0; i < 4; i++) {
    const x = pad + (i % 2) * (cell + gap);
    const y = pad + Math.floor(i / 2) * (cell + gap);
    list.push({ x0: x, y0: y, x1: x + cell, y1: y + cell, r: size * 0.07, color: colors[i].concat(255) });
  }
  return list;
}

function renderIcon(size) {
  const S = 4, shapes_ = shapes(size);
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = px + (sx + 0.5) / S, y = py + (sy + 0.5) / S;
          for (let i = shapes_.length - 1; i >= 0; i--) {
            if (insideRounded(x, y, shapes_[i])) {
              r += shapes_[i].color[0]; g += shapes_[i].color[1]; b += shapes_[i].color[2];
              hits++;
              break;
            }
          }
        }
      }
      const o = (py * size + px) * 4;
      const n = S * S;
      if (hits) { buf[o] = Math.round(r / hits); buf[o + 1] = Math.round(g / hits); buf[o + 2] = Math.round(b / hits); }
      buf[o + 3] = Math.round((hits / n) * 255);
    }
  }
  return buf;
}

/* ---------- PNG ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function pngEncode(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8bit RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- ICO（经典 32bpp BGRA + AND 掩码，兼容性最好） ---------- */
function icoEncode(size, rgba) {
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) { // DIB 自底向上
    for (let x = 0; x < size; x++) {
      const s = ((size - 1 - y) * size + x) * 4;
      const d = (y * size + x) * 4;
      xor[d] = rgba[s + 2]; xor[d + 1] = rgba[s + 1]; xor[d + 2] = rgba[s]; xor[d + 3] = rgba[s + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  const img = Buffer.concat([xor, Buffer.alloc(maskRow * size)]); // 掩码全 0（不透明判定交给 alpha）
  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0); bih.writeInt32LE(size, 4); bih.writeInt32LE(size * 2, 8);
  bih.writeUInt16LE(1, 12); bih.writeUInt16LE(32, 14);
  bih.writeUInt32LE(0, 16); bih.writeUInt32LE(img.length, 20);
  const blob = Buffer.concat([bih, img]);

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0; entry[3] = 0;
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(blob.length, 8); entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, blob]);
}

/* ---------- 输出 ---------- */
const outDir = path.join(__dirname, '..', 'src-tauri', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const big = renderIcon(512);
fs.writeFileSync(path.join(outDir, 'icon.png'), pngEncode(512, big));

const mid = renderIcon(256);
fs.writeFileSync(path.join(outDir, 'icon-256.png'), pngEncode(256, mid));
fs.writeFileSync(path.join(outDir, 'icon.ico'), icoEncode(256, mid));

console.log('图标已生成：icon.png(512) / icon-256.png / icon.ico(256) →', outDir);
/**
 * Deterministic pure-JavaScript rasteriser for QRForge layouts.
 *
 * Each colour layer is accumulated into a 4×4 super-sampled coverage mask
 * (one 16-bit word per pixel). Shapes of the same layer are OR-ed together
 * before compositing, which gives correct anti-aliasing with no hairline
 * seams between adjacent modules.
 */

import { parseColor } from "./color.js";

const GRID = 4;
const FULL = 0xffff;
const OFFSETS = Array.from({ length: GRID }, (_, i) => (i + 0.5) / GRID);

function popcount16(v) {
  v -= (v >>> 1) & 0x5555;
  v = (v & 0x3333) + ((v >>> 2) & 0x3333);
  v = (v + (v >>> 4)) & 0x0f0f;
  return (v + (v >>> 8)) & 0x1f;
}

function clampRadii(s) {
  return s.r.map((v) => Math.min(v, s.w / 2, s.h / 2));
}

function insideTest(shape) {
  if (shape.type === "circle") {
    const { cx, cy, r } = shape;
    const r2 = r * r;
    return (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2;
  }
  const { x: rx, y: ry, w, h } = shape;
  const [tl, tr, br, bl] = clampRadii(shape);
  const right = rx + w;
  const bottom = ry + h;
  const corner = (px, py, cx, cy, r) => (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
  return (x, y) => {
    if (x < rx || x >= right || y < ry || y >= bottom) return false;
    if (tl && x < rx + tl && y < ry + tl) return corner(x, y, rx + tl, ry + tl, tl);
    if (tr && x > right - tr && y < ry + tr) return corner(x, y, right - tr, ry + tr, tr);
    if (br && x > right - br && y > bottom - br) return corner(x, y, right - br, bottom - br, br);
    if (bl && x < rx + bl && y > bottom - bl) return corner(x, y, rx + bl, bottom - bl, bl);
    return true;
  };
}

function bounds(shape) {
  if (shape.type === "circle") {
    return [shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r];
  }
  return [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h];
}

function isPlainRect(shape) {
  return shape.type === "rect" && !shape.hole && shape.r.every((v) => v === 0);
}

function rasterShape(mask, width, height, scale, shape) {
  const [bx0, by0, bx1, by1] = bounds(shape);
  const x0 = Math.max(0, Math.floor(bx0 * scale));
  const y0 = Math.max(0, Math.floor(by0 * scale));
  const x1 = Math.min(width, Math.ceil(bx1 * scale));
  const y1 = Math.min(height, Math.ceil(by1 * scale));
  const inside = insideTest(shape);
  const hole = shape.hole ? insideTest(shape.hole) : null;
  const plain = isPlainRect(shape);

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const idx = py * width + px;
      if (mask[idx] === FULL) continue;
      // Fast path: pixel entirely within an axis-aligned rectangle.
      if (plain && px / scale >= bx0 && (px + 1) / scale <= bx1 && py / scale >= by0 && (py + 1) / scale <= by1) {
        mask[idx] = FULL;
        continue;
      }
      let bits = 0;
      let bit = 1;
      for (let sy = 0; sy < GRID; sy++) {
        const uy = (py + OFFSETS[sy]) / scale;
        for (let sx = 0; sx < GRID; sx++) {
          const ux = (px + OFFSETS[sx]) / scale;
          if (inside(ux, uy) && !(hole && hole(ux, uy))) bits |= bit;
          bit <<= 1;
        }
      }
      mask[idx] |= bits;
    }
  }
}

function compositePixel(out, i, r, g, b, a) {
  if (a <= 0) return;
  const da = out[i + 3] / 255;
  const oa = a + da * (1 - a);
  out[i] = Math.round((r * a + out[i] * da * (1 - a)) / oa);
  out[i + 1] = Math.round((g * a + out[i + 1] * da * (1 - a)) / oa);
  out[i + 2] = Math.round((b * a + out[i + 2] * da * (1 - a)) / oa);
  out[i + 3] = Math.round(oa * 255);
}

function drawImage(out, width, height, scale, logo) {
  const src = logo.pixels;
  const box = logo.size * scale;
  const k = Math.min(box / src.width, box / src.height);
  const dw = src.width * k;
  const dh = src.height * k;
  const dx = logo.x * scale + (box - dw) / 2;
  const dy = logo.y * scale + (box - dh) / 2;
  const x0 = Math.max(0, Math.floor(dx));
  const y0 = Math.max(0, Math.floor(dy));
  const x1 = Math.min(width, Math.ceil(dx + dw));
  const y1 = Math.min(height, Math.ceil(dy + dh));
  const samples = GRID * GRID;

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      // Box-filter the source with a 4×4 grid of samples (premultiplied).
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < GRID; sy++) {
        const fy = py + OFFSETS[sy];
        if (fy < dy || fy >= dy + dh) continue;
        const syi = Math.min(src.height - 1, Math.floor((fy - dy) / k));
        for (let sx = 0; sx < GRID; sx++) {
          const fx = px + OFFSETS[sx];
          if (fx < dx || fx >= dx + dw) continue;
          const sxi = Math.min(src.width - 1, Math.floor((fx - dx) / k));
          const si = (syi * src.width + sxi) * 4;
          const alpha = src.data[si + 3] / 255;
          r += src.data[si] * alpha;
          g += src.data[si + 1] * alpha;
          b += src.data[si + 2] * alpha;
          a += alpha;
        }
      }
      if (a > 0) compositePixel(out, (py * width + px) * 4, r / a, g / a, b / a, a / samples);
    }
  }
}

/**
 * Rasterise a layout into RGBA pixels.
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
export function rasterize(layout) {
  const width = layout.pixelWidth;
  const height = layout.pixelHeight;
  const scale = layout.scale;
  const out = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint16Array(width * height);

  for (const layer of layout.layers) {
    mask.fill(0);
    for (const shape of layer.shapes) rasterShape(mask, width, height, scale, shape);
    const c = parseColor(layer.fill);
    for (let i = 0; i < mask.length; i++) {
      const m = mask[i];
      if (m === 0) continue;
      compositePixel(out, i * 4, c.r, c.g, c.b, (c.a * popcount16(m)) / 16);
    }
  }

  if (layout.logo?.pixels) drawImage(out, width, height, scale, layout.logo);
  return { width, height, data: out };
}

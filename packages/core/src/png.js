/**
 * Minimal PNG encoder/decoder built on the platform's CompressionStream.
 * The decoder supports the formats people realistically use for logos:
 * non-interlaced greyscale, RGB, palette, grey+alpha and RGBA images.
 */

import { QRForgeError } from "./errors.js";
import { concatBytes, crc32, deflate, inflate } from "./bytes.js";

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function u32(n) {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concatBytes([typeBytes, data]);
  return concatBytes([u32(data.length), body, u32(crc32(body))]);
}

/**
 * Encode RGBA pixels as a PNG file.
 * Fully opaque images are stored as RGB to keep files small.
 * @param {{width:number,height:number,data:Uint8Array|Uint8ClampedArray}} image
 * @param {{dpi?:number}} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function encodePNG({ width, height, data }, options = {}) {
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = x * channels;
      row[d] = data[s];
      row[d + 1] = data[s + 1];
      row[d + 2] = data[s + 2];
      if (channels === 4) row[d + 3] = data[s + 3];
    }
    const offset = y * (stride + 1);
    // "Up" filter: QR rows repeat vertically, so this compresses extremely well.
    raw[offset] = y === 0 ? 0 : 2;
    for (let i = 0; i < stride; i++) raw[offset + 1 + i] = y === 0 ? row[i] : (row[i] - prev[i]) & 0xff;
    prev.set(row);
  }

  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // colour type
  const chunks = [SIGNATURE, chunk("IHDR", ihdr)];
  if (options.dpi) {
    const ppm = Math.round(options.dpi / 0.0254);
    chunks.push(chunk("pHYs", concatBytes([u32(ppm), u32(ppm), new Uint8Array([1])])));
  }
  chunks.push(chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0)));
  return concatBytes(chunks);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decode a PNG file into RGBA pixels.
 * @param {Uint8Array} bytes
 * @returns {Promise<{width:number,height:number,data:Uint8ClampedArray}>}
 */
export async function decodePNG(bytes) {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new QRForgeError("INVALID_IMAGE", "Not a PNG file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let header;
  let palette;
  let transparency;
  const idat = [];
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === "IHDR") {
      header = {
        width: view.getUint32(16),
        height: view.getUint32(20),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (!header) throw new QRForgeError("INVALID_IMAGE", "PNG is missing its header.");
  const { width, height, bitDepth, colorType, interlace } = header;
  if (interlace !== 0) throw new QRForgeError("INVALID_IMAGE", "Interlaced PNG logos are not supported.");
  if (width * height > 4096 * 4096) throw new QRForgeError("INVALID_IMAGE", "Logo image is too large.");
  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (!channels || ![1, 2, 4, 8, 16].includes(bitDepth)) {
    throw new QRForgeError("INVALID_IMAGE", "Unsupported PNG format.");
  }

  const raw = await inflate(concatBytes(idat));
  const bitsPerPixel = channels * bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const pixels = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      out[i] = v & 0xff;
    }
    prev = out;
  }

  const sample = (y, index) => {
    // Returns the index-th sample of row y, scaled to 0–255 (or the raw palette index).
    const rowStart = y * stride;
    if (bitDepth === 8) return pixels[rowStart + index];
    if (bitDepth === 16) return pixels[rowStart + index * 2];
    const bitPos = index * bitDepth;
    const byte = pixels[rowStart + (bitPos >> 3)];
    const value = (byte >> (8 - bitDepth - (bitPos & 7))) & ((1 << bitDepth) - 1);
    return colorType === 3 ? value : Math.round((value * 255) / ((1 << bitDepth) - 1));
  };

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const base = x * channels;
      if (colorType === 3) {
        const idx = sample(y, base);
        rgba[o] = palette?.[idx * 3] ?? 0;
        rgba[o + 1] = palette?.[idx * 3 + 1] ?? 0;
        rgba[o + 2] = palette?.[idx * 3 + 2] ?? 0;
        rgba[o + 3] = transparency && idx < transparency.length ? transparency[idx] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(y, base);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = colorType === 4 ? sample(y, base + 1) : 255;
      } else {
        rgba[o] = sample(y, base);
        rgba[o + 1] = sample(y, base + 1);
        rgba[o + 2] = sample(y, base + 2);
        rgba[o + 3] = colorType === 6 ? sample(y, base + 3) : 255;
      }
    }
  }
  return { width, height, data: rgba };
}

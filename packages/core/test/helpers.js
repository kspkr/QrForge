import jsQR from "jsqr";
import { layoutQR, rasterize } from "../src/index.js";

/** Decode RGBA pixels with jsQR (an independent decoder). */
export function decodePixels({ width, height, data }) {
  const result = jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: "attemptBoth" });
  return result ? result.data : null;
}

/** Render options with the pure rasteriser and decode the result. */
export function renderAndDecode(options) {
  const { layout } = layoutQR(options);
  return decodePixels(rasterize(layout));
}

/** Build a solid-colour RGBA image. */
export function solidImage(width, height, [r, g, b, a = 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([r, g, b, a], i * 4);
  return { width, height, data };
}

/** Render a bare module matrix to pixels (black on white). */
export function matrixToPixels(m, scale = 4, margin = 4) {
  const n = (m.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + margin) * scale + dy) * n + (x + margin) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { width: n, height: n, data };
}

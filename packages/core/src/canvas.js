/**
 * Browser renderer: draws a layout on a canvas. Used for PNG output in
 * browsers because it supports text labels and every logo format the
 * browser can decode.
 */

import { shapePath } from "./svg.js";
import { createCanvas, loadDrawableImage } from "./image.js";

function cssColor(hex) {
  return hex.length === 9
    ? `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${
        parseInt(hex.slice(7, 9), 16) / 255
      })`
    : hex;
}

async function canvasToBytes(canvas) {
  const blob =
    typeof canvas.convertToBlob === "function"
      ? await canvas.convertToBlob({ type: "image/png" })
      : await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Draw a layout onto a 2D canvas context (already sized to the layout's pixel size).
 */
export async function drawLayout(ctx, layout) {
  ctx.save();
  ctx.scale(layout.scale, layout.scale);
  for (const layer of layout.layers) {
    ctx.fillStyle = cssColor(layer.fill);
    const simple = layer.shapes.filter((s) => !s.hole);
    if (simple.length) ctx.fill(new Path2D(simple.map(shapePath).join("")), "nonzero");
    for (const s of layer.shapes) if (s.hole) ctx.fill(new Path2D(shapePath(s)), "evenodd");
  }
  if (layout.logo) {
    const { x, y, size } = layout.logo;
    let image;
    let w;
    let h;
    if (layout.logo.src) {
      image = await loadDrawableImage(layout.logo.src);
      w = image.naturalWidth || size;
      h = image.naturalHeight || size;
    } else {
      const { width, height, data } = layout.logo.pixels;
      const tmp = createCanvas(width, height);
      tmp.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
      image = tmp;
      w = width;
      h = height;
    }
    const k = Math.min(size / w, size / h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x + (size - w * k) / 2, y + (size - h * k) / 2, w * k, h * k);
  }
  if (layout.text) {
    const t = layout.text;
    ctx.fillStyle = cssColor(t.color);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${t.fontSize}px Inter, "Segoe UI", Helvetica, Arial, sans-serif`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${t.fontSize * 0.04}px`;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}

export async function renderCanvasPNG(layout) {
  const canvas = createCanvas(layout.pixelWidth, layout.pixelHeight);
  await drawLayout(canvas.getContext("2d"), layout);
  return canvasToBytes(canvas);
}

/**
 * Logo image loading for raster (PNG) and PDF output.
 *
 * - In browsers, any format the browser can decode (PNG, JPEG, WebP, GIF, SVG)
 *   is supported via canvas.
 * - In Node.js, PNG logos are decoded with the built-in decoder.
 *
 * Nothing is ever fetched from the network: logos must be data URLs or bytes.
 */

import { QRForgeError } from "./errors.js";
import { parseDataURL, sniffImageMime } from "./bytes.js";
import { decodePNG } from "./png.js";

export function hasCanvas() {
  return typeof OffscreenCanvas !== "undefined" || (typeof document !== "undefined" && !!document.createElement);
}

export function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Browsers only: load a logo from a URL the developer supplied (e.g. "/logo.svg").
 * Cross-origin images must be served with CORS headers to be exportable.
 */
async function loadBrowserImageFromURL(url) {
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new QRForgeError("INVALID_IMAGE", `Couldn’t load the logo from ${url}.`, { field: "logo.src" });
  }
  return img;
}

async function loadBrowserImage(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Load an image in the browser as a drawable element. */
export async function loadDrawableImage(src) {
  if (typeof src === "string" && !src.startsWith("data:")) return loadBrowserImageFromURL(src);
  const { bytes, mime } = typeof src === "string" ? parseDataURL(src) : { bytes: src, mime: sniffImageMime(src) };
  return loadBrowserImage(bytes, mime);
}

async function browserPixels(img) {
  // Cap the working resolution; logos never need more than this.
  const max = 1024;
  const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || max) * k));
  const h = Math.max(1, Math.round((img.naturalHeight || max) * k));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data };
}

/**
 * Resolve a logo source to RGBA pixels.
 * @param {string|Uint8Array} src - data URL or image bytes
 */
export async function loadLogoPixels(src) {
  let bytes;
  let mime;
  const inBrowser = typeof Image !== "undefined" && hasCanvas();
  if (inBrowser && typeof src === "string" && !src.startsWith("data:")) {
    return browserPixels(await loadBrowserImageFromURL(src));
  }
  if (typeof src === "string") {
    if (!src.startsWith("data:")) {
      throw new QRForgeError(
        "INVALID_OPTION",
        "In Node.js, PNG and PDF output need the logo as a data: URL or image bytes (QRForge never fetches URLs on the server).",
        { field: "logo.src" },
      );
    }
    ({ bytes, mime } = parseDataURL(src));
  } else if (src instanceof Uint8Array) {
    bytes = src;
    mime = sniffImageMime(src);
  } else {
    throw new QRForgeError("INVALID_OPTION", "Unsupported logo source.", { field: "logo.src" });
  }
  if (inBrowser) return browserPixels(await loadBrowserImage(bytes, mime));
  if (mime === "image/png" || sniffImageMime(bytes) === "image/png") return decodePNG(bytes);
  throw new QRForgeError(
    "UNSUPPORTED_FEATURE",
    `Logos in ${mime} format are only supported in the browser. Use a PNG logo in Node.js, or SVG output.`,
    { field: "logo.src" },
  );
}

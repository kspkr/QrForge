/**
 * @qrforge/core — zero-dependency, deterministic QR code generation.
 *
 * Everything runs locally. No data is ever sent to a server.
 */

import { encode } from "./encoder.js";
import { QRForgeError } from "./errors.js";
import { normalizeOptions } from "./options.js";
import { createLayout } from "./layout.js";
import { renderSVG } from "./svg.js";
import { rasterize } from "./raster.js";
import { encodePNG } from "./png.js";
import { renderPDF } from "./pdf.js";
import { hasCanvas, loadLogoPixels } from "./image.js";
import { analyzeLayout } from "./reliability.js";
import { buildPayload } from "./payloads.js";
import { toDataURL as bytesToDataURL } from "./bytes.js";

export { encode, ECC_LEVELS, byteCapacity } from "./encoder.js";
export { QRForgeError } from "./errors.js";
export {
  normalizeOptions,
  DEFAULT_OPTIONS,
  MODULE_STYLES,
  CORNER_STYLES,
  FRAME_STYLES,
  FORMATS,
} from "./options.js";
export { createLayout } from "./layout.js";
export { renderSVG, shapePath } from "./svg.js";
export { rasterize } from "./raster.js";
export { encodePNG, decodePNG } from "./png.js";
export { renderPDF, PAGE_SIZES } from "./pdf.js";
export { contrastRatio, luminance, parseColor } from "./color.js";
export { presets, getPreset } from "./presets.js";
export {
  payloads,
  buildPayload,
  QR_TYPES,
  url,
  text,
  wifi,
  vcard,
  email,
  sms,
  phone,
  location,
  calendar,
} from "./payloads.js";

const MIME = { svg: "image/svg+xml", png: "image/png", pdf: "application/pdf" };

/** Resolve `data` (string, bytes, or structured input when `type` is given) to the encoded content. */
export function resolveData(options) {
  const { data, type } = options;
  if (type && type !== "raw") {
    return buildPayload(type, data);
  }
  if (typeof data === "string" || data instanceof Uint8Array) {
    if (data.length === 0) throw new QRForgeError("EMPTY_DATA", "QR code data must not be empty.");
    return data;
  }
  if (typeof data === "number") return String(data);
  throw new QRForgeError(
    "EMPTY_DATA",
    'Provide "data" as a string, or set "type" (e.g. "wifi") and pass the fields in "data".',
  );
}

/**
 * Encode + lay out a QR code without rendering it.
 * Useful for custom renderers (the React package uses this).
 */
export function layoutQR(options = {}) {
  const content = resolveData(options);
  const opts = normalizeOptions(options);
  const matrix = encode(content, {
    ecc: opts.ecc,
    minVersion: options.minVersion,
    maxVersion: options.maxVersion,
    mask: options.mask,
  });
  return { content, matrix, options: opts, layout: createLayout(matrix, opts) };
}

/** Render a QR code as an SVG string (synchronous). */
export function toSVG(options = {}) {
  const { layout } = layoutQR(options);
  return renderSVG(layout, { title: options.title });
}

async function withLogoPixels(qr) {
  const logo = qr.layout.logo;
  if (logo && !logo.pixels && logo.src) {
    logo.pixels = await loadLogoPixels(logo.src);
  }
  return qr;
}

/**
 * Render a QR code as PNG bytes.
 *
 * `renderer`: "auto" (default) uses a canvas in browsers (supports labels and
 * any logo format) and the pure-JS rasteriser elsewhere. "raster" forces the
 * deterministic pure-JS path.
 */
export async function toPNG(options = {}) {
  const qr = layoutQR(options);
  const renderer = options.renderer ?? "auto";
  const useCanvas = renderer === "canvas" || (renderer === "auto" && hasCanvas() && typeof Path2D !== "undefined");
  if (useCanvas) {
    const { renderCanvasPNG } = await import("./canvas.js");
    return renderCanvasPNG(qr.layout);
  }
  if (qr.layout.text) {
    throw new QRForgeError(
      "UNSUPPORTED_FEATURE",
      "Text labels in PNG output need a browser canvas. Use SVG or PDF output for labelled codes in Node.js.",
      { field: "label" },
    );
  }
  await withLogoPixels(qr);
  return encodePNG(rasterize(qr.layout), { dpi: options.dpi });
}

/** Render a QR code as a single-page vector PDF. */
export async function toPDF(options = {}) {
  const qr = await withLogoPixels(layoutQR(options));
  return renderPDF(qr.layout, { pageSize: options.pageSize, title: options.title });
}

/**
 * Generate a QR code.
 *
 * @example
 * const svg = await generateQR({ data: "https://example.com", format: "svg" });
 * const png = await generateQR({ data: "https://example.com", format: "png" }); // Uint8Array
 * const url = await generateQR({ data: "hello", format: "png", output: "dataURL" });
 *
 * @param {object} options
 * @param {"svg"|"png"|"pdf"} [options.format="svg"]
 * @param {"string"|"buffer"|"dataURL"} [options.output] - Defaults to "string" for SVG, "buffer" otherwise.
 * @returns {Promise<string|Uint8Array>}
 */
export async function generateQR(options = {}) {
  const format = (options.format ?? "svg").toLowerCase();
  if (!MIME[format]) {
    throw new QRForgeError("INVALID_OPTION", `format must be "svg", "png" or "pdf" (got ${JSON.stringify(options.format)}).`);
  }
  const output = options.output ?? (format === "svg" ? "string" : "buffer");
  if (!["string", "buffer", "dataURL"].includes(output)) {
    throw new QRForgeError("INVALID_OPTION", 'output must be "string", "buffer" or "dataURL".');
  }
  if (output === "string" && format !== "svg") {
    throw new QRForgeError("INVALID_OPTION", `output "string" is only available for SVG. Use "buffer" or "dataURL".`);
  }

  let bytes;
  if (format === "svg") {
    const svg = toSVG(options);
    if (output === "string") return svg;
    bytes = new TextEncoder().encode(svg);
  } else if (format === "png") {
    bytes = await toPNG(options);
  } else {
    bytes = await toPDF(options);
  }
  return output === "dataURL" ? bytesToDataURL(bytes, MIME[format]) : bytes;
}

/**
 * Analyse how reliably a styled code will scan.
 * @returns {{level:"good"|"fair"|"poor", warnings:Array<{code:string,severity:string,message:string}>, version:number, modules:number}}
 */
export function analyzeReliability(options = {}) {
  const { matrix, options: opts } = layoutQR(options);
  return { ...analyzeLayout(matrix, opts), version: matrix.version, modules: matrix.size };
}

/** MIME type for an output format. */
export function mimeType(format) {
  return MIME[format];
}

import { QRForgeError } from "./errors.js";
import { bytesToBase64, sniffImageMime } from "./bytes.js";

function num(v) {
  return Number(v.toFixed(3)).toString();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rectPath({ x, y, w, h, r }) {
  const [tl, tr, br, bl] = r.map((v) => Math.min(v, w / 2, h / 2));
  if (!tl && !tr && !br && !bl) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`;
  let d = `M${num(x + tl)} ${num(y)}H${num(x + w - tr)}`;
  if (tr) d += `A${num(tr)} ${num(tr)} 0 0 1 ${num(x + w)} ${num(y + tr)}`;
  d += `V${num(y + h - br)}`;
  if (br) d += `A${num(br)} ${num(br)} 0 0 1 ${num(x + w - br)} ${num(y + h)}`;
  d += `H${num(x + bl)}`;
  if (bl) d += `A${num(bl)} ${num(bl)} 0 0 1 ${num(x)} ${num(y + h - bl)}`;
  d += `V${num(y + tl)}`;
  if (tl) d += `A${num(tl)} ${num(tl)} 0 0 1 ${num(x + tl)} ${num(y)}`;
  return `${d}z`;
}

function circlePath({ cx, cy, r }) {
  return `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 1 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 1 ${num(-2 * r)} 0z`;
}

export function shapePath(shape) {
  const d = shape.type === "circle" ? circlePath(shape) : rectPath(shape);
  return shape.hole ? d + shapePath(shape.hole) : d;
}

function fillAttrs(color) {
  if (color.length === 9) {
    const alpha = parseInt(color.slice(7), 16) / 255;
    return `fill="${color.slice(0, 7)}" fill-opacity="${num(alpha)}"`;
  }
  return `fill="${color}"`;
}

function logoHref(logo) {
  if (typeof logo.src === "string") return logo.src;
  if (logo.src instanceof Uint8Array) {
    return `data:${sniffImageMime(logo.src)};base64,${bytesToBase64(logo.src)}`;
  }
  throw new QRForgeError(
    "INVALID_OPTION",
    "SVG output needs logo.src as a URL, data URL or image bytes (raw pixels are only supported for PNG/PDF).",
    { field: "logo.src" },
  );
}

/**
 * Render a layout to an SVG document string.
 * @param {ReturnType<import("./layout.js").createLayout>} layout
 * @param {{title?:string}} [meta]
 */
export function renderSVG(layout, meta = {}) {
  const { width, height, pixelWidth, pixelHeight } = layout;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg"${layout.logo ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ""} ` +
      `width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${num(width)} ${num(height)}" ` +
      `role="img" aria-label="${escapeXml(meta.title ?? "QR code")}">`,
  ];

  for (const layer of layout.layers) {
    const simple = layer.shapes.filter((s) => !s.hole);
    const holed = layer.shapes.filter((s) => s.hole);
    const crisp = layer.crisp ? ' shape-rendering="crispEdges"' : "";
    if (simple.length) parts.push(`<path ${fillAttrs(layer.fill)}${crisp} d="${simple.map(shapePath).join("")}"/>`);
    for (const s of holed) {
      parts.push(`<path ${fillAttrs(layer.fill)}${crisp} fill-rule="evenodd" d="${shapePath(s)}"/>`);
    }
  }

  if (layout.logo) {
    const { x, y, size } = layout.logo;
    parts.push(
      `<image x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}" ` +
        `preserveAspectRatio="xMidYMid meet" xlink:href="${escapeXml(logoHref(layout.logo))}"/>`,
    );
  }

  if (layout.text) {
    const t = layout.text;
    parts.push(
      `<text x="${num(t.x)}" y="${num(t.y)}" text-anchor="middle" ` +
        `font-family="Inter, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="${num(t.fontSize)}" ` +
        `font-weight="600" letter-spacing="${num(t.fontSize * 0.04)}" ${fillAttrs(t.color)}>${escapeXml(t.text)}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

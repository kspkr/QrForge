/**
 * Minimal vector PDF writer. QR modules are drawn as vector paths, so the
 * PDF prints crisply at any size. Labels use the built-in Helvetica font
 * (no font embedding needed); logos are embedded as Flate-compressed images.
 */

import { parseColor } from "./color.js";
import { concatBytes, deflate } from "./bytes.js";

const KAPPA = 0.5522847498;

// Helvetica advance widths (1/1000 em) for ASCII 32–126, from the standard AFM.
// prettier-ignore
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

export const PAGE_SIZES = Object.freeze({
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A5: [419.53, 595.28],
});

function n(v) {
  return Number(v.toFixed(3)).toString();
}

/** Map text to single-byte WinAnsi; characters outside Latin-1 become "?". */
function toWinAnsi(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    out += code >= 32 && code <= 255 && !(code >= 127 && code < 160) ? ch : "?";
  }
  return out;
}

function textWidth(text, fontSize) {
  let units = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  return (units / 1000) * fontSize;
}

function escapePdfString(text) {
  return text.replace(/([\\()])/g, "\\$1");
}

/** Emit path operators for a shape in a coordinate system where y grows downwards. */
function shapeOps(shape, tx) {
  const ops = [];
  if (shape.type === "circle") {
    const { cx, cy, r } = shape;
    const k = r * KAPPA;
    const p = (x, y) => tx(x, y).map(n).join(" ");
    ops.push(`${p(cx + r, cy)} m`);
    ops.push(`${p(cx + r, cy + k)} ${p(cx + k, cy + r)} ${p(cx, cy + r)} c`);
    ops.push(`${p(cx - k, cy + r)} ${p(cx - r, cy + k)} ${p(cx - r, cy)} c`);
    ops.push(`${p(cx - r, cy - k)} ${p(cx - k, cy - r)} ${p(cx, cy - r)} c`);
    ops.push(`${p(cx + k, cy - r)} ${p(cx + r, cy - k)} ${p(cx + r, cy)} c h`);
  } else {
    const { x, y, w, h } = shape;
    const [tl, tr, br, bl] = shape.r.map((v) => Math.min(v, w / 2, h / 2));
    const p = (px, py) => tx(px, py).map(n).join(" ");
    ops.push(`${p(x + tl, y)} m`);
    ops.push(`${p(x + w - tr, y)} l`);
    if (tr) ops.push(`${p(x + w - tr + tr * KAPPA, y)} ${p(x + w, y + tr - tr * KAPPA)} ${p(x + w, y + tr)} c`);
    ops.push(`${p(x + w, y + h - br)} l`);
    if (br) ops.push(`${p(x + w, y + h - br + br * KAPPA)} ${p(x + w - br + br * KAPPA, y + h)} ${p(x + w - br, y + h)} c`);
    ops.push(`${p(x + bl, y + h)} l`);
    if (bl) ops.push(`${p(x + bl - bl * KAPPA, y + h)} ${p(x, y + h - bl + bl * KAPPA)} ${p(x, y + h - bl)} c`);
    ops.push(`${p(x, y + tl)} l`);
    if (tl) ops.push(`${p(x, y + tl - tl * KAPPA)} ${p(x + tl - tl * KAPPA, y)} ${p(x + tl, y)} c`);
    ops.push("h");
  }
  if (shape.hole) ops.push(...shapeOps(shape.hole, tx));
  return ops;
}

/**
 * Render a layout as a single-page PDF.
 * @param {ReturnType<import("./layout.js").createLayout>} layout
 * @param {{pageSize?: "fit"|"A4"|"Letter"|"A5", title?: string}} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function renderPDF(layout, options = {}) {
  const pageSize = options.pageSize ?? "fit";
  // "fit": page is exactly the code at its pixel size, treated as 72 dpi points.
  const contentW = layout.pixelWidth * 0.75;
  const contentH = layout.pixelHeight * 0.75;
  let pageW = contentW;
  let pageH = contentH;
  let drawW = contentW;
  let offsetX = 0;
  let offsetY = 0;
  if (pageSize !== "fit") {
    [pageW, pageH] = PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4;
    // Centre the code on the page at 60% of the page width.
    drawW = pageW * 0.6;
    offsetX = (pageW - drawW) / 2;
    offsetY = (pageH - (drawW * contentH) / contentW) / 2;
  }
  const s = drawW / layout.width; // points per unit
  const tx = (x, y) => [offsetX + x * s, pageH - offsetY - y * s];

  const content = [];
  for (const layer of layout.layers) {
    const c = parseColor(layer.fill);
    if (c.a === 0) continue;
    content.push("q");
    if (c.a < 1) content.push(`/GSa${Math.round(c.a * 100)} gs`);
    content.push(`${n(c.r / 255)} ${n(c.g / 255)} ${n(c.b / 255)} rg`);
    const simple = layer.shapes.filter((sh) => !sh.hole);
    const holed = layer.shapes.filter((sh) => sh.hole);
    if (simple.length) {
      for (const sh of simple) content.push(...shapeOps(sh, tx));
      content.push("f");
    }
    for (const sh of holed) {
      content.push(...shapeOps(sh, tx), "f*");
    }
    content.push("Q");
  }

  const alphaStates = new Set(
    layout.layers.map((l) => parseColor(l.fill).a).filter((a) => a > 0 && a < 1).map((a) => Math.round(a * 100)),
  );

  let image = null;
  if (layout.logo?.pixels) {
    const { width, height, data } = layout.logo.pixels;
    const rgb = new Uint8Array(width * height * 3);
    const alpha = new Uint8Array(width * height);
    let hasAlpha = false;
    for (let i = 0; i < width * height; i++) {
      rgb[i * 3] = data[i * 4];
      rgb[i * 3 + 1] = data[i * 4 + 1];
      rgb[i * 3 + 2] = data[i * 4 + 2];
      alpha[i] = data[i * 4 + 3];
      if (alpha[i] !== 255) hasAlpha = true;
    }
    image = {
      width,
      height,
      rgb: await deflate(rgb),
      alpha: hasAlpha ? await deflate(alpha) : null,
    };
    const box = layout.logo.size;
    const k = Math.min(box / width, box / height);
    const dw = width * k;
    const dh = height * k;
    const [ix, iy] = tx(layout.logo.x + (box - dw) / 2, layout.logo.y + (box - dh) / 2 + dh);
    content.push("q", `${n(dw * s)} 0 0 ${n(dh * s)} ${n(ix)} ${n(iy)} cm`, "/Logo Do", "Q");
  }

  if (layout.text) {
    const t = layout.text;
    const c = parseColor(t.color);
    const text = toWinAnsi(t.text);
    const size = t.fontSize * s;
    const [x, y] = tx(t.x, t.y);
    content.push(
      "BT",
      `${n(c.r / 255)} ${n(c.g / 255)} ${n(c.b / 255)} rg`,
      `/F1 ${n(size)} Tf`,
      `${n(x - textWidth(text, size) / 2)} ${n(y)} Td`,
      `(${escapePdfString(text)}) Tj`,
      "ET",
    );
  }

  const encoder = new TextEncoder();
  const contentBytes = await deflate(encoder.encode(content.join("\n")));

  // Assemble objects.
  const objects = [];
  const add = (parts) => {
    objects.push(parts);
    return objects.length;
  };
  const catalogId = add(null);
  const pagesId = add(null);
  const pageId = add(null);
  const contentId = add([
    encoder.encode(`<< /Length ${contentBytes.length} /Filter /FlateDecode >>\nstream\n`),
    contentBytes,
    encoder.encode("\nendstream"),
  ]);
  const fontId = add([encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")]);

  let xobjects = "";
  if (image) {
    let smaskRef = "";
    if (image.alpha) {
      const smaskId = add([
        encoder.encode(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
            `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.alpha.length} >>\nstream\n`,
        ),
        image.alpha,
        encoder.encode("\nendstream"),
      ]);
      smaskRef = ` /SMask ${smaskId} 0 R`;
    }
    const imageId = add([
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smaskRef} /Length ${image.rgb.length} >>\nstream\n`,
      ),
      image.rgb,
      encoder.encode("\nendstream"),
    ]);
    xobjects = ` /XObject << /Logo ${imageId} 0 R >>`;
  }

  const gs = alphaStates.size
    ? ` /ExtGState << ${[...alphaStates].map((a) => `/GSa${a} << /ca ${n(a / 100)} >>`).join(" ")} >>`
    : "";
  const title = escapePdfString(toWinAnsi(options.title ?? "QR code"));
  const infoId = add([encoder.encode(`<< /Title (${title}) /Producer (QRForge) >>`)]);

  objects[catalogId - 1] = [encoder.encode(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)];
  objects[pagesId - 1] = [encoder.encode(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`)];
  objects[pageId - 1] = [
    encoder.encode(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(pageW)} ${n(pageH)}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >>${xobjects}${gs} >> /Contents ${contentId} 0 R >>`,
    ),
  ];

  const chunks = [encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((parts, i) => {
    offsets.push(offset);
    const body = concatBytes([encoder.encode(`${i + 1} 0 obj\n`), ...parts, encoder.encode("\nendobj\n")]);
    chunks.push(body);
    offset += body.length;
  });
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>`,
    "startxref",
    String(offset),
    "%%EOF\n",
  ].join("\n");
  chunks.push(encoder.encode(xref));
  return concatBytes(chunks);
}

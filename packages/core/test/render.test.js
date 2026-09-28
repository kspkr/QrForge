import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateQR,
  toSVG,
  toPNG,
  toPDF,
  decodePNG,
  encodePNG,
  analyzeReliability,
  presets,
  MODULE_STYLES,
  CORNER_STYLES,
  layoutQR,
  rasterize,
} from "../src/index.js";
import { decodePixels, renderAndDecode, solidImage } from "./helpers.js";

const DATA = "https://qrforge.dev/hello";

test("SVG output is a well-formed, deterministic document", async () => {
  const svg = await generateQR({ data: DATA, format: "svg" });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 33 33"/); // version 2 (25 modules) + 2×4 margin
  assert.match(svg, /width="512" height="512"/);
  assert.ok(svg.endsWith("</svg>"));
  assert.equal(svg, toSVG({ data: DATA }));
});

test("SVG honours colours, transparency and escapes label text", () => {
  const svg = toSVG({
    data: DATA,
    foreground: "#123456",
    background: "transparent",
    label: "<Scan & go>",
  });
  assert.ok(svg.includes('fill="#123456"'));
  assert.ok(!svg.includes('fill="#ffffff"'));
  assert.ok(svg.includes("&lt;Scan &amp; go&gt;"));
  assert.ok(!svg.includes("<Scan"));
});

test("SVG escapes logo URLs", () => {
  const svg = toSVG({ data: DATA, ecc: "H", logo: { src: 'data:image/png;base64,AAAA"onload="x' } });
  assert.ok(svg.includes("&quot;onload=&quot;x"));
});

test("every style combination without a reliability warning scans at many sizes", () => {
  let checked = 0;
  for (const moduleStyle of MODULE_STYLES) {
    for (const cornerStyle of CORNER_STYLES) {
      for (const cornerDotStyle of CORNER_STYLES) {
        const options = { data: DATA, moduleStyle, cornerStyle, cornerDotStyle };
        if (analyzeReliability(options).level !== "good") continue;
        for (let size = 150; size <= 700; size += 37) {
          const decoded = renderAndDecode({ ...options, size });
          assert.equal(decoded, DATA, `${moduleStyle}/${cornerStyle}/${cornerDotStyle} @ ${size}px`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 200);
});

test("mixed circle/square corners are flagged", () => {
  const r = analyzeReliability({ data: DATA, cornerStyle: "square", cornerDotStyle: "circle" });
  assert.ok(r.warnings.some((w) => w.code === "CORNER_MISMATCH"));
});

test("every preset scans", () => {
  for (const preset of presets) {
    assert.equal(renderAndDecode({ data: DATA, size: 400, ...preset.options }), DATA, preset.id);
  }
});

test("frames scan", () => {
  for (const style of ["box", "banner"]) {
    assert.equal(renderAndDecode({ data: DATA, size: 400, frame: { style, color: "#4f46e5" } }), DATA, style);
  }
});

test("a logo with high error correction still scans", () => {
  const logo = { pixels: solidImage(40, 40, [220, 38, 38]), size: 0.25 };
  assert.equal(renderAndDecode({ data: DATA, size: 400, ecc: "H", logo }), DATA);
  const { layout } = layoutQR({ data: DATA, size: 400, ecc: "H", logo });
  const px = rasterize(layout);
  const c = (px.width * (px.height / 2) + px.width / 2) * 4;
  assert.deepEqual([...px.data.slice(c, c + 3)], [220, 38, 38], "logo is drawn in the centre");
});

test("PNG output is valid, deterministic and decodes back to the data", async () => {
  const a = await generateQR({ data: DATA, format: "png", size: 300 });
  const b = await toPNG({ data: DATA, size: 300 });
  assert.ok(a instanceof Uint8Array);
  assert.deepEqual([...a.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(a, b);
  const image = await decodePNG(a);
  assert.equal(image.width, 300);
  assert.equal(image.height, 300);
  assert.equal(decodePixels(image), DATA);
});

test("PNG supports transparency", async () => {
  const png = await toPNG({ data: DATA, size: 200, background: "transparent" });
  const image = await decodePNG(png);
  assert.equal(image.data[3], 0, "corner pixel is transparent");
});

test("PNG logos can be supplied as PNG bytes", async () => {
  const logoPng = await encodePNG(solidImage(16, 16, [0, 128, 255]));
  const png = await toPNG({ data: DATA, size: 400, ecc: "H", logo: { src: logoPng, size: 0.2 } });
  const image = await decodePNG(png);
  assert.equal(decodePixels(image), DATA);
  const c = (200 * 400 + 200) * 4;
  assert.deepEqual([...image.data.slice(c, c + 3)], [0, 128, 255]);
});

test("PNG labels require a canvas and fail loudly in Node", async () => {
  await assert.rejects(toPNG({ data: DATA, label: "Scan me" }), (e) => e.code === "UNSUPPORTED_FEATURE");
});

test("PDF output is a structurally valid document", async () => {
  const pdf = await toPDF({ data: DATA, label: "Scan me", logo: { pixels: solidImage(8, 8, [0, 0, 0, 128]) }, ecc: "H" });
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.ok(text.slice(startxref).startsWith("xref"));
  // Every xref offset must point at the start of its object.
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  assert.ok(text.includes("/BaseFont /Helvetica"));
  assert.ok(text.includes("/SMask"));
});

test("PDF supports fixed page sizes", async () => {
  const pdf = await generateQR({ data: DATA, format: "pdf", pageSize: "A4" });
  assert.ok(new TextDecoder("latin1").decode(pdf).includes("/MediaBox [0 0 595.28 841.89]"));
});

test("data URL output", async () => {
  const svg = await generateQR({ data: DATA, output: "dataURL" });
  assert.match(svg, /^data:image\/svg\+xml;base64,/);
  const png = await generateQR({ data: DATA, format: "png", output: "dataURL" });
  assert.match(png, /^data:image\/png;base64,iVBORw0KGgo/);
});

test("structured types are built from `type` + `data`", () => {
  const svg = toSVG({ type: "wifi", data: { ssid: "Cafe", password: "espresso" } });
  assert.match(svg, /^<svg/);
  const decoded = renderAndDecode({ type: "wifi", data: { ssid: "Cafe", password: "espresso" }, size: 300 });
  assert.equal(decoded, "WIFI:T:WPA;S:Cafe;P:espresso;;");
});

test("invalid options are rejected", async () => {
  await assert.rejects(generateQR({ data: DATA, format: "gif" }), (e) => e.code === "INVALID_OPTION");
  await assert.rejects(generateQR({ data: DATA, format: "png", output: "string" }), (e) => e.code === "INVALID_OPTION");
  await assert.rejects(generateQR({}), (e) => e.code === "EMPTY_DATA");
  assert.throws(() => toSVG({ data: DATA, foreground: "red" }), (e) => e.details.field === "foreground");
  assert.throws(() => toSVG({ data: DATA, size: 5 }), (e) => e.details.field === "size");
  assert.throws(() => toSVG({ data: DATA, moduleStyle: "hearts" }), (e) => e.details.field === "moduleStyle");
  assert.throws(() => toSVG({ data: DATA, logo: { src: "x", size: 0.9 } }), (e) => e.details.field === "logo.size");
});

test("reliability analysis flags risky designs", () => {
  assert.equal(analyzeReliability({ data: DATA }).level, "good");
  const low = analyzeReliability({ data: DATA, foreground: "#bbbbbb" });
  assert.equal(low.level, "poor");
  assert.ok(low.warnings.some((w) => w.code === "LOW_CONTRAST"));
  const inverted = analyzeReliability({ data: DATA, foreground: "#ffffff", background: "#000000" });
  assert.ok(inverted.warnings.some((w) => w.code === "INVERTED"));
  assert.ok(analyzeReliability({ data: DATA, margin: 0 }).warnings.some((w) => w.code === "NO_QUIET_ZONE"));
  const bigLogo = analyzeReliability({ data: DATA, ecc: "L", logo: { src: "data:,", size: 0.3 } });
  assert.ok(bigLogo.warnings.some((w) => w.code === "LOGO_TOO_LARGE"));
  assert.ok(analyzeReliability({ data: DATA, size: 40 }).warnings.some((w) => w.code === "TOO_SMALL"));
});

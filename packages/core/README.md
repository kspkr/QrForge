# @qrforge/core

Deterministic QR code generation for browsers and Node.js, with SVG, PNG and PDF output. No runtime dependencies.

- QR Model 2 encoder: versions 1 to 40, error correction levels L, M, Q and H, numeric, alphanumeric and UTF-8 byte modes.
- Output as SVG strings, PNG bytes or vector PDF.
- Styling: colors, `square`, `rounded`, `soft` and `dots` modules, finder pattern shapes, logos, frames, labels and presets.
- Payload builders for URL, text, Wi-Fi, vCard, email, SMS, phone, location and calendar events.
- Reliability analysis that flags designs likely to scan poorly.
- No network access: encoded content never leaves the process.

## Installation

```bash
npm install @qrforge/core
```

Requires Node.js 18+ or a modern browser.

## Usage

```js
import { generateQR } from "@qrforge/core";

const svg = await generateQR({ data: "https://example.com", format: "svg" });
const png = await generateQR({ data: "https://example.com", format: "png", size: 1024 }); // Uint8Array
const dataUrl = await generateQR({ data: "https://example.com", format: "png", output: "dataURL" });
const pdf = await generateQR({ data: "https://example.com", format: "pdf", pageSize: "A4" });
```

Writing a file in Node.js:

```js
import { writeFile } from "node:fs/promises";
import { toPNG } from "@qrforge/core";

await writeFile("qr.png", await toPNG({ data: "https://example.com" }));
```

Structured content:

```js
await generateQR({ type: "wifi", data: { ssid: "Cafe", password: "espresso" } });
```

## API

| Function | Returns |
| --- | --- |
| `generateQR(options)` | `Promise<string \| Uint8Array>` in the requested format |
| `toSVG(options)` | `string` (synchronous) |
| `toPNG(options)` | `Promise<Uint8Array>` |
| `toPDF(options)` | `Promise<Uint8Array>` |
| `analyzeReliability(options)` | `{ level: "good" \| "fair" \| "poor", warnings, version, modules }` |
| `encode(data, { ecc, minVersion, maxVersion, mask })` | Module matrix |
| `layoutQR(options)` | Format-independent shapes for custom renderers |
| `url`, `text`, `wifi`, `vcard`, `email`, `sms`, `phone`, `location`, `calendar`, `buildPayload(type, input)` | Payload strings |
| `presets`, `getPreset(id)` | Design presets |
| `QRForgeError` | Error class with a stable `code` and `details.field` |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `data` | | String, bytes, or structured fields when `type` is set. |
| `type` | | `url`, `text`, `wifi`, `vcard`, `email`, `sms`, `phone`, `location` or `calendar`. |
| `format` | `"svg"` | `"svg"`, `"png"` or `"pdf"`. |
| `output` | `"string"` for SVG, otherwise `"buffer"` | `"string"`, `"buffer"` or `"dataURL"`. |
| `size` | `512` | Width in pixels (32–8192). |
| `margin` | `4` | Quiet zone in modules (0–32). |
| `ecc` | `"M"` | `"L"`, `"M"`, `"Q"` or `"H"`. |
| `foreground` | `"#000000"` | Hex color. |
| `background` | `"#ffffff"` | Hex color or `"transparent"`. |
| `moduleStyle` | `"square"` | `"square"`, `"rounded"`, `"soft"` or `"dots"`. |
| `cornerStyle` | `"square"` | Finder ring: `"square"`, `"rounded"` or `"circle"`. |
| `cornerDotStyle` | `"square"` | Finder center: `"square"`, `"rounded"` or `"circle"`. |
| `cornerColor` | foreground | Finder color. |
| `logo` | | `{ src, pixels, size = 0.22, padding = 1, background = "#ffffff", radius = 0.2, excavate = true }` |
| `label` | | `{ text, color, size = 1 }` or a string of up to 64 characters. |
| `frame` | | `{ style: "box" \| "banner", color }` or a string. |
| `title` | `"QR code"` | SVG `aria-label` and PDF title. |
| `renderer` | `"auto"` | PNG renderer: `"auto"`, `"canvas"` or `"raster"`. |
| `dpi` | | PNG pixel density metadata. |
| `pageSize` | `"fit"` | PDF page: `"fit"`, `"A4"`, `"Letter"` or `"A5"`. |
| `minVersion`, `maxVersion`, `mask` | automatic | Encoder controls. |

## Browser and Node.js

- In browsers, PNG output uses a canvas, which supports labels and any logo format the browser can decode. Node.js uses a deterministic JavaScript rasterizer: labels are not supported in PNG (use SVG or PDF), and logos must be PNG for PNG and PDF output.
- In Node.js, logo URLs are referenced in SVG output and never fetched. In browsers, a logo URL is loaded by the browser for PNG and PDF export; cross-origin images need CORS headers.
- PDF labels use Helvetica with the Latin-1 character set; other characters are replaced with `?`.

## Reliability analysis

```js
import { analyzeReliability } from "@qrforge/core";

analyzeReliability({ data: "https://example.com", foreground: "#cccccc" }).level; // "poor"
```

The analysis checks contrast, inverted colors, the quiet zone, pixel density, mixed finder shapes, logo coverage relative to the error correction level, and transparency.

## Documentation

<https://kspkr.github.io/QrForge/docs/guide/core>

## License

MIT

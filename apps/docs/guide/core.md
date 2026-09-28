# Core library: `@qrforge/core`

`@qrforge/core` is a deterministic QR code generator for browsers and Node.js with no runtime dependencies. The Studio, the React components and the CLI are built on it.

- QR encoder (ISO/IEC 18004, versions 1 to 40, all four error correction levels).
- SVG, PNG and vector PDF output, with styling, logos, frames and labels.
- Payload builders for URL, text, Wi-Fi, vCard, email, SMS, phone, location and calendar events.
- Scan reliability analysis.

QR content is never sent over the network. A logo URL you provide is loaded by the browser for PNG and PDF export; in Node.js, URLs are never fetched.

```bash
npm install @qrforge/core
```

Requires Node.js 18+ (PNG and PDF output use `CompressionStream`) or a modern browser.

## Usage

```js
import { generateQR } from "@qrforge/core";

// SVG string (default format)
const svg = await generateQR({ data: "https://example.com" });

// PNG bytes (Uint8Array)
const png = await generateQR({ data: "https://example.com", format: "png", size: 1024 });

// Data URL, for example for an <img>
const url = await generateQR({ data: "https://example.com", format: "png", output: "dataURL" });

// Vector PDF on an A4 page
const pdf = await generateQR({ data: "https://example.com", format: "pdf", pageSize: "A4" });
```

Writing a file in Node.js:

```js
import { writeFile } from "node:fs/promises";
import { toPNG } from "@qrforge/core";

await writeFile("qr.png", await toPNG({ data: "https://example.com", size: 800 }));
```

## Structured content

Set `type` and pass the fields in `data`. The matching payload builder validates the input and produces the payload.

```js
await generateQR({
  type: "wifi",
  data: { ssid: "Cafe", password: "espresso", encryption: "WPA" },
  format: "svg",
});
```

## Functions

| Function | Returns | Description |
| --- | --- | --- |
| `generateQR(options)` | `Promise<string \| Uint8Array>` | Render in any format. |
| `toSVG(options)` | `string` | Synchronous SVG rendering. |
| `toPNG(options)` | `Promise<Uint8Array>` | PNG bytes. |
| `toPDF(options)` | `Promise<Uint8Array>` | Single-page vector PDF. |
| `analyzeReliability(options)` | `{ level, warnings, version, modules }` | Estimates how reliably the styled code will scan. |
| `encode(data, { ecc, minVersion, maxVersion, mask })` | `{ version, size, ecc, mask, modules }` | Raw module matrix; `modules[y][x]` is `true` for dark modules. |
| `layoutQR(options)` | `{ content, matrix, options, layout }` | Encode and lay out without rendering, for custom renderers. |
| `byteCapacity(version, ecc)` | `number` | Maximum payload size in bytes for a version and ECC level. |
| `buildPayload(type, input)` | `string` | Build the payload for a structured type. |
| `decodePNG(bytes)`, `encodePNG(image)` | | Minimal PNG codec used for logos. |
| `contrastRatio(a, b)` | `number` | WCAG contrast ratio of two hex colors. |
| `presets`, `getPreset(id)` | | Built-in design presets. |

Errors are `QRForgeError` instances with a stable `code` (`EMPTY_DATA`, `DATA_TOO_LONG`, `INVALID_OPTION`, `INVALID_PAYLOAD`, `INVALID_IMAGE`, `UNSUPPORTED_FEATURE` or `UNSUPPORTED_ENVIRONMENT`). Errors caused by input also set `details.field`.

```js
import { generateQR, QRForgeError } from "@qrforge/core";

try {
  await generateQR({ data: "x".repeat(5000) });
} catch (e) {
  if (e instanceof QRForgeError && e.code === "DATA_TOO_LONG") {
    // Shorten the content or lower the error correction level.
  }
}
```

## Options

### Content and output

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `string \| Uint8Array \| object` | | Content to encode, or structured fields when `type` is set. Required. |
| `type` | `"url" \| "text" \| "wifi" \| "vcard" \| "email" \| "sms" \| "phone" \| "location" \| "calendar"` | | Builds the payload from the fields in `data`. |
| `format` | `"svg" \| "png" \| "pdf"` | `"svg"` | Output format (`generateQR` only). |
| `output` | `"string" \| "buffer" \| "dataURL"` | `"string"` for SVG, otherwise `"buffer"` | `"string"` is available for SVG only. |
| `title` | `string` | `"QR code"` | SVG `aria-label` and PDF title. |
| `renderer` | `"auto" \| "canvas" \| "raster"` | `"auto"` | PNG renderer. `auto` uses a canvas in browsers and the JavaScript rasterizer elsewhere. |
| `dpi` | `number` | | PNG pixel density metadata (JavaScript rasterizer only). |
| `pageSize` | `"fit" \| "A4" \| "Letter" \| "A5"` | `"fit"` | PDF page size. With `fit`, the page matches the code (pixels × 0.75 pt); other sizes center the code at 60% of the page width. |
| `minVersion`, `maxVersion` | `1`–`40` | `1`, `40` | Constrain the QR version. |
| `mask` | `0`–`7` | automatic | Force a mask pattern. |

Text is encoded in numeric, alphanumeric or byte (UTF-8) mode, using the most compact single mode that fits the whole string.

### Style

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `number` (32–8192) | `512` | Output width in pixels. Labels and frames add height. |
| `margin` | `integer` (0–32) | `4` | Quiet zone in modules. |
| `ecc` | `"L" \| "M" \| "Q" \| "H"` | `"M"` | Error correction level; recovers about 7%, 15%, 25% or 30% of the code. |
| `foreground` | hex color | `"#000000"` | Module color: `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. |
| `background` | hex color or `"transparent"` | `"#ffffff"` | Background color. |
| `moduleStyle` | `"square" \| "rounded" \| "soft" \| "dots"` | `"square"` | Shape of data modules. `rounded` and `soft` round only exposed corners, so adjacent modules join. |
| `cornerStyle` | `"square" \| "rounded" \| "circle"` | `"square"` | Outer ring of the three finder patterns. |
| `cornerDotStyle` | `"square" \| "rounded" \| "circle"` | `"square"` | Center of the finder patterns. |
| `cornerColor` | hex color or `null` | foreground | Finder pattern color. |
| `logo` | `object \| string` | `null` | See below. A string is shorthand for `{ src }`. |
| `label` | `object \| string` | `null` | Text below the code. A string is shorthand for `{ text }`. |
| `frame` | `object \| string` | `null` | `"box"` or `"banner"` frame. |

With non-square module styles, alignment patterns are drawn as solid shapes so decoders can locate them.

#### `logo`

| Field | Default | Description |
| --- | --- | --- |
| `src` | | Data URL, URL or image bytes (`Uint8Array`). In Node.js, URLs work for SVG output only. |
| `pixels` | | Pre-decoded RGBA image `{ width, height, data }`, for PNG and PDF. |
| `size` | `0.22` | Logo width as a fraction of the code (0.05–0.35). |
| `padding` | `1` | Clear space around the logo in modules (0–4). |
| `background` | `"#ffffff"` | Color of the plate behind the logo, or `null` or `false` for none. |
| `radius` | `0.2` | Plate corner radius as a fraction of its size (0–0.5). |
| `excavate` | `true` | Remove the modules behind the logo. |

Use `ecc: "H"`, or at least `"Q"`, with logos. Modules hidden by the logo consume error correction capacity.

#### `label` and `frame`

| Field | Default | Description |
| --- | --- | --- |
| `label.text` | | Up to 64 characters. |
| `label.color` | automatic | A color that is readable on the frame, or the foreground color. |
| `label.size` | `1` | Font size multiplier (0.5–2). |
| `frame.style` | | `"none"`, `"box"` (outline) or `"banner"` (solid frame with the label in a bottom bar). |
| `frame.color` | foreground | Frame color. |

```js
await generateQR({
  data: "https://example.com/menu",
  format: "svg",
  frame: { style: "banner", color: "#0a0a0a" },
  label: "SCAN FOR THE MENU",
});
```

## Presets

`presets` contains six designs, all with strong contrast and a full quiet zone: `minimal`, `business`, `modern`, `rounded`, `dark` (a dark banner frame around a standard dark-on-light code) and `elegant`.

```js
import { generateQR, getPreset } from "@qrforge/core";

await generateQR({ data: "https://example.com", ...getPreset("modern").options });
```

## Payload builders

Each builder validates its input and throws `QRForgeError` with code `INVALID_PAYLOAD` and `details.field` when a value is invalid.

| Builder | Input | Output |
| --- | --- | --- |
| `url(url)` | string or `{ url }` | Adds `https://` when no scheme is given; only `http` and `https` are accepted. |
| `text(text)` | string or `{ text }` | Unchanged text. |
| `wifi({ ssid, password, encryption, hidden })` | `encryption`: `WPA` (default), `WEP` or `nopass` | `WIFI:T:WPA;S:…;P:…;;` with special characters escaped. |
| `vcard({ firstName, lastName, organization, title, phone, mobile, email, website, street, city, region, postalCode, country, note })` | A name or organization is required | vCard 3.0. |
| `email({ to, subject, body, cc, bcc })` | | `mailto:` URI. |
| `sms({ phone, message })` | | `SMSTO:number:message`. |
| `phone(number)` | string or `{ phone }` | `tel:` URI with separators removed. |
| `location({ latitude, longitude } \| { address }, format)` | `format`: `geo` (default), `osm`, `google` or `apple` | `geo:` URI or map link. |
| `calendar({ title, start, end, allDay, location, description })` | Dates as `Date` objects or ISO strings; all-day events accept `YYYY-MM-DD` | iCalendar `VEVENT` in UTC. |

```js
import { vcard, generateQR } from "@qrforge/core";

const payload = vcard({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" });
const svg = await generateQR({ data: payload });
```

## Scan reliability

```js
import { analyzeReliability } from "@qrforge/core";

const r = analyzeReliability({ data: "https://example.com", foreground: "#bbbbbb" });
// { level: "poor", version: 2, modules: 25,
//   warnings: [{ code: "LOW_CONTRAST", severity: "danger", message: "…" }] }
```

`level` is `"good"`, `"fair"` (warnings present) or `"poor"` (at least one danger). The checks cover contrast (`LOW_CONTRAST`), inverted colors (`INVERTED`), the quiet zone (`NO_QUIET_ZONE`, `SMALL_QUIET_ZONE`), pixels per module (`TOO_SMALL`, `SMALL`), mixed finder shapes (`CORNER_MISMATCH`), logo coverage relative to ECC (`LOGO_TOO_LARGE`, `LOGO_LARGE`, `LOGO_ECC`, `LOGO_OVERLAP`) and transparency (`TRANSPARENT_BACKGROUND`, `TRANSLUCENT_BACKGROUND`).

## Browser and Node.js differences

| Feature | Browser | Node.js |
| --- | --- | --- |
| SVG | Yes | Yes |
| PNG | Canvas renderer by default | JavaScript rasterizer (deterministic) |
| PNG with `label` | Yes | No; throws `UNSUPPORTED_FEATURE`. Use SVG or PDF. |
| Logo formats for PNG and PDF | Any format the browser decodes (PNG, JPEG, WebP, GIF, SVG) | PNG only, or pre-decoded `pixels` |
| Logo URLs such as `/logo.svg` | SVG, PNG and PDF (loaded by the browser; cross-origin images need CORS headers) | SVG output only (referenced, never fetched) |
| PDF | Yes | Yes |

PDF labels use the built-in Helvetica font; characters outside Latin-1 are replaced with `?`. SVG labels use the system sans-serif font.

## Determinism

The same input always produces the same module matrix and the same SVG string. With `renderer: "raster"`, the default in Node.js, PNG pixels are identical across runs.

## Custom renderers

`layoutQR()` returns a format-independent list of rectangles (with per-corner radii) and circles, optionally with holes, in module units. `shapePath(shape)` converts a shape to an SVG path string. The React package renders directly from this layout.

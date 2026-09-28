# @qrforge/react

React components and hooks for QR codes generated in the browser, built on [`@qrforge/core`](https://www.npmjs.com/package/@qrforge/core).

- Renders `<svg>` elements and supports server-side rendering.
- Supports every core style option: colors, module and corner shapes, logos, frames, labels and presets.
- Downloads as SVG, PNG or PDF, generated in the browser without uploading anything.
- ES modules with TypeScript definitions. No build step and no JSX runtime requirement.

## Installation

```bash
npm install @qrforge/react
```

Peer dependency: `react >= 17`.

## Usage

```jsx
import { QRCode } from "@qrforge/react";

export default function App() {
  return <QRCode value="https://example.com" size={300} />;
}
```

## `<QRCode />` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | — | Content to encode (alias of `data`). |
| `data` | `string \| object` | — | Content, or structured fields when `type` is set. |
| `type` | `"url" \| "text" \| "wifi" \| "vcard" \| "email" \| "sms" \| "phone" \| "location" \| "calendar"` | — | Build the payload from `data`. |
| `size` | `number` | `256` | Width in pixels. |
| `preset` | `string` | — | `minimal`, `business`, `modern`, `rounded`, `dark` or `elegant`. Explicit props take precedence. |
| `margin` | `number` | `4` | Quiet zone in modules. |
| `ecc` / `errorCorrection` | `"L" \| "M" \| "Q" \| "H"` | `"M"` | Error correction level. |
| `foreground` / `fgColor` | hex | `"#000000"` | Module color. |
| `background` / `bgColor` | hex or `"transparent"` | `"#ffffff"` | Background color. |
| `moduleStyle` | `"square" \| "rounded" \| "soft" \| "dots"` | `"square"` | Module shape. |
| `cornerStyle` / `cornerDotStyle` | `"square" \| "rounded" \| "circle"` | `"square"` | Finder pattern shapes. |
| `cornerColor` | hex | foreground | Finder pattern color. |
| `logo` | `{ src, size, padding, background, radius, excavate }` or string | — | `src` is a URL (e.g. `/logo.svg`) or data URL; cross-origin logos need CORS headers for PNG/PDF export. Use `ecc="H"`. |
| `label` | `{ text, color, size }` or string | — | Text under the code. |
| `frame` | `{ style: "box" \| "banner", color }` or string | — | Frame around the code. |
| `format` | `"svg" \| "png"` | `"svg"` | `png` renders an `<img>`. |
| `title` / `alt` | `string` | — | Accessible name. |
| `fallback` | `ReactNode` | `null` | Shown for invalid input. |
| `onError` | `(error) => void` | — | Receives the `QRForgeError`. |
| Other props | | | Passed to the `<svg>` or `<img>`, for example `className`, `style` and `data-*`. |

The ref exposes `download(format, filename)`, `toDataURL(format)` and `toSVG()`.

## Examples

```jsx
import { useRef } from "react";
import { QRCode, QRDownloadButton, useQRCode } from "@qrforge/react";

// Preset with structured content
<QRCode type="wifi" data={{ ssid: "Cafe", password: "espresso" }} preset="modern" />;

// Frame and label
<QRCode value="https://example.com/menu" frame={{ style: "banner", color: "#0a0a0a" }} label="SCAN FOR THE MENU" />;

// Download button
<QRDownloadButton value="https://example.com" format="pdf" filename="poster">
  Download PDF
</QRDownloadButton>;

// Imperative download
function Card() {
  const ref = useRef(null);
  return (
    <>
      <QRCode ref={ref} value="https://example.com" />
      <button onClick={() => ref.current.download("png", "card")}>PNG</button>
    </>
  );
}

// Hook with reliability analysis
function Checker({ value }) {
  const { reliability } = useQRCode({ value, foreground: "#9ca3af" });
  return <p>{reliability?.level}</p>; // "poor" (low contrast)
}
```

## API

| Export | Description |
| --- | --- |
| `QRCode` | The component (forwards a ref with download helpers). |
| `QRDownloadButton` | Button that generates and downloads a file (`format`, `filename`, `onDownload`, `onError`). |
| `useQRCode(props)` | `{ layout, matrix, content, error, reliability, options, download, toDataURL, toSVG }`. |
| `downloadQR(options, { format, filename })` | Generate and download without a component. |
| `saveFile(content, filename, mime)` | Download a string, bytes or Blob. |
| `toCoreOptions(props)` | Map component props to `@qrforge/core` options. |
| `presets` | Built-in presets. |

## Notes

- SVG rendering works during SSR. PNG rendering and downloads need a browser.
- Labels in PNG and PDF work in the browser. See the [core documentation](https://kspkr.github.io/QrForge/docs/guide/core#browser-and-node-js-differences) for Node.js limitations.
- QR content is never sent over the network. Logos given as URLs are loaded by the browser only for PNG and PDF export.

## Documentation

<https://kspkr.github.io/QrForge/docs/guide/react>

## License

MIT

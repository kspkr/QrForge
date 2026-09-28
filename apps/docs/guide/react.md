# React: `@qrforge/react`

React components and hooks built on [`@qrforge/core`](./core). Codes are generated locally and rendered as `<svg>` elements (without `dangerouslySetInnerHTML`), and every core style option is supported.

```bash
npm install @qrforge/react
```

Peer dependency: `react >= 17`. The package ships plain ES modules (no JSX, no build step).

## `<QRCode />`

```jsx
import { QRCode } from "@qrforge/react";

export default function App() {
  return <QRCode value="https://example.com" size={300} />;
}
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | — | Content to encode (alias of `data`). |
| `data` | `string \| object` | — | Content, or structured fields when `type` is set. |
| `type` | QR type | — | `"wifi"`, `"vcard"` and so on; see [payload builders](./core#payload-builders). |
| `size` | `number` | `256` | Width in pixels. |
| `preset` | `string` | — | Apply a built-in preset; explicit props override it. |
| `margin` | `number` | `4` | Quiet zone in modules. |
| `ecc` / `errorCorrection` | `"L" \| "M" \| "Q" \| "H"` | `"M"` | Error correction. |
| `foreground` / `fgColor` | hex | `"#000000"` | Module color. |
| `background` / `bgColor` | hex \| `"transparent"` | `"#ffffff"` | Background. |
| `moduleStyle` | `"square" \| "rounded" \| "soft" \| "dots"` | `"square"` | |
| `cornerStyle`, `cornerDotStyle` | `"square" \| "rounded" \| "circle"` | `"square"` | Finder pattern shapes. |
| `cornerColor` | hex | foreground | |
| `logo` | `object \| string` | — | See [core logo options](./core#logo). `src` may be a URL (e.g. `/logo.svg`) or a data URL in every mode; cross-origin logos need CORS headers to be exported as PNG/PDF. |
| `label` | `object \| string` | — | Text under the code. |
| `frame` | `object \| string` | — | `"box"` or `"banner"`. |
| `format` | `"svg" \| "png"` | `"svg"` | `png` renders an `<img>` with a PNG data URL. |
| `title` | `string` | — | Accessible name (`<title>` and `aria-label`). |
| `alt` | `string` | — | `alt` for `format="png"`. |
| `fallback` | `ReactNode` | `null` | Rendered when the input is invalid (or while PNG renders). |
| `onError` | `(error) => void` | — | Called with the `QRForgeError` for invalid input. |
| `className`, `style`, other props | | | Passed to the `<svg>` / `<img>`. |

The SVG has `role="img"` and an accessible name. It can be scaled with CSS (for example `className="w-full h-auto"`); the `viewBox` keeps it sharp at any size.

### Examples

```jsx
<QRCode value="https://example.com" preset="modern" size={240} />

<QRCode
  type="wifi"
  data={{ ssid: "Cafe", password: "espresso" }}
  label="Free Wi-Fi"
  frame={{ style: "banner", color: "#111827" }}
  title="Wi-Fi QR code"
/>

<QRCode
  value="https://example.com"
  ecc="H"
  logo={{ src: "/logo.svg", size: 0.22 }}
/>
```

### Imperative download via ref

```jsx
import { useRef } from "react";
import { QRCode } from "@qrforge/react";

function Card() {
  const qr = useRef(null);
  return (
    <>
      <QRCode ref={qr} value="https://example.com" />
      <button onClick={() => qr.current.download("png", "my-code")}>Download PNG</button>
    </>
  );
}
```

The ref exposes `download(format = "png", filename = "qrcode")`, `toDataURL(format = "png")` and `toSVG()`.

## `<QRDownloadButton />`

```jsx
import { QRDownloadButton } from "@qrforge/react";

<QRDownloadButton value="https://example.com" format="svg" filename="site">
  Download SVG
</QRDownloadButton>;
```

Accepts every option prop plus `format` (`"svg" | "png" | "pdf"`), `filename`, `onDownload(format)`, `onError(error)`, `disabled`, `className`, `style`. The button is disabled (`aria-busy`) while the file is generated.

## `useQRCode(props)`

```jsx
import { useQRCode } from "@qrforge/react";

function Inspector({ url }) {
  const { matrix, reliability, error, download } = useQRCode({ value: url, foreground: "#334155" });
  if (error) return <p>{error.message}</p>;
  return (
    <p>
      Version {matrix.version}, {reliability.level}
      <button onClick={() => download("pdf")}>PDF</button>
    </p>
  );
}
```

Returns `{ layout, matrix, content, error, reliability, options, download, toDataURL, toSVG }`. Results are memoized per set of options.

## Helpers

| Export | Description |
| --- | --- |
| `downloadQR(options, { format, filename })` | Generate and trigger a browser download. Accepts core options or component-style props. |
| `saveFile(content, filename, mime)` | Download a string, bytes or Blob. |
| `toCoreOptions(props)` | Convert component props (aliases, presets) to core options. |
| `presets` | Re-exported from core. |

## Server-side rendering

In SVG mode, `<QRCode />` has no side effects and can be rendered on the server (for example with `renderToString`); the client produces identical markup. `format="png"` and downloads require a browser.

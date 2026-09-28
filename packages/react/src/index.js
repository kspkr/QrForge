/**
 * @qrforge/react — React components for QRForge.
 *
 * Written with React.createElement (no JSX) so the package ships as plain
 * ES modules with no build step.
 */

import {
  createElement as h,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  analyzeReliability,
  generateQR,
  getPreset,
  layoutQR,
  mimeType,
  shapePath,
} from "@qrforge/core";

const STYLE_KEYS = [
  "size",
  "margin",
  "ecc",
  "foreground",
  "background",
  "moduleStyle",
  "cornerStyle",
  "cornerDotStyle",
  "cornerColor",
  "logo",
  "label",
  "frame",
  "minVersion",
  "maxVersion",
  "mask",
  "title",
];

/**
 * Normalise component props into @qrforge/core options.
 * Accepts friendly aliases: `value` for `data`, `errorCorrection` for `ecc`,
 * `fgColor`/`bgColor` for `foreground`/`background`, and a `preset` id.
 */
export function toCoreOptions(props) {
  const preset = props.preset ? getPreset(props.preset) : null;
  const options = { ...(preset ? preset.options : {}) };
  for (const key of STYLE_KEYS) if (props[key] !== undefined) options[key] = props[key];
  if (props.errorCorrection !== undefined) options.ecc = props.errorCorrection;
  if (props.fgColor !== undefined) options.foreground = props.fgColor;
  if (props.bgColor !== undefined) options.background = props.bgColor;
  options.data = props.data !== undefined ? props.data : props.value;
  if (props.type) options.type = props.type;
  if (options.size === undefined) options.size = 256;
  return options;
}

/** Trigger a browser download for bytes or a string. */
export function saveFile(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generate and download a QR code.
 * @param {object} options - @qrforge/core options (or component-style props).
 * @param {{format?: "svg"|"png"|"pdf", filename?: string}} [settings]
 */
export async function downloadQR(options, { format = "png", filename = "qrcode" } = {}) {
  const coreOptions = "value" in options || "preset" in options ? toCoreOptions(options) : options;
  const output = await generateQR({ ...coreOptions, format, output: format === "svg" ? "string" : "buffer" });
  const name = filename.endsWith(`.${format}`) ? filename : `${filename}.${format}`;
  saveFile(output, name, mimeType(format));
}

/** Stable cache key for options (logo pixel buffers are keyed by identity). */
function optionsKey(options) {
  return JSON.stringify(options, (key, value) =>
    value instanceof Uint8Array || value instanceof Uint8ClampedArray ? `bytes:${value.length}` : value,
  );
}

/**
 * Compute a QR code layout plus helpers.
 * @returns {{layout: object|null, matrix: object|null, error: Error|null, reliability: object|null,
 *   toSVG: () => Promise<string>, toDataURL: (format?: string) => Promise<string>,
 *   download: (format?: string, filename?: string) => Promise<void>}}
 */
export function useQRCode(props) {
  const options = toCoreOptions(props);
  const key = optionsKey(options);

  const result = useMemo(() => {
    try {
      const qr = layoutQR(options);
      return { layout: qr.layout, matrix: qr.matrix, content: qr.content, error: null };
    } catch (error) {
      return { layout: null, matrix: null, content: null, error };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reliability = useMemo(() => {
    if (!result.layout) return null;
    try {
      return analyzeReliability(options);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, result.layout]);

  const download = useCallback(
    (format = "png", filename = "qrcode") => downloadQR(options, { format, filename }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const toDataURL = useCallback(
    (format = "png") => generateQR({ ...options, format, output: "dataURL" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const toSVG = useCallback(
    () => generateQR({ ...options, format: "svg" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return { ...result, reliability, download, toDataURL, toSVG, options };
}

function renderLayout(layout, { title, className, style, rest, ref }) {
  const children = [];
  if (title) children.push(h("title", { key: "title" }, title));
  layout.layers.forEach((layer, i) => {
    const fill = layer.fill.length === 9 ? layer.fill.slice(0, 7) : layer.fill;
    const fillOpacity = layer.fill.length === 9 ? parseInt(layer.fill.slice(7), 16) / 255 : undefined;
    const common = { fill, fillOpacity, shapeRendering: layer.crisp ? "crispEdges" : undefined };
    const simple = layer.shapes.filter((s) => !s.hole);
    if (simple.length) children.push(h("path", { key: `l${i}`, ...common, d: simple.map(shapePath).join("") }));
    layer.shapes.forEach((s, j) => {
      if (s.hole) children.push(h("path", { key: `l${i}h${j}`, ...common, fillRule: "evenodd", d: shapePath(s) }));
    });
  });
  if (layout.logo && typeof layout.logo.src === "string") {
    const { x, y, size, src } = layout.logo;
    children.push(
      h("image", { key: "logo", x, y, width: size, height: size, href: src, preserveAspectRatio: "xMidYMid meet" }),
    );
  }
  if (layout.text) {
    const t = layout.text;
    children.push(
      h(
        "text",
        {
          key: "label",
          x: t.x,
          y: t.y,
          textAnchor: "middle",
          fontFamily: "Inter, 'Segoe UI', Helvetica, Arial, sans-serif",
          fontSize: t.fontSize,
          fontWeight: 600,
          letterSpacing: t.fontSize * 0.04,
          fill: t.color.slice(0, 7),
        },
        t.text,
      ),
    );
  }
  return h(
    "svg",
    {
      ref,
      xmlns: "http://www.w3.org/2000/svg",
      width: layout.pixelWidth,
      height: layout.pixelHeight,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      role: "img",
      "aria-label": title || "QR code",
      className,
      style,
      ...rest,
    },
    children,
  );
}

const OWN_PROPS = new Set([
  ...STYLE_KEYS,
  "value",
  "data",
  "type",
  "preset",
  "errorCorrection",
  "fgColor",
  "bgColor",
  "format",
  "className",
  "style",
  "onError",
  "fallback",
  "alt",
]);

/**
 * Render a QR code.
 *
 * @example
 * <QRCode value="https://example.com" size={300} />
 *
 * `format="svg"` (default) renders inline SVG; `format="png"` renders an <img>.
 * The ref exposes `download(format, filename)`, `toDataURL(format)` and `toSVG()`.
 */
export const QRCode = forwardRef(function QRCode(props, ref) {
  const { format = "svg", className, style, onError, fallback = null, title, alt } = props;
  const qr = useQRCode(props);
  const [png, setPng] = useState(null);

  useImperativeHandle(ref, () => ({ download: qr.download, toDataURL: qr.toDataURL, toSVG: qr.toSVG }), [qr]);

  useEffect(() => {
    if (qr.error && onError) onError(qr.error);
  }, [qr.error, onError]);

  useEffect(() => {
    if (format !== "png" || !qr.layout) return undefined;
    let cancelled = false;
    qr.toDataURL("png").then(
      (url) => !cancelled && setPng(url),
      (error) => !cancelled && onError?.(error),
    );
    return () => {
      cancelled = true;
    };
  }, [format, qr.layout, qr.toDataURL, onError]);

  if (!qr.layout) return fallback;

  const rest = {};
  for (const [k, v] of Object.entries(props)) if (!OWN_PROPS.has(k)) rest[k] = v;

  if (format === "png") {
    if (!png) return fallback;
    return h("img", {
      src: png,
      width: qr.layout.pixelWidth,
      height: qr.layout.pixelHeight,
      alt: alt ?? title ?? "QR code",
      className,
      style,
      ...rest,
    });
  }
  return renderLayout(qr.layout, { title, className, style, rest });
});

/**
 * A button that downloads a QR code.
 *
 * @example
 * <QRDownloadButton value="https://example.com" format="svg" filename="my-qr">Download SVG</QRDownloadButton>
 */
export function QRDownloadButton(props) {
  const { format = "png", filename = "qrcode", children, onError, onDownload, disabled, className, style } = props;
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    try {
      await downloadQR(toCoreOptions(props), { format, filename });
      onDownload?.(format);
    } catch (error) {
      if (onError) onError(error);
      else throw error;
    } finally {
      setBusy(false);
    }
  };
  return h(
    "button",
    { type: "button", onClick, disabled: disabled || busy, "aria-busy": busy || undefined, className, style },
    children ?? `Download ${format.toUpperCase()}`,
  );
}

export { presets } from "@qrforge/core";

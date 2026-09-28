import { QRForgeError } from "./errors.js";
import { normalizeColor } from "./color.js";

export const MODULE_STYLES = Object.freeze(["square", "rounded", "soft", "dots"]);
export const CORNER_STYLES = Object.freeze(["square", "rounded", "circle"]);
export const FRAME_STYLES = Object.freeze(["none", "box", "banner"]);
export const FORMATS = Object.freeze(["svg", "png", "pdf"]);

export const DEFAULT_OPTIONS = Object.freeze({
  size: 512,
  margin: 4,
  ecc: "M",
  foreground: "#000000",
  background: "#ffffff",
  moduleStyle: "square",
  cornerStyle: "square",
  cornerDotStyle: "square",
  cornerColor: null,
  logo: null,
  label: null,
  frame: null,
});

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new QRForgeError("INVALID_OPTION", `${field} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(value)}).`, {
      field,
    });
  }
  return value;
}

function number(value, field, min, max, { integer = false } = {}) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new QRForgeError(
      "INVALID_OPTION",
      `${field} must be ${integer ? "an integer" : "a number"} between ${min} and ${max} (got ${JSON.stringify(value)}).`,
      { field },
    );
  }
  return n;
}

function normalizeLogo(logo) {
  if (!logo) return null;
  const input = typeof logo === "string" ? { src: logo } : logo;
  const hasSrc = typeof input.src === "string" && input.src.length > 0;
  const hasBytes = input.src instanceof Uint8Array;
  const hasPixels = input.pixels && input.pixels.data && input.pixels.width > 0 && input.pixels.height > 0;
  if (!hasSrc && !hasBytes && !hasPixels) {
    throw new QRForgeError("INVALID_OPTION", "logo.src must be a data URL, URL, or PNG bytes.", { field: "logo.src" });
  }
  return {
    src: input.src ?? null,
    pixels: hasPixels ? input.pixels : null,
    size: number(input.size ?? 0.22, "logo.size", 0.05, 0.35),
    padding: number(input.padding ?? 1, "logo.padding", 0, 4),
    background:
      input.background === false || input.background === null
        ? null
        : normalizeColor(input.background ?? "#ffffff", "logo.background"),
    radius: number(input.radius ?? 0.2, "logo.radius", 0, 0.5),
    excavate: input.excavate !== false,
  };
}

function normalizeLabel(label) {
  if (label === null || label === undefined || label === false) return null;
  const input = typeof label === "string" ? { text: label } : label;
  const text = String(input.text ?? "").trim();
  if (!text) return null;
  if (text.length > 64) {
    throw new QRForgeError("INVALID_OPTION", "label.text must be at most 64 characters.", { field: "label.text" });
  }
  return {
    text,
    color: input.color ? normalizeColor(input.color, "label.color") : null,
    size: number(input.size ?? 1, "label.size", 0.5, 2),
  };
}

function normalizeFrame(frame) {
  if (!frame) return null;
  const input = typeof frame === "string" ? { style: frame } : frame;
  const style = oneOf(input.style ?? "none", FRAME_STYLES, "frame.style");
  if (style === "none") return null;
  return {
    style,
    color: input.color ? normalizeColor(input.color, "frame.color") : null,
  };
}

/**
 * Validate and fill in defaults for rendering options.
 * Throws QRForgeError with code INVALID_OPTION on bad input.
 */
export function normalizeOptions(options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const ecc = String(o.ecc).toUpperCase();
  const foreground = normalizeColor(o.foreground, "foreground");
  if (foreground === "transparent") {
    throw new QRForgeError("INVALID_OPTION", "foreground cannot be transparent.", { field: "foreground" });
  }
  return {
    size: Math.round(number(o.size, "size", 32, 8192)),
    margin: number(o.margin, "margin", 0, 32, { integer: true }),
    ecc: oneOf(ecc, ["L", "M", "Q", "H"], "ecc"),
    foreground,
    background: normalizeColor(o.background, "background"),
    moduleStyle: oneOf(o.moduleStyle, MODULE_STYLES, "moduleStyle"),
    cornerStyle: oneOf(o.cornerStyle, CORNER_STYLES, "cornerStyle"),
    cornerDotStyle: oneOf(o.cornerDotStyle, CORNER_STYLES, "cornerDotStyle"),
    cornerColor: o.cornerColor ? normalizeColor(o.cornerColor, "cornerColor") : null,
    logo: normalizeLogo(o.logo),
    label: normalizeLabel(o.label),
    frame: normalizeFrame(o.frame),
  };
}

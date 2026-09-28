import { QRForgeError } from "./errors.js";

const HEX_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Parse a hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa) or "transparent".
 * @returns {{r:number,g:number,b:number,a:number}} channels 0–255, alpha 0–1
 */
export function parseColor(value, field = "color") {
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (typeof value !== "string" || !HEX_REGEX.test(value.trim())) {
    throw new QRForgeError(
      "INVALID_OPTION",
      `${field} must be a hex colour like "#1a1a2e" (got ${JSON.stringify(value)}).`,
      { field },
    );
  }
  let hex = value.trim().slice(1);
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
}

/** Normalise a colour to lowercase #rrggbb or #rrggbbaa (or "transparent"). */
export function normalizeColor(value, field) {
  const c = parseColor(value, field);
  if (value === "transparent") return "transparent";
  const h = (n) => n.toString(16).padStart(2, "0");
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return c.a < 1 ? `${base}${h(Math.round(c.a * 255))}` : base;
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0–1). */
export function luminance(color) {
  const { r, g, b } = typeof color === "string" ? parseColor(color) : color;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours (1–21). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick black or white text for legibility on the given background. */
export function readableTextColor(background) {
  return luminance(background) > 0.4 ? "#111111" : "#ffffff";
}

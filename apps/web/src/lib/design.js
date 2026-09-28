import { getPreset } from "@qrforge/core";

/**
 * The Studio's design state. It's a flat, form-friendly shape that is also
 * what gets stored in a saved QR code's `design` field.
 */
export const DEFAULT_DESIGN = Object.freeze({
  preset: "minimal",
  foreground: "#000000",
  background: "#ffffff",
  transparent: false,
  moduleStyle: "square",
  cornerStyle: "square",
  cornerDotStyle: "square",
  cornerColor: "",
  ecc: "M",
  margin: 4,
  logo: null, // { src, name, size, padding, background, bgColor }
  frame: "none",
  frameColor: "#0a0a0a",
  label: "",
});

/** Merge a preset into a design, keeping content-specific choices (logo, label, ECC). */
export function applyPreset(design, presetId) {
  const preset = getPreset(presetId);
  if (!preset) return design;
  const o = preset.options;
  return {
    ...design,
    preset: presetId,
    foreground: o.foreground,
    background: o.background,
    transparent: false,
    moduleStyle: o.moduleStyle,
    cornerStyle: o.cornerStyle,
    cornerDotStyle: o.cornerDotStyle,
    cornerColor: o.cornerColor ?? "",
    frame: o.frame?.style ?? "none",
    frameColor: o.frame?.color ?? design.frameColor,
    label: o.frame && !design.label ? "SCAN ME" : design.label,
  };
}

/** Accept designs saved by older versions or other clients. */
export function normalizeDesign(input) {
  if (!input || typeof input !== "object") return { ...DEFAULT_DESIGN };
  const d = { ...DEFAULT_DESIGN, ...input };
  if (d.logo && typeof d.logo.src !== "string") d.logo = null;
  return d;
}

/** Convert a design to @qrforge/core rendering options. */
export function designToOptions(design, overrides = {}) {
  const d = normalizeDesign(design);
  return {
    foreground: d.foreground,
    background: d.transparent ? "transparent" : d.background,
    moduleStyle: d.moduleStyle,
    cornerStyle: d.cornerStyle,
    cornerDotStyle: d.cornerDotStyle,
    cornerColor: d.cornerColor || null,
    ecc: d.ecc,
    margin: d.margin,
    logo: d.logo
      ? {
          src: d.logo.src,
          size: d.logo.size,
          padding: d.logo.padding,
          background: d.logo.background ? d.logo.bgColor || (d.transparent ? "#ffffff" : d.background) : null,
        }
      : null,
    frame: d.frame && d.frame !== "none" ? { style: d.frame, color: d.frameColor } : null,
    label: d.label?.trim() ? { text: d.label.trim() } : null,
    ...overrides,
  };
}

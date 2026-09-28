/**
 * Design presets. Every preset keeps strong contrast and a proper quiet zone,
 * so they all scan reliably out of the box.
 */
export const presets = Object.freeze([
  {
    id: "minimal",
    name: "Minimal",
    description: "Classic black on white. Maximum compatibility.",
    options: {
      foreground: "#000000",
      background: "#ffffff",
      moduleStyle: "square",
      cornerStyle: "square",
      cornerDotStyle: "square",
      cornerColor: null,
      frame: null,
    },
  },
  {
    id: "business",
    name: "Business",
    description: "Deep navy with softened corners.",
    options: {
      foreground: "#0f172a",
      background: "#ffffff",
      moduleStyle: "soft",
      cornerStyle: "rounded",
      cornerDotStyle: "square",
      cornerColor: "#1e3a8a",
      frame: null,
    },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Dots with circular eyes in indigo.",
    options: {
      foreground: "#312e81",
      background: "#ffffff",
      moduleStyle: "dots",
      cornerStyle: "circle",
      cornerDotStyle: "circle",
      cornerColor: "#4f46e5",
      frame: null,
    },
  },
  {
    id: "rounded",
    name: "Rounded",
    description: "Fluid, connected modules.",
    options: {
      foreground: "#111827",
      background: "#ffffff",
      moduleStyle: "rounded",
      cornerStyle: "rounded",
      cornerDotStyle: "rounded",
      cornerColor: null,
      frame: null,
    },
  },
  {
    id: "dark",
    name: "Dark",
    description: "Dark frame with a scan-me banner.",
    options: {
      foreground: "#0a0a0a",
      background: "#ffffff",
      moduleStyle: "soft",
      cornerStyle: "rounded",
      cornerDotStyle: "rounded",
      cornerColor: null,
      frame: { style: "banner", color: "#0a0a0a" },
    },
  },
  {
    id: "elegant",
    name: "Elegant",
    description: "Warm ink with gold accents.",
    options: {
      foreground: "#292524",
      background: "#fffbeb",
      moduleStyle: "soft",
      cornerStyle: "rounded",
      cornerDotStyle: "circle",
      cornerColor: "#854d0e",
      frame: null,
    },
  },
]);

export function getPreset(id) {
  return presets.find((p) => p.id === id) ?? null;
}

/** Public links. Override at build time with VITE_* environment variables. */
export const REPO_URL = import.meta.env.VITE_REPO_URL || "https://github.com/kspkr/QrForge";
export const DOCS_URL = import.meta.env.VITE_DOCS_URL || "https://kspkr.github.io/QrForge/docs/";
/** Static hosting (GitHub Pages): Studio only, never contacts an API. */
export const STATIC_ONLY = import.meta.env.VITE_STATIC_ONLY === "true";
export const VERSION = "0.1.0";

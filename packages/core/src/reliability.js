/**
 * Scan-reliability analysis. Styling should never silently break a code, so
 * the designer surfaces these warnings next to the preview.
 */

import { contrastRatio, luminance, parseColor } from "./color.js";
import { ECC_LEVELS } from "./encoder.js";
import { logoRegion } from "./layout.js";

/**
 * @param {{size:number}} matrix
 * @param {ReturnType<import("./options.js").normalizeOptions>} opts
 * @returns {{level:"good"|"fair"|"poor", warnings:{code:string,severity:"warning"|"danger"|"info",message:string}[]}}
 */
export function analyzeLayout(matrix, opts) {
  const warnings = [];
  const add = (severity, code, message) => warnings.push({ severity, code, message });
  const bg = opts.background === "transparent" ? "#ffffff" : opts.background;

  if (opts.background === "transparent") {
    add("info", "TRANSPARENT_BACKGROUND", "Transparent background: place the code on a light, plain surface.");
  } else if (parseColor(opts.background).a < 1) {
    add("info", "TRANSLUCENT_BACKGROUND", "Semi-transparent background: contrast depends on what is behind the code.");
  }

  const checkContrast = (color, what) => {
    const ratio = contrastRatio(color, bg);
    if (ratio < 2.5) {
      add("danger", "LOW_CONTRAST", `${what} and background have very low contrast (${ratio.toFixed(1)}:1). Most scanners will fail.`);
    } else if (ratio < 4) {
      add("warning", "LOW_CONTRAST", `${what} contrast is low (${ratio.toFixed(1)}:1). Aim for at least 4:1.`);
    }
  };
  checkContrast(opts.foreground, "Foreground");
  if (opts.cornerColor && opts.cornerColor !== opts.foreground) checkContrast(opts.cornerColor, "Corner colour");

  if (luminance(opts.foreground) > luminance(bg)) {
    add("warning", "INVERTED", "Light-on-dark (inverted) codes are not supported by every scanner.");
  }

  if (opts.margin === 0) {
    add(
      "danger",
      "NO_QUIET_ZONE",
      "No quiet zone. Scanners need empty space around the code — use a margin of at least 2 modules.",
    );
  } else if (opts.margin < 2) {
    add("warning", "SMALL_QUIET_ZONE", "Very small quiet zone. A margin of 2–4 modules is recommended.");
  }

  const pxPerModule = opts.size / (matrix.size + opts.margin * 2);
  if (pxPerModule < 2) {
    add("danger", "TOO_SMALL", `Only ${pxPerModule.toFixed(1)} px per module. Increase the size.`);
  } else if (pxPerModule < 3) {
    add("warning", "SMALL", `Only ${pxPerModule.toFixed(1)} px per module. Increase the size for screens and print.`);
  }

  if (
    opts.cornerStyle !== opts.cornerDotStyle &&
    (opts.cornerStyle === "circle" || opts.cornerDotStyle === "circle" || opts.moduleStyle === "dots")
  ) {
    add(
      "warning",
      "CORNER_MISMATCH",
      "Mixing corner shapes distorts the finder patterns. Some scanners find these codes harder to read.",
    );
  }

  if (opts.logo) {
    const region = logoRegion(matrix.size, opts.logo);
    const covered = (region.cleared * region.cleared) / (matrix.size * matrix.size);
    const recovery = ECC_LEVELS[opts.ecc].recovery;
    const pct = Math.round(covered * 100);
    if (covered > recovery * 0.75) {
      add(
        "danger",
        "LOGO_TOO_LARGE",
        `The logo covers ~${pct}% of the code but level ${opts.ecc} error correction only recovers ~${Math.round(
          recovery * 100,
        )}%. Shrink the logo or raise error correction to H.`,
      );
    } else if (covered > recovery * 0.5) {
      add("warning", "LOGO_LARGE", `The logo covers ~${pct}% of the code. Test-scan before printing.`);
    }
    if (opts.ecc === "L" || opts.ecc === "M") {
      add("info", "LOGO_ECC", "Using error correction Q or H is recommended with a logo.");
    }
    if (!opts.logo.excavate && !opts.logo.background) {
      add("warning", "LOGO_OVERLAP", "The logo is drawn over modules without a background. Enable a logo background.");
    }
  }

  const level = warnings.some((w) => w.severity === "danger")
    ? "poor"
    : warnings.some((w) => w.severity === "warning")
      ? "fair"
      : "good";
  return { level, warnings };
}

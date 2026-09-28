/**
 * Format-independent layout.
 *
 * Converts a module matrix plus normalised options into a list of simple
 * geometric primitives (rectangles with per-corner radii and circles,
 * optionally with a hole). The SVG, PNG and PDF renderers all draw from this
 * single description, so every output format looks identical.
 *
 * Coordinates are in "units" where one QR module = 1 unit.
 */

import { readableTextColor } from "./color.js";
import { alignmentPatternPositions } from "./encoder.js";

const FINDER_SIZE = 7;

function rect(x, y, w, h, r = 0) {
  const radii = Array.isArray(r) ? r : [r, r, r, r];
  return { type: "rect", x, y, w, h, r: radii };
}

function circle(cx, cy, r) {
  return { type: "circle", cx, cy, r };
}

function isInFinder(x, y, n) {
  return (
    (x < FINDER_SIZE && y < FINDER_SIZE) ||
    (x >= n - FINDER_SIZE && y < FINDER_SIZE) ||
    (x < FINDER_SIZE && y >= n - FINDER_SIZE)
  );
}

function finderShapes(ox, oy, outerStyle, innerStyle) {
  let outer;
  switch (outerStyle) {
    case "circle":
      outer = { ...circle(ox + 3.5, oy + 3.5, 3.5), hole: circle(ox + 3.5, oy + 3.5, 2.5) };
      break;
    case "rounded":
      outer = { ...rect(ox, oy, 7, 7, 2.2), hole: rect(ox + 1, oy + 1, 5, 5, 1.3) };
      break;
    default:
      outer = { ...rect(ox, oy, 7, 7), hole: rect(ox + 1, oy + 1, 5, 5) };
  }
  let inner;
  switch (innerStyle) {
    case "circle":
      inner = circle(ox + 3.5, oy + 3.5, 1.5);
      break;
    case "rounded":
      inner = rect(ox + 2, oy + 2, 3, 3, 0.9);
      break;
    default:
      inner = rect(ox + 2, oy + 2, 3, 3);
  }
  return [outer, inner];
}

/** Centres of alignment patterns, excluding those overlapping finder patterns. */
function alignmentCentres(version) {
  const positions = alignmentPatternPositions(version);
  const last = positions.length - 1;
  const centres = [];
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      centres.push([positions[i], positions[j]]);
    }
  }
  return centres;
}

/**
 * Styled module sets (dots, rounded) can make alignment patterns hard for
 * some decoders to locate, so they are always drawn as solid shapes.
 */
function alignmentShapes(cx, cy, ox, oy, style) {
  const x = ox + cx - 2;
  const y = oy + cy - 2;
  if (style === "dots") {
    return [{ ...circle(x + 2.5, y + 2.5, 2.5), hole: circle(x + 2.5, y + 2.5, 1.5) }, circle(x + 2.5, y + 2.5, 0.6)];
  }
  const r = style === "square" ? 0 : 1.2;
  return [{ ...rect(x, y, 5, 5, r), hole: rect(x + 1, y + 1, 3, 3, r ? 0.6 : 0) }, rect(x + 2, y + 2, 1, 1, r ? 0.3 : 0)];
}

/**
 * Compute the square region (in module coordinates) cleared for a logo.
 * Returns null when there is no logo.
 */
export function logoRegion(n, logo) {
  if (!logo) return null;
  const box = logo.size * n;
  let cleared = Math.ceil(box + logo.padding * 2);
  if (cleared % 2 !== n % 2) cleared += 1; // Keep the region centred on the module grid.
  const start = (n - cleared) / 2;
  return { box, boxStart: (n - box) / 2, cleared, clearedStart: start };
}

function moduleShapes(matrix, style, ox, oy, skip) {
  const { size: n, modules } = matrix;
  const dark = (x, y) => x >= 0 && y >= 0 && x < n && y < n && modules[y][x] && !skip(x, y);
  const shapes = [];

  if (style === "square") {
    // Merge horizontal runs: far fewer primitives and no seams between modules.
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!dark(x, y)) {
          x++;
          continue;
        }
        const start = x;
        while (x < n && dark(x, y)) x++;
        shapes.push(rect(ox + start, oy + y, x - start, 1));
      }
    }
    return shapes;
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!dark(x, y)) continue;
      if (style === "dots") {
        shapes.push(circle(ox + x + 0.5, oy + y + 0.5, 0.45));
        continue;
      }
      // Neighbour-aware rounding: a corner is rounded only when both
      // adjacent sides are open, so connected modules flow together.
      const r = style === "rounded" ? 0.5 : 0.25;
      const up = dark(x, y - 1);
      const down = dark(x, y + 1);
      const left = dark(x - 1, y);
      const right = dark(x + 1, y);
      shapes.push(
        rect(ox + x, oy + y, 1, 1, [
          !up && !left ? r : 0,
          !up && !right ? r : 0,
          !down && !right ? r : 0,
          !down && !left ? r : 0,
        ]),
      );
    }
  }
  return shapes;
}

/**
 * @param {{size:number,modules:boolean[][]}} matrix
 * @param {ReturnType<import("./options.js").normalizeOptions>} opts
 */
export function createLayout(matrix, opts) {
  const n = matrix.size;
  const qrWidth = n + opts.margin * 2;
  const label = opts.label;
  const frame = opts.frame;
  const fontSize = label ? Math.max(qrWidth * 0.075, 2.2) * label.size : 0;

  // Frame geometry (units). `pad` = frame thickness around the QR area.
  let pad = 0;
  let bottom = 0;
  if (frame?.style === "banner") {
    pad = Math.max(1, qrWidth * 0.035);
    bottom = label ? fontSize * 2.2 : pad;
  } else if (frame?.style === "box") {
    pad = Math.max(1, qrWidth * 0.035);
    bottom = label ? fontSize * 2 + pad : pad;
  } else if (label) {
    bottom = fontSize * 2;
  }

  const width = qrWidth + pad * 2;
  const height = qrWidth + pad + bottom;
  const qrX = pad;
  const qrY = pad;
  const ox = qrX + opts.margin;
  const oy = qrY + opts.margin;

  const frameColor = frame?.color ?? opts.foreground;
  const layers = [];

  // Background / frame.
  if (frame?.style === "banner") {
    const radius = pad * 2.5;
    layers.push({ fill: frameColor, shapes: [rect(0, 0, width, height, radius)] });
    if (opts.background !== "transparent") {
      layers.push({ fill: opts.background, shapes: [rect(qrX, qrY, qrWidth, qrWidth, pad * 1.2)] });
    }
  } else if (frame?.style === "box") {
    const radius = pad * 2;
    if (opts.background !== "transparent") {
      layers.push({ fill: opts.background, shapes: [rect(0, 0, width, height, radius)] });
    }
    const t = Math.max(0.6, pad * 0.45);
    layers.push({
      fill: frameColor,
      shapes: [{ ...rect(0, 0, width, height, radius), hole: rect(t, t, width - 2 * t, height - 2 * t, Math.max(0, radius - t)) }],
    });
  } else if (opts.background !== "transparent") {
    layers.push({ fill: opts.background, shapes: [rect(0, 0, width, height)] });
  }

  // Logo region.
  const region = logoRegion(n, opts.logo);
  const inCleared = region
    ? (x, y) =>
        opts.logo.excavate &&
        x >= region.clearedStart &&
        x < region.clearedStart + region.cleared &&
        y >= region.clearedStart &&
        y < region.clearedStart + region.cleared
    : () => false;
  // Alignment patterns get dedicated solid shapes for styled modules.
  const solidAlignment = opts.moduleStyle !== "square";
  const alignments = solidAlignment
    ? alignmentCentres(matrix.version).filter(([cx, cy]) => {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inCleared(cx + dx, cy + dy)) return false;
        return true;
      })
    : [];
  const inAlignment = (x, y) => solidAlignment && alignments.some(([cx, cy]) => Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2);
  const skip = (x, y) => isInFinder(x, y, n) || inCleared(x, y) || inAlignment(x, y);

  layers.push({
    fill: opts.foreground,
    crisp: opts.moduleStyle === "square",
    shapes: [
      ...moduleShapes(matrix, opts.moduleStyle, ox, oy, skip),
      ...alignments.flatMap(([cx, cy]) => alignmentShapes(cx, cy, ox, oy, opts.moduleStyle)),
    ],
  });

  const cornerShapes = [
    ...finderShapes(ox, oy, opts.cornerStyle, opts.cornerDotStyle),
    ...finderShapes(ox + n - FINDER_SIZE, oy, opts.cornerStyle, opts.cornerDotStyle),
    ...finderShapes(ox, oy + n - FINDER_SIZE, opts.cornerStyle, opts.cornerDotStyle),
  ];
  const cornerColor = opts.cornerColor ?? opts.foreground;
  if (cornerColor === opts.foreground) {
    layers[layers.length - 1].shapes.push(...cornerShapes);
    layers[layers.length - 1].crisp = layers[layers.length - 1].crisp && opts.cornerStyle === "square" && opts.cornerDotStyle === "square";
  } else {
    layers.push({
      fill: cornerColor,
      crisp: opts.cornerStyle === "square" && opts.cornerDotStyle === "square",
      shapes: cornerShapes,
    });
  }

  let logo = null;
  if (region) {
    if (opts.logo.background) {
      const s = region.cleared;
      layers.push({
        fill: opts.logo.background,
        shapes: [rect(ox + region.clearedStart, oy + region.clearedStart, s, s, s * opts.logo.radius)],
      });
    }
    logo = {
      x: ox + region.boxStart,
      y: oy + region.boxStart,
      size: region.box,
      src: opts.logo.src,
      pixels: opts.logo.pixels,
    };
  }

  let text = null;
  if (label) {
    const barTop = qrY + qrWidth;
    const barHeight = height - barTop - (frame?.style === "box" ? pad * 0.5 : 0);
    let color = label.color;
    if (!color) {
      if (frame?.style === "banner") color = readableTextColor(frameColor);
      else if (frame?.style === "box") color = frameColor;
      else color = opts.foreground;
    }
    text = {
      x: width / 2,
      // Baseline placed so the cap-height is optically centred in the bar.
      y: barTop + barHeight / 2 + fontSize * 0.35,
      text: label.text,
      fontSize,
      color,
    };
  }

  const scale = opts.size / width;
  return {
    width,
    height,
    scale,
    pixelWidth: opts.size,
    pixelHeight: Math.round(height * scale),
    layers,
    logo,
    text,
  };
}

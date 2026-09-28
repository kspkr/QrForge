/**
 * Render a QR module matrix in the terminal with Unicode half blocks.
 * Each character cell covers two module rows.
 *
 * - color mode: explicit black-on-white ANSI colours, readable on both dark
 *   and light terminal themes.
 * - plain mode (NO_COLOR / piped output): light modules are drawn as blocks,
 *   which reads correctly on the common dark-background terminal.
 */

const QUIET_ZONE = 2;

export function renderTerminal(matrix, { color = true } = {}) {
  const n = matrix.size;
  const total = n + QUIET_ZONE * 2;
  const dark = (x, y) => {
    const mx = x - QUIET_ZONE;
    const my = y - QUIET_ZONE;
    return mx >= 0 && my >= 0 && mx < n && my < n && matrix.modules[my][mx];
  };

  const lines = [];
  for (let y = 0; y < total; y += 2) {
    let line = "";
    for (let x = 0; x < total; x++) {
      const top = dark(x, y);
      const bottom = y + 1 < total ? dark(x, y + 1) : false;
      if (color) {
        // Foreground = dark modules, background = white.
        line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
      } else {
        // Light modules drawn as blocks.
        const tl = !top;
        const bl = y + 1 < total ? !bottom : false;
        line += tl && bl ? "█" : tl ? "▀" : bl ? "▄" : " ";
      }
    }
    lines.push(color ? `\x1b[30;107m${line}\x1b[0m` : line);
  }
  return `${lines.join("\n")}\n`;
}

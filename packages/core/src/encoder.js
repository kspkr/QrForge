/**
 * QR Code Model 2 encoder (ISO/IEC 18004), versions 1–40.
 *
 * Pure JavaScript, zero dependencies, fully deterministic: the same input
 * always produces exactly the same module matrix.
 */

import { QRForgeError } from "./errors.js";

/** Error correction levels. `formatBits` are the 2-bit values used in format info. */
export const ECC_LEVELS = Object.freeze({
  L: { ordinal: 0, formatBits: 1, recovery: 0.07 },
  M: { ordinal: 1, formatBits: 0, recovery: 0.15 },
  Q: { ordinal: 2, formatBits: 3, recovery: 0.25 },
  H: { ordinal: 3, formatBits: 2, recovery: 0.3 },
});

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;
const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const NUMERIC_REGEX = /^[0-9]*$/;
const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;

const MODES = Object.freeze({
  numeric: { bits: 0x1, charCountBits: [10, 12, 14] },
  alphanumeric: { bits: 0x2, charCountBits: [9, 11, 13] },
  byte: { bits: 0x4, charCountBits: [8, 16, 16] },
});

function charCountBits(mode, version) {
  return mode.charCountBits[Math.floor((version + 7) / 17)];
}

function appendBits(buffer, value, length) {
  for (let i = length - 1; i >= 0; i--) buffer.push((value >>> i) & 1);
}

function utf8Bytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

/**
 * Build a single segment using the most compact mode that can represent the
 * whole input. Mixed-mode optimisation is intentionally not performed: it
 * saves very little for typical QR payloads and keeps output predictable.
 */
function makeSegment(data) {
  if (data instanceof Uint8Array || Array.isArray(data)) {
    const bytes = Array.from(data);
    const bits = [];
    for (const b of bytes) appendBits(bits, b, 8);
    return { mode: MODES.byte, numChars: bytes.length, bits };
  }
  const text = String(data);
  if (text.length > 0 && NUMERIC_REGEX.test(text)) {
    const bits = [];
    for (let i = 0; i < text.length; ) {
      const n = Math.min(text.length - i, 3);
      appendBits(bits, parseInt(text.substring(i, i + n), 10), n * 3 + 1);
      i += n;
    }
    return { mode: MODES.numeric, numChars: text.length, bits };
  }
  if (text.length > 0 && ALPHANUMERIC_REGEX.test(text)) {
    const bits = [];
    let i;
    for (i = 0; i + 2 <= text.length; i += 2) {
      const value =
        ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45 +
        ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
      appendBits(bits, value, 11);
    }
    if (i < text.length) appendBits(bits, ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6);
    return { mode: MODES.alphanumeric, numChars: text.length, bits };
  }
  const bytes = utf8Bytes(text);
  const bits = [];
  for (const b of bytes) appendBits(bits, b, 8);
  return { mode: MODES.byte, numChars: bytes.length, bits };
}

function segmentBitLength(segment, version) {
  const ccBits = charCountBits(segment.mode, version);
  if (segment.numChars >= 1 << ccBits) return Infinity;
  return 4 + ccBits + segment.bits.length;
}

function numRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(version, ecl) {
  return (
    Math.floor(numRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][version] *
      NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][version]
  );
}

/** Maximum payload size in bytes (byte mode) for a version / ECC level. */
export function byteCapacity(version, ecc = "M") {
  const ecl = ECC_LEVELS[ecc];
  const ccBits = version < 10 ? 8 : 16;
  return Math.floor((numDataCodewords(version, ecl) * 8 - 4 - ccBits) / 8);
}

// ---------------------------------------------------------------------------
// Reed–Solomon over GF(2^8) with polynomial 0x11D.

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

const divisorCache = new Map();

function reedSolomonDivisor(degree) {
  if (divisorCache.has(degree)) return divisorCache.get(degree);
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  divisorCache.set(degree, result);
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMultiply(divisor[i], factor);
  }
  return result;
}

function addEccAndInterleave(data, version, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  const divisor = reedSolomonDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = reedSolomonRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      // Skip the padding byte inserted into short blocks.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix construction.

export function alignmentPatternPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

class Matrix {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }

  setFunction(x, y, dark) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  drawFunctionPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);

    const positions = alignmentPatternPositions(this.version);
    const last = positions.length - 1;
    for (let i = 0; i <= last; i++) {
      for (let j = 0; j <= last; j++) {
        const overlapsFinder =
          (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
        if (!overlapsFinder) this.drawAlignment(positions[i], positions[j]);
      }
    }

    // Reserve format areas with a dummy mask; overwritten after masking.
    this.drawFormatBits(ECC_LEVELS.M, 0);
    this.drawVersion();
  }

  drawFinder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
          this.setFunction(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  drawAlignment(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormatBits(ecl, mask) {
    const data = (ecl.formatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) !== 0;
    const { size } = this;

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i));
    this.setFunction(8, 7, bit(6));
    this.setFunction(8, 8, bit(7));
    this.setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) this.setFunction(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFunction(8, size - 15 + i, bit(i));
    this.setFunction(8, size - 8, true); // Always-dark module.
  }

  drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  drawCodewords(codewords) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask) {
    const fn = MASK_FUNCTIONS[mask];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y][x] && fn(x, y)) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  penaltyScore() {
    const { size, modules } = this;
    let result = 0;

    // Rule 1: runs of five or more same-coloured modules in rows and columns.
    for (let y = 0; y < size; y++) {
      result += runPenalty((i) => modules[y][i], size);
    }
    for (let x = 0; x < size; x++) {
      result += runPenalty((i) => modules[i][x], size);
    }

    // Rule 2: 2x2 blocks of the same colour.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
          result += 3;
        }
      }
    }

    // Rule 3: finder-like patterns 1:1:3:1:1 with four light modules on either side.
    for (let y = 0; y < size; y++) {
      result += finderLikePenalty((i) => modules[y][i], size);
    }
    for (let x = 0; x < size; x++) {
      result += finderLikePenalty((i) => modules[i][x], size);
    }

    // Rule 4: balance of dark and light modules.
    let dark = 0;
    for (const row of modules) for (const m of row) if (m) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  }
}

const MASK_FUNCTIONS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function runPenalty(get, size) {
  let result = 0;
  let runColor = get(0);
  let runLength = 1;
  for (let i = 1; i < size; i++) {
    const c = get(i);
    if (c === runColor) {
      runLength++;
    } else {
      if (runLength >= 5) result += 3 + (runLength - 5);
      runColor = c;
      runLength = 1;
    }
  }
  if (runLength >= 5) result += 3 + (runLength - 5);
  return result;
}

const FINDER_A = [true, false, true, true, true, false, true, false, false, false, false];
const FINDER_B = [false, false, false, false, true, false, true, true, true, false, true];

function finderLikePenalty(get, size) {
  let result = 0;
  for (let i = 0; i + 11 <= size; i++) {
    let matchA = true;
    let matchB = true;
    for (let k = 0; k < 11 && (matchA || matchB); k++) {
      const c = get(i + k);
      if (c !== FINDER_A[k]) matchA = false;
      if (c !== FINDER_B[k]) matchB = false;
    }
    if (matchA) result += 40;
    if (matchB) result += 40;
  }
  return result;
}

// ---------------------------------------------------------------------------

/**
 * Encode data into a QR code module matrix.
 *
 * @param {string|Uint8Array} data - Text (encoded as UTF-8 when needed) or raw bytes.
 * @param {object} [options]
 * @param {"L"|"M"|"Q"|"H"} [options.ecc="M"] - Error correction level.
 * @param {number} [options.minVersion=1]
 * @param {number} [options.maxVersion=40]
 * @param {number} [options.mask] - Force a mask pattern (0–7). Chosen automatically by default.
 * @returns {{version:number,size:number,ecc:string,mask:number,modules:boolean[][]}}
 */
export function encode(data, options = {}) {
  const ecc = (options.ecc ?? "M").toUpperCase();
  const ecl = ECC_LEVELS[ecc];
  if (!ecl) {
    throw new QRForgeError("INVALID_OPTION", `Invalid error correction level "${options.ecc}". Use L, M, Q or H.`);
  }
  if (data === undefined || data === null || (typeof data === "string" && data.length === 0)) {
    throw new QRForgeError("EMPTY_DATA", "QR code data must not be empty.");
  }
  const minVersion = options.minVersion ?? MIN_VERSION;
  const maxVersion = options.maxVersion ?? MAX_VERSION;
  if (
    !Number.isInteger(minVersion) ||
    !Number.isInteger(maxVersion) ||
    minVersion < MIN_VERSION ||
    maxVersion > MAX_VERSION ||
    minVersion > maxVersion
  ) {
    throw new QRForgeError("INVALID_OPTION", "minVersion/maxVersion must be integers between 1 and 40.");
  }
  if (options.mask !== undefined && !(Number.isInteger(options.mask) && options.mask >= 0 && options.mask <= 7)) {
    throw new QRForgeError("INVALID_OPTION", "mask must be an integer between 0 and 7.");
  }

  const segment = makeSegment(data);

  let version;
  let dataUsedBits;
  for (version = minVersion; ; version++) {
    const capacityBits = numDataCodewords(version, ecl) * 8;
    dataUsedBits = segmentBitLength(segment, version);
    if (dataUsedBits <= capacityBits) break;
    if (version >= maxVersion) {
      throw new QRForgeError(
        "DATA_TOO_LONG",
        `Data is too long for a QR code at error correction level ${ecc} ` +
          `(max ${byteCapacity(maxVersion, ecc)} bytes). Shorten the content or lower the error correction level.`,
      );
    }
  }

  const bits = [];
  appendBits(bits, segment.mode.bits, 4);
  appendBits(bits, segment.numChars, charCountBits(segment.mode, version));
  for (const b of segment.bits) bits.push(b);

  const capacityBits = numDataCodewords(version, ecl) * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(bits, pad, 8);

  const codewords = new Array(bits.length / 8).fill(0);
  bits.forEach((b, i) => {
    codewords[i >>> 3] |= b << (7 - (i & 7));
  });

  const matrix = new Matrix(version);
  matrix.drawFunctionPatterns();
  matrix.drawCodewords(addEccAndInterleave(codewords, version, ecl));

  let mask = options.mask;
  if (mask === undefined) {
    let minPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      matrix.applyMask(m);
      matrix.drawFormatBits(ecl, m);
      const penalty = matrix.penaltyScore();
      if (penalty < minPenalty) {
        mask = m;
        minPenalty = penalty;
      }
      matrix.applyMask(m); // XOR again to undo.
    }
  }
  matrix.applyMask(mask);
  matrix.drawFormatBits(ecl, mask);

  return {
    version,
    size: matrix.size,
    ecc,
    mask,
    modules: matrix.modules,
  };
}

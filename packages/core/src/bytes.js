/**
 * Small, isomorphic byte helpers (browser + Node.js ≥18) with no dependencies.
 */

import { QRForgeError } from "./errors.js";

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Decode a `data:` URL into its MIME type and bytes. */
export function parseDataURL(url) {
  const match = /^data:([^;,]*)(;[^,]*)?,(.*)$/s.exec(url);
  if (!match) throw new QRForgeError("INVALID_OPTION", "Expected a data: URL.");
  const mime = match[1] || "text/plain";
  const isBase64 = (match[2] || "").includes(";base64");
  const bytes = isBase64 ? base64ToBytes(match[3]) : new TextEncoder().encode(decodeURIComponent(match[3]));
  return { mime, bytes };
}

export function toDataURL(bytes, mime) {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

export function sniffImageMime(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return "application/octet-stream";
}

let crcTable;
export function crc32(bytes, start = 0, end = bytes.length) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipeThrough(bytes, stream) {
  if (typeof stream === "undefined") {
    throw new QRForgeError(
      "UNSUPPORTED_ENVIRONMENT",
      "CompressionStream is not available. QRForge needs Node.js 18+ or a modern browser for PNG/PDF output.",
    );
  }
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

/** zlib-wrapped deflate (RFC 1950), as required by PNG and PDF FlateDecode. */
export function deflate(bytes) {
  return pipeThrough(bytes, typeof CompressionStream === "undefined" ? undefined : new CompressionStream("deflate"));
}

export function inflate(bytes) {
  return pipeThrough(bytes, typeof DecompressionStream === "undefined" ? undefined : new DecompressionStream("deflate"));
}

export function concatBytes(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

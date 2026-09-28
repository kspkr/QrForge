import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, byteCapacity, QRForgeError } from "../src/index.js";
import { decodePixels, matrixToPixels } from "./helpers.js";

test("round-trips numeric, alphanumeric, byte and UTF-8 data at every ECC level", () => {
  const samples = [
    "0123456789",
    "HELLO WORLD $%*+-./:",
    "https://example.com/path?query=value#hash",
    "Grüße aus Köln — 日本語テキスト — 🚀",
    "a",
  ];
  for (const ecc of ["L", "M", "Q", "H"]) {
    for (const s of samples) {
      const m = encode(s, { ecc });
      assert.equal(decodePixels(matrixToPixels(m)), s, `ecc=${ecc} data=${s}`);
    }
  }
});

test("covers every version from 1 to 40", () => {
  for (let v = 1; v <= 40; v++) {
    const data = "x".repeat(byteCapacity(v, "L"));
    const m = encode(data, { ecc: "L" });
    assert.equal(m.version, v, `capacity boundary for version ${v}`);
    assert.equal(m.size, v * 4 + 17);
    // One more byte must not fit in the same version.
    if (v < 40) assert.equal(encode(`${data}x`, { ecc: "L" }).version, v + 1);
    if (v % 5 === 0 || v < 8) assert.equal(decodePixels(matrixToPixels(m, 2, 4)), data, `version ${v}`);
  }
});

test("every mask pattern produces a decodable code", () => {
  for (let mask = 0; mask < 8; mask++) {
    const m = encode("mask test", { mask });
    assert.equal(m.mask, mask);
    assert.equal(decodePixels(matrixToPixels(m)), "mask test");
  }
});

test("is deterministic", () => {
  const a = encode("https://qrforge.dev", { ecc: "Q" });
  const b = encode("https://qrforge.dev", { ecc: "Q" });
  assert.deepEqual(a, b);
});

test("honours minVersion", () => {
  assert.equal(encode("hi", { minVersion: 5 }).version, 5);
});

test("accepts raw bytes", () => {
  const m = encode(new Uint8Array([104, 105]));
  assert.equal(decodePixels(matrixToPixels(m)), "hi");
});

test("rejects invalid input with stable error codes", () => {
  assert.throws(() => encode(""), (e) => e instanceof QRForgeError && e.code === "EMPTY_DATA");
  assert.throws(() => encode("x", { ecc: "Z" }), (e) => e.code === "INVALID_OPTION");
  assert.throws(() => encode("x", { mask: 9 }), (e) => e.code === "INVALID_OPTION");
  assert.throws(() => encode("x", { minVersion: 0 }), (e) => e.code === "INVALID_OPTION");
  assert.throws(() => encode("x".repeat(3000), { ecc: "H" }), (e) => e.code === "DATA_TOO_LONG");
  assert.throws(() => encode("x".repeat(100), { maxVersion: 2 }), (e) => e.code === "DATA_TOO_LONG");
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";
import { decodePNG, encodePNG } from "@qrforge/core";

const BIN = fileURLToPath(new URL("../bin/qrforge.js", import.meta.url));
let dir;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "qrforge-cli-"));
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function cli(args, { input, env } = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: dir,
    input: Buffer.from(input ?? ""),
    env: { ...process.env, NO_COLOR: "1", QRFORGE_DEBUG: "", ...env },
    encoding: "buffer",
  });
  return {
    code: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    raw: result.stdout,
  };
}

async function decodeFile(name) {
  const image = await decodePNG(new Uint8Array(readFileSync(join(dir, name))));
  const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  return result?.data ?? null;
}

test("--version prints the package version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const flag of ["--version", "-v"]) {
    const r = cli([flag]);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), pkg.version);
  }
});

test("--help lists every command", () => {
  const r = cli(["--help"]);
  assert.equal(r.code, 0);
  for (const cmd of ["generate", "url", "text", "wifi", "vcard", "email", "sms", "phone", "location", "calendar, event"]) {
    assert.ok(r.stdout.includes(cmd), cmd);
  }
  assert.ok(r.stdout.includes("--output"));
});

test("command help via --help and help <command>", () => {
  const a = cli(["wifi", "--help"]);
  const b = cli(["help", "wifi"]);
  assert.equal(a.code, 0);
  assert.equal(a.stdout, b.stdout);
  assert.ok(a.stdout.includes("--ssid"));
  assert.ok(a.stdout.includes("--encryption"));
  assert.ok(cli(["help", "event"]).stdout.includes("--all-day"));
});

test("no arguments prints help and exits 1", () => {
  const r = cli([]);
  assert.equal(r.code, 1);
  assert.ok(r.stdout.includes("Usage:"));
});

const CASES = [
  [["generate", "https://example.com"], "https://example.com"],
  [["url", "example.com/menu"], "https://example.com/menu"],
  [["text", "Hello, world"], "Hello, world"],
  [["wifi", "--ssid", "Cafe", "--password", "espresso"], "WIFI:T:WPA;S:Cafe;P:espresso;;"],
  [["wifi", "--ssid", "Open", "--encryption", "nopass", "--hidden"], "WIFI:T:nopass;S:Open;H:true;;"],
  [
    ["vcard", "--first", "Ada", "--last", "Lovelace", "--email", "ada@example.com"],
    "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\nEMAIL;TYPE=INTERNET:ada@example.com\r\nEND:VCARD",
  ],
  [["email", "--to", "a@b.co", "--subject", "Hi there"], "mailto:a@b.co?subject=Hi%20there"],
  [["sms", "--phone", "+1 555 123 4567", "--message", "JOIN"], "SMSTO:+15551234567:JOIN"],
  [["phone", "+15550001111"], "tel:+15550001111"],
  [["location", "--lat", "48.8584", "--lng", "2.2945"], "geo:48.8584,2.2945"],
  [["location", "--address", "Paris", "--map", "osm"], "https://www.openstreetmap.org/search?query=Paris"],
  [
    ["event", "--title", "Launch", "--start", "2026-05-01T18:00:00Z"],
    "BEGIN:VEVENT\r\nSUMMARY:Launch\r\nDTSTART:20260501T180000Z\r\nEND:VEVENT",
  ],
];

test("every command encodes the expected payload (decoded from PNG)", async () => {
  for (const [i, [args, expected]] of CASES.entries()) {
    const file = `case-${i}.png`;
    const r = cli([...args, "-o", file]);
    assert.equal(r.code, 0, `${args.join(" ")}: ${r.stderr}`);
    assert.ok(r.stdout.includes("Saved PNG"), r.stdout);
    assert.equal(await decodeFile(file), expected, args.join(" "));
  }
});

test("SVG and PDF file outputs", () => {
  let r = cli(["generate", "https://example.com", "--output", "qr.svg"]);
  assert.equal(r.code, 0, r.stderr);
  const svg = readFileSync(join(dir, "qr.svg"), "utf8");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

  r = cli(["url", "example.com", "-o", "qr.pdf", "--label", "Scan me", "--page-size", "A4"]);
  assert.equal(r.code, 0, r.stderr);
  const pdf = readFileSync(join(dir, "qr.pdf"), "latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.includes("/MediaBox [0 0 595.28 841.89]"));
});

test("--format without --output writes qrcode.<ext>", () => {
  const r = cli(["generate", "hello", "--format", "pdf"]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(join(dir, "qrcode.pdf")));
});

test("--output - writes to stdout", async () => {
  const svg = cli(["generate", "hello", "--output", "-"]);
  assert.equal(svg.code, 0);
  assert.match(svg.stdout, /^<svg[\s\S]*<\/svg>$/);

  const png = cli(["generate", "hello", "--format", "png", "-o", "-"]);
  assert.equal(png.code, 0);
  const image = await decodePNG(new Uint8Array(png.raw));
  assert.equal(jsQR(new Uint8ClampedArray(image.data), image.width, image.height).data, "hello");
});

test("styling options, presets and transparency are applied", async () => {
  let r = cli(["generate", "styled", "-o", "styled.svg", "--fg", "#123456", "--style", "dots", "--corner", "circle", "--corner-dot", "circle"]);
  assert.equal(r.code, 0, r.stderr);
  const svg = readFileSync(join(dir, "styled.svg"), "utf8");
  assert.ok(svg.includes('fill="#123456"'));

  r = cli(["generate", "preset", "-o", "preset.png", "--preset", "modern", "--size", "400"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(await decodeFile("preset.png"), "preset");

  r = cli(["generate", "clear", "-o", "clear.png", "--transparent"]);
  assert.equal(r.code, 0);
  const image = await decodePNG(new Uint8Array(readFileSync(join(dir, "clear.png"))));
  assert.equal(image.data[3], 0);
  assert.ok(r.stderr.includes("Transparent background"));
});

test("PNG logo from a file", async () => {
  const pixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) pixels.set([220, 38, 38, 255], i * 4);
  writeFileSync(join(dir, "logo.png"), await encodePNG({ width: 16, height: 16, data: pixels }));
  const r = cli(["url", "example.com", "--logo", "logo.png", "-o", "logo-qr.png", "--size", "400"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(await decodeFile("logo-qr.png"), "https://example.com");

  const missing = cli(["url", "example.com", "--logo", "nope.png", "-o", "x.png"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /file not found/);
});

test("reliability warnings are printed to stderr", () => {
  const r = cli(["generate", "hi", "-o", "low.svg", "--fg", "#cccccc"]);
  assert.equal(r.code, 0);
  assert.match(r.stderr, /low contrast/i);
});

test("missing fields fail with a clear message when not interactive", () => {
  let r = cli(["wifi", "--ssid", "Cafe", "-o", "x.png"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Missing required option: --password/);

  r = cli(["calendar"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--title, --start/);

  r = cli(["location"]);
  assert.match(r.stderr, /--lat and --lng, or --address/);

  r = cli(["generate"]);
  assert.match(r.stderr, /<data>/);
});

test("invalid input exits 1 with a clean error", () => {
  const cases = [
    [["frobnicate"], /Unknown command "frobnicate"/],
    [["url", "example.com", "--bogus"], /Unknown option '--bogus'/],
    [["generate", "x", "--format", "gif"], /Unknown format "gif"/],
    [["generate", "x", "-o", "file.jpg"], /Cannot infer the format/],
    [["generate", "x", "-o", "x.svg", "--ecc", "Z"], /ecc must be one of/],
    [["generate", "x", "-o", "x.svg", "--fg", "red"], /foreground must be a hex colour/],
    [["generate", "x", "-o", "x.svg", "--preset", "neon"], /Unknown preset "neon"/],
    [["generate", "x", "-o", "x.png", "--label", "Hi"], /Text labels in PNG output need a browser/],
    [["email", "--to", "not-an-email", "-o", "x.svg"], /not a valid email/],
    [["url", "javascript:alert(1)", "-o", "x.svg"], /Only http/],
    [["generate", "a", "b"], /Too many arguments/],
    [["wifi", "extra"], /Unexpected argument "extra"/],
    [["generate", "x", "-o", "x.svg", "--page-size", "A4"], /only applies to PDF/],
  ];
  for (const [args, pattern] of cases) {
    const r = cli(args);
    assert.equal(r.code, 1, args.join(" "));
    assert.match(r.stderr, pattern, args.join(" "));
    assert.ok(!r.stderr.includes("    at "), "no stack trace");
  }
});

test("terminal preview renders a square block of half-block characters", () => {
  const r = cli(["url", "example.com"]);
  assert.equal(r.code, 0);
  const lines = r.stdout.split("\n");
  // Version 2 with a 2-module quiet zone: 29 columns, ceil(29 / 2) = 15 rows.
  const art = lines.slice(0, 15);
  assert.ok(art.every((l) => [...l].length === 29), "every row is 29 cells wide");
  assert.ok(art.every((l) => /^[█▀▄ ]+$/.test(l)));
  assert.match(lines[15], /^url · version 2 \(25×25\) · ecc M$/);
  assert.equal(lines[16], "https://example.com");
});

test("terminal preview masks Wi-Fi passwords", () => {
  const r = cli(["wifi", "--ssid", "Cafe", "--password", "topsecret"]);
  assert.equal(r.code, 0);
  assert.ok(!r.stdout.includes("topsecret"));
  assert.ok(r.stdout.includes("P:••••••"));
});

test("colour output uses ANSI codes only when allowed", () => {
  const r = cli(["text", "hi"], { env: { NO_COLOR: "1" } });
  assert.ok(!r.stdout.includes("\x1b["));
});

test("generate - reads data from stdin", () => {
  const r = cli(["generate", "-", "-o", "-"], { input: "from stdin\n" });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^<svg/);
});

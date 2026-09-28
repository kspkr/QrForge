// Generate QR codes as SVG, PNG and PDF files with @qrforge/core.
// Everything runs locally — no network access, no API keys.
import { writeFile, mkdir } from "node:fs/promises";
import { generateQR, analyzeReliability, wifi } from "@qrforge/core";

await mkdir("out", { recursive: true });

// 1. A plain URL as SVG (returned as a string).
const svg = await generateQR({ data: "https://example.com", format: "svg" });
await writeFile("out/website.svg", svg);

// 2. A styled PNG (returned as a Uint8Array).
const png = await generateQR({
  data: "https://example.com",
  format: "png",
  size: 1024,
  moduleStyle: "rounded",
  cornerStyle: "rounded",
  cornerDotStyle: "rounded",
  foreground: "#0f172a",
});
await writeFile("out/website.png", png);

// 3. A Wi-Fi code as a print-ready A4 PDF with a label.
const payload = wifi({ ssid: "Cafe Guest", password: "espresso123" });
const pdf = await generateQR({
  data: payload,
  format: "pdf",
  pageSize: "A4",
  ecc: "Q",
  label: "Scan to join Wi-Fi",
  frame: { style: "banner", color: "#0a0a0a" },
});
await writeFile("out/wifi.pdf", pdf);

// 4. Structured types can also be passed directly with `type`.
const vcardSvg = await generateQR({
  type: "vcard",
  data: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
  format: "svg",
});
await writeFile("out/contact.svg", vcardSvg);

// Check how reliably a design will scan before printing.
const report = analyzeReliability({ data: "https://example.com", foreground: "#cccccc" });
console.log(`Reliability of a light-grey design: ${report.level}`);
for (const w of report.warnings) console.log(`  - [${w.severity}] ${w.message}`);

console.log("Wrote out/website.svg, out/website.png, out/wifi.pdf and out/contact.svg");

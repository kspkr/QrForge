// Create a dynamic QR code on your QRForge server and print its analytics.
//
//   QRFORGE_URL=http://localhost QRFORGE_API_KEY=qrf_... node index.js
import { writeFile } from "node:fs/promises";
import { QRForge, QRForgeAPIError } from "@qrforge/sdk";
import { generateQR } from "@qrforge/core";

const { QRFORGE_URL, QRFORGE_API_KEY } = process.env;
if (!QRFORGE_URL || !QRFORGE_API_KEY) {
  console.error("Set QRFORGE_URL and QRFORGE_API_KEY (create a key under Dashboard → API keys).");
  process.exit(1);
}

const client = new QRForge({ baseUrl: QRFORGE_URL, apiKey: QRFORGE_API_KEY });

try {
  // 1. Create a dynamic code that redirects to a destination you can change later.
  const qr = await client.qrcodes.create({
    name: "SDK example",
    kind: "dynamic",
    destination: "https://example.com",
    utm: { source: "sdk-example", medium: "qr" },
  });
  console.log(`Created ${qr.id} → ${qr.redirect_url}`);

  // 2. Render the printable code locally. It encodes the short redirect URL.
  await writeFile("qrcode.svg", await generateQR({ data: qr.redirect_url, format: "svg" }));
  console.log("Saved qrcode.svg");

  // 3. Change where it points — the printed code keeps working.
  await client.qrcodes.update(qr.id, { destination: "https://example.com/new" });

  // 4. Read anonymous analytics for the last 30 days.
  const stats = await client.qrcodes.analytics(qr.id, { range: "30d" });
  console.log(`Total scans: ${stats.totals.total_scans} (unique ${stats.totals.unique_scans})`);

  // 5. Iterate over every code in your account.
  let count = 0;
  for await (const code of client.qrcodes.listAll()) {
    count++;
    console.log(`  ${code.kind.padEnd(7)} ${code.name}`);
  }
  console.log(`${count} codes in total`);
} catch (error) {
  if (error instanceof QRForgeAPIError) {
    console.error(`API error ${error.status} (${error.code}): ${error.message}`);
    if (error.fields) console.error(error.fields);
    process.exit(1);
  }
  throw error;
}

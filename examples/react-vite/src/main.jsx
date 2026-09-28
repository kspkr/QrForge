import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QRCode, QRDownloadButton, useQRCode } from "@qrforge/react";

function App() {
  const [value, setValue] = useState("https://example.com");
  const [preset, setPreset] = useState("modern");
  const ref = useRef(null);
  // The hook exposes the scan-reliability analysis for the current options.
  const { reliability } = useQRCode({ value, preset });

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "48px auto", padding: 16 }}>
      <h1>QRForge + React</h1>

      <label style={{ display: "block", marginBottom: 12 }}>
        Content{" "}
        <input value={value} onChange={(e) => setValue(e.target.value)} style={{ width: "100%" }} />
      </label>

      <label style={{ display: "block", marginBottom: 24 }}>
        Preset{" "}
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {["minimal", "business", "modern", "rounded", "dark", "elegant"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>

      {/* Renders inline SVG, generated locally in the browser. */}
      <QRCode ref={ref} value={value} size={300} preset={preset} label="SCAN ME" fallback={<p>Enter some content.</p>} />

      <p>Reliability: {reliability?.level ?? "—"}</p>

      <div style={{ display: "flex", gap: 8 }}>
        <QRDownloadButton value={value} preset={preset} format="png" size={1024} filename="my-qr">
          Download PNG
        </QRDownloadButton>
        <QRDownloadButton value={value} preset={preset} format="svg" filename="my-qr">
          Download SVG
        </QRDownloadButton>
        <button type="button" onClick={() => ref.current?.download("pdf", "my-qr")}>
          Download PDF (via ref)
        </button>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

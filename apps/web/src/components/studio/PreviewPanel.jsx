import { useState } from "react";
import { Download, Copy, Check, Lock, ShieldCheck, TriangleAlert, CircleAlert, Info, ChevronDown, ScanLine } from "lucide-react";
import { QRCode, useQRCode, downloadQR } from "@qrforge/react";
import { toPNG, toSVG } from "@qrforge/core";
import { Button } from "../ui/Button.jsx";
import { Segmented } from "../ui/controls.jsx";
import { Select } from "../ui/Field.jsx";
import { Menu, useToast } from "../ui/overlay.jsx";
import { cx } from "../../lib/cx.js";

const EXPORT_SIZES = [256, 512, 1024, 2048, 4096];

function ReliabilityBadge({ reliability }) {
  const [open, setOpen] = useState(false);
  if (!reliability) return null;
  const meta = {
    good: { label: "Scans reliably", icon: ShieldCheck, cls: "text-emerald-600 dark:text-emerald-400" },
    fair: { label: "Check before printing", icon: TriangleAlert, cls: "text-amber-600 dark:text-amber-400" },
    poor: { label: "May not scan", icon: CircleAlert, cls: "text-red-600 dark:text-red-400" },
  }[reliability.level];
  const Icon = meta.icon;
  const issues = reliability.warnings;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => issues.length && setOpen((o) => !o)}
        aria-expanded={issues.length ? open : undefined}
        className={cx("flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]", !issues.length && "cursor-default")}
      >
        <Icon className={cx("h-4 w-4 shrink-0", meta.cls)} />
        <span className={cx("font-medium", meta.cls)}>{meta.label}</span>
        <span className="muted ml-auto text-xs tabular-nums">
          v{reliability.version} · {reliability.modules}×{reliability.modules}
        </span>
        {issues.length > 0 && <ChevronDown className={cx("h-3.5 w-3.5 text-zinc-400 transition-transform", open && "rotate-180")} />}
      </button>
      {open && issues.length > 0 && (
        <ul className="animate-fade-in space-y-2 border-t border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          {issues.map((w) => {
            const WIcon = w.severity === "danger" ? CircleAlert : w.severity === "warning" ? TriangleAlert : Info;
            const color = w.severity === "danger" ? "text-red-500" : w.severity === "warning" ? "text-amber-500" : "text-sky-500";
            return (
              <li key={w.code} className="flex gap-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                <WIcon className={cx("mt-0.5 h-3.5 w-3.5 shrink-0", color)} />
                {w.message}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Live preview with export controls. `options` are @qrforge/core options
 * (without size); `data` is the encoded payload or null when the form is incomplete.
 */
export function PreviewPanel({ data, options, error, filename = "qrcode", footer, compact = false, exportable = true }) {
  const toast = useToast();
  const [format, setFormat] = useState("png");
  const [size, setSize] = useState(1024);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const previewOptions = { ...options, value: data ?? "", size: 640 };
  const { reliability, error: renderError } = useQRCode(previewOptions);
  const ready = !!data && !renderError;

  const exportOptions = { ...options, data, size };

  const download = async () => {
    setBusy(true);
    try {
      await downloadQR(exportOptions, { format, filename });
    } catch (e) {
      toast.error("Export failed", { description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const copySVG = async () => {
    try {
      await navigator.clipboard.writeText(toSVG(exportOptions));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("SVG copied to clipboard");
    } catch (e) {
      toast.error("Couldn't copy", { description: e.message });
    }
  };

  const copyPNG = async () => {
    try {
      if (typeof ClipboardItem === "undefined") throw new Error("Your browser can't copy images.");
      const bytes = await toPNG(exportOptions);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
      toast.success("Image copied to clipboard");
    } catch (e) {
      toast.error("Couldn't copy", { description: e.message });
    }
  };

  const message = error?.message ?? (data ? renderError?.message : null);

  return (
    <div className="surface overflow-hidden">
      <div className={cx("preview-grid relative flex items-center justify-center bg-zinc-50/60 dark:bg-zinc-950/40", compact ? "p-6" : "p-8 sm:p-10")}>
        <div
          className={cx(
            "relative w-full max-w-[320px] transition-opacity duration-200",
            options.background === "transparent" && "checkerboard rounded-lg",
            !ready && "opacity-25 blur-[1.5px]",
          )}
        >
          {ready ? (
            <QRCode {...previewOptions} className="h-auto w-full rounded-lg drop-shadow-sm" title="QR code preview" />
          ) : (
            <QRCode value="https://qrforge.dev/placeholder" size={640} {...options} logo={null} label={null} frame={null} className="h-auto w-full rounded-lg" aria-hidden="true" />
          )}
        </div>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="flex max-w-[260px] items-start gap-2 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95">
              <ScanLine className="mt-px h-4 w-4 shrink-0 text-zinc-400" />
              <span>{message || "Fill in the details to generate your code."}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-800/80">
        {ready && <ReliabilityBadge reliability={reliability} />}

        {exportable && (
        <>
        <div className="flex gap-2">
          <Segmented
            label="Export format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "png", label: "PNG" },
              { value: "svg", label: "SVG" },
              { value: "pdf", label: "PDF" },
            ]}
          />
          {format === "png" && (
            <div className="w-28 shrink-0">
              <Select aria-label="PNG size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {EXPORT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} px
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="accent" size="lg" className="flex-1 justify-center" onClick={download} disabled={!ready} loading={busy}>
            {!busy && <Download className="h-4 w-4" />}
            Download {format.toUpperCase()}
          </Button>
          <Menu
            label="Copy"
            items={[
              { label: "Copy as SVG", icon: copied ? Check : Copy, onSelect: copySVG },
              { label: "Copy as image", icon: Copy, onSelect: copyPNG },
            ]}
            trigger={(props) => (
              <Button variant="secondary" size="lg" className="px-3.5" disabled={!ready} {...props}>
                <Copy className="h-4 w-4" />
              </Button>
            )}
          />
        </div>

        <p className="muted flex items-center justify-center gap-1.5 pt-0.5 text-xs">
          <Lock className="h-3 w-3" />
          Generated locally. Your QR data never leaves your browser.
        </p>
        </>
        )}
        {footer}
      </div>
    </div>
  );
}

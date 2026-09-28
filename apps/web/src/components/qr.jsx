import { QRCode, downloadQR } from "@qrforge/react";
import { Zap, Box } from "lucide-react";
import { designToOptions } from "../lib/design.js";
import { QR_TYPE_MAP } from "../lib/qrTypes.js";
import { Badge } from "./ui/controls.jsx";

/** Core rendering options for a saved QR code. */
export function qrOptions(qr, overrides) {
  return { data: qr.content, ...designToOptions(qr.design), ...overrides };
}

export function QRThumb({ qr, size = 40 }) {
  const opts = designToOptions(qr.design);
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-zinc-200 dark:ring-zinc-700"
      style={{ width: size, height: size }}
    >
      <QRCode
        value={qr.content}
        size={size * 3}
        {...opts}
        logo={null}
        label={null}
        frame={null}
        margin={1}
        className="h-full w-full"
        aria-hidden="true"
      />
    </span>
  );
}

export function StatusBadge({ qr }) {
  const expired = qr.expires_at && new Date(qr.expires_at) < new Date();
  if (qr.admin_locked) return <Badge tone="danger" dot>Locked</Badge>;
  if (qr.status === "disabled") return <Badge tone="neutral" dot>Disabled</Badge>;
  if (expired) return <Badge tone="warning" dot>Expired</Badge>;
  return <Badge tone="success" dot>Active</Badge>;
}

export function KindBadge({ qr }) {
  return qr.kind === "dynamic" ? (
    <Badge tone="accent">
      <Zap className="h-3 w-3" /> Dynamic
    </Badge>
  ) : (
    <Badge tone="neutral">
      <Box className="h-3 w-3" /> {QR_TYPE_MAP[qr.qr_type]?.label ?? "Static"}
    </Badge>
  );
}

export function downloadSaved(qr, format, size = 1024) {
  const safe = qr.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "qrcode";
  return downloadQR(qrOptions(qr, { size }), { format, filename: safe });
}

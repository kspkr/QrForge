import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDate, formatNumber } from "../../lib/format.js";
import { Button } from "../../components/ui/Button.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Segmented } from "../../components/ui/controls.jsx";
import { Alert, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { Dialog, useToast } from "../../components/ui/overlay.jsx";
import { KindBadge, StatusBadge } from "../../components/qr.jsx";
import { Pager, useDebounced } from "./AdminUsers.jsx";

export default function AdminCodes() {
  useDocumentTitle("QR codes · Admin");
  const toast = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const { data, error, loading, reload } = useAsync(() => api.get("/admin/qrcodes", { page, per_page: 20, q: query, status }), [page, query, status]);
  const [disabling, setDisabling] = useState(null);
  const [reason, setReason] = useState("");

  const update = async (qr, body, message) => {
    try {
      await api.patch(`/admin/qrcodes/${qr.id}`, body);
      toast.success(message);
      reload();
    } catch (e) {
      toast.error("Couldn't update", { description: e.message });
    }
  };

  return (
    <div>
      <PageHeader title="QR codes" description="Every code on this server. Disabling a code here locks it — the owner can't re-enable it." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Search name, slug, destination or owner" className="pl-9" aria-label="Search codes" />
        </div>
        <div className="sm:w-64">
          <Segmented
            size="sm"
            label="Status"
            value={status}
            onChange={(v) => (setStatus(v), setPage(1))}
            options={[
              { value: "", label: "All" },
              { value: "active", label: "Active" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
        </div>
      </div>
      {error && <Alert tone="danger">{error.message}</Alert>}
      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-3 py-2.5 font-medium">Owner</th>
                <th className="px-3 py-2.5 font-medium">Destination</th>
                <th className="px-3 py-2.5 text-right font-medium">Scans</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((qr) => (
                <tr key={qr.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{qr.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <KindBadge qr={qr} />
                      {qr.slug && <span className="muted font-mono text-xs">/r/{qr.slug}</span>}
                    </div>
                  </td>
                  <td className="muted px-3 py-2.5 text-xs">{qr.owner_email}</td>
                  <td className="max-w-[240px] px-3 py-2.5">
                    <span className="block truncate text-xs" title={qr.destination ?? qr.content}>
                      {qr.destination ?? qr.content}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(qr.scan_count)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge qr={qr} />
                  </td>
                  <td className="muted px-3 py-2.5">{formatDate(qr.created_at)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {qr.status === "active" ? (
                      <Button size="xs" variant="danger-ghost" onClick={() => (setReason(""), setDisabling(qr))}>
                        Disable
                      </Button>
                    ) : (
                      <Button size="xs" variant="ghost" onClick={() => update(qr, { status: "active" }, "Code re-enabled")}>
                        Enable
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={data?.pagination.total ?? 0} onChange={setPage} />

      <Dialog
        open={!!disabling}
        onClose={() => setDisabling(null)}
        title={`Disable “${disabling?.name}”?`}
        description="Scanners will see a “disabled” page. The owner is shown your reason and can't re-enable the code."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisabling(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await update(disabling, { status: "disabled", disabled_reason: reason.trim() || undefined }, "Code disabled");
                setDisabling(null);
              }}
            >
              Disable code
            </Button>
          </>
        }
      >
        <Field label="Reason" optional>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Phishing destination" maxLength={200} data-autofocus />
        </Field>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { Flag } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDateTime } from "../../lib/format.js";
import { Button } from "../../components/ui/Button.jsx";
import { Badge, Segmented } from "../../components/ui/controls.jsx";
import { Alert, EmptyState, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { useToast } from "../../components/ui/overlay.jsx";
import { Pager } from "./AdminUsers.jsx";

const REASON_LABELS = { phishing: "Phishing", malware: "Malware", spam: "Spam", illegal: "Illegal", other: "Other" };

export default function AdminReports() {
  useDocumentTitle("Abuse reports · Admin");
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => api.get("/admin/abuse-reports", { status, page, per_page: 20 }), [status, page]);
  const [busy, setBusy] = useState(null);

  const resolve = async (report, body, message) => {
    setBusy(report.id);
    try {
      await api.patch(`/admin/abuse-reports/${report.id}`, body);
      toast.success(message);
      reload();
    } catch (e) {
      toast.error("Couldn't update report", { description: e.message });
    } finally {
      setBusy(null);
    }
  };

  const rows = data?.data ?? [];
  return (
    <div>
      <PageHeader title="Abuse reports" description="Reports submitted from the public report form and redirect pages." />
      <div className="mb-4 max-w-sm">
        <Segmented
          size="sm"
          label="Report status"
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          options={[
            { value: "open", label: "Open" },
            { value: "resolved", label: "Resolved" },
            { value: "dismissed", label: "Dismissed" },
          ]}
        />
      </div>
      {error && <Alert tone="danger">{error.message}</Alert>}
      {loading && !data ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <div className="surface">
          <EmptyState icon={Flag} title={status === "open" ? "No open reports" : `No ${status} reports`} description="Nice and quiet." />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{REASON_LABELS[r.reason] ?? r.reason}</Badge>
                    <code className="font-mono text-sm">/r/{r.slug}</code>
                    {!r.qrcode_id && <span className="muted text-xs">(no matching code)</span>}
                  </div>
                  {r.details && <p className="mt-2 text-sm break-words whitespace-pre-wrap">{r.details}</p>}
                  <p className="muted mt-2 text-xs">
                    {formatDateTime(r.created_at)}
                    {r.reporter_email ? ` · from ${r.reporter_email}` : " · anonymous"}
                  </p>
                </div>
                {r.status === "open" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => resolve(r, { status: "dismissed" }, "Report dismissed")}>
                      Dismiss
                    </Button>
                    {r.qrcode_id && (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy === r.id}
                        onClick={() => resolve(r, { status: "resolved", disable_qrcode: true }, "Code disabled and report resolved")}
                      >
                        Disable code
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => resolve(r, { status: "resolved" }, "Report resolved")}>
                      Resolve
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={data?.pagination.total ?? 0} onChange={setPage} />
    </div>
  );
}

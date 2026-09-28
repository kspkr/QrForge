import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  Plus,
  Search,
  QrCode,
  MoreHorizontal,
  Eye,
  Pencil,
  CopyPlus,
  Download,
  ChartColumn,
  Power,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Palette,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDate, formatNumber, hostOf } from "../../lib/format.js";
import { PageHeader, EmptyState, Skeleton, Alert } from "../../components/ui/misc.jsx";
import { Button, ButtonLink } from "../../components/ui/Button.jsx";
import { Input, Select } from "../../components/ui/Field.jsx";
import { Segmented } from "../../components/ui/controls.jsx";
import { Menu, ConfirmDialog, useToast } from "../../components/ui/overlay.jsx";
import { QRThumb, StatusBadge, KindBadge, downloadSaved } from "../../components/qr.jsx";

const PER_PAGE = 20;

export function useCodeActions(reload) {
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actionsFor = (qr) => [
    { label: "View", icon: Eye, onSelect: () => navigate(`/app/codes/${qr.id}`) },
    { label: "Edit", icon: Pencil, onSelect: () => navigate(`/app/codes/${qr.id}?tab=settings`) },
    {
      label: "Duplicate",
      icon: CopyPlus,
      onSelect: async () => {
        try {
          const copy = await api.post(`/qrcodes/${qr.id}/duplicate`);
          toast.success("Code duplicated");
          navigate(`/app/codes/${copy.id}`);
        } catch (e) {
          toast.error("Couldn't duplicate", { description: e.message });
        }
      },
    },
    {
      label: "Download PNG",
      icon: Download,
      onSelect: () => downloadSaved(qr, "png").catch((e) => toast.error("Export failed", { description: e.message })),
    },
    {
      label: "Download SVG",
      icon: Download,
      onSelect: () => downloadSaved(qr, "svg").catch((e) => toast.error("Export failed", { description: e.message })),
    },
    ...(qr.kind === "dynamic"
      ? [{ label: "Analytics", icon: ChartColumn, onSelect: () => navigate(`/app/codes/${qr.id}?tab=analytics`) }]
      : []),
    {
      label: qr.status === "active" ? "Disable" : "Enable",
      icon: Power,
      disabled: qr.admin_locked,
      onSelect: async () => {
        try {
          await api.patch(`/qrcodes/${qr.id}`, { status: qr.status === "active" ? "disabled" : "active" });
          toast.success(qr.status === "active" ? "Code disabled" : "Code enabled");
          reload();
        } catch (e) {
          toast.error("Couldn't update", { description: e.message });
        }
      },
    },
    { separator: true },
    { label: "Delete", icon: Trash2, tone: "danger", onSelect: () => setConfirmDelete(qr) },
  ];

  const dialog = (
    <ConfirmDialog
      open={!!confirmDelete}
      onClose={() => setConfirmDelete(null)}
      title={`Delete “${confirmDelete?.name}”?`}
      description={
        confirmDelete?.kind === "dynamic"
          ? "Printed copies of this code will stop working, and its analytics are deleted. This can't be undone."
          : "This removes it from your dashboard. Printed copies keep working. This can't be undone."
      }
      confirmLabel="Delete"
      loading={deleting}
      onConfirm={async () => {
        setDeleting(true);
        try {
          await api.del(`/qrcodes/${confirmDelete.id}`);
          toast.success("Code deleted");
          setConfirmDelete(null);
          reload();
        } catch (e) {
          toast.error("Couldn't delete", { description: e.message });
        } finally {
          setDeleting(false);
        }
      }}
    />
  );
  return { actionsFor, dialog };
}

export default function Codes() {
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") ?? "";
  const page = Number(params.get("page") ?? 1);
  const campaign = params.get("campaign_id") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  useDocumentTitle(kind === "dynamic" ? "Dynamic codes" : "QR codes");

  // Debounce search into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) {
        const next = new URLSearchParams(params);
        if (q) next.set("q", q);
        else next.delete("q");
        next.delete("page");
        setParams(next, { replace: true });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, params, setParams]);

  const { data, error, loading, reload } = useAsync(
    () => api.get("/qrcodes", { page, per_page: PER_PAGE, kind, q: params.get("q"), campaign_id: campaign, sort: "-created_at" }),
    [page, kind, params.get("q"), campaign],
  );
  const campaigns = useAsync(() => api.get("/campaigns", { per_page: 100 }), []);
  const { actionsFor, dialog } = useCodeActions(reload);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const total = data?.pagination.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows = data?.data ?? [];
  const filtered = !!(kind || params.get("q") || campaign);

  return (
    <div>
      <PageHeader
        title={kind === "dynamic" ? "Dynamic codes" : "QR codes"}
        description="Every code you've saved or created on this server."
        actions={
          <>
            <ButtonLink to="/studio" variant="secondary" size="sm">
              <Palette className="h-3.5 w-3.5" /> Static code
            </ButtonLink>
            <ButtonLink to="/app/codes/new" variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" /> Dynamic code
            </ButtonLink>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="md:w-72">
          <Segmented
            size="sm"
            label="Filter by kind"
            value={kind}
            onChange={(v) => setParam("kind", v)}
            options={[
              { value: "", label: "All" },
              { value: "dynamic", label: "Dynamic" },
              { value: "static", label: "Static" },
            ]}
          />
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, slug or destination" className="pl-9" aria-label="Search codes" />
        </div>
        <div className="md:w-52">
          <Select aria-label="Filter by campaign" value={campaign} onChange={(e) => setParam("campaign_id", e.target.value)}>
            <option value="">All campaigns</option>
            {(campaigns.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <Alert tone="danger">{error.message}</Alert>}

      <div className="surface overflow-hidden">
        {!data && loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={QrCode}
            title={filtered ? "No matching codes" : "No QR codes yet"}
            description={
              filtered
                ? "Try a different search or filter."
                : "Create a dynamic code you can edit after printing, or save a static one from the Studio."
            }
            action={
              !filtered && (
                <ButtonLink to="/app/codes/new" variant="primary" size="sm">
                  <Plus className="h-3.5 w-3.5" /> Create dynamic code
                </ButtonLink>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Destination</th>
                  <th className="px-3 py-2.5 text-right font-medium">Scans</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={loading ? "opacity-60" : ""}>
                {rows.map((qr) => (
                  <tr key={qr.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/70 dark:border-zinc-800/60 dark:hover:bg-zinc-900/40">
                    <td className="px-4 py-2.5">
                      <Link to={`/app/codes/${qr.id}`} className="flex items-center gap-3">
                        <QRThumb qr={qr} size={36} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:underline">{qr.name}</span>
                          {qr.slug && <span className="muted block font-mono text-xs">/r/{qr.slug}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <KindBadge qr={qr} />
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <span className="muted block truncate" title={qr.destination ?? qr.content}>
                        {qr.kind === "dynamic" ? hostOf(qr.destination) : qr.content.split(/\r?\n/)[0]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qr.kind === "dynamic" ? formatNumber(qr.scan_count) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge qr={qr} />
                    </td>
                    <td className="muted px-3 py-2.5 whitespace-nowrap">{formatDate(qr.created_at)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Menu
                        label={`Actions for ${qr.name}`}
                        items={actionsFor(qr)}
                        trigger={(props) => (
                          <Button variant="ghost" size="icon-sm" {...props}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="muted">
            {formatNumber((page - 1) * PER_PAGE + 1)}–{formatNumber(Math.min(page * PER_PAGE, total))} of {formatNumber(total)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}

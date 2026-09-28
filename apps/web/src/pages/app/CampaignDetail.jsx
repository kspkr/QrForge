import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Pencil, Trash2, Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatNumber } from "../../lib/format.js";
import { AnalyticsPanel } from "../../components/AnalyticsPanel.jsx";
import { BarList } from "../../components/charts/charts.jsx";
import { QRThumb, StatusBadge } from "../../components/qr.jsx";
import { Button, ButtonLink } from "../../components/ui/Button.jsx";
import { Alert, EmptyState, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { ConfirmDialog, useToast } from "../../components/ui/overlay.jsx";
import { CampaignDialog } from "./Campaigns.jsx";

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: campaign, error, loading, setData } = useAsync(() => api.get(`/campaigns/${id}`), [id]);
  const codes = useAsync(() => api.get("/qrcodes", { campaign_id: id, per_page: 100 }), [id]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useDocumentTitle(campaign?.name ?? "Campaign");

  if (error) return <Alert tone="danger">{error.status === 404 ? "Campaign not found." : error.message}</Alert>;
  if (loading && !campaign) return <Skeleton className="h-96" />;
  const rows = codes.data?.data ?? [];

  return (
    <div>
      <Link to="/app/campaigns" className="muted mb-4 inline-flex items-center gap-1 text-sm hover:text-zinc-900 dark:hover:text-zinc-100">
        <ArrowLeft className="h-3.5 w-3.5" /> Campaigns
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full" style={{ background: campaign.color ?? "#71717a" }} />
            {campaign.name}
          </span>
        }
        description={campaign.description || `${formatNumber(campaign.qr_count)} codes in this campaign.`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </>
        }
      />

      <AnalyticsPanel path={`/campaigns/${id}/analytics`}>
        {(data) => (
          <div className="surface p-4">
            <BarList title="By code" items={(data.per_qrcode ?? []).map((q) => ({ name: q.name, count: q.scans }))} />
          </div>
        )}
      </AnalyticsPanel>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Codes</h2>
          <ButtonLink to="/app/codes/new" size="xs" variant="ghost">
            <Plus className="h-3.5 w-3.5" /> Add code
          </ButtonLink>
        </div>
        {rows.length === 0 ? (
          <div className="surface">
            <EmptyState title="No codes in this campaign" description="Assign codes from their Settings tab, or pick this campaign when creating one." />
          </div>
        ) : (
          <ul className="surface divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {rows.map((qr) => (
              <li key={qr.id}>
                <Link to={`/app/codes/${qr.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40">
                  <QRThumb qr={qr} size={34} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{qr.name}</span>
                  <span className="muted text-xs tabular-nums">{formatNumber(qr.scan_count)} scans</span>
                  <StatusBadge qr={qr} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CampaignDialog key={editOpen ? "open" : "closed"} open={editOpen} onClose={() => setEditOpen(false)} campaign={campaign} onSaved={setData} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this campaign?"
        description="Its codes are kept and keep working; they're just no longer grouped."
        confirmLabel="Delete campaign"
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await api.del(`/campaigns/${id}`);
            toast.success("Campaign deleted");
            navigate("/app/campaigns");
          } catch (e) {
            toast.error("Couldn't delete", { description: e.message });
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}

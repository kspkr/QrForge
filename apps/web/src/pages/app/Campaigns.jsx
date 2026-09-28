import { useState } from "react";
import { Link } from "react-router";
import { Plus, Megaphone } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatNumber, formatDate } from "../../lib/format.js";
import { Button } from "../../components/ui/Button.jsx";
import { Field, Input, Textarea } from "../../components/ui/Field.jsx";
import { Alert, EmptyState, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { Dialog, useToast } from "../../components/ui/overlay.jsx";

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

export function CampaignDialog({ open, onClose, campaign, onSaved }) {
  const toast = useToast();
  // Remounted (via key) each time it opens, so initial state is always fresh.
  const [form, setForm] = useState({ name: campaign?.name ?? "", description: campaign?.description ?? "", color: campaign?.color ?? COLORS[0] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = campaign ? await api.patch(`/campaigns/${campaign.id}`, form) : await api.post("/campaigns", form);
      toast.success(campaign ? "Campaign updated" : "Campaign created");
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { name: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={campaign ? "Edit campaign" : "New campaign"}
      description="Group codes — flyers, packaging, social — and compare how each performs."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!form.name.trim()} onClick={save}>
            {campaign ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="Name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} placeholder="Summer campaign" data-autofocus />
        </Field>
        <Field label="Description" optional error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} rows={2} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Color</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
                onClick={() => setForm({ ...form, color: c })}
                className="h-7 w-7 rounded-full ring-offset-2 ring-offset-white transition-shadow aria-pressed:ring-2 aria-pressed:ring-zinc-900 dark:ring-offset-zinc-900 dark:aria-pressed:ring-zinc-100"
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

export default function Campaigns() {
  useDocumentTitle("Campaigns");
  const { data, error, loading, reload } = useAsync(() => api.get("/campaigns", { per_page: 100 }), []);
  const [open, setOpen] = useState(false);
  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Group related codes and compare their performance."
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New campaign
          </Button>
        }
      />
      {error && <Alert tone="danger">{error.message}</Alert>}
      {loading && !data ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="A campaign is a group of codes — say, every placement for a product launch."
            action={
              <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New campaign
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <Link key={c.id} to={`/app/campaigns/${c.id}`} className="surface group p-5 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color ?? "#71717a" }} />
                <h2 className="truncate font-semibold group-hover:underline">{c.name}</h2>
              </div>
              {c.description && <p className="muted mt-1.5 line-clamp-2 text-sm">{c.description}</p>}
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{formatNumber(c.scan_count)}</p>
                  <p className="muted text-xs">scans · {formatNumber(c.qr_count)} codes</p>
                </div>
                <p className="muted text-xs">{formatDate(c.created_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <CampaignDialog key={open ? "open" : "closed"} open={open} onClose={() => setOpen(false)} onSaved={reload} />
    </div>
  );
}

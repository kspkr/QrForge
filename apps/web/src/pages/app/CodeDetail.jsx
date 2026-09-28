import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Pencil,
  Lock,
  CalendarClock,
  Megaphone,
  Globe,
  MoreHorizontal,
  History,
  ChartColumnBig,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { designToOptions, normalizeDesign } from "../../lib/design.js";
import { formatDateTime, formatRelative, formatNumber } from "../../lib/format.js";
import { QR_TYPE_MAP } from "../../lib/qrTypes.js";
import { cx } from "../../lib/cx.js";
import { AnalyticsPanel } from "../../components/AnalyticsPanel.jsx";
import { CodeForm, codeFormToBody, initialCodeForm } from "../../components/CodeForm.jsx";
import { DesignPanel } from "../../components/studio/DesignPanel.jsx";
import { PreviewPanel } from "../../components/studio/PreviewPanel.jsx";
import { StatusBadge, KindBadge } from "../../components/qr.jsx";
import { useCodeActions } from "./Codes.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Field.jsx";
import { Alert, EmptyState, Skeleton } from "../../components/ui/misc.jsx";
import { ConfirmDialog, Menu, useToast } from "../../components/ui/overlay.jsx";

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function DestinationCard({ qr, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(qr.destination);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch(`/qrcodes/${qr.id}`, { destination: value.trim() });
      toast.success("Destination updated", { description: "Scans go to the new URL immediately." });
      setEditing(false);
      onSaved(updated);
    } catch (err) {
      setError(err.fields?.destination ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Destination</h3>
        {!editing && (
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Change
          </Button>
        )}
      </div>
      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-2">
          <Input value={value} onChange={(e) => setValue(e.target.value)} type="url" autoFocus spellCheck={false} aria-label="Destination URL" aria-invalid={!!error} />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" variant="primary" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      ) : (
        <a
          href={qr.destination}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 flex items-center gap-1.5 text-sm break-all text-zinc-700 hover:underline dark:text-zinc-300"
        >
          {qr.destination}
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </a>
      )}
      <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900/70">
        <p className="muted text-xs">Encoded short link</p>
        <div className="flex items-center justify-between gap-2">
          <code className="truncate font-mono text-[13px]">{qr.redirect_url}</code>
          <CopyButton value={qr.redirect_url} label="Copy short link" />
        </div>
      </div>
    </div>
  );
}

function Details({ qr, campaigns, domains }) {
  const campaign = campaigns.find((c) => c.id === qr.campaign_id);
  const domain = domains.find((d) => d.id === qr.domain_id);
  const rows = [
    qr.kind === "dynamic" && { icon: ChartColumnBig, label: "Scans", value: formatNumber(qr.scan_count) },
    { icon: Megaphone, label: "Campaign", value: campaign ? <Link className="hover:underline" to={`/app/campaigns/${campaign.id}`}>{campaign.name}</Link> : "None" },
    qr.kind === "dynamic" && { icon: Globe, label: "Domain", value: domain?.hostname ?? "Default" },
    qr.kind === "dynamic" && { icon: CalendarClock, label: "Expires", value: qr.expires_at ? formatDateTime(qr.expires_at) : "Never" },
    qr.kind === "dynamic" && { icon: Lock, label: "Password", value: qr.has_password ? "Protected" : "None" },
    { icon: History, label: "Created", value: formatDateTime(qr.created_at) },
  ].filter(Boolean);
  return (
    <div className="surface divide-y divide-zinc-100 dark:divide-zinc-800/60">
      {rows.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
          <span className="muted flex items-center gap-2">
            <Icon className="h-3.5 w-3.5" /> {label}
          </span>
          <span className="text-right">{value}</span>
        </div>
      ))}
      {qr.admin_locked && (
        <div className="p-4">
          <Alert tone="danger" title="Disabled by an administrator">
            {qr.disabled_reason || "This code violated the server's usage policy."}
          </Alert>
        </div>
      )}
    </div>
  );
}

function StaticContent({ qr }) {
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Encoded content · {QR_TYPE_MAP[qr.qr_type]?.label ?? qr.qr_type}</h3>
        <CopyButton value={qr.content} label="Copy content" />
      </div>
      <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs break-all whitespace-pre-wrap dark:bg-zinc-900/70">{qr.content}</pre>
      <p className="muted mt-3 text-xs">Static codes contain their content directly, so printed copies keep working even if this server goes away.</p>
    </div>
  );
}

function HistoryList({ qr }) {
  const { data, error, loading } = useAsync(() => api.get(`/qrcodes/${qr.id}/history`), [qr.id, qr.destination]);
  if (error) return <Alert tone="danger">{error.message}</Alert>;
  if (loading && !data) return <Skeleton className="h-32" />;
  const items = data?.data ?? [];
  if (!items.length) {
    return (
      <div className="surface">
        <EmptyState icon={History} title="No changes yet" description="Every time the destination changes, it's recorded here." />
      </div>
    );
  }
  return (
    <ol className="surface divide-y divide-zinc-100 dark:divide-zinc-800/60">
      {items.map((h, i) => (
        <li key={`${h.changed_at}-${i}`} className="px-5 py-3.5 text-sm">
          <p className="break-all">{h.destination}</p>
          <p className="muted mt-1 text-xs">
            {h.previous_destination ? (
              <>
                was <span className="break-all">{h.previous_destination}</span> ·{" "}
              </>
            ) : null}
            {formatRelative(h.changed_at)}
            {h.changed_by_email ? ` by ${h.changed_by_email}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

function SettingsTab({ qr, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => initialCodeForm(qr));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const body = codeFormToBody(form, { kind: qr.kind });
      if (qr.kind === "dynamic" && !form.slug.trim()) delete body.slug;
      const updated = await api.patch(`/qrcodes/${qr.id}`, body);
      toast.success("Changes saved");
      setForm(initialCodeForm(updated));
      onSaved(updated);
    } catch (err) {
      setErrors(err.fields ?? {});
      if (!err.fields || !Object.keys(err.fields).length) setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="surface max-w-3xl space-y-5 p-5" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <CodeForm form={form} setForm={setForm} errors={errors} kind={qr.kind} />
      {qr.kind === "dynamic" && form.slug !== qr.slug && (
        <Alert tone="warning">Changing the slug changes the encoded link — codes already printed with the old link will stop working.</Alert>
      )}
      <div className="flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Button type="submit" variant="primary" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function DesignTab({ qr, onSaved }) {
  const toast = useToast();
  const [design, setDesign] = useState(() => normalizeDesign(qr.design));
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => designToOptions(design), [design]);
  const dirty = JSON.stringify(design) !== JSON.stringify(normalizeDesign(qr.design));
  const save = async () => {
    setSaving(true);
    try {
      onSaved(await api.patch(`/qrcodes/${qr.id}`, { design }));
      toast.success("Design saved");
    } catch (e) {
      toast.error("Couldn't save design", { description: e.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="surface px-5 pt-1.5" aria-label="Design">
        <DesignPanel design={design} onChange={setDesign} onNotice={(m) => toast.info(m)} />
      </section>
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <PreviewPanel
          data={qr.content}
          options={options}
          compact
          filename={qr.name}
          footer={
            <Button variant="primary" className="w-full justify-center" disabled={!dirty} loading={saving} onClick={save}>
              Save design
            </Button>
          }
        />
      </aside>
    </div>
  );
}

export default function CodeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const { data: qr, error, loading, setData } = useAsync(() => api.get(`/qrcodes/${id}`), [id]);
  const campaigns = useAsync(() => api.get("/campaigns", { per_page: 100 }), []);
  const domains = useAsync(() => api.get("/domains"), []);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const { actionsFor, dialog } = useCodeActions(() => navigate("/app/codes"));
  useDocumentTitle(qr?.name ?? "QR code");

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/app/codes" className="muted inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="h-3.5 w-3.5" /> QR codes
        </Link>
        <Alert tone="danger" title={error.status === 404 ? "QR code not found" : "Couldn't load this code"}>
          {error.status === 404 ? "It may have been deleted." : error.message}
        </Alert>
      </div>
    );
  }
  if (loading && !qr) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    ...(qr.kind === "dynamic" ? [{ id: "analytics", label: "Analytics" }] : []),
    { id: "design", label: "Design" },
    { id: "settings", label: "Settings" },
    ...(qr.kind === "dynamic" ? [{ id: "history", label: "History" }] : []),
  ];
  const menuItems = actionsFor(qr).map((item) =>
    item.label === "Disable" || item.label === "Enable"
      ? {
          ...item,
          onSelect: async () => {
            try {
              setData(await api.patch(`/qrcodes/${qr.id}`, { status: qr.status === "active" ? "disabled" : "active" }));
              toast.success(qr.status === "active" ? "Code disabled" : "Code enabled");
            } catch (e) {
              toast.error("Couldn't update", { description: e.message });
            }
          },
        }
      : item,
  );

  return (
    <div>
      <Link to="/app/codes" className="muted mb-4 inline-flex items-center gap-1 text-sm hover:text-zinc-900 dark:hover:text-zinc-100">
        <ArrowLeft className="h-3.5 w-3.5" /> QR codes
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{qr.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <KindBadge qr={qr} />
            <StatusBadge qr={qr} />
            {!qr.analytics_enabled && qr.kind === "dynamic" && <span className="muted text-xs">Analytics off</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {qr.kind === "dynamic" && (
            <Button size="sm" variant="secondary" onClick={() => setRotateOpen(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Rotate link
            </Button>
          )}
          <Menu
            label="Code actions"
            items={menuItems.filter((i) => i.label !== "View" && i.label !== "Edit" && i.label !== "Analytics")}
            trigger={(props) => (
              <Button size="sm" variant="secondary" {...props}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            )}
          />
        </div>
      </div>

      <div role="tablist" aria-label="Code sections" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-zinc-200)] dark:shadow-[inset_0_-1px_0_var(--color-zinc-800)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === "overview" ? {} : { tab: t.id }, { replace: true })}
            className={cx(
              "border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
              tab === t.id
                ? "border-ember-500 text-zinc-900 dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <PreviewPanel data={qr.content} options={designToOptions(qr.design)} compact filename={qr.name} />
            <div className="space-y-6">
              {qr.kind === "dynamic" ? <DestinationCard key={qr.destination} qr={qr} onSaved={setData} /> : <StaticContent qr={qr} />}
              <Details qr={qr} campaigns={campaigns.data?.data ?? []} domains={domains.data?.data ?? []} />
            </div>
          </div>
        )}
        {tab === "analytics" && (
          <AnalyticsPanel
            path={`/qrcodes/${qr.id}/analytics`}
            disabledNote={!qr.analytics_enabled ? <Alert tone="info">Analytics collection is off for this code. Existing data is shown.</Alert> : null}
          />
        )}
        {tab === "design" && <DesignTab qr={qr} onSaved={setData} />}
        {tab === "settings" && <SettingsTab key={qr.updated_at} qr={qr} onSaved={setData} />}
        {tab === "history" && <HistoryList qr={qr} />}
      </div>

      <ConfirmDialog
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        title="Rotate the short link?"
        description="A new random link is generated. Codes printed with the current link will stop working — use this if a code has leaked or been abused."
        confirmLabel="Rotate link"
        loading={rotating}
        onConfirm={async () => {
          setRotating(true);
          try {
            setData(await api.post(`/qrcodes/${qr.id}/rotate-slug`));
            toast.success("Link rotated", { description: "Download the new code before printing." });
            setRotateOpen(false);
          } catch (e) {
            toast.error("Couldn't rotate", { description: e.message });
          } finally {
            setRotating(false);
          }
        }}
      />
      {dialog}
    </div>
  );
}

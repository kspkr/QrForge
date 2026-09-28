import { useState } from "react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { Button } from "../../components/ui/Button.jsx";
import { Field, Input, Textarea } from "../../components/ui/Field.jsx";
import { Switch } from "../../components/ui/controls.jsx";
import { Alert, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { useToast } from "../../components/ui/overlay.jsx";

const toLines = (list) => (list ?? []).join("\n");
const fromLines = (text) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

function Section({ title, description, children }) {
  return (
    <section className="surface grid gap-6 p-5 md:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="muted mt-1 text-xs leading-relaxed">{description}</p>
      </div>
      <div className="max-w-lg space-y-4">{children}</div>
    </section>
  );
}

export default function AdminSettings() {
  useDocumentTitle("Settings · Admin");
  const { data, error, loading, setData } = useAsync(() => api.get("/admin/settings"), []);
  if (error) return <Alert tone="danger">{error.message}</Alert>;
  if (loading || !data) return <Skeleton className="h-96" />;
  return <SettingsForm initial={data} onSaved={setData} />;
}

function SettingsForm({ initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    ...initial,
    allowlist: toLines(initial.domain_allowlist),
    blocklist: toLines(initial.domain_blocklist),
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = {
        registration_enabled: form.registration_enabled,
        max_qrcodes_per_user: Number(form.max_qrcodes_per_user) || 0,
        max_redirect_length: Number(form.max_redirect_length) || 2048,
        block_private_destinations: form.block_private_destinations,
        analytics_retention_days: Number(form.analytics_retention_days) || 0,
        domain_allowlist: fromLines(form.allowlist),
        domain_blocklist: fromLines(form.blocklist),
      };
      onSaved(await api.patch("/admin/settings", body));
      toast.success("Settings saved");
    } catch (err) {
      setErrors(err.fields ?? {});
      toast.error("Couldn't save settings", { description: err.message });
    } finally {
      setSaving(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={save} className="space-y-6">
      <PageHeader
        title="Settings"
        description="Server-wide policies. Changes apply immediately."
        actions={
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            Save settings
          </Button>
        }
      />
      <Section title="Accounts" description="Control who can sign up and how many codes each account may create.">
        <Switch
          label="Open registration"
          description="Anyone who can reach this server can create an account."
          checked={form.registration_enabled}
          onChange={(v) => setForm({ ...form, registration_enabled: v })}
        />
        <Field label="Max QR codes per user" hint="0 means unlimited. Admins can override per user." error={errors.max_qrcodes_per_user}>
          <Input type="number" min={0} value={form.max_qrcodes_per_user} onChange={set("max_qrcodes_per_user")} />
        </Field>
      </Section>
      <Section title="Redirect safety" description="Stop QRForge from being used as an open redirect or to reach internal services.">
        <Switch
          label="Block private destinations"
          description="Reject localhost, private-network and link-local addresses."
          checked={form.block_private_destinations}
          onChange={(v) => setForm({ ...form, block_private_destinations: v })}
        />
        <Field label="Max destination length" hint="Characters." error={errors.max_redirect_length}>
          <Input type="number" min={64} max={8192} value={form.max_redirect_length} onChange={set("max_redirect_length")} />
        </Field>
        <Field label="Domain allowlist" optional hint="One domain per line. When set, destinations must be on these domains (subdomains included)." error={errors.domain_allowlist}>
          <Textarea rows={4} value={form.allowlist} onChange={set("allowlist")} placeholder="example.com" spellCheck={false} className="font-mono text-xs" />
        </Field>
        <Field label="Domain blocklist" optional hint="One domain per line. Existing codes pointing here stop redirecting." error={errors.domain_blocklist}>
          <Textarea rows={4} value={form.blocklist} onChange={set("blocklist")} placeholder="bad.example" spellCheck={false} className="font-mono text-xs" />
        </Field>
      </Section>
      <Section title="Analytics" description="Scan records are anonymous. Retention limits how long they're kept.">
        <Field label="Retention (days)" hint="Scans older than this are deleted hourly. 0 keeps data forever." error={errors.analytics_retention_days}>
          <Input type="number" min={0} value={form.analytics_retention_days} onChange={set("analytics_retention_days")} />
        </Field>
      </Section>
    </form>
  );
}

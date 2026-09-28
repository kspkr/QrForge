import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDateTime } from "../../lib/format.js";
import { Button } from "../../components/ui/Button.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Alert, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { useToast } from "../../components/ui/overlay.jsx";

function Card({ title, description, children }) {
  return (
    <section className="surface grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="muted mt-1 text-xs leading-relaxed">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Profile() {
  const { user, setUser } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name ?? "", email: user.email, current_password: "" });
  const emailChanged = form.email.trim().toLowerCase() !== user.email;
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { name: form.name };
      if (emailChanged) Object.assign(body, { email: form.email, current_password: form.current_password });
      const res = await api.patch("/auth/me", body);
      setUser(res.user);
      setForm((f) => ({ ...f, current_password: "" }));
      toast.success("Profile updated");
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { email: err.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card title="Profile" description="Your name and sign-in email.">
      <form onSubmit={submit} className="max-w-md space-y-4">
        <Field label="Name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
        </Field>
        {emailChanged && (
          <Field label="Current password" hint="Required to change your sign-in email." error={errors.current_password}>
            <Input
              type="password"
              autoComplete="current-password"
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
            />
          </Field>
        )}
        <Button type="submit" variant="primary" size="sm" loading={saving} disabled={emailChanged && !form.current_password}>
          Save profile
        </Button>
      </form>
    </Card>
  );
}

function Password() {
  const toast = useToast();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/auth/password/change", { current_password: form.current_password, new_password: form.new_password });
      setForm({ current_password: "", new_password: "", confirm: "" });
      toast.success("Password changed", { description: "Other sessions were signed out." });
    } catch (err) {
      setError(Object.values(err.fields ?? {})[0] ?? err.message);
    } finally {
      setSaving(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card title="Password" description="Changing your password signs out every other session.">
      <form onSubmit={submit} className="max-w-md space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={form.current_password} onChange={set("current_password")} />
        </Field>
        <Field label="New password" hint="8 to 72 characters.">
          <Input type="password" autoComplete="new-password" maxLength={72} value={form.new_password} onChange={set("new_password")} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" maxLength={72} value={form.confirm} onChange={set("confirm")} />
        </Field>
        <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!form.current_password || form.new_password.length < 8}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

export function AuditTable({ path }) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useAsync(() => api.get(path, { page, per_page: 20 }), [path, page]);
  if (error) return <Alert tone="danger">{error.message}</Alert>;
  if (loading && !data) return <Skeleton className="h-40" />;
  const rows = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  return (
    <div>
      {rows.length === 0 ? (
        <p className="muted py-6 text-center text-sm">No activity recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-3 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="py-2 pl-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="py-2 pr-3 font-mono text-xs">{e.action}</td>
                  <td className="muted px-3 py-2 text-xs">{e.actor_email ?? "system"}</td>
                  <td className="muted px-3 py-2 font-mono text-xs">{e.target_id ?? "—"}</td>
                  <td className="muted py-2 pl-3 text-xs whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 20 && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="xs" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button size="xs" variant="secondary" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  useDocumentTitle("Settings");
  const { logout } = useSession();
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your account on this QRForge server." />
      <Profile />
      <Password />
      <Card title="Activity" description="Security-relevant events on your account: sign-ins, key changes and code changes.">
        <AuditTable path="/audit-log" />
      </Card>
      <Card title="Sign out" description="End this session on this device.">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await logout();
            navigate("/");
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}

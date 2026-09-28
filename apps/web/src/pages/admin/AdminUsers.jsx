import { useEffect, useState } from "react";
import { Search, MoreHorizontal, ShieldCheck, ShieldOff, Ban, CircleCheck, Gauge } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useSession } from "../../lib/session.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDate, formatNumber, formatRelative } from "../../lib/format.js";
import { Button } from "../../components/ui/Button.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Badge } from "../../components/ui/controls.jsx";
import { Alert, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { Dialog, Menu, useToast } from "../../components/ui/overlay.jsx";

export function Pager({ page, total, perPage = 20, onChange }) {
  if (total <= perPage) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="muted">
        Page {page} of {Math.ceil(total / perPage)}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={page * perPage >= total} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function AdminUsers() {
  useDocumentTitle("Users · Admin");
  const toast = useToast();
  const { user: me } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const { data, error, loading, reload } = useAsync(() => api.get("/admin/users", { page, per_page: 20, q: query }), [page, query]);
  const [limitUser, setLimitUser] = useState(null);
  const [limit, setLimit] = useState("");

  const patch = async (u, body, message) => {
    try {
      await api.patch(`/admin/users/${u.id}`, body);
      toast.success(message);
      reload();
    } catch (e) {
      toast.error("Couldn't update user", { description: e.message });
    }
  };

  return (
    <div>
      <PageHeader title="Users" description="Accounts on this server." />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Search by email or name" className="pl-9" aria-label="Search users" />
      </div>
      {error && <Alert tone="danger">{error.message}</Alert>}
      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 text-right font-medium">Codes</th>
                <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                <th className="px-3 py-2.5 font-medium">Joined</th>
                <th className="px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{u.name || "—"}</p>
                    <p className="muted text-xs">{u.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
                      {u.role === "admin" ? <Badge tone="accent">Admin</Badge> : <Badge>User</Badge>}
                      {u.disabled && <Badge tone="danger">Disabled</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(u.qr_count)}
                    {u.max_qrcodes ? <span className="muted"> / {u.max_qrcodes}</span> : null}
                  </td>
                  <td className="muted px-3 py-2.5">{formatRelative(u.last_login_at)}</td>
                  <td className="muted px-3 py-2.5">{formatDate(u.created_at)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {u.id !== me.id && (
                      <Menu
                        label={`Actions for ${u.email}`}
                        items={[
                          u.role === "admin"
                            ? { label: "Remove admin", icon: ShieldOff, onSelect: () => patch(u, { role: "user" }, "Admin removed") }
                            : { label: "Make admin", icon: ShieldCheck, onSelect: () => patch(u, { role: "admin" }, "User promoted") },
                          {
                            label: "Set code limit",
                            icon: Gauge,
                            onSelect: () => {
                              setLimit(u.max_qrcodes ? String(u.max_qrcodes) : "");
                              setLimitUser(u);
                            },
                          },
                          { separator: true },
                          u.disabled
                            ? { label: "Enable account", icon: CircleCheck, onSelect: () => patch(u, { disabled: false }, "Account enabled") }
                            : { label: "Disable account", icon: Ban, tone: "danger", onSelect: () => patch(u, { disabled: true }, "Account disabled") },
                        ]}
                        trigger={(props) => (
                          <Button variant="ghost" size="icon-sm" {...props}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        )}
                      />
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
        open={!!limitUser}
        onClose={() => setLimitUser(null)}
        title="QR code limit"
        description={`Maximum number of codes ${limitUser?.email} can create. Leave empty to use the server default.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLimitUser(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await patch(limitUser, { max_qrcodes: limit === "" ? null : Number(limit) }, "Limit updated");
                setLimitUser(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Limit">
          <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Server default" data-autofocus />
        </Field>
      </Dialog>
    </div>
  );
}

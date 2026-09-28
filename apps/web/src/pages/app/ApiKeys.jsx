import { useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDate, formatNumber, formatRelative } from "../../lib/format.js";
import { Button } from "../../components/ui/Button.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Alert, EmptyState, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { ConfirmDialog, Dialog, useToast } from "../../components/ui/overlay.jsx";

export default function ApiKeys() {
  useDocumentTitle("API keys");
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get("/api-keys"), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [secret, setSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const rows = data?.data ?? [];

  const create = async (e) => {
    e?.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.post("/api-keys", { name: name.trim() });
      setSecret(res.key);
      setCreateOpen(false);
      setName("");
      reload();
    } catch (err) {
      setCreateError(err.fields?.name ?? err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="API keys"
        description="Authenticate scripts and integrations against the REST API."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New key
          </Button>
        }
      />
      {error && <Alert tone="danger">{error.message}</Alert>}
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={KeyRound}
            title="No API keys"
            description="Keys can manage your QR codes, campaigns and analytics — not your account or other keys."
            action={
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New key
              </Button>
            }
          />
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Key</th>
                <th className="px-3 py-2.5 text-right font-medium">Requests</th>
                <th className="px-3 py-2.5 font-medium">Last used</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
                <th className="px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="px-4 py-2.5 font-medium">{k.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(k.usage_count)}</td>
                  <td className="muted px-3 py-2.5">{formatRelative(k.last_used_at)}</td>
                  <td className="muted px-3 py-2.5">{formatDate(k.created_at)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button size="icon-sm" variant="danger-ghost" aria-label={`Revoke ${k.name}`} onClick={() => setRevoking(k)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="surface mt-6 p-5">
        <h2 className="text-sm font-semibold">Using the API</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">
          {`curl ${window.location.origin}/api/v1/qrcodes \\
  -H "Authorization: Bearer qrf_…"`}
        </pre>
        <p className="muted mt-3 text-xs">
          Full reference: <a className="underline" href="/api/v1/openapi.yaml">OpenAPI specification</a>. Or use the JavaScript SDK:{" "}
          <code className="font-mono">npm install @qrforge/sdk</code>.
        </p>
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create an API key"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={creating} disabled={!name.trim()} onClick={create}>
              Create key
            </Button>
          </>
        }
      >
        <form onSubmit={create}>
          <Field label="Name" hint="So you can tell keys apart, e.g. “CI pipeline”." error={createError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-autofocus />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={!!secret}
        onClose={() => {
          setSecret(null);
          setCopied(false);
        }}
        title="Your new API key"
        description="Copy it now — for your security it won't be shown again."
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setSecret(null);
              setCopied(false);
            }}
          >
            Done
          </Button>
        }
      >
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 pl-3 dark:border-zinc-700 dark:bg-zinc-950">
          <code className="flex-1 font-mono text-xs break-all">{secret}</code>
          <Button
            size="sm"
            variant="secondary"
            data-autofocus
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch {
                toast.error("Couldn't copy — select the key and copy it manually.");
              }
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Anything using this key will immediately lose access."
        confirmLabel="Revoke key"
        onConfirm={async () => {
          try {
            await api.del(`/api-keys/${revoking.id}`);
            toast.success("Key revoked");
            setRevoking(null);
            reload();
          } catch (e) {
            toast.error("Couldn't revoke", { description: e.message });
          }
        }}
      />
    </div>
  );
}

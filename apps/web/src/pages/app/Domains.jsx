import { useState } from "react";
import { Globe, Plus, Trash2, RefreshCw, Copy } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useSession } from "../../lib/session.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatDate } from "../../lib/format.js";
import { DOCS_URL } from "../../lib/config.js";
import { Button } from "../../components/ui/Button.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Badge } from "../../components/ui/controls.jsx";
import { Alert, EmptyState, PageHeader, Skeleton } from "../../components/ui/misc.jsx";
import { ConfirmDialog, Dialog, useToast } from "../../components/ui/overlay.jsx";

function Record({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="muted text-[11px] tracking-wide uppercase">{label}</p>
      <div className="flex items-center gap-1">
        <code className="truncate font-mono text-xs">{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          onClick={() => navigator.clipboard?.writeText(value).catch(() => {})}
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export default function Domains() {
  useDocumentTitle("Domains");
  const toast = useToast();
  const { server } = useSession();
  const { data, error, loading, reload } = useAsync(() => api.get("/domains"), []);
  const [addOpen, setAddOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [addError, setAddError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(null);
  const [removing, setRemoving] = useState(null);
  const rows = data?.data ?? [];
  const serverHost = server?.base_url ? new URL(server.base_url).host : window.location.host;

  const add = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setAddError(null);
    try {
      await api.post("/domains", { hostname: hostname.trim().toLowerCase() });
      toast.success("Domain added", { description: "Now add the DNS records shown below." });
      setAddOpen(false);
      setHostname("");
      reload();
    } catch (err) {
      setAddError(err.fields?.hostname ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  const verify = async (d) => {
    setVerifying(d.id);
    try {
      await api.post(`/domains/${d.id}/verify`);
      toast.success(`${d.hostname} verified`);
      reload();
    } catch (err) {
      toast.error("Verification failed", { description: err.message });
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Custom domains"
        description="Serve dynamic codes from your own domain, like qr.yourcompany.com/r/menu."
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add domain
          </Button>
        }
      />
      {error && <Alert tone="danger">{error.message}</Alert>}
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Globe}
            title="No custom domains"
            description="Point a subdomain at this server, verify it with a DNS record, and choose it when creating codes."
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add domain
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((d) => (
            <li key={d.id} className="surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-zinc-400" />
                  <span className="font-medium">{d.hostname}</span>
                  {d.verified ? <Badge tone="success" dot>Verified</Badge> : <Badge tone="warning" dot>Pending DNS</Badge>}
                </div>
                <div className="flex gap-2">
                  {!d.verified && (
                    <Button size="sm" variant="secondary" loading={verifying === d.id} onClick={() => verify(d)}>
                      {verifying !== d.id && <RefreshCw className="h-3.5 w-3.5" />} Verify
                    </Button>
                  )}
                  <Button size="icon" variant="danger-ghost" aria-label={`Remove ${d.hostname}`} onClick={() => setRemoving(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {!d.verified ? (
                <div className="mt-4 space-y-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/60">
                  <p className="text-xs font-medium">Add these DNS records at your DNS provider:</p>
                  <div className="grid gap-3 sm:grid-cols-[80px_1fr_1fr]">
                    <Record label="Type" value="CNAME" />
                    <Record label="Name" value={d.hostname} />
                    <Record label="Value" value={serverHost} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[80px_1fr_1fr]">
                    <Record label="Type" value={d.verification_record.type} />
                    <Record label="Name" value={d.verification_record.name} />
                    <Record label="Value" value={d.verification_record.value} />
                  </div>
                  <p className="muted text-xs">
                    DNS changes can take a few minutes. Your reverse proxy must also serve this hostname with TLS —{" "}
                    <a href={DOCS_URL} className="underline">
                      see the custom domain guide
                    </a>
                    .
                  </p>
                </div>
              ) : (
                <p className="muted mt-2 text-xs">Verified {formatDate(d.verified_at)} · Codes using it resolve at https://{d.hostname}/r/…</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a custom domain"
        description="Use a subdomain dedicated to QR links, such as qr.example.com."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} disabled={!hostname.trim()} onClick={add}>
              Add domain
            </Button>
          </>
        }
      >
        <form onSubmit={add}>
          <Field label="Hostname" error={addError}>
            <Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="qr.example.com" spellCheck={false} data-autofocus />
          </Field>
        </form>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.hostname}?`}
        description="Codes assigned to this domain fall back to the default server domain — printed copies using the custom domain stop working."
        confirmLabel="Remove domain"
        onConfirm={async () => {
          try {
            await api.del(`/domains/${removing.id}`);
            toast.success("Domain removed");
            setRemoving(null);
            reload();
          } catch (e) {
            toast.error("Couldn't remove", { description: e.message });
          }
        }}
      />
    </div>
  );
}

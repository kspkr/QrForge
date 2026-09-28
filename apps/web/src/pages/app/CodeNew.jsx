import { useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { DEFAULT_DESIGN, designToOptions, normalizeDesign } from "../../lib/design.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { CodeForm, codeFormToBody, initialCodeForm } from "../../components/CodeForm.jsx";
import { DesignPanel } from "../../components/studio/DesignPanel.jsx";
import { PreviewPanel } from "../../components/studio/PreviewPanel.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Alert, PageHeader } from "../../components/ui/misc.jsx";
import { useToast } from "../../components/ui/overlay.jsx";

export default function CodeNew() {
  useDocumentTitle("New dynamic code");
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { server } = useSession();
  const [form, setForm] = useState(() => initialCodeForm({}, { destination: location.state?.destination ?? "" }));
  const [design, setDesign] = useState(() => normalizeDesign(location.state?.design ?? DEFAULT_DESIGN));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // The real slug is assigned by the server; preview with the custom slug or a placeholder
  // of typical length so the density (and therefore the design) matches the final code.
  const previewUrl = `${(server?.base_url ?? window.location.origin).replace(/\/$/, "")}/r/${form.slug.trim() || "xxxxxxx"}`;
  const options = useMemo(() => designToOptions(design), [design]);

  const submit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const body = codeFormToBody(form, { isNew: true });
      if (!body.name) body.name = form.destination ? new URL(form.destination).host : "Dynamic code";
      const qr = await api.post("/qrcodes", { ...body, design });
      toast.success("Dynamic code created", { description: qr.redirect_url });
      navigate(`/app/codes/${qr.id}`);
    } catch (err) {
      if (err instanceof TypeError) setErrors({ destination: "Enter a valid URL, starting with https://" });
      else {
        setErrors(err.fields ?? {});
        if (!err.fields || !Object.keys(err.fields).length) setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to="/app/codes" className="muted mb-4 inline-flex items-center gap-1 text-sm hover:text-zinc-900 dark:hover:text-zinc-100">
        <ArrowLeft className="h-3.5 w-3.5" /> QR codes
      </Link>
      <PageHeader title="New dynamic code" description="A short link you can re-point at any time — print once, update forever." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <form className="surface space-y-5 p-5" onSubmit={submit} noValidate>
            {error && <Alert tone="danger">{error}</Alert>}
            <CodeForm form={form} setForm={setForm} errors={errors} isNew />
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <Button variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!form.destination.trim()}>
                Create code
              </Button>
            </div>
          </form>
          <section className="surface px-5 pt-1.5" aria-label="Design">
            <DesignPanel design={design} onChange={setDesign} onNotice={(m) => toast.info(m)} />
          </section>
        </div>
        <aside>
          <div className="lg:sticky lg:top-8">
            <PreviewPanel
              data={previewUrl}
              options={options}
              compact
              exportable={false}
              footer={<p className="muted text-center text-xs">Preview · the final link is assigned when you create the code.</p>}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

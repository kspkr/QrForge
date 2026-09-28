import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Save, Zap, Server, ArrowRight, RotateCcw } from "lucide-react";
import { QR_TYPE_MAP, buildStudioPayload } from "../lib/qrTypes.js";
import { DEFAULT_DESIGN, designToOptions, normalizeDesign } from "../lib/design.js";
import { storage } from "../lib/storage.js";
import { useSession } from "../lib/session.jsx";
import { api } from "../lib/api.js";
import { DOCS_URL } from "../lib/config.js";
import { TypePicker, ContentForm } from "../components/studio/ContentForm.jsx";
import { DesignPanel } from "../components/studio/DesignPanel.jsx";
import { PreviewPanel } from "../components/studio/PreviewPanel.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Dialog, useToast } from "../components/ui/overlay.jsx";
import { Field, Input } from "../components/ui/Field.jsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

const DESIGN_KEY = "qrforge-studio-design";
const TYPE_KEY = "qrforge-studio-type";

function initialValues() {
  return Object.fromEntries(Object.values(QR_TYPE_MAP).map((t) => [t.id, { ...t.defaults }]));
}

function SaveDialog({ open, onClose, onSave, saving, defaultName }) {
  const [name, setName] = useState(defaultName);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Save to dashboard"
      description="Keep this static code in your QRForge account so you can find, edit and re-download it later."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => onSave(name.trim())} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-autofocus />
        </Field>
      </form>
    </Dialog>
  );
}

function ServerActions({ type, payload, values, design }) {
  const { server, user } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (server === undefined) return null;
  if (server === null) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs dark:bg-zinc-900/60">
        <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <p className="muted leading-relaxed">
          Need codes you can edit after printing, with analytics?{" "}
          <a href={DOCS_URL} className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100">
            Self-host QRForge Server
          </a>
          .
        </p>
      </div>
    );
  }
  if (!user) {
    return (
      <Link
        to="/login?next=/studio"
        className="group flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2.5 text-xs dark:bg-zinc-900/60"
      >
        <span className="muted">Sign in to save codes and create dynamic, trackable QR codes.</span>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
      </Link>
    );
  }

  const save = async (name) => {
    setSaving(true);
    try {
      const qr = await api.post("/qrcodes", { name, kind: "static", qr_type: type, content: payload, form_data: values, design });
      toast.success("Saved to your dashboard");
      setSaveOpen(false);
      navigate(`/app/codes/${qr.id}`);
    } catch (e) {
      toast.error("Couldn't save", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" disabled={!payload} onClick={() => setSaveOpen(true)}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!payload || type !== "url"}
          title={type === "url" ? "Create an editable, trackable version" : "Dynamic codes redirect to a URL"}
          onClick={() => navigate("/app/codes/new", { state: { destination: payload, design } })}
        >
          <Zap className="h-3.5 w-3.5" /> Make dynamic
        </Button>
      </div>
      <SaveDialog
        key={saveOpen ? "open" : "closed"}
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={save}
        saving={saving}
        defaultName={`${QR_TYPE_MAP[type].label} code`}
      />
    </>
  );
}

export default function Studio() {
  useDocumentTitle("QR Studio");
  const toast = useToast();
  const [type, setType] = useState(() => (QR_TYPE_MAP[storage.get(TYPE_KEY)] ? storage.get(TYPE_KEY) : "url"));
  const [valuesByType, setValuesByType] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [design, setDesign] = useState(() => normalizeDesign(storage.getJSON(DESIGN_KEY, DEFAULT_DESIGN)));

  // Only the design and selected type are remembered — never the content,
  // which may contain Wi-Fi passwords or personal details.
  useEffect(() => storage.setJSON(DESIGN_KEY, design), [design]);
  useEffect(() => storage.set(TYPE_KEY, type), [type]);

  const values = valuesByType[type];
  const { payload, error } = useMemo(() => buildStudioPayload(type, values), [type, values]);
  const options = useMemo(() => designToOptions(design), [design]);

  // Surface a validation message once the user has typed something.
  const hasInput = Object.entries(values).some(
    ([k, v]) => typeof v === "string" && v.trim() !== "" && QR_TYPE_MAP[type].defaults[k] !== v,
  );
  const visibleError = error && (hasInput || Object.keys(touched).length > 0) ? error : null;

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-8 pb-20 sm:px-6 lg:pt-10">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">QR Studio</h1>
          <p className="muted mt-1 text-sm">Design a code, download it, done. No account, no tracking.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDesign({ ...DEFAULT_DESIGN });
            toast.info("Design reset");
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset design
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="order-2 space-y-6 lg:order-1">
          <section className="surface p-5" aria-labelledby="content-heading">
            <h2 id="content-heading" className="mb-4 text-[13px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Content
            </h2>
            <TypePicker
              value={type}
              onChange={(t) => {
                setType(t);
                setTouched({});
              }}
            />
            <div className="mt-5">
              <ContentForm
                key={type}
                type={type}
                values={values}
                onChange={(v) => setValuesByType((all) => ({ ...all, [type]: v }))}
                error={visibleError}
                touched={touched}
                onBlur={(name) => setTouched((t) => ({ ...t, [name]: true }))}
              />
            </div>
          </section>

          <section className="surface px-5 pt-1.5" aria-label="Design">
            <DesignPanel design={design} onChange={setDesign} onNotice={(m) => toast.info(m)} />
          </section>
        </div>

        <aside className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-20">
            <PreviewPanel
              data={payload}
              options={options}
              error={visibleError}
              filename={`qrforge-${type}`}
              footer={<ServerActions type={type} payload={payload} values={values} design={design} />}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

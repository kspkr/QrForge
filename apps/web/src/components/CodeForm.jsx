import { useRef, useState } from "react";
import { ChevronDown, FileText, Link2, Upload } from "lucide-react";
import { Field, Input, Select } from "./ui/Field.jsx";
import { Segmented, Switch } from "./ui/controls.jsx";
import { Button } from "./ui/Button.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { api } from "../lib/api.js";
import { useSession } from "../lib/session.jsx";
import { formatBytes, fromLocalInput, toLocalInput } from "../lib/format.js";
import { cx } from "../lib/cx.js";

const UTM_FIELDS = [
  ["source", "Source", "flyer"],
  ["medium", "Medium", "print"],
  ["campaign", "Campaign", "summer-sale"],
  ["term", "Term", ""],
  ["content", "Content", ""],
];

/** Form state for a dynamic code, initialised from an existing code (or defaults). */
export function initialCodeForm(qr = {}, overrides = {}) {
  return {
    name: qr.name ?? "",
    target: qr.file ? "file" : "url",
    destination: qr.destination ?? "",
    file: qr.file ?? null,
    slug: qr.slug ?? "",
    campaign_id: qr.campaign_id ?? "",
    domain_id: qr.domain_id ?? "",
    expires_at: toLocalInput(qr.expires_at),
    password: "",
    clearPassword: false,
    has_password: !!qr.has_password,
    utm: { source: "", medium: "", campaign: "", term: "", content: "", ...(qr.utm ?? {}) },
    analytics_enabled: qr.analytics_enabled ?? true,
    ...overrides,
  };
}

/**
 * Convert form state to an API body. For updates only changed-able fields are sent;
 * `password` is sent only when set or cleared.
 */
export function codeFormToBody(form, { kind = "dynamic", isNew = false } = {}) {
  const utm = Object.fromEntries(Object.entries(form.utm).filter(([, v]) => v.trim()));
  const body = {
    name: form.name.trim(),
    campaign_id: form.campaign_id || null,
  };
  if (kind === "dynamic") {
    if (form.target === "file") body.file_id = form.file?.id ?? null;
    else body.destination = form.destination.trim();
    Object.assign(body, {
      domain_id: form.domain_id || null,
      expires_at: fromLocalInput(form.expires_at),
      utm: Object.keys(utm).length ? utm : null,
      analytics_enabled: form.analytics_enabled,
    });
    if (form.slug.trim()) body.slug = form.slug.trim();
    if (form.password) body.password = form.password;
    else if (form.clearPassword && !isNew) body.password = null;
  }
  if (isNew) body.kind = kind;
  return body;
}

/** Uploads a file to the server and reports the stored file back. */
export function FilePicker({ id, file, onChange, error, limits }) {
  const input = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const pick = async (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen) return;
    setUploadError(null);
    if (limits?.max_bytes && chosen.size > limits.max_bytes) {
      setUploadError(`Files can be at most ${formatBytes(limits.max_bytes)}.`);
      return;
    }
    setUploading(true);
    try {
      onChange(await api.upload("/files", chosen));
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const shown = uploadError ?? error;
  return (
    <div>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept={limits?.extensions?.join(",")} onChange={pick} />
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 dark:border-zinc-700">
        <FileText className="h-5 w-5 shrink-0 text-zinc-400" />
        <div className="min-w-0 flex-1 text-sm">
          {file ? (
            <>
              <p className="truncate font-medium">{file.name}</p>
              <p className="muted text-xs">{formatBytes(file.size)}</p>
            </>
          ) : (
            <p className="muted">No file selected</p>
          )}
        </div>
        <Button id={id} size="sm" variant="secondary" loading={uploading} onClick={() => input.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> {file ? "Replace" : "Choose file"}
        </Button>
      </div>
      {shown ? (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{shown}</p>
      ) : (
        limits && (
          <p className="muted mt-1.5 text-xs">
            {limits.extensions.map((x) => x.slice(1).toUpperCase()).join(", ")} up to {formatBytes(limits.max_bytes)}. Scanners download the file.
          </p>
        )
      )}
    </div>
  );
}

export function CodeForm({ form, setForm, errors = {}, kind = "dynamic", isNew = false }) {
  const { server } = useSession();
  const uploads = server?.features?.file_uploads ? server.file_uploads : null;
  const [utmOpen, setUtmOpen] = useState(Object.values(form.utm).some(Boolean));
  const campaigns = useAsync(() => api.get("/campaigns", { per_page: 100 }), []);
  const domains = useAsync(() => (kind === "dynamic" ? api.get("/domains") : Promise.resolve({ data: [] })), [kind]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const verifiedDomains = (domains.data?.data ?? []).filter((d) => d.verified);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name" error={errors.name} className="sm:col-span-2" hint="Only visible to you.">
        <Input value={form.name} onChange={set("name")} maxLength={120} placeholder="Restaurant menu" />
      </Field>

      {kind === "dynamic" && (
        <>
          {(uploads || form.target === "file") && (
            <div className="sm:col-span-2">
              <Segmented
                label="Code opens"
                value={form.target}
                onChange={(target) => setForm((f) => ({ ...f, target }))}
                options={[
                  { value: "url", label: "Link", icon: Link2 },
                  { value: "file", label: "File", icon: FileText },
                ]}
              />
            </div>
          )}
          {form.target === "file" ? (
            <Field label="File" className="sm:col-span-2">
              <FilePicker file={form.file} onChange={(file) => setForm((f) => ({ ...f, file }))} error={errors.file_id} limits={uploads} />
            </Field>
          ) : (
            <Field label="Destination URL" error={errors.destination} className="sm:col-span-2" hint="Where scanners are sent. You can change it at any time.">
              <Input type="url" value={form.destination} onChange={set("destination")} placeholder="https://example.com/menu" spellCheck={false} />
            </Field>
          )}
          <Field label="Custom slug" optional error={errors.slug} hint="Letters, numbers, - and _. Leave empty for a random one.">
            <Input value={form.slug} onChange={set("slug")} placeholder="menu" spellCheck={false} maxLength={64} />
          </Field>
          <Field label="Domain" error={errors.domain_id} hint={verifiedDomains.length ? undefined : "Add a custom domain under Domains."}>
            <Select value={form.domain_id} onChange={set("domain_id")}>
              <option value="">Default server domain</option>
              {verifiedDomains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <Field label="Campaign" optional error={errors.campaign_id} className={kind === "dynamic" ? "" : "sm:col-span-2"}>
        <Select value={form.campaign_id} onChange={set("campaign_id")}>
          <option value="">No campaign</option>
          {(campaigns.data?.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      {kind === "dynamic" && (
        <>
          <Field label="Expires" optional error={errors.expires_at} hint="After this the code shows an “expired” page.">
            <Input type="datetime-local" value={form.expires_at} onChange={set("expires_at")} />
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <Field
              label="Password"
              optional
              error={errors.password}
              hint={
                form.has_password && !form.clearPassword
                  ? "A password is set. Enter a new one to replace it."
                  : `Scanners must enter it before ${form.target === "file" ? "downloading" : "being redirected"}.`
              }
            >
              <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} disabled={form.clearPassword} />
            </Field>
            {!isNew && form.has_password && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.clearPassword}
                  onChange={(e) => setForm((f) => ({ ...f, clearPassword: e.target.checked, password: "" }))}
                  className="accent-ember-500"
                />
                Remove password protection
              </label>
            )}
          </div>

          {form.target !== "file" && (
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => setUtmOpen((o) => !o)}
                aria-expanded={utmOpen}
                className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300"
              >
                <ChevronDown className={cx("h-4 w-4 text-zinc-400 transition-transform", !utmOpen && "-rotate-90")} />
                UTM parameters
                <span className="font-normal text-zinc-400">optional</span>
              </button>
              {utmOpen && (
                <div className="animate-fade-in mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {UTM_FIELDS.map(([key, label, placeholder]) => (
                    <Field key={key} label={`utm_${key}`} error={errors[`utm.${key}`]}>
                      <Input
                        value={form.utm[key]}
                        placeholder={placeholder || label}
                        onChange={(e) => setForm((f) => ({ ...f, utm: { ...f.utm, [key]: e.target.value } }))}
                        maxLength={100}
                        aria-label={label}
                      />
                    </Field>
                  ))}
                  <p className="muted text-xs sm:col-span-3">Added to the destination on redirect unless the URL already sets them.</p>
                </div>
              )}
            </div>
          )}

          <div className="sm:col-span-2">
            <Switch
              label="Collect analytics"
              description="Anonymous scan counts, devices and countries. No IP addresses are stored."
              checked={form.analytics_enabled}
              onChange={(v) => setForm((f) => ({ ...f, analytics_enabled: v }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

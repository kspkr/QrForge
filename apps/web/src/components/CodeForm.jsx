import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Field, Input, Select } from "./ui/Field.jsx";
import { Switch } from "./ui/controls.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { api } from "../lib/api.js";
import { fromLocalInput, toLocalInput } from "../lib/format.js";
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
    destination: qr.destination ?? "",
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
    Object.assign(body, {
      destination: form.destination.trim(),
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

export function CodeForm({ form, setForm, errors = {}, kind = "dynamic", isNew = false }) {
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
          <Field label="Destination URL" error={errors.destination} className="sm:col-span-2" hint="Where scanners are sent. You can change it at any time.">
            <Input type="url" value={form.destination} onChange={set("destination")} placeholder="https://example.com/menu" spellCheck={false} />
          </Field>
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
              hint={form.has_password && !form.clearPassword ? "A password is set. Enter a new one to replace it." : "Scanners must enter it before being redirected."}
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

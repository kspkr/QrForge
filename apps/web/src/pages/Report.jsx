import { useState } from "react";
import { useSearchParams } from "react-router";
import { Flag } from "lucide-react";
import { AuthCard } from "./auth/AuthCard.jsx";
import { Field, Input, Select, Textarea } from "../components/ui/Field.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/misc.jsx";
import { api } from "../lib/api.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

const REASONS = [
  { value: "phishing", label: "Phishing or scam" },
  { value: "malware", label: "Malware or unwanted software" },
  { value: "spam", label: "Spam" },
  { value: "illegal", label: "Illegal content" },
  { value: "other", label: "Something else" },
];

export default function Report() {
  useDocumentTitle("Report abuse");
  const [params] = useSearchParams();
  const [form, setForm] = useState({ slug: params.get("slug") ?? "", reason: "phishing", details: "", reporter_email: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/abuse-reports", { ...form, reporter_email: form.reporter_email || undefined });
      setSent(true);
    } catch (err) {
      setError(err.status === 429 ? "You've sent several reports recently. Please try again later." : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Report a QR code" description="Tell the operators of this QRForge server about a code that's being misused.">
      {sent ? (
        <Alert tone="success" title="Thanks — report received">
          An administrator will review it. Codes found to be abusive are disabled.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="QR code link" hint="The full link (…/r/abc123) or just the code.">
            <Input value={form.slug} onChange={set("slug")} placeholder="https://qr.example.com/r/abc123" spellCheck={false} />
          </Field>
          <Field label="Reason">
            <Select value={form.reason} onChange={set("reason")}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Details" optional>
            <Textarea value={form.details} onChange={set("details")} maxLength={2000} />
          </Field>
          <Field label="Your email" optional hint="Only used if the administrator needs to follow up.">
            <Input type="email" value={form.reporter_email} onChange={set("reporter_email")} />
          </Field>
          <Button type="submit" variant="primary" className="w-full justify-center" loading={busy} disabled={!form.slug.trim()}>
            <Flag className="h-4 w-4" /> Send report
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

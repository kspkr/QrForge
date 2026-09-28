import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { AuthCard } from "./AuthCard.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Alert } from "../../components/ui/misc.jsx";
import { useSession } from "../../lib/session.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";

export default function Register() {
  useDocumentTitle("Create account");
  const { register, user, server } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app" replace />;
  const setup = !!server?.setup_required;
  const closed = server && !server.registration_enabled && !setup;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await register(form.name, form.email, form.password);
      navigate("/app", { replace: true });
    } catch (err) {
      setFields(err.fields ?? {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthCard
      title={setup ? "Set up your QRForge server" : "Create your account"}
      description={setup ? "The first account becomes the administrator." : "Free forever. No credit card, no trackers."}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
            Sign in
          </Link>
        </>
      }
    >
      {closed ? (
        <Alert tone="info" title="Registration is closed">
          This QRForge server isn't accepting new accounts. Ask an administrator to open registration.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && !Object.keys(fields).length && <Alert tone="danger">{error}</Alert>}
          <Field label="Name" error={fields.name}>
            <Input autoComplete="name" value={form.name} onChange={set("name")} autoFocus maxLength={100} />
          </Field>
          <Field label="Email" error={fields.email}>
            <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Password" hint="8 to 72 characters." error={fields.password}>
            <Input type="password" autoComplete="new-password" maxLength={72} value={form.password} onChange={set("password")} />
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="w-full justify-center"
            loading={busy}
            disabled={!form.email || form.password.length < 8}
          >
            {setup ? "Create admin account" : "Create account"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

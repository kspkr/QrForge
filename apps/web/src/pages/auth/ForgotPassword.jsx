import { useState } from "react";
import { Link } from "react-router";
import { AuthCard } from "./AuthCard.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Alert } from "../../components/ui/misc.jsx";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";

export default function ForgotPassword() {
  useDocumentTitle("Reset password");
  const { server } = useSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="We'll send a reset link if the address has an account."
      footer={
        <Link to="/login" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success" title="Check your inbox">
          If an account exists for {email}, a reset link is on its way. It expires in one hour.
          {!server?.features?.password_reset_email && (
            <span className="mt-2 block">
              This server has no email configured, so the link was written to the server log. Ask your administrator for it.
            </span>
          )}
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" variant="primary" className="w-full justify-center" loading={busy} disabled={!email}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthCard } from "./AuthCard.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Button, ButtonLink } from "../../components/ui/Button.jsx";
import { Alert } from "../../components/ui/misc.jsx";
import { api } from "../../lib/api.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";

export default function ResetPassword() {
  useDocumentTitle("Choose a new password");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/reset", { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Choose a new password">
      {!token ? (
        <Alert tone="danger" title="Missing reset token">
          Open the link from your reset email, or{" "}
          <Link to="/forgot-password" className="underline">
            request a new one
          </Link>
          .
        </Alert>
      ) : done ? (
        <div className="space-y-4">
          <Alert tone="success" title="Password updated">
            All other sessions were signed out.
          </Alert>
          <ButtonLink to="/login" variant="primary" className="w-full justify-center">
            Sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="New password" hint="8 to 72 characters.">
            <Input type="password" autoComplete="new-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <Field label="Confirm password">
            <Input type="password" autoComplete="new-password" maxLength={72} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" className="w-full justify-center" loading={busy} disabled={password.length < 8}>
            Update password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

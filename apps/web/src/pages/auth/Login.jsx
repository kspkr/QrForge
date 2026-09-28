import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { AuthCard, safeNext } from "./AuthCard.jsx";
import { Field, Input } from "../../components/ui/Field.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Alert } from "../../components/ui/misc.jsx";
import { useSession } from "../../lib/session.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";

export default function Login() {
  useDocumentTitle("Sign in");
  const { login, user, server } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  if (user) return <Navigate to={next} replace />;
  if (server?.setup_required) return <Navigate to="/register" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.status === 429 ? "Too many attempts. Please wait a minute and try again." : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Sign in to QRForge"
      description="Manage dynamic codes, campaigns and analytics."
      footer={
        server?.registration_enabled ? (
          <>
            No account?{" "}
            <Link to="/register" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
              Create one
            </Link>
          </>
        ) : null
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="muted text-xs hover:text-zinc-900 dark:hover:text-zinc-100">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" className="w-full justify-center" loading={busy} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}

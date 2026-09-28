import { Link } from "react-router";
import { Logo } from "../../components/ui/icons.jsx";
import { useSession } from "../../lib/session.jsx";
import { Alert, Spinner } from "../../components/ui/misc.jsx";
import { ButtonLink } from "../../components/ui/Button.jsx";

/** Centered card used by sign-in, sign-up and password pages. */
export function AuthCard({ title, description, children, footer }) {
  const { server } = useSession();
  return (
    <div className="flex justify-center px-4 py-16 sm:py-24">
      <div className="animate-rise w-full max-w-[380px]">
        <Link to="/" className="mb-8 flex justify-center" aria-label="QRForge home">
          <Logo className="h-9 w-9" />
        </Link>
        <h1 className="text-center text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="muted mt-2 text-center text-sm">{description}</p>}
        <div className="surface mt-8 p-6">
          {server === undefined ? (
            <div className="flex justify-center py-8 text-zinc-400">
              <Spinner />
            </div>
          ) : server === null ? (
            <div className="space-y-4">
              <Alert tone="info" title="No QRForge server connected">
                Accounts, dynamic codes and analytics need QRForge Server. The Studio works without it.
              </Alert>
              <ButtonLink to="/studio" variant="primary" className="w-full justify-center">
                Open the Studio
              </ButtonLink>
            </div>
          ) : (
            children
          )}
        </div>
        {footer && server && <div className="muted mt-6 text-center text-sm">{footer}</div>}
      </div>
    </div>
  );
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

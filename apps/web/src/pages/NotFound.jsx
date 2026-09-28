import { ButtonLink } from "../components/ui/Button.jsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

export default function NotFound() {
  useDocumentTitle("Not found");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-32 text-center">
      <p className="font-mono text-sm text-ember-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn't exist</h1>
      <p className="muted mt-2 text-sm">The link may be broken, or the page may have moved.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink to="/" variant="secondary">
          Home
        </ButtonLink>
        <ButtonLink to="/studio" variant="primary">
          Open Studio
        </ButtonLink>
      </div>
    </div>
  );
}

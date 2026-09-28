import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Menu as MenuIcon, X, Sun, Moon, Monitor } from "lucide-react";
import { Logo, GitHubIcon } from "../ui/icons.jsx";
import { ButtonLink, Button } from "../ui/Button.jsx";
import { useSession } from "../../lib/session.jsx";
import { useTheme } from "../../lib/theme.jsx";
import { REPO_URL, DOCS_URL } from "../../lib/config.js";
import { cx } from "../../lib/cx.js";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const order = ["system", "light", "dark"];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={`Theme: ${theme}. Switch to ${next}.`} title={`Theme: ${theme}`}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}

const linkClass = ({ isActive }) =>
  cx(
    "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
    isActive ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
  );

export function SiteHeader() {
  const { server, user } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/75">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 text-[15px]" aria-label="QRForge home">
          <Logo className="h-6 w-6" />
          <span className="font-semibold tracking-tight">QRForge</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink to="/studio" className={linkClass}>
            Studio
          </NavLink>
          <a href={DOCS_URL} className={linkClass({})}>
            Docs
          </a>
          {server && user && (
            <NavLink to="/app" className={linkClass}>
              Dashboard
            </NavLink>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={REPO_URL}
            className="hidden h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 sm:inline-flex dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
          >
            <GitHubIcon className="h-4 w-4" />
            GitHub
          </a>
          <ThemeToggle />
          {server && !user && (
            <ButtonLink to="/login" variant="secondary" size="sm" className="hidden sm:inline-flex">
              Sign in
            </ButtonLink>
          )}
          <ButtonLink to="/studio" variant="primary" size="sm" className="hidden sm:inline-flex">
            Create QR code
          </ButtonLink>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="animate-fade-in border-t border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            <NavLink to="/studio" className={linkClass}>
              Studio
            </NavLink>
            <a href={DOCS_URL} className={linkClass({})}>
              Docs
            </a>
            <a href={REPO_URL} className={linkClass({})}>
              GitHub
            </a>
            {server && user && (
              <NavLink to="/app" className={linkClass}>
                Dashboard
              </NavLink>
            )}
            {server && !user && (
              <NavLink to="/login" className={linkClass}>
                Sign in
              </NavLink>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800/60">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo className="h-5 w-5" />
          <span className="text-sm font-medium">QRForge</span>
          <span className="muted text-sm">· MIT licensed · No ads, no tracking</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Footer">
          <Link to="/studio" className="muted hover:text-zinc-900 dark:hover:text-zinc-100">
            Studio
          </Link>
          <a href={DOCS_URL} className="muted hover:text-zinc-900 dark:hover:text-zinc-100">
            Documentation
          </a>
          <a href={`${REPO_URL}#self-hosting`} className="muted hover:text-zinc-900 dark:hover:text-zinc-100">
            Self-host
          </a>
          <a href={REPO_URL} className="muted hover:text-zinc-900 dark:hover:text-zinc-100">
            GitHub
          </a>
          <Link to="/report" className="muted hover:text-zinc-900 dark:hover:text-zinc-100">
            Report abuse
          </Link>
        </nav>
      </div>
    </footer>
  );
}

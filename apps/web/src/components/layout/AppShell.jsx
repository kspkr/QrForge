import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  QrCode,
  Zap,
  ChartColumn,
  Megaphone,
  Globe,
  KeyRound,
  Settings,
  ShieldCheck,
  Users,
  Flag,
  SlidersHorizontal,
  ScrollText,
  ArrowLeft,
  LogOut,
  Menu as MenuIcon,
  X,
  Plus,
  Palette,
} from "lucide-react";
import { Logo } from "../ui/icons.jsx";
import { Button, ButtonLink } from "../ui/Button.jsx";
import { ThemeToggle } from "./SiteHeader.jsx";
import { useSession } from "../../lib/session.jsx";
import { cx } from "../../lib/cx.js";

const APP_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/codes", label: "QR codes", icon: QrCode, match: (l) => l.pathname.startsWith("/app/codes") && !l.search.includes("kind=dynamic") },
  { to: "/app/codes?kind=dynamic", label: "Dynamic codes", icon: Zap, match: (l) => l.search.includes("kind=dynamic") },
  { to: "/app/analytics", label: "Analytics", icon: ChartColumn },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/app/domains", label: "Domains", icon: Globe },
  { to: "/app/api-keys", label: "API keys", icon: KeyRound },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const ADMIN_NAV = [
  { to: "/admin", label: "System", icon: ShieldCheck, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/codes", label: "QR codes", icon: QrCode },
  { to: "/admin/reports", label: "Abuse reports", icon: Flag },
  { to: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
];

function NavItem({ item }) {
  const location = useLocation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => {
        const active = item.match ? item.match(location) : isActive;
        return cx(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          active
            ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800/80 dark:text-zinc-50"
            : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100",
        );
      }}
    >
      <Icon className="h-4 w-4 opacity-80" />
      {item.label}
    </NavLink>
  );
}

function Sidebar({ admin }) {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const nav = admin ? ADMIN_NAV : APP_NAV;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="QRForge home">
          <Logo className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-tight">QRForge</span>
        </Link>
        {admin && <span className="rounded-md bg-ember-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ember-600 uppercase dark:text-ember-400">Admin</span>}
      </div>
      <div className="px-3 pb-3">
        {admin ? (
          <ButtonLink to="/app" variant="secondary" size="sm" className="w-full justify-center">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
          </ButtonLink>
        ) : (
          <ButtonLink to="/app/codes/new" variant="primary" size="sm" className="w-full justify-center">
            <Plus className="h-3.5 w-3.5" /> New dynamic code
          </ButtonLink>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label={admin ? "Admin" : "Dashboard"}>
        {nav.map((item) => (
          <NavItem key={item.to} item={item} />
        ))}
        {!admin && (
          <>
            <div className="my-3 h-px bg-zinc-200 dark:bg-zinc-800" />
            <NavItem item={{ to: "/studio", label: "QR Studio", icon: Palette }} />
            {user?.role === "admin" && <NavItem item={{ to: "/admin", label: "Admin", icon: ShieldCheck }} />}
          </>
        )}
      </nav>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold uppercase dark:bg-zinc-800">
            {(user?.name || user?.email || "?").slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user?.name || "Account"}</p>
            <p className="muted truncate text-xs">{user?.email}</p>
          </div>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ admin = false }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Close the drawer on navigation (state adjusted during render, not in an effect).
  const path = location.pathname + location.search;
  const [prevPath, setPrevPath] = useState(path);
  if (path !== prevPath) {
    setPrevPath(path);
    setOpen(false);
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden border-r border-zinc-200 bg-zinc-50/50 lg:sticky lg:top-0 lg:block lg:h-screen dark:border-zinc-800/70 dark:bg-zinc-950">
        <Sidebar admin={admin} />
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/85 px-4 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/85">
        <Link to="/" className="flex items-center gap-2" aria-label="QRForge home">
          <Logo className="h-6 w-6" />
          <span className="font-semibold tracking-tight">QRForge</span>
        </Link>
        <Button variant="ghost" size="icon" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <MenuIcon className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 w-72 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close navigation" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
            <Sidebar admin={admin} />
          </div>
        </div>
      )}

      <main id="main" className="min-w-0">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

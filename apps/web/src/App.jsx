import { lazy, Suspense } from "react";
import { Routes, Route, Outlet, Navigate, useLocation } from "react-router";
import { SiteHeader, SiteFooter } from "./components/layout/SiteHeader.jsx";
import { Spinner } from "./components/ui/misc.jsx";
import { useSession } from "./lib/session.jsx";
import Landing from "./pages/Landing.jsx";
import Studio from "./pages/Studio.jsx";
import NotFound from "./pages/NotFound.jsx";

// Account, dashboard and admin features are lazy-loaded so the Studio stays fast.
const Login = lazy(() => import("./pages/auth/Login.jsx"));
const Register = lazy(() => import("./pages/auth/Register.jsx"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword.jsx"));
const Report = lazy(() => import("./pages/Report.jsx"));
const AppShell = lazy(() => import("./components/layout/AppShell.jsx"));
const Overview = lazy(() => import("./pages/app/Overview.jsx"));
const Codes = lazy(() => import("./pages/app/Codes.jsx"));
const CodeNew = lazy(() => import("./pages/app/CodeNew.jsx"));
const CodeDetail = lazy(() => import("./pages/app/CodeDetail.jsx"));
const Analytics = lazy(() => import("./pages/app/Analytics.jsx"));
const Campaigns = lazy(() => import("./pages/app/Campaigns.jsx"));
const CampaignDetail = lazy(() => import("./pages/app/CampaignDetail.jsx"));
const Domains = lazy(() => import("./pages/app/Domains.jsx"));
const ApiKeys = lazy(() => import("./pages/app/ApiKeys.jsx"));
const Settings = lazy(() => import("./pages/app/Settings.jsx"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview.jsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.jsx"));
const AdminCodes = lazy(() => import("./pages/admin/AdminCodes.jsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.jsx"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings.jsx"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit.jsx"));

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
      <Spinner className="h-5 w-5" />
    </div>
  );
}

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-white px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3 dark:bg-zinc-900"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Guards dashboard routes: needs a reachable server and a signed-in user. */
function RequireUser({ admin = false }) {
  const { server, user, loading } = useSession();
  const location = useLocation();
  if (loading) return <PageFallback />;
  if (!server) return <Navigate to="/studio" replace />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/app" replace />;
  return (
    <Suspense fallback={<PageFallback />}>
      <AppShell admin={admin} />
    </Suspense>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="studio" element={<Studio />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="report" element={<Report />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="app" element={<RequireUser />}>
        <Route index element={<Overview />} />
        <Route path="codes" element={<Codes />} />
        <Route path="codes/new" element={<CodeNew />} />
        <Route path="codes/:id" element={<CodeDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="domains" element={<Domains />} />
        <Route path="api-keys" element={<ApiKeys />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="admin" element={<RequireUser admin />}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="codes" element={<AdminCodes />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>
    </Routes>
  );
}

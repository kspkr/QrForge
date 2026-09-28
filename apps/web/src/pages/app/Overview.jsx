import { Link } from "react-router";
import { Plus, Palette, QrCode, ArrowRight } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useSession } from "../../lib/session.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatNumber, formatRelative } from "../../lib/format.js";
import { AnalyticsPanel } from "../../components/AnalyticsPanel.jsx";
import { BarList } from "../../components/charts/charts.jsx";
import { QRThumb, StatusBadge } from "../../components/qr.jsx";
import { ButtonLink } from "../../components/ui/Button.jsx";
import { EmptyState, PageHeader, Skeleton } from "../../components/ui/misc.jsx";

export default function Overview() {
  useDocumentTitle("Overview");
  const { user } = useSession();
  const recent = useAsync(() => api.get("/qrcodes", { per_page: 5, sort: "-created_at" }), []);
  const hasCodes = (recent.data?.pagination.total ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title={`Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Scans across all of your dynamic QR codes."
        actions={
          <>
            <ButtonLink to="/studio" variant="secondary" size="sm">
              <Palette className="h-3.5 w-3.5" /> Studio
            </ButtonLink>
            <ButtonLink to="/app/codes/new" variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" /> Dynamic code
            </ButtonLink>
          </>
        }
      />

      {recent.loading && !recent.data ? (
        <Skeleton className="h-72" />
      ) : !hasCodes ? (
        <div className="surface">
          <EmptyState
            icon={QrCode}
            title="Create your first dynamic code"
            description="Dynamic codes point to a short link on this server, so you can change the destination after printing and see anonymous scan stats."
            action={
              <ButtonLink to="/app/codes/new" variant="primary">
                <Plus className="h-4 w-4" /> New dynamic code
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <AnalyticsPanel path="/analytics/overview">
          {(data) => (
            <div className="surface p-4">
              <BarList title="Top codes" items={(data.top_qrcodes ?? []).map((q) => ({ name: q.name, count: q.scans }))} />
            </div>
          )}
        </AnalyticsPanel>
      )}

      {hasCodes && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent codes</h2>
            <Link to="/app/codes" className="muted inline-flex items-center gap-1 text-xs hover:text-zinc-900 dark:hover:text-zinc-100">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="surface divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {recent.data.data.map((qr) => (
              <li key={qr.id}>
                <Link to={`/app/codes/${qr.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40">
                  <QRThumb qr={qr} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{qr.name}</p>
                    <p className="muted truncate text-xs">{qr.destination ?? qr.content.split(/\r?\n/)[0]}</p>
                  </div>
                  {qr.kind === "dynamic" && <span className="muted text-xs tabular-nums">{formatNumber(qr.scan_count)} scans</span>}
                  <StatusBadge qr={qr} />
                  <span className="muted hidden w-24 text-right text-xs sm:block">{formatRelative(qr.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

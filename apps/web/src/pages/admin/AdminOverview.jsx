import { Link } from "react-router";
import { Activity, Database, Cpu, Flag } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { formatBytes, formatDuration, formatNumber } from "../../lib/format.js";
import { StatTiles, TimeSeriesChart } from "../../components/charts/charts.jsx";
import { Badge } from "../../components/ui/controls.jsx";
import { Alert, PageHeader, Skeleton } from "../../components/ui/misc.jsx";

function InfoCard({ icon: Icon, title, rows }) {
  return (
    <div className="surface p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-zinc-400" /> {title}
      </h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="muted">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AdminOverview() {
  useDocumentTitle("Admin");
  const { data, error, loading } = useAsync(() => api.get("/admin/overview"), []);
  if (error) return <Alert tone="danger">{error.message}</Alert>;
  if (loading && !data) return <Skeleton className="h-96" />;
  const { counts, storage, system, traffic } = data;

  return (
    <div className="space-y-6">
      <PageHeader title="System" description="Health and usage of this QRForge server." />
      <StatTiles
        stats={[
          { label: "Users", value: counts.users },
          { label: "QR codes", value: counts.qrcodes },
          { label: "Active redirects", value: counts.active_redirects },
          { label: "Scans (24h)", value: counts.scans_24h },
          { label: "Scans (total)", value: counts.scans_total },
        ]}
      />
      <div className="surface p-5">
        <h3 className="mb-4 text-sm font-semibold">Redirect traffic · last 30 days</h3>
        <TimeSeriesChart data={traffic.map((t) => ({ bucket: t.bucket, scans: t.scans, unique: 0 }))} granularity="day" height={200} showUnique={false} />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={Activity}
          title="Health"
          rows={[
            ["Database", system.database === "ok" ? <Badge tone="success" dot>OK</Badge> : <Badge tone="danger" dot>Error</Badge>],
            ["Version", system.version],
            ["Uptime", formatDuration(system.uptime_seconds)],
          ]}
        />
        <InfoCard
          icon={Database}
          title="Storage"
          rows={[
            ["Driver", storage.driver],
            ["Database size", formatBytes(storage.database_bytes)],
            ["Dynamic codes", formatNumber(counts.dynamic_qrcodes)],
          ]}
        />
        <InfoCard
          icon={Cpu}
          title="Runtime"
          rows={[
            ["Go", system.go_version],
            ["Goroutines", formatNumber(system.goroutines)],
            ["Memory", formatBytes(system.memory_bytes)],
          ]}
        />
        <InfoCard
          icon={Flag}
          title="API & abuse"
          rows={[
            ["API keys", formatNumber(counts.api_keys)],
            ["API requests", formatNumber(counts.api_requests_total)],
            [
              "Open reports",
              counts.open_abuse_reports ? (
                <Link to="/admin/reports" className="font-medium text-red-600 hover:underline dark:text-red-400">
                  {counts.open_abuse_reports}
                </Link>
              ) : (
                0
              ),
            ],
          ]}
        />
      </div>
    </div>
  );
}

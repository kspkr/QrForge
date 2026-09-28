import { useState } from "react";
import { TimeSeriesChart, BarList, StatTiles } from "./charts/charts.jsx";
import { Segmented } from "./ui/controls.jsx";
import { Alert, Skeleton } from "./ui/misc.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { api } from "../lib/api.js";
import { formatNumber } from "../lib/format.js";

export const RANGES = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "365d", label: "1y" },
];

/**
 * Stat tiles, time series and breakdowns for any analytics endpoint.
 * `path` e.g. "/qrcodes/qr_x/analytics"; `children(data)` renders extra sections.
 */
export function AnalyticsPanel({ path, children, disabledNote }) {
  const [range, setRange] = useState("30d");
  const { data, error, loading } = useAsync(() => api.get(path, { range }), [path, range]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {disabledNote ?? <span />}
        <div className="w-full sm:w-72">
          <Segmented size="sm" label="Time range" value={range} onChange={setRange} options={RANGES} />
        </div>
      </div>

      {error && <Alert tone="danger">{error.message}</Alert>}

      {!data && loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      ) : data ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <StatTiles
            stats={[
              { label: "Total scans", value: data.totals.total_scans },
              { label: "Unique scans", value: data.totals.unique_scans },
              { label: "Today", value: data.totals.today },
              { label: "This week", value: data.totals.this_week },
              { label: "This month", value: data.totals.this_month },
            ]}
          />
          <div className="surface mt-5 p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Scan activity</h3>
              <p className="muted text-xs tabular-nums">
                {formatNumber(data.range_totals.scans)} scans · {formatNumber(data.range_totals.unique)} unique in range
              </p>
            </div>
            <TimeSeriesChart data={data.timeseries} granularity={data.range.granularity} />
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <div className="surface p-4">
              <BarList title="Devices" items={data.devices.map((d) => ({ ...d, name: d.name ? d.name[0].toUpperCase() + d.name.slice(1) : d.name }))} />
            </div>
            <div className="surface p-4">
              <BarList title="Operating systems" items={data.os} />
            </div>
            <div className="surface p-4">
              <BarList title="Browsers" items={data.browsers} />
            </div>
            <div className="surface p-4">
              <BarList title="Countries" items={data.countries} empty="Country data needs a trusted country header (see docs)." />
            </div>
            <div className="surface p-4">
              <BarList title="Referrers" items={data.referrers} empty="Most QR scans have no referrer." />
            </div>
            {children?.(data)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

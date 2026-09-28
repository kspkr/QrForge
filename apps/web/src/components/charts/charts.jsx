import { useId, useMemo, useRef, useState } from "react";
import { Table2, ChartColumn } from "lucide-react";
import { formatNumber, formatCompact } from "../../lib/format.js";
import { cx } from "../../lib/cx.js";

/*
 * Small, dependency-free SVG charts. One y-axis, a quiet grid, hover tooltips
 * and a table view for screen readers. The two series colors were checked for
 * color-vision deficiency and have separate tones for the dark theme.
 */
const SERIES = [
  { key: "scans", label: "Scans", cls: "fill-[#2a78d6] dark:fill-[#3987e5]", swatch: "bg-[#2a78d6] dark:bg-[#3987e5]", stroke: "stroke-[#2a78d6] dark:stroke-[#3987e5]" },
  { key: "unique", label: "Unique", cls: "fill-[#eb6834] dark:fill-[#d95926]", swatch: "bg-[#eb6834] dark:bg-[#d95926]", stroke: "stroke-[#eb6834] dark:stroke-[#d95926]" },
];

function niceMax(v) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

function bucketLabel(bucket, granularity, opts = {}) {
  const d = new Date(granularity === "hour" ? bucket : `${bucket}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return bucket;
  if (granularity === "hour") {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", ...(opts.long ? { weekday: "short", day: "numeric", month: "short" } : {}) }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC", ...(opts.long ? { weekday: "short", year: "numeric" } : {}) }).format(d);
}

/**
 * Scans over time: bars for total scans with a line for unique scans.
 * data: [{ bucket, scans, unique }]
 */
export function TimeSeriesChart({ data, granularity = "day", height = 240, showUnique = true }) {
  const series = showUnique ? SERIES : [SERIES[0]];
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const wrapRef = useRef(null);
  const titleId = useId();
  const width = 800;
  const pad = { top: 12, right: 8, bottom: 26, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = useMemo(() => niceMax(Math.max(1, ...data.map((d) => d.scans))), [data]);
  const n = data.length || 1;
  const slot = innerW / n;
  const barW = Math.max(1, Math.min(28, slot - 2)); // 2px surface gap between adjacent bars
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const x = (i) => pad.left + i * slot + slot / 2;
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const labelEvery = Math.ceil(n / 8);
  const total = data.reduce((s, d) => s + d.scans, 0);

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.unique).toFixed(1)}`).join("");

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - pad.left) / slot)));
    setHover(i);
  };

  const hovered = hover !== null ? data[hover] : null;

  return (
    <figure className="relative" aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        Scans over time. {formatNumber(total)} scans in range.
      </figcaption>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          {series.length > 1 && series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cx("h-2 w-2 rounded-sm", s.swatch)} />
              {s.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="muted inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-pressed={table}
        >
          {table ? <ChartColumn className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          {table ? "Chart" : "Table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-[280px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-left text-xs dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">{granularity === "hour" ? "Hour" : "Date"}</th>
                <th className="px-3 py-2 text-right font-medium">Scans</th>
                {showUnique && <th className="px-3 py-2 text-right font-medium">Unique</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.bucket} className="border-t border-zinc-100 dark:border-zinc-800/60">
                  <td className="px-3 py-1.5">{bucketLabel(d.bucket, granularity, { long: true })}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(d.scans)}</td>
                  {showUnique && <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(d.unique)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full touch-none select-none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onTouchStart={(e) => onMove(e.touches[0] ? { ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)}
            role="img"
            aria-label={`Bar chart of scans over time, ${formatNumber(total)} total`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray={t ? "2 4" : undefined} />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-zinc-500 text-[11px] tabular-nums dark:fill-zinc-500">
                  {formatCompact(Math.round(t))}
                </text>
              </g>
            ))}
            {hover !== null && (
              <rect x={pad.left + hover * slot} y={pad.top} width={slot} height={innerH} className="fill-zinc-900/[0.04] dark:fill-white/[0.05]" />
            )}
            {data.map((d, i) => {
              const h = (d.scans / max) * innerH;
              if (h <= 0) return null;
              const r = Math.min(4, barW / 2, h);
              const bx = x(i) - barW / 2;
              const by = y(d.scans);
              // Rounded data-end, square at the baseline.
              const path = `M${bx} ${pad.top + innerH}V${by + r}Q${bx} ${by} ${bx + r} ${by}H${bx + barW - r}Q${bx + barW} ${by} ${bx + barW} ${by + r}V${pad.top + innerH}Z`;
              return <path key={d.bucket} d={path} className={SERIES[0].cls} opacity={hover === null || hover === i ? 1 : 0.55} />;
            })}
            {showUnique && data.length > 1 && <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" className={SERIES[1].stroke} />}
            {hovered && showUnique && (
              <circle cx={x(hover)} cy={y(hovered.unique)} r="4.5" strokeWidth="2" className={cx(SERIES[1].cls, "stroke-white dark:stroke-zinc-900")} />
            )}
            {data.map((d, i) =>
              i % labelEvery === 0 ? (
                <text key={d.bucket} x={x(i)} y={height - 6} textAnchor="middle" className="fill-zinc-500 text-[11px]">
                  {bucketLabel(d.bucket, granularity)}
                </text>
              ) : null,
            )}
          </svg>
          {hovered && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-[140px] -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              style={{ left: `${Math.min(88, Math.max(12, (x(hover) / width) * 100))}%` }}
            >
              <p className="mb-1 font-medium">{bucketLabel(hovered.bucket, granularity, { long: true })}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-4 text-zinc-600 dark:text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <span className={cx("h-2 w-2 rounded-sm", s.swatch)} />
                    {s.label}
                  </span>
                  <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{formatNumber(hovered[s.key])}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Ranked horizontal bars (magnitude, single hue), doubling as an accessible list. */
export function BarList({ title, items, empty = "No data yet" }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-medium">
        <span className="text-zinc-700 dark:text-zinc-300">{title}</span>
        <span className="muted">Scans</span>
      </div>
      {items.length === 0 ? (
        <p className="muted py-6 text-center text-xs">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.name}
              className="group relative flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px]"
              title={`${item.name || "Unknown"}: ${formatNumber(item.count)} (${Math.round((item.count / total) * 100)}%)`}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-md bg-[#2a78d6]/15 transition-colors group-hover:bg-[#2a78d6]/25 dark:bg-[#3987e5]/20 dark:group-hover:bg-[#3987e5]/30"
                style={{ width: `${(item.count / max) * 100}%` }}
                aria-hidden="true"
              />
              <span className="relative truncate">{item.name || "Unknown"}</span>
              <span className="relative text-zinc-600 tabular-nums dark:text-zinc-300">{formatNumber(item.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Stat tiles for headline numbers (not a chart). */
export function StatTiles({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-800">
      {stats.map((s) => (
        <div key={s.label} className="bg-white px-4 py-3.5 dark:bg-zinc-950">
          <p className="muted text-xs">{s.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(s.value)}</p>
        </div>
      ))}
    </div>
  );
}

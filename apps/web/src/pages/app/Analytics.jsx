import { ShieldCheck } from "lucide-react";
import { AnalyticsPanel } from "../../components/AnalyticsPanel.jsx";
import { BarList } from "../../components/charts/charts.jsx";
import { PageHeader } from "../../components/ui/misc.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";

export default function Analytics() {
  useDocumentTitle("Analytics");
  return (
    <div>
      <PageHeader title="Analytics" description="Anonymous scan statistics across every dynamic code you own." />
      <AnalyticsPanel path="/analytics/overview">
        {(data) => (
          <div className="surface p-4">
            <BarList title="Top codes" items={(data.top_qrcodes ?? []).map((q) => ({ name: q.name, count: q.scans }))} />
          </div>
        )}
      </AnalyticsPanel>
      <p className="muted mt-8 flex items-start gap-2 text-xs leading-relaxed">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
        QRForge never stores IP addresses or full user agents. Unique scans use a salted hash that rotates daily, so visitors can't be
        tracked across days or codes. Times are in UTC.
      </p>
    </div>
  );
}

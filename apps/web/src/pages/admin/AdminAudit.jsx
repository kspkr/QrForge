import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { PageHeader } from "../../components/ui/misc.jsx";
import { AuditTable } from "../app/Settings.jsx";

export default function AdminAudit() {
  useDocumentTitle("Audit log · Admin");
  return (
    <div>
      <PageHeader title="Audit log" description="Security-relevant events across the whole server." />
      <div className="surface p-5">
        <AuditTable path="/admin/audit-log" />
      </div>
    </div>
  );
}

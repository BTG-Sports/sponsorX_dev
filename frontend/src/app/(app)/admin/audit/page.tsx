import { EmptyState } from "@/components/states";
import { AuditExplorer, type AuditPage } from "@/components/audit-explorer";
import { apiFetch, fetchActor } from "@/server/api";
import { loadMoreAudit } from "./actions";

/* --------------------------------------------------------------------------
   Audit log — P8-FE-02, §23 §30. Critical mutation history, browsable and
   filterable by record and by person: GET /audit-log (BTG admin only in the
   matrix). Filters come from the URL so a filtered history is shareable;
   the island changes them in place and pages with the keyset cursor.
   Live-only: there was never a fixture version of this screen.
   -------------------------------------------------------------------------- */

export default async function AuditPageRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const filters = { entity: one(sp.entity), actorId: one(sp.actorId), entityId: one(sp.entityId), action: one(sp.action) };
  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-xs text-muted">
        Every critical change — who did it, to what, and what moved. Written in the same transaction as the change.
      </p>
    </div>
  );

  const who = await fetchActor();
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
  const res = who.status === "linked" ? await apiFetch(`/audit-log${p.toString() ? `?${p}` : ""}`) : null;
  if (!res || res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="clock" title="The audit log is BTG admin's" hint="It holds the tenant's whole mutation history (RBAC matrix, auditLog)." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Audit log unavailable (${res.status}).`);
  const page = (await res.json()) as AuditPage;

  return (
    <div className="space-y-6">
      {heading}
      <AuditExplorer page={page} filters={filters} loadMore={loadMoreAudit} />
    </div>
  );
}

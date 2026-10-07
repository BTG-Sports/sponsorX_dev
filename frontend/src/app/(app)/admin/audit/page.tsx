import { EmptyState } from "@/components/states";
import { AuditExplorer, type AuditPage } from "@/components/audit-explorer";
import { apiListQuery, textParam } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Audit log — P8-FE-02, §23 §30. Critical mutation history, browsable and
   filterable by record and by person: GET /audit-log (BTG admin only in the
   matrix). Filters come from the URL so a filtered history is shareable;
   the island changes them in place.

   P1-FE-31 (2026-10-07): SERVER-PAGED, as a table — the house pager
   (?page, ?size) in place of "Load more" on the keyset cursor, so a page of
   the history is a link too.

   Reads  GET /audit-log?page&size&entity&actorId&entityId&action   one page, the facets and the count
   Live-only: there was never a fixture version of this screen.
   -------------------------------------------------------------------------- */

export default async function AuditPageRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = { entity: textParam(sp, "entity"), actorId: textParam(sp, "actorId"), entityId: textParam(sp, "entityId"), action: textParam(sp, "action") };
  const heading = (
    <div>
      <h1 className="sx-page-title">Audit log</h1>
      <p className="mt-1 text-xs text-muted">
        Every critical change — who did it, to what, and what moved. Written in the same transaction as the change.
      </p>
    </div>
  );

  const who = await fetchActor();
  const res = who.status === "linked" ? await apiFetch(`/audit-log${apiListQuery(sp, filters)}`) : null;
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
      <AuditExplorer page={page} filters={filters} />
    </div>
  );
}

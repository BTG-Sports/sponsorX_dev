import { EmptyState, SkeletonPage } from "@/components/states";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { demoState } from "@/lib/demo";
import { apiFetch } from "@/server/api";
import { deskView, prospectDeskQuery, type ProspectDeskPage } from "@/lib/prospects-live";
import { LiveProspectDesk } from "./live-prospects";

/* --------------------------------------------------------------------------
   P9-FE-11 — BTG and Sales's prospect desk (GET /prospects, P9-BE-21).
   Held prospects by default (?view=held), with the system's reasons; the
   auto-decided ones under ?view=auto. Server-paged (?page / ?size).
   ?demo=loading|empty|error keep the branded states.
   -------------------------------------------------------------------------- */

const PATH = "/admin/next/prospects";

export default async function ProspectDeskRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");
  if (demo === null) {
    const lacking = await staffWithoutAccess(PATH);
    if (lacking) return <NotInRole path={PATH} title="NEXT prospects" roles={lacking} />;
  }

  const sp = await searchParams;
  const view = deskView(sp.view);
  if (demo !== "empty") {
    const res = await apiFetch(`/prospects${prospectDeskQuery(sp, view)}`);
    if (res.ok) return <LiveProspectDesk desk={(await res.json()) as ProspectDeskPage} view={view} />;
    if (res.status !== 401 && res.status !== 403) throw new Error(`Prospects unavailable (${res.status}).`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Student prospects</h1>
      <EmptyState
        mark="chart"
        title="No prospects to show"
        hint="Businesses students bring in are decided automatically; the ones held for a person land here with the reason."
      />
    </div>
  );
}

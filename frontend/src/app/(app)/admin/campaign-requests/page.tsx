import { CampaignRequestsDesk } from "@/components/campaign-requests-desk";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { KpiTile } from "@/components/ops-stage";
import { EmptyState, SkeletonRows } from "@/components/states";
import { requestCounts, sortRequests, type ApiCampaignRequest } from "@/lib/campaign-change-live";
import { demoState } from "@/lib/demo";
import { readCampaignRequests } from "@/server/campaign-change";
import { decideCampaignRequestAction } from "./actions";

/* --------------------------------------------------------------------------
   Campaign requests — P8-FE-12. A cancel or change that could not apply on
   its own (something delivered, something paid that needs refunding, an open
   dispute, a minor's order, a closed edition, something falling outside new
   dates) waits here for BTG. Each row shows the same impact the requester
   saw — the affected products, their outcomes, the money, the hold reasons —
   with Approve and Decline (a note, emailed to the requester).

   A dashboard on the Mission Control stage: small title, four tiles, then
   the work. Reads GET /campaign-requests (P8-BE-12); until that lands the
   desk says "Not available yet" rather than fail. BTG admins and campaign
   managers. ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/campaign-requests";
const TITLE = "Campaign requests";

export default async function CampaignRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const read = demo === "empty" ? ({ ok: true, requests: [] } as const) : await readCampaignRequests();
  const rows: ApiCampaignRequest[] = read.ok ? sortRequests(read.requests) : [];
  const counts = requestCounts(rows);
  const now = new Date().getTime();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          A cancel or change that couldn&rsquo;t apply on its own waits here. Approve to apply it; decline with a note. The requester is emailed the answer either way.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Waiting" value={counts.waiting} caption={counts.waiting ? "for a BTG decision" : "nothing waiting"} tone={counts.waiting ? "orange" : "green"} delay={0.1} />
        <KpiTile label="Cancels" value={counts.cancels} caption="campaigns asked to end" tone="blue" delay={0.16} />
        <KpiTile label="Changes" value={counts.changes} caption="names, dates or budgets" tone="cyan" delay={0.22} />
        <KpiTile label="Decided" value={counts.decided} caption="approved or declined" tone="green" delay={0.28} />
      </dl>

      {!read.ok ? (
        <EmptyState
          mark="inbox"
          title={read.unavailable ? "Not available yet" : "Requests couldn't load"}
          hint={read.unavailable ? "Held cancel and change requests will show here once the campaign-requests API is live. Nothing is lost — a request that can't apply on its own still emails BTG admins." : read.message}
        />
      ) : rows.length === 0 ? (
        <EmptyState mark="inbox" title="Nothing waiting" hint="Cancels and changes that pass every check apply on their own. Only the ones that need a person land here." />
      ) : (
        <CampaignRequestsDesk rows={rows} decide={decideCampaignRequestAction} now={now} />
      )}
    </div>
  );
}

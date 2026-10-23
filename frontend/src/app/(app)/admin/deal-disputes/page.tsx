import { DealDisputeTable, OpenDealDispute } from "@/components/deal-dispute-desk";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { KpiTile } from "@/components/ops-stage";
import { TabLink, TabStrip } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { dealDisputeCounts, dealDisputeEmpty, dealDisputesForTab } from "@/lib/deal-dispute-desk";
import { DEAL_DISPUTE_TABS, dealDisputeTab, mayManageDisputes, type ApiDealDisputeList } from "@/lib/deal-disputes-live";
import { demoState } from "@/lib/demo";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Deal disputes — P8-FE-05. A concern raised about a deal (a school, a
   league, a parent, the sponsor) pauses the order: nothing on it moves and
   its earning is held until a BTG admin resumes or cancels it with a note.
   A dashboard on the Mission Control stage: small title, four tiles, then
   the work. Not the card-payment Disputes desk (/admin/payments/disputes).

   Reads  GET /deal-disputes   { disputes } — every dispute, newest first,
   up to 200, with no counts and no paging; the tiles and tab counts are
   computed here from that one read. BTG admin opens and decides; campaign
   managers read; Finance reads its own twin (/finance/deal-disputes).
   ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/deal-disputes";
const TITLE = "Deal disputes";
const ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"];

export default async function DealDisputesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const sp = await searchParams;
  const tab = dealDisputeTab(sp.tab);
  const empty = demo === "empty";
  const [res, who] = await Promise.all([empty ? null : apiFetch("/deal-disputes"), fetchActor()]);
  if (res?.status === 403) return <NotInRole path={PATH} title={TITLE} roles={ROLES} />;
  if (res && !res.ok) throw new Error(`Deal disputes unavailable (${res.status}).`);
  const all = res ? ((await res.json()) as ApiDealDisputeList).disputes : [];
  const counts = dealDisputeCounts(all);
  const rows = dealDisputesForTab(all, tab);
  const roles = who.status === "linked" ? who.actor.roles : [];
  const manager = mayManageDisputes(roles);
  const paused = counts.OPEN + counts.DOCUMENTS_IN;
  const now = new Date().getTime();
  const words = dealDisputeEmpty(tab);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="sx-page-title">{TITLE}</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
            A concern raised about a deal pauses the order — nothing on it moves and its earning is held — until a BTG admin resumes or cancels it with a note. The athlete, or their guardian, sends the documents BTG asks for.
          </p>
        </div>
        {manager ? <OpenDealDispute base={PATH} /> : <p className="text-xs text-muted">BTG admin opens and decides these.</p>}
      </div>

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Waiting on documents" value={counts.OPEN} caption={counts.OPEN ? "deals paused, documents owed" : "nothing owed"} tone={counts.OPEN ? "orange" : "green"} delay={0.1} />
        <KpiTile label="Documents in" value={counts.DOCUMENTS_IN} caption={counts.DOCUMENTS_IN ? "for a BTG admin to decide" : paused ? `${paused} deal${paused === 1 ? "" : "s"} paused` : "no deal paused"} tone="blue" delay={0.16} />
        <KpiTile label="Resumed" value={counts.RESUMED} caption="deals picked back up" tone="green" delay={0.22} />
        <KpiTile label="Cancelled" value={counts.CANCELLED} caption="deals ended over a concern" tone="cyan" delay={0.28} />
      </dl>

      <TabStrip label="Deal disputes">
        {DEAL_DISPUTE_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={counts[t.state]} hot={t.key === "documents"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={words.title} hint={words.hint} />
      ) : (
        <div className="space-y-2">
          <DealDisputeTable rows={rows} base={PATH} skin="admin" label={`Deal disputes · ${tab.label}`} now={now} />
          <p className="text-[11px] text-faint">Newest first. The desk shows the latest 200.</p>
        </div>
      )}
    </div>
  );
}

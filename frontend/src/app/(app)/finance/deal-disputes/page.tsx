import { DealDisputeTable } from "@/components/deal-dispute-desk";
import { StadiumHint } from "@/components/stadium-hint";
import { TabLink, TabStrip } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { VaultGhost, VaultHead, VaultTile, VaultTiles, VaultUpdated } from "@/components/vault-stage";
import { dealDisputeCounts, dealDisputeEmpty, dealDisputesForTab } from "@/lib/deal-dispute-desk";
import { DEAL_DISPUTE_TABS, dealDisputeTab, type ApiDealDisputeList } from "@/lib/deal-disputes-live";
import { demoState } from "@/lib/demo";
import { apiFetch } from "@/server/api";
import { Refused } from "../refused";

/* --------------------------------------------------------------------------
   Deal disputes — P8-FE-05, the Finance portal's read-only twin. A concern
   raised about a deal pauses the order and holds its earning until a BTG
   admin resumes or cancels it; Finance reads along, so a held earning on
   the Treasury can say why. On the Vault (P1-ART-25): small title, four
   tiles computed from the one read, then the work. No actions here — BTG
   admin opens and decides on /admin/deal-disputes.

   Reads  GET /deal-disputes   { disputes } — newest first, up to 200, no
   counts and no paging. The portal admits FINANCE only, so there is no
   role check here; a 403 from the API is the backstop (../refused.tsx).
   Every link stays inside /finance.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/finance/deal-disputes";
const TITLE = "Deal disputes";

export default async function DealDisputesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <VaultGhost label="Loading deal disputes" tiles={4} cols={4} rows={1} />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const tab = dealDisputeTab(sp.tab);
  const empty = demo === "empty";
  const res = empty ? null : await apiFetch("/deal-disputes");
  if (res?.status === 403) return <Refused title={TITLE} />;
  if (res && !res.ok) throw new Error(`Deal disputes unavailable (${res.status}).`);
  const all = res ? ((await res.json()) as ApiDealDisputeList).disputes : [];
  const counts = dealDisputeCounts(all);
  const rows = dealDisputesForTab(all, tab);
  const paused = counts.OPEN + counts.DOCUMENTS_IN;
  const read = new Date();
  const now = read.getTime();
  const readAt = read.toISOString();
  const words = dealDisputeEmpty(tab);

  return (
    <div className="space-y-5">
      <VaultHead
        title={TITLE}
        pill={<>Live · <VaultUpdated iso={readAt} /></>}
        actions={<StadiumHint skin="vault" label="About this desk" text="A concern raised about a deal pauses the order and holds its earning until a BTG admin resumes or cancels it. Finance reads along; the decision is BTG admin’s." />}
      >
        <VaultTiles cols={4}>
          <VaultTile label="Waiting on documents" value={counts.OPEN} format="int" tone={counts.OPEN ? "you" : undefined} badge={counts.OPEN > 0 ? counts.OPEN : undefined} caption={counts.OPEN ? "deals paused, documents owed" : "nothing owed"} delay={0.08} />
          <VaultTile label="Documents in" value={counts.DOCUMENTS_IN} format="int" caption={counts.DOCUMENTS_IN ? "for a BTG admin to decide" : paused ? `${paused} deal${paused === 1 ? "" : "s"} paused` : "no deal paused"} delay={0.12} />
          <VaultTile label="Resumed" value={counts.RESUMED} format="int" caption="earnings released" delay={0.16} />
          <VaultTile label="Cancelled" value={counts.CANCELLED} format="int" caption="earnings stay held" delay={0.2} />
        </VaultTiles>
      </VaultHead>

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
          <DealDisputeTable rows={rows} base={PATH} skin="vault" label={`Deal disputes · ${tab.label}`} now={now} />
          <p className="text-[11px] text-[color:var(--vault-faint)]">Newest first. The desk shows the latest 200. BTG admin opens and decides these.</p>
        </div>
      )}
    </div>
  );
}

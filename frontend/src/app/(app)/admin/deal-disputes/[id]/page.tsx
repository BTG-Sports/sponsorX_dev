import Link from "next/link";

import { DealChip, DealDisputeDetail } from "@/components/deal-dispute-desk";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { EmptyState } from "@/components/states";
import { orderStateTone, orderStateWords } from "@/lib/deal-dispute-desk";
import { dealStateLabel, dealStateTone, dealTabFor, mayManageDisputes, type ApiDealDispute } from "@/lib/deal-disputes-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   One deal dispute — P8-FE-05. The header (athlete, campaign, job, where
   the order is), the decision (Resolve for a BTG admin while the deal is
   paused; the outcome and note once decided), the concern, what BTG asked
   for, the documents behind the audited five-minute link (BTG admin only),
   and the facts. Campaign managers read.

   Reads  GET  /deal-disputes/:id
   Writes POST /deal-disputes/:id/resolve, GET …/documents/:documentId
          (deal-dispute-desk.tsx → ../actions.ts)
   The dispute emails link here. 404 from the API → an honest empty state.
   There is no admin order page to link to: the order's state is shown and
   its id is in the facts.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const LIST = "/admin/deal-disputes";
const TITLE = "Deal dispute";
const ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"];

export default async function DealDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lacking = await staffWithoutAccess(LIST);
  if (lacking) return <NotInRole path={LIST} title={TITLE} roles={lacking} />;
  const [res, who] = await Promise.all([apiFetch(`/deal-disputes/${encodeURIComponent(id)}`), fetchActor()]);
  if (res.status === 403) return <NotInRole path={LIST} title={TITLE} roles={ROLES} />;
  if (res.status === 404) {
    return (
      <div className="space-y-5">
        <Link href={LIST} className="text-xs text-muted hover:text-text">← Deal disputes</Link>
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="inbox" title="No deal dispute matches this link" hint="It may be in another tenant’s books, or the link is old." action={{ label: "Back to Deal disputes", href: LIST }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Deal dispute unavailable (${res.status}).`);
  const d = (await res.json()) as ApiDealDispute;
  const roles = who.status === "linked" ? who.actor.roles : [];
  const manager = mayManageDisputes(roles);
  const back = `${LIST}?tab=${dealTabFor(d.state).key}`;

  return (
    <div className="space-y-6">
      <Link href={back} className="text-xs text-muted hover:text-text">← Deal disputes</Link>

      <div>
        <h1 className="sx-page-title">{d.athleteName}</h1>
        <p className="mt-1 text-xs text-muted">{d.campaignName} · {d.job}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <DealChip skin="admin" tone={dealStateTone(d.state)}>{dealStateLabel(d.state)}</DealChip>
          <span className="text-[11px] text-muted">Order:</span>
          <DealChip skin="admin" tone={orderStateTone(d.orderState)}>{orderStateWords(d.orderState)}</DealChip>
        </p>
      </div>

      <DealDisputeDetail dispute={d} skin="admin" canManage={manager} canOpenDocuments={manager} />
    </div>
  );
}

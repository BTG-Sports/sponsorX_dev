import Link from "next/link";

import { DealChip, DealDisputeDetail } from "@/components/deal-dispute-desk";
import { EmptyState } from "@/components/states";
import { VaultHead, VaultUpdated, at } from "@/components/vault-stage";
import { orderStateTone, orderStateWords } from "@/lib/deal-dispute-desk";
import { dealStateLabel, dealStateTone, dealTabFor, type ApiDealDispute } from "@/lib/deal-disputes-live";
import { apiFetch } from "@/server/api";
import { Refused } from "../../refused";

/* --------------------------------------------------------------------------
   One deal dispute — P8-FE-05, the Finance portal's read-only twin. The
   header, the decision (or that it waits on a BTG admin), the concern,
   what BTG asked for, the documents by name only (BTG admin opens them),
   and the facts. No actions: Finance reads along.

   Reads  GET /deal-disputes/:id. The portal admits FINANCE only; a 403
   from the API is the backstop (../../refused.tsx). Every link stays
   inside /finance.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const LIST = "/finance/deal-disputes";
const TITLE = "Deal dispute";

export default async function DealDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/deal-disputes/${encodeURIComponent(id)}`);
  if (res.status === 403) return <Refused title={TITLE} />;
  if (res.status === 404) {
    return (
      <div className="space-y-5">
        <Link href={LIST} className="text-xs text-[color:var(--vault-muted)] hover:text-[color:var(--vault-gold-hi)]">← Deal disputes</Link>
        <VaultHead title={TITLE} />
        <EmptyState mark="inbox" title="No deal dispute matches this link" hint="It may be in another tenant’s books, or the link is old." action={{ label: "Back to Deal disputes", href: LIST }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Deal dispute unavailable (${res.status}).`);
  const d = (await res.json()) as ApiDealDispute;
  const back = `${LIST}?tab=${dealTabFor(d.state).key}`;
  const readAt = new Date().toISOString();

  return (
    <div className="space-y-6">
      <Link href={back} className="text-xs text-[color:var(--vault-muted)] hover:text-[color:var(--vault-gold-hi)]">← Deal disputes</Link>

      <VaultHead title={`${TITLE} · ${d.athleteName}`} pill={<>Live · <VaultUpdated iso={readAt} /></>}>
        <p className="sx-vault-in mt-2 text-xs text-[color:var(--vault-muted)]" style={at(0.04)}>{d.campaignName} · {d.job}</p>
        <p className="sx-vault-in mt-3 flex flex-wrap items-center gap-2" style={at(0.08)}>
          <DealChip skin="vault" tone={dealStateTone(d.state)}>{dealStateLabel(d.state)}</DealChip>
          <span className="text-[11px] text-[color:var(--vault-muted)]">Order:</span>
          <DealChip skin="vault" tone={orderStateTone(d.orderState)}>{orderStateWords(d.orderState)}</DealChip>
        </p>
      </VaultHead>

      <DealDisputeDetail dispute={d} skin="vault" canManage={false} canOpenDocuments={false} />
    </div>
  );
}

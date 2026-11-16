import { SellerOrderMissing } from "@/components/seller-orders";
import { AthleteSale } from "@/components/sale-wizard/sale-page";
import { sampleSale, sampleState } from "@/lib/sale-journey";
import type { ApiSellerOrder } from "@/lib/seller-orders-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "../../confirmations/confirmations.css";
import "./sale.css";

/* --------------------------------------------------------------------------
   One sale (the athlete's side) — 2S4-FE-03 / 2S4-FE-04 seller half.

   Reads  GET  /sales/:lineId              (own line, own share — 2S4-BE-06)
   Writes POST /sales/:lineId/proof        (photo grant — seller-sales-actions.ts)
          POST /sales/:lineId/delivered    (note, photo, link — 2S4-BE-07)
          the problem answer, the cancel answer and "Can't deliver"
          (2S4-BE-11 / 2S4-BE-12), all through seller-sales-actions.ts

   POL-FE-96 (2026-11-16) — redesigned as a step-by-step wizard (owner: the
   old page was "so confusing for a human"): a ticket with the share and
   whose move it is, then Sponsor pays → You deliver it → Sponsor checks it
   → You get paid, opening on the step the sale is at. Mark delivered is
   three short steps on the page instead of a pop-up. Drawn in the
   confirmations wizard's hand (its CSS is imported beside this page's
   own). Reads and writes unchanged. The property portal keeps the old
   detail (SellerOrderDetail).

   ?demo=sample&as=<state> walks a made-up sale through every state
   (lib/sale-journey.ts SAMPLE_STATES); nothing in it is sent.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteSaleDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePortalAccess("athlete");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const now = new Date();
  if (sp.demo === "sample") {
    const as = sampleState(sp.as);
    return <AthleteSale order={sampleSale(as, now)} now={now} sample={as} />;
  }
  const res = await apiFetch(`/sales/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) return <SellerOrderMissing kind="athlete" />;
  if (!res.ok) throw new Error(`Order unavailable (${res.status}).`);
  return <AthleteSale order={(await res.json()) as ApiSellerOrder} now={now} />;
}

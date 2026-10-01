import { SellerOrderDetail, SellerOrderMissing } from "@/components/seller-orders";
import type { ApiSellerOrder } from "@/lib/seller-orders-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   One order (the team's side) — 2S4-FE-03 / 2S4-FE-04 seller half (Claude
   Design Orders.dc.html, who = hawks: detail · mark · waiting · confirmed ·
   problem · unpaid). The line, the team's share, the delivery track,
   "Mark delivered", and the sponsor's contact once paid.

   Reads  GET  /sales/:lineId              (own line, own share — 2S4-BE-06)
   Writes POST /sales/:lineId/proof        (photo grant — seller-sales-actions.ts)
          POST /sales/:lineId/delivered    (note, photo, link — 2S4-BE-07)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertySaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("property");
  const { id } = await params;
  const res = await apiFetch(`/sales/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) return <SellerOrderMissing kind="team" />;
  if (!res.ok) throw new Error(`Order unavailable (${res.status}).`);
  return <SellerOrderDetail kind="team" order={(await res.json()) as ApiSellerOrder} />;
}

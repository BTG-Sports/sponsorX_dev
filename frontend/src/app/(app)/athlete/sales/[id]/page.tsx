import { SellerOrderDetail, SellerOrderMissing } from "@/components/seller-orders";
import { sampleOrder } from "@/lib/seller-orders-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   One order (the athlete's side) — 2S4-FE-03 / 2S4-FE-04 seller half
   (Claude Design Orders.dc.html, who = riley: detail · mark · waiting ·
   confirmed · problem · unpaid). The line, the athlete's share, the
   delivery track, "Mark delivered", and the sponsor's contact once paid.

   SCAFFOLD — sample data.
   Will read  GET /marketplace-orders/:id            (seller scope — 2S4-BE-06)
   Will write mark delivered → sponsor confirms in 24h (2S4-BE-07); the
              dialog's button is disabled until then.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;
  const order = sampleOrder("athlete", id);
  return order ? <SellerOrderDetail kind="athlete" order={order} /> : <SellerOrderMissing kind="athlete" />;
}

import { SellerOrderDetail, SellerOrderMissing } from "@/components/seller-orders";
import { sampleOrder } from "@/lib/seller-orders-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   One order (the team's side) — 2S4-FE-03 / 2S4-FE-04 seller half (Claude
   Design Orders.dc.html, who = hawks: detail · mark · waiting · confirmed ·
   problem · unpaid). The line, the team's share, the delivery track,
   "Mark delivered", and the sponsor's contact once paid.

   SCAFFOLD — sample data.
   Will read  GET /marketplace-orders/:id            (seller scope — 2S4-BE-06)
   Will write mark delivered → sponsor confirms in 24h (2S4-BE-07); the
              dialog's button is disabled until then.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertySaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("property");
  const { id } = await params;
  const order = sampleOrder("team", id);
  return order ? <SellerOrderDetail kind="team" order={order} /> : <SellerOrderMissing kind="team" />;
}

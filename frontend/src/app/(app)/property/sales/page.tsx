import { SellerOrdersList } from "@/components/seller-orders";
import { demoState } from "@/lib/demo";
import { sampleOrders } from "@/lib/seller-orders-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Orders (the team's sales) — 2S4-FE-03 and the seller half of 2S4-FE-04
   (Claude Design Orders.dc.html, who = hawks, list view). Every marketplace
   sale the team made, with the team's own share only — each athlete's
   share is on their own Orders page.

   SCAFFOLD — sample data. Reads nothing yet: GET /marketplace-orders is
   BTG's, Finance's and the buying sponsor's (policy.ts `marketplaceOrder`);
   a PROPERTY_MGR gets 403. The sellers' view is 2S4-BE-06.
   Will read  GET /marketplace-orders   (seller scope, own share — 2S4-BE-06)
   ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertySalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("property");
  return <SellerOrdersList kind="team" orders={sampleOrders("team")} demo={await demoState(searchParams)} />;
}

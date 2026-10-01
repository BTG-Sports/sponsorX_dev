import { SellerOrdersList } from "@/components/seller-orders";
import { demoState } from "@/lib/demo";
import { sampleOrders } from "@/lib/seller-orders-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Orders (the athlete's sales) — 2S4-FE-03 and the seller half of 2S4-FE-04
   (Claude Design Orders.dc.html, who = riley, list view). Every marketplace
   sale of the athlete's items, with their own share only.

   Not /athlete/orders: that route is Phase 1's Campaign Orders.

   SCAFFOLD — sample data. Reads nothing yet: GET /marketplace-orders is
   BTG's, Finance's and the buying sponsor's (policy.ts `marketplaceOrder`);
   an ATHLETE gets 403. The sellers' view is 2S4-BE-06.
   Will read  GET /marketplace-orders   (seller scope, own share — 2S4-BE-06)
   ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteSalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  return <SellerOrdersList kind="athlete" orders={sampleOrders("athlete")} demo={await demoState(searchParams)} />;
}

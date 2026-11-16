import { MarketplaceOrderDetail } from "@/components/marketplace-order-detail";

/* POL-FE-54 (app review B3) — one marketplace order, for Finance: the same
   page BTG has (components/marketplace-order-detail.tsx), so Finance can
   record a bank transfer. The API decides what each role may do. */

export const dynamic = "force-dynamic";

export default async function FinanceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MarketplaceOrderDetail id={id} back={{ href: "/finance/orders", label: "All orders" }} />;
}

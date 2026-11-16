import { MarketplaceOrderDetail } from "@/components/marketplace-order-detail";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";

/* One marketplace order, for BTG (2S7-FE-02). The body is shared with
   Finance's order page since POL-FE-54 — components/marketplace-order-detail.tsx. */

export const dynamic = "force-dynamic";

const PATH = "/admin/marketplace";

export default async function MarketplaceOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Marketplace operations" roles={lacking} />;
  const { id } = await params;
  /* POL-FE-54 — opened from All orders, the way back is the list. */
  const from = (await searchParams).from;
  const back = from === "orders" ? { href: "/admin/marketplace/orders", label: "All orders" } : { href: PATH, label: "Marketplace operations" };
  return <MarketplaceOrderDetail id={id} back={back} />;
}

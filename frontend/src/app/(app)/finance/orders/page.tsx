import { AllOrders } from "@/components/all-orders";
import { orderListQuery, orderListTab, type ApiOrderList } from "@/lib/all-orders-live";
import { apiFetch } from "@/server/api";

/* POL-FE-54 (app review B3) — Finance's All orders: find any marketplace
   order to record a bank transfer on it (Finance holds marketplaceOrder
   write tenant-wide). The Finance layout admits Finance only. */

export const dynamic = "force-dynamic";

export default async function FinanceOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = orderListTab(sp.tab);
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1;
  const res = await apiFetch(orderListQuery(tab, q, page));
  if (!res.ok) throw new Error(`Orders unavailable (${res.status}).`);
  const data = (await res.json()) as ApiOrderList;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">All orders</h1>
        <p className="mt-1 text-xs text-muted">Every Shop and package order. Open one to record a bank transfer.</p>
      </div>
      <AllOrders data={data} tab={tab} q={q} base="/finance/orders" orderHref={(id) => `/finance/orders/${encodeURIComponent(id)}`} tone="vault" />
    </div>
  );
}

import Link from "next/link";

import { AllOrders } from "@/components/all-orders";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { orderListQuery, orderListTab, type ApiOrderList } from "@/lib/all-orders-live";
import { apiFetch } from "@/server/api";

/* POL-FE-54 (app review B3) — BTG's All orders: every marketplace order by
   state, searchable, each opening the order page (mark paid by hand, cancel,
   refund). Before this the order page opened only from two queues. */

export const dynamic = "force-dynamic";

const PATH = "/admin/marketplace";

export default async function AllOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="All orders" roles={lacking} />;
  const sp = await searchParams;
  const tab = orderListTab(sp.tab);
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1;
  /* No catch — an outage is an error page. */
  const res = await apiFetch(orderListQuery(tab, q, page));
  if (!res.ok) throw new Error(`Orders unavailable (${res.status}).`);
  const data = (await res.json()) as ApiOrderList;
  return (
    <div className="space-y-6">
      <Link href={PATH} className="text-xs text-muted hover:text-text">← Marketplace operations</Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">All orders</h1>
        <p className="mt-1 text-xs text-muted">Every Shop and package order. Open one to record a payment, cancel or refund it.</p>
      </div>
      <AllOrders data={data} tab={tab} q={q} base="/admin/marketplace/orders" orderHref={(id) => `/admin/marketplace/orders/${encodeURIComponent(id)}?from=orders`} tone="admin" />
    </div>
  );
}

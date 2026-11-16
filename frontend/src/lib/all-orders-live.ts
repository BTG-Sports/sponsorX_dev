/* --------------------------------------------------------------------------
   POL-FE-54 (app review B3) — "All orders" for BTG and Finance. There was
   no orders list: the order page opened only from the approval and failed
   payment queues, or an email. GET /marketplace-orders?page&size&tab&q (the
   sponsor's own list's route, tenant-wide for BTG and Finance) gives one
   tab's page and every tab's count; the search matches the order id
   (SX-…), a line, the billing reference / name / email, or the sponsor.
   -------------------------------------------------------------------------- */

import type { ApiMarketplaceOrder } from "@/lib/marketplace-ops-live";

export const ORDER_LIST_TABS = [
  { key: "all", label: "All" },
  { key: "waiting", label: "Waiting for approval" },
  { key: "to_pay", label: "To pay" },
  { key: "in_progress", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;
export type OrderListTab = (typeof ORDER_LIST_TABS)[number]["key"];

export type ApiOrderList = {
  orders: (ApiMarketplaceOrder & { sponsorName?: string | null; billingReference?: string | null })[];
  page: { page: number; size: number; total: number; pages: number };
  tabs: { key: string; label: string; count: number }[];
};

/** ?tab= → a tab; anything else is All. */
export function orderListTab(v: string | string[] | undefined): OrderListTab {
  const k = Array.isArray(v) ? v[0] : v;
  return ORDER_LIST_TABS.find((t) => t.key === k)?.key ?? "all";
}

/** "SX-1A2B3C4D" (the id people read) → the part the API's id search matches. */
export function orderSearchTerm(q: string): string {
  const t = q.trim();
  const m = /^SX-([A-Z0-9]{4,8})$/i.exec(t);
  return m ? m[1]!.toLowerCase() : t;
}

/** The list's own query for the API. */
export function orderListQuery(tab: OrderListTab, q: string, page: number): string {
  const p = new URLSearchParams({ page: String(Math.max(1, page)), size: "20", tab });
  const term = orderSearchTerm(q);
  if (term) p.set("q", term);
  return `/marketplace-orders?${p.toString()}`;
}

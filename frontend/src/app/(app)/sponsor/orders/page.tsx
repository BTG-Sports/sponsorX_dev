import Link from "next/link";

import { Badge } from "@/components/ui";
import { EmptyState } from "@/components/states";
import {
  ORDER_STATES,
  fmtStamp,
  orderCopy,
  orderRef,
  orderStateParam,
  usd,
  type ApiOrder,
} from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Orders — 2S4-FE-02. The sponsor's marketplace orders (Phase 2 self-service
   buying), newest first. Distinct from Campaigns, which are BTG-managed
   Phase 1 campaign orders.

   Reads  GET /marketplace-orders[?state=]   own-sponsor scope, both sponsor
                                             roles. `?state` is only sent when
                                             it is one of the nine order states
                                             — the API does not validate it.

   Honest gap: no paging or counts in the API; the list is whatever it returns.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePortalAccess("sponsor");
  const sp = await searchParams;
  const state = orderStateParam(sp.state);

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-xs text-muted">What you&rsquo;ve bought in the shop, and where each order stands.</p>
      </div>
      <Link href="/sponsor/shop" className="text-xs text-primary hover:underline">
        Shop →
      </Link>
    </div>
  );

  const res = await apiFetch(`/marketplace-orders${state ? `?state=${state}` : ""}`);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="users" title="Orders aren't open to this account" hint="Orders belong to a sponsor organisation. Ask BTG to link your account." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Orders unavailable (${res.status}).`);
  const orders = [...((await res.json()) as { orders: ApiOrder[] }).orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const chip = (key: string | null, label: string) => (
    <Link
      key={key ?? "all"}
      href={key ? `/sponsor/orders?state=${key}` : "/sponsor/orders"}
      className={[
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        state === key ? "bg-surface-2 text-text" : "text-muted hover:text-text",
      ].join(" ")}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      {heading}
      <nav aria-label="Order state" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {chip(null, "All")}
        {ORDER_STATES.map((s) => chip(s, orderCopy(s).label))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={state ? `No orders ${orderCopy(state).label.toLowerCase()}` : "No orders yet"}
          hint={state ? "Try All, or another state." : "Orders appear here once you check out from the cart."}
          action={state ? { label: "Show all orders", href: "/sponsor/orders" } : { label: "Go to the shop", href: "/sponsor/shop" }}
        />
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const c = orderCopy(o.state);
            return (
              <li key={o.id}>
                <Link
                  href={`/sponsor/orders/${encodeURIComponent(o.id)}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-line-soft hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{orderRef(o.id)}</span>
                      <Badge tone={c.tone}>{c.label}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {o.lines.map((l) => l.title).join(" · ") || "No lines"}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-faint">Placed {fmtStamp(o.createdAt)}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{usd(o.totalCents)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

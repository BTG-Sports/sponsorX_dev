import Link from "next/link";

import { ListSearch, ServerList } from "@/components/server-pager";
import type { FilterTone } from "@/components/filter-kit";
import { Badge } from "@/components/ui";
import { ORDER_LIST_TABS, type ApiOrderList, type OrderListTab } from "@/lib/all-orders-live";
import { ORDER_STATE_COPY, shortId, usd } from "@/lib/marketplace-ops-live";

/* --------------------------------------------------------------------------
   POL-FE-54 (app review B3) — BTG's and Finance's "All orders": tabs by
   state with counts, a search, and every row opening the order. Server
   rendered; the base path and the order link are the caller's.
   -------------------------------------------------------------------------- */

export function AllOrders({
  data, tab, q, base, orderHref, tone,
}: {
  data: ApiOrderList;
  tab: OrderListTab;
  q: string;
  base: string;
  orderHref: (id: string) => string;
  tone: FilterTone;
}) {
  const href = (t: OrderListTab, page = 1) => {
    const p = new URLSearchParams();
    if (t !== "all") p.set("tab", t);
    if (q) p.set("q", q);
    if (page > 1) p.set("page", String(page));
    const s = p.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };
  const count = (k: string) => data.tabs.find((t) => t.key === k)?.count ?? 0;
  return (
    <div className="space-y-4">
      <nav aria-label="Order states" className="flex flex-wrap gap-2">
        {ORDER_LIST_TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} aria-current={t.key === tab ? "page" : undefined}
            className={["inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs", t.key === tab ? "border-primary/50 bg-primary/12 text-text" : "border-line text-muted hover:text-text"].join(" ")}>
            {t.label} <span className="tabular-nums text-faint">{count(t.key)}</span>
          </Link>
        ))}
      </nav>
      <ServerList>
        <ListSearch initial={q} label="Search orders" placeholder="Order (SX-…), item, sponsor, billing reference, name or email…" tone={tone} />
      </ServerList>
      {data.orders.length === 0 ? (
        <p className="rounded-xl border border-line-soft px-4 py-6 text-center text-xs text-muted">
          {q ? "No order matches this search." : "No orders in this tab."}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-xl border border-line-soft" aria-label="Orders">
          {data.orders.map((o) => {
            const state = ORDER_STATE_COPY[o.state] ?? { label: o.state, tone: "neutral" as const };
            return (
              <li key={o.id}>
                <Link href={orderHref(o.id)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-medium">{shortId(o.id)}</span>
                    <span className="block text-[11px] text-muted [overflow-wrap:anywhere]">
                      {o.sponsorName ?? "A sponsor"} · {o.lines.length} item{o.lines.length === 1 ? "" : "s"}
                      {o.billingReference ? ` · ref ${o.billingReference}` : ""} · {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">{usd(o.totalCents)}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {data.page.pages > 1 && (
        <p className="flex items-center gap-3 text-xs text-muted">
          {data.page.page > 1 && <Link className="underline" href={href(tab, data.page.page - 1)}>Previous</Link>}
          <span>Page {data.page.page} of {data.page.pages} · {data.page.total} orders</span>
          {data.page.page < data.page.pages && <Link className="underline" href={href(tab, data.page.page + 1)}>Next</Link>}
        </p>
      )}
    </div>
  );
}

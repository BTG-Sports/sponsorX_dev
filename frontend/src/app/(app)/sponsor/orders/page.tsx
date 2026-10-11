import type { ReactNode } from "react";
import Link from "next/link";

import { ListSearch, PendingList, ServerList } from "@/components/server-pager";
import { EmptyState } from "@/components/states";
import {
  StadiumChip,
  StadiumDate,
  StadiumHead,
  StadiumPanel,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
} from "@/components/stadium-stage";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { orderRef, usd, type ApiOrder } from "@/lib/shop-live";
import { textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { orderWord } from "@/lib/sponsor-words";
import { liveSponsorOrderPage, ORDER_TAB_FILTERS, type OrderTab } from "@/server/sponsor";

/* --------------------------------------------------------------------------
   Sponsor Orders — on the Stadium Board (P1-ART-23 Task 15, spec
   2026-10-11 §7.10, §8.2). What the sponsor has bought in the shop
   (Phase 2 self-service buying), searchable, tabbed by where each order
   stands, and server-paged. Distinct from Campaigns, which are BTG-managed
   Phase 1 campaign orders.

   Every tile and tab count is the API's own (memory: stats-must-be-retrievable):
     GET /marketplace-orders/summary          Waiting, In progress, Delivered,
                                               Total spent
     GET /marketplace-orders?page&size&tab&q  the paged table and its tabs
   Nothing is summed from the rows on screen. Money is in cents.

   Honest gap: orders aren't open to every signed-in sponsor role — a role
   admitted to the portal but not linked to a sponsor tenant gets a 403 here,
   same as before paging landed. There is no demo deck for this page (the
   plan doesn't ask for one): that account sees why, not fixtures dressed as
   its own spend.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/sponsor/orders";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const live = await liveSponsorOrderPage(sp);

  if (!live) {
    return (
      <div className="space-y-6">
        <StadiumHead title="Your orders" />
        <EmptyState
          mark="users"
          title="Orders aren't open to this account"
          hint="Orders belong to a sponsor organisation. Ask BTG to link your account."
        />
      </div>
    );
  }

  const now = new Date();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  /* The validated tab — an unrecognised `?tab=` drops out here exactly as it
     does from the API query, so the tab strip and the "filtered" state agree
     with what was actually asked for, not with whatever junk sat in the URL. */
  const tab = textParam(sp, "tab", ORDER_TAB_FILTERS);
  const filtered = Boolean(q || (tab && tab !== "all"));
  const summary = live.summary;
  const byTab = summary?.byTab ?? {};
  const waiting = byTab.waiting ?? 0;
  const inProgress = byTab.in_progress ?? 0;
  const delivered = byTab.delivered ?? 0;

  return (
    <div className="space-y-6">
      <StadiumHead title="Your orders" pill={<StadiumUpdated iso={now.toISOString()} />}>
        {summary && (
          <StadiumTiles cols={4}>
            <StadiumTile
              label="Waiting for approval"
              value={waiting}
              href={tabHref(sp, "waiting")}
              hint="Orders the seller or BTG still has to approve. Nothing is charged yet."
              delay={0.1}
            />
            <StadiumTile
              label="In progress"
              value={inProgress}
              href={tabHref(sp, "in_progress")}
              hint="Paid orders whose items are being delivered."
              delay={0.16}
            />
            <StadiumTile
              label="Delivered"
              value={delivered}
              href={tabHref(sp, "delivered")}
              hint="Orders whose items are done."
              delay={0.22}
            />
            <StadiumTile
              label="Total spent"
              value={summary.spentCents}
              format="usd0"
              hint="What you've paid across every order, once it's approved or further along."
              delay={0.28}
            />
          </StadiumTiles>
        )}
      </StadiumHead>

      <OrderList sp={sp} q={q} tab={tab} filtered={filtered} rows={live.rows} page={live.page} tabs={live.tabs} />
    </div>
  );
}

function OrderList({
  sp, q, tab, filtered, rows, page, tabs,
}: {
  sp: SearchParams;
  q: string;
  tab: string;
  filtered: boolean;
  rows: ApiOrder[];
  page: PageInfo;
  tabs: OrderTab[];
}) {
  const outOfRange = page.page > page.pages;
  const empty: ReactNode = outOfRange ? (
    "No orders on this page. Go back to the first page to see them."
  ) : filtered ? (
    "No orders match."
  ) : (
    <>
      No orders yet.{" "}
      <Link href="/sponsor/shop" className="font-medium text-sponsor hover:underline">
        Browse the shop →
      </Link>
    </>
  );

  const columns: Column[] = [
    { key: "order", label: "Order" },
    { key: "status", label: "Status" },
    { key: "placed", label: "Placed" },
    { key: "total", label: "Total", num: true },
  ];

  return (
    <section className="min-w-0" aria-labelledby="sx-your-orders">
      <h2 id="sx-your-orders" className="sx-section-title mb-3">Your orders</h2>
      <ServerList>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <TabStrip label="Order status">
            {tabs.map((t) => (
              <TabLink key={t.key} href={tabHref(sp, t.key === "all" ? "" : t.key)} on={t.key === "all" ? !tab : tab === t.key} count={t.count} hot={t.key === "to_pay"}>
                {t.label}
              </TabLink>
            ))}
          </TabStrip>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-64">
            <ListSearch initial={q} label="Search your orders" placeholder="Search by order or item" tone="sponsor" />
          </div>
        </div>
        {rows.length === 0 ? (
          <PendingList>
            <StadiumPanel>
              <p className="text-sm text-muted">{empty}</p>
            </StadiumPanel>
          </PendingList>
        ) : (
          <PagedTable bare tone="sponsor" page={page} noun="Orders" filtered={filtered} label="Your orders" columns={columns}>
            {rows.map((o, i) => {
              const word = orderWord(o.state);
              return (
                <Tr key={o.id} i={i}>
                  <Td>
                    <Link
                      href={`/sponsor/orders/${encodeURIComponent(o.id)}`}
                      className="block rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sponsor"
                    >
                      <Primary sub={o.lines.map((l) => l.title).join(" · ") || "No lines"}>{orderRef(o.id)}</Primary>
                    </Link>
                  </Td>
                  <Td label="Status">
                    <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
                  </Td>
                  <Td label="Placed" muted>
                    <StadiumDate iso={o.createdAt} format="date" />
                  </Td>
                  <Td label="Total" num>
                    {usd(o.totalCents)}
                  </Td>
                </Tr>
              );
            })}
          </PagedTable>
        )}
      </ServerList>
    </section>
  );
}

/** A tab's href: keep every other param, drop the page, set `tab`. */
function tabHref(sp: SearchParams, tab: string): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || k === "tab") continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (typeof val === "string" && val) u.set(k, val);
  }
  if (tab) u.set("tab", tab);
  const s = u.toString();
  return s ? `${PATH}?${s}` : PATH;
}

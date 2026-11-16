import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaHead, ArenaUpdated } from "@/components/arena-stage";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { FirstSaleHero } from "@/components/athlete-sales/sales-board";
import { SalesAsks, SalesRoadHelp, SalesShop } from "@/components/athlete-sales/sales-shop";
import { ServerList } from "@/components/server-pager";
import { EmptyState, ErrorPanel, SkeletonRows } from "@/components/states";
import { approvalCard, saleCard, salesShopTabs, salesSidings, salesStations } from "@/lib/athlete-sales-shop";
import { demoState } from "@/lib/demo";
import { apiListQuery, apiListQueryFor, pageOrAll, textParam } from "@/lib/list-query";
import { approvalsToList } from "@/lib/order-automation-live";
import { APPROVAL_KEYS, SELLER, salesTab, salesTabParam, salesTabs, shareNote, type ApiApprovalList, type ApiSalesList } from "@/lib/seller-orders-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "../inventory/inventory.css";
import "./sales.css";

/* --------------------------------------------------------------------------
   Sales (the athlete's) — 2S4-FE-03 and the seller half of 2S4-FE-04.
   Every marketplace sale of the athlete's items — sold by them, or by
   their team — with their own share only. Not /athlete/orders: that route
   is Phase 1's Campaign Orders. One sale opens on ./[id].

   Reads  GET /sales?page&size[&tab][&q]   → { sales, page, tabs } (2S4-BE-06)
          GET /seller-approvals?apage&asize → { approvals, page, counts }
                                              (2S4-FE-05 / BE-09)
   ?demo=loading|empty|error renders the branded states.

   POL-FE-95 (2026-11-16) — redrawn like Inventory and Listings (POL-FE-83/
   84). The owner: the old page was "so confusing for a human" — four KPI
   plates with captions, a table led by the order ref, a pill that said
   whose turn it was but not what to do. Top to bottom now:
     1. the title, with Payouts beside it;
     2. "How a sale moves": Sold → Paid → Delivered → Confirmed, four
        stations on a flowing rail with the API's tab counts (a click opens
        that tab), and Problems / Cancelled off the road when there are any —
        since 2026-11-16 in a popup behind a "How a sale moves" help button
        beside Payouts (owner: "same in the /athlete/sales");
     3. a sponsor waiting for a yes or no (the approvals), when any;
     4. the sales: tabs, search, List ↔ Cards; each sale says what was sold
        to whom, the athlete's share, what happens next as a sentence
        ("Deliver it by Oct 17"), "Your move" when it's theirs, and a track.
   Nothing sold yet: a hero with the four steps a sale takes. Every count is
   the API's (memory: stats-must-be-retrievable). The property portal's
   Sales (/property/sales, SellerOrdersList kind="team") is unchanged.
   Words: lib/athlete-sales-shop.ts. Styles: inventory.css + ./sales.css.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const TITLE = "Sales";
const PATH = SELLER.athlete.basePath;
const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** `help`: "How a sale moves", the road in a popup — only once there is a sale on it. */
function Head({ lede = true, help }: { lede?: boolean; help?: ReactNode }) {
  return (
    <ArenaHead
      title={TITLE}
      pill={<ArenaUpdated />}
      actions={
        <span className="sx-sl-head-actions">
          {help}
          <Link href={SELLER.athlete.moneyHref} className="sx-iv-rules sx-sl-payouts">
            <Glyph ui="coin" className="size-4" />
            Payouts
            <Glyph ui="arrow" className="size-3.5" />
          </Link>
        </span>
      }
    >
      {lede && (
        <p className="sx-iv-lede sx-iv-rise" style={d(0.06)}>
          Everything sponsors bought from you, and what to do next on each one.
        </p>
      )}
    </ArenaHead>
  );
}

const EMPTY: Record<string, { title: string; hint: string }> = {
  to_deliver: { title: "Nothing to deliver right now", hint: "A paid sale shows here until you mark it delivered." },
  awaiting_payment: { title: "Every sale is paid", hint: "A sale waits here until the sponsor pays." },
  delivered: { title: "Nothing waiting for a sponsor", hint: "Once you mark a sale delivered, the sponsor has 24 hours to confirm." },
  problems: { title: "No problems", hint: "If a sponsor reports a problem, it shows here and we email you." },
  confirmed: { title: "Nothing confirmed yet", hint: "A sale lands here once the sponsor confirms it, or 24 hours pass without an answer." },
  cancelled: { title: "Nothing cancelled", hint: "Cancelled and refunded sales show here." },
};

export default async function AthleteSalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const demo = await demoState(searchParams);
  if (demo === "loading" || demo === "error" || demo === "empty") {
    return (
      <div className="sx-iv sx-sl space-y-8">
        <Head lede={demo !== "error"} />
        {demo === "loading" ? (
          <div className="sx-iv-list">
            <SkeletonRows rows={4} />
          </div>
        ) : demo === "error" ? (
          <ErrorPanel title="Sales didn’t load" hint="The rest of the portal still works. Try again in a minute." />
        ) : (
          <FirstSaleHero />
        )}
      </div>
    );
  }

  const sp = await searchParams;
  const q = textParam(sp, "q");
  const tabKey = salesTabParam(sp.tab);
  const [res, appRes] = await Promise.all([
    apiFetch(`/sales${apiListQuery(sp, { tab: tabKey, q })}`),
    apiFetch(`/seller-approvals${apiListQueryFor(sp, APPROVAL_KEYS)}`).catch(() => null),
  ]);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} />
        <EmptyState mark="inbox" title="No athlete profile is linked to this login" hint="Your sales show here once your login is linked to your athlete profile." />
      </div>
    );
  }
  if (!res.ok) {
    return (
      <div className="sx-iv sx-sl space-y-8">
        <Head lede={false} />
        <ErrorPanel title="Sales didn’t load" hint="The rest of the portal still works. Try again in a minute." />
      </div>
    );
  }

  const list = (await res.json()) as ApiSalesList;
  const apiTabs = salesTabs(list);
  const tab = salesTab(sp.tab, apiTabs).key;
  /* 2S4-FE-05 — a failed approvals read hides that list, never the page. */
  const app = appRes?.ok ? ((await appRes.json()) as ApiApprovalList) : null;
  const approvals = app ? (app.page ? app.approvals : approvalsToList(app.approvals)) : [];
  const waiting = app?.counts?.waiting ?? approvals.filter((a) => a.canAnswer).length;

  const now = new Date();
  const page = pageOrAll(list.sales, list.page);
  const cards = list.sales.map((o) => saleCard(o, now));
  const filtered = tab !== "all" || q !== "";
  const allCount = apiTabs.find((t) => t.key === "all")?.count ?? page.total;
  const nothingYet = allCount === 0 && approvals.length === 0 && !filtered;
  /* A roster athlete's line is sold by their team: their team's share is elsewhere. */
  const soldByTeam = list.sales.some((o) => o.line.athlete !== null && o.line.soldBy !== o.line.athlete);

  return (
    <ServerList>
      <div className="sx-iv sx-sl space-y-8">
        <Head help={!nothingYet && allCount > 0 ? <SalesRoadHelp stations={salesStations(apiTabs)} sidings={salesSidings(apiTabs)} tab={tab} /> : undefined} />
        {nothingYet ? (
          <FirstSaleHero />
        ) : (
          <>
            {approvals.length > 0 && (
              <SalesAsks
                asks={approvals.map((a) => approvalCard(a, now))}
                waiting={waiting}
                page={pageOrAll(approvals, app?.page)}
                keys={APPROVAL_KEYS}
                hrefBase={PATH}
              />
            )}
            <section aria-label="Your sales">
              <SalesShop
                cards={cards}
                tabs={salesShopTabs(apiTabs, tab)}
                tab={tab}
                q={q}
                filtered={filtered}
                page={page}
                hrefBase={PATH}
                note={shareNote("athlete", soldByTeam)}
                empty={
                  q
                    ? { title: "No sale matches that search", hint: "Try another word, or clear the search to see every sale." }
                    : (EMPTY[tab] ?? { title: "No sales yet", hint: "When a sponsor buys one of your items, it shows here and we email you." })
                }
              />
            </section>
          </>
        )}
      </div>
    </ServerList>
  );
}

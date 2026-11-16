import type { CSSProperties } from "react";
import Link from "next/link";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { ServerList } from "@/components/server-pager";
import { OrdersHelp, OrdersShop, PayStrip } from "@/components/sponsor-orders/orders-board";
import { EmptyState } from "@/components/states";
import { StadiumHead, StadiumUpdated } from "@/components/stadium-stage";
import { textParam, type SearchParams } from "@/lib/list-query";
import { emptyWords, orderCard, orderStations, orderTabs } from "@/lib/orders-board";
import { liveSponsorOrderPage, ORDER_TAB_FILTERS } from "@/server/sponsor";

import "./orders.css";

/* --------------------------------------------------------------------------
   Sponsor Orders — on the Stadium Board (P1-ART-23 Task 15, spec
   2026-10-11 §7.10, §8.2). What the sponsor has bought in the shop
   (Phase 2 self-service buying), searchable, tabbed by where each order
   stands, and server-paged. Distinct from Campaigns, which are BTG-managed
   Phase 1 campaign orders.

   POL-FE-98 (2026-11-16) — redrawn like the athlete's Inventory, Listings
   and Sales after the owner found the table "so confusing for a human":
   keep the Stadium theme, add animation and wow. The page reads top to
   bottom:
     1. the title, a line on what this page is, a way back to the shop, and
        "How orders work" — a help button whose popup is the scoreboard:
        how an order moves (Waiting → To pay → In progress → Delivered),
        each step's count, and what's been spent; a step opens its tab
        (owner, after the first look: "make this inside a popup panel
        which trigger by a help button");
     2. "Your move" — only while orders wait to be paid;
     3. the orders: tabs with counts, search, Cards ↔ List, and per order
        what was bought from whom, the total, what happens next as a
        sentence and the four stops of its journey.
   A sponsor with no orders gets a hero instead of 2–3 (and no help
   button): the three steps to a first order and a big "Browse the shop".

   Every count is the API's own (memory: stats-must-be-retrievable):
     GET /marketplace-orders/summary          byTab, spentCents, paymentsOpen
     GET /marketplace-orders?page&size&tab&q  the page of orders and its tabs
   Nothing is summed from the rows on screen. Money is in cents. Words are
   worked out server-side in lib/orders-board.ts; styles in ./orders.css.

   Honest gap: orders aren't open to every signed-in sponsor role — a role
   admitted to the portal but not linked to a sponsor tenant gets a 403 here,
   same as before paging landed. There is no demo deck for this page (the
   plan doesn't ask for one): that account sees why, not fixtures dressed as
   its own spend.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const at = (s: number) => ({ "--sx-reveal-delay": `${s}s` }) as CSSProperties;

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
     does from the API query, so the tabs and the "filtered" state agree with
     what was actually asked for, not with whatever junk sat in the URL. */
  const tab = textParam(sp, "tab", ORDER_TAB_FILTERS) || "all";
  const filtered = Boolean(q || tab !== "all");
  const summary = live.summary;
  const paymentsOpen = summary?.paymentsOpen;
  /* The board shows the whole picture (the summary); without one, the
     tabs' own counts (which follow the search). */
  const byTab = summary?.byTab ?? Object.fromEntries(live.tabs.map((t) => [t.key, t.count]));
  const total = summary ? (summary.byTab.all ?? 0) : live.page.total;
  const firstOrder = !filtered && total === 0 && live.rows.length === 0;
  const toPay = paymentsOpen === false ? 0 : (byTab.to_pay ?? 0);
  const cards = live.rows.map((o) => orderCard(o, now, paymentsOpen));

  return (
    <ServerList>
      <div className="sx-or space-y-6">
        <StadiumHead
          title="Your orders"
          pill={<StadiumUpdated iso={now.toISOString()} />}
          actions={
            <>
            {!firstOrder && (
              <OrdersHelp stations={orderStations(byTab, paymentsOpen)} cancelled={byTab.cancelled ?? 0} spentCents={summary ? summary.spentCents : null} tab={tab} />
            )}
            <Link href="/sponsor/shop" className="sx-or-head-link">
              <Glyph ui="tag" className="size-4" />
              Shop
            </Link>
            </>
          }
        >
          <p className="sx-or-lede sx-stadium-in" style={at(0.02)}>
            Everything you&rsquo;ve bought in the shop: where each order is, and what happens next.
          </p>
        </StadiumHead>

        {firstOrder ? (
          <FirstOrderHero />
        ) : (
          <>
            {toPay > 0 && <PayStrip count={toPay} tab={tab} />}
            <section aria-label="Your orders">
              <OrdersShop
                cards={cards}
                tabs={orderTabs(live.tabs, tab, paymentsOpen)}
                tab={tab}
                q={q}
                filtered={filtered}
                page={live.page}
                empty={emptyWords(tab, q, live.page.page > live.page.pages)}
              />
            </section>
          </>
        )}
      </div>
    </ServerList>
  );
}

/* ------------------------------------------------------------- the first order */

const STEPS = [
  { icon: "tag", title: "Pick from the shop", text: "Posts, clinics, appearances — each at the seller's own price." },
  { icon: "check", title: "Place the order", text: "The seller, or BTG for a big one, approves it. Nothing is charged yet." },
  { icon: "coin", title: "Pay, then watch it happen", text: "Pay by card once it's approved. Every step shows up here." },
] as const;

function FirstOrderHero() {
  return (
    <section aria-label="Your first order" className="sx-or-hero sx-stadium-in" style={at(0.06)}>
      <span aria-hidden="true" className="sx-or-board-sweep" />
      <div className="sx-or-hero-copy">
        <span className="sx-or-hero-badge" aria-hidden="true">
          <span className="sx-or-hero-orbit" />
          <Glyph ui="box" className="size-8" />
        </span>
        <p className="sx-or-eyebrow">No orders yet</p>
        <h2 className="sx-or-hero-title">Your first order starts in the shop.</h2>
        <p className="sx-or-hero-lede">Once you buy something, this page shows where it is — approved, paid, delivered — and what to do next.</p>
        <Link href="/sponsor/shop" className="sx-or-btn" data-big="">
          Browse the shop <Glyph ui="arrow" className="size-4" />
        </Link>
      </div>
      <ol className="sx-or-hero-steps" aria-label="How an order works">
        {STEPS.map((s, i) => (
          <li key={s.title} className="sx-stadium-panel sx-or-hero-step sx-stadium-in" style={at(0.2 + i * 0.1)}>
            <span className="sx-or-hero-n sx-stadium-num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="sx-or-icon sx-or-icon-sm" aria-hidden="true">
              <Glyph ui={s.icon} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="sx-or-hero-step-title">{s.title}</span>
              <span className="sx-or-hero-step-text">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

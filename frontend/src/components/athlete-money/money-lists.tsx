"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { ShopTabs, ViewSwitch, tilt, untilt, useShopView } from "@/components/athlete-inventory/inventory-shop";
import { PagerRow, PendingList } from "@/components/server-pager";
import { payoutTabPatch, type OrderMoneyCard, type OrderMoneyStage, type PayoutCardView, type PayoutStage, type PayoutTab } from "@/lib/athlete-money-shop";
import type { ListKeys, PageInfo } from "@/lib/list-query";
import { MoneyGlyph, type MoneyGlyphName } from "./money-glyphs";

/* --------------------------------------------------------------------------
   POL-FE-97 — the athlete's Payouts, the lists (client):

   - MoneyOrders   "Your share of each sale": List ↔ Cards (the choice
                   Inventory, Listings and Sales remember). Each sale says
                   where its money is now, as a sentence, with the API's
                   figures as labelled amounts and one way to act on it.
   - MoneyPayouts  "Your payouts": tabs by state (the API's counts), then
                   each payout on a timeline — amount, when, the orders it
                   covers, its status in words and its track (Requested →
                   Approved → Sent → Paid), with the fix when it waits on
                   the payout account.

   Both lists stay server-paged (memory: pagination-pattern); the history
   keeps its own URL keys (?hpage / ?hsize / ?hstate).

   MoneyTabs (owner, 2026-11-16: "make this a tab version between the
   history and the cashout list") puts the two behind one switch — Money by
   sale | Payout history — with a sliding marker and the counts. The choice
   is ?list=payouts in the URL (written with history.replaceState, so no
   round trip; the pagers keep it), and "Follow it" on a sale flips to the
   history.
   -------------------------------------------------------------------------- */

export type MoneyList = "sales" | "payouts";
const TabCtx = createContext<((t: MoneyList) => void) | null>(null);

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

export const ORDER_GLYPH: Record<OrderMoneyStage, MoneyGlyphName> = {
  frozen: "snow",
  owed: "undo",
  ready: "wallet",
  pay: "clock",
  locked: "unlock",
  moving: "send",
  reserve: "lock",
  paid: "check",
  ended: "ban",
};

const PAYOUT_GLYPH: Record<PayoutStage, MoneyGlyphName> = {
  review: "hourglass",
  moving: "send",
  paid: "check",
  problem: "alert",
  back: "undo",
};

function Empty({ title, hint, icon }: { title: string; hint: string; icon: MoneyGlyphName }) {
  return (
    <div className="sx-iv-none sx-iv-rise" style={d(0.08)}>
      <span className="sx-iv-none-mark" aria-hidden="true">
        <MoneyGlyph name={icon} className="size-7" />
      </span>
      <p className="sx-iv-none-title">{title}</p>
      <p className="sx-iv-none-hint">{hint}</p>
    </div>
  );
}

function Pill({ card }: { card: OrderMoneyCard }) {
  return (
    <span className="sx-my-pill" data-money={card.stage}>
      <span className="sx-iv-state-dot" aria-hidden="true" />
      {card.label}
    </span>
  );
}

function Parts({ card }: { card: OrderMoneyCard }) {
  if (card.parts.length === 0) return null;
  return (
    <span className="sx-my-parts">
      {card.parts.map((p) => (
        <span key={p.key} className="sx-my-part" data-money={p.key}>
          {p.label} <strong className="sx-arena-num">{p.amount}</strong>
        </span>
      ))}
    </span>
  );
}

function Go({ card }: { card: OrderMoneyCard }) {
  const show = useContext(TabCtx);
  if (!card.go) return null;
  const inPage = card.go.href.startsWith("#");
  const body = (
    <>
      {card.go.label}
      <MoneyGlyph name="arrow" className="size-3.5" />
    </>
  );
  return inPage ? (
    <a
      href={card.go.href}
      className="sx-my-go"
      data-money={card.stage}
      onClick={(e) => {
        if (card.go?.href !== "#your-payouts" || !show) return;
        e.preventDefault();
        show("payouts");
      }}
    >
      {body}
    </a>
  ) : (
    <Link href={card.go.href} className="sx-my-go" data-money={card.stage}>
      {body}
    </Link>
  );
}

function OrderRow({ card, i }: { card: OrderMoneyCard; i: number }) {
  return (
    <li className="sx-iv-rise" style={d(0.04 + i * 0.035)}>
      <div className="sx-iv-row sx-my-row" data-money={card.stage} data-on="">
        <span className="sx-iv-icon sx-iv-icon-sm sx-my-icon" aria-hidden="true">
          <MoneyGlyph name={ORDER_GLYPH[card.stage]} className="size-[18px]" />
        </span>
        <span className="sx-iv-row-main">
          <span className="sx-iv-row-title">{card.title}</span>
          <span className="sx-iv-row-sub">
            <span>
              <strong className="sx-my-who">{card.sponsor}</strong> · Order {card.ref} · {card.status}
            </span>
          </span>
        </span>
        <span className="sx-my-row-next">
          <span className="sx-my-row-next-top">
            <Pill card={card} />
            <span className="sx-my-row-next-title">{card.next.title}</span>
          </span>
          <span className="sx-my-row-next-hint">{card.next.hint}</span>
          <Parts card={card} />
        </span>
        <span className="sx-my-row-share">
          <span className="sx-arena-num">{card.share}</span>
          <span className="sx-my-row-share-cap">your share</span>
          <Go card={card} />
        </span>
      </div>
    </li>
  );
}

function OrderTile({ card, i }: { card: OrderMoneyCard; i: number }) {
  return (
    <li className="sx-iv-rise" style={d(0.06 + i * 0.05)}>
      <article className="sx-iv-card sx-my-card" data-money={card.stage} data-on={card.stage === "ended" ? undefined : ""} onPointerMove={tilt} onPointerLeave={untilt}>
        <span aria-hidden="true" className="sx-iv-glare" />
        <div className="sx-iv-card-top">
          <span className="sx-iv-icon sx-my-icon" aria-hidden="true">
            <MoneyGlyph name={ORDER_GLYPH[card.stage]} className="size-6" />
          </span>
          <Pill card={card} />
        </div>
        <p className="sx-my-card-for">
          Sold to <strong>{card.sponsor}</strong>
        </p>
        <h3 className="sx-iv-card-title">{card.title}</h3>
        <p className="sx-iv-kind">
          Order {card.ref} · {card.status}
        </p>
        <div className="sx-my-next-box">
          <p className="sx-my-next-title">{card.next.title}</p>
          <p className="sx-my-next-hint">{card.next.hint}</p>
        </div>
        <Parts card={card} />
        <div className="sx-iv-facts">
          <p className="sx-iv-price">
            <span className="sx-arena-num">{card.share}</span>
            <span className="sx-iv-each">your share</span>
          </p>
          <Go card={card} />
        </div>
      </article>
    </li>
  );
}

export function MoneyOrders({ cards, page }: { cards: OrderMoneyCard[]; page: PageInfo }) {
  const view = useShopView();
  return (
    <section aria-labelledby="by-order-title" className="sx-iv-shop">
      <div className="sx-my-list-head sx-iv-rise" style={d(0.02)}>
        <h2 id="by-order-title" className="sr-only">Your share of each sale</h2>
        <p className="sx-iv-hint">
          <MoneyGlyph name="coin" className="size-3.5" />
          <span>Your share of each sale: where its money is right now, and what unlocks it.</span>
        </p>
        {cards.length > 0 && <ViewSwitch view={view} />}
      </div>
      {cards.length > 0 && (
        <div className="sx-iv-rise" style={d(0.05)}>
          <PagerRow page={page} noun="Sales" tone="athlete" position="top" />
        </div>
      )}
      <PendingList>
        {cards.length === 0 ? (
          <Empty icon="coin" title="No orders yet" hint="When a sponsor buys one of your items and pays, your share appears here." />
        ) : view === "list" ? (
          <div key="list" className="sx-iv-list">
            <div className="sx-iv-list-head sx-my-row" aria-hidden="true">
              <span>Sale</span>
              <span>Where the money is</span>
              <span className="sx-my-head-share">Your share</span>
            </div>
            <ul aria-label="Your share of each sale">
              {cards.map((c, i) => (
                <OrderRow key={c.id} card={c} i={i} />
              ))}
            </ul>
          </div>
        ) : (
          <ul key="cards" aria-label="Your share of each sale" className="sx-iv-grid sx-my-grid">
            {cards.map((c, i) => (
              <OrderTile key={c.id} card={c} i={i} />
            ))}
          </ul>
        )}
      </PendingList>
      {cards.length > 0 && <PagerRow page={page} noun="Sales" tone="athlete" position="bottom" />}
    </section>
  );
}

/* ── the payouts ───────────────────────────────────────────────────────── */

function Track({ p, delay }: { p: PayoutCardView; delay: number }) {
  if (!p.track) return null;
  const at = p.track.findIndex((t) => t.state === "current");
  /* the lit wire runs to the step it's on (all the way once paid) */
  const progress = at === -1 ? 1 : at / (p.track.length - 1);
  return (
    <div className="sx-my-track" style={d(delay, { "--p": progress } as CSSProperties)}>
      <span aria-hidden="true" className="sx-my-track-rail">
        <span className="sx-my-track-fill" />
      </span>
      <ol className="sx-my-track-steps" aria-label="Where this payout is">
      {p.track.map((t, i) => (
        <li key={t.label} className="sx-my-track-step" data-state={t.state} aria-current={t.state === "current" ? "step" : undefined} style={d(delay + 0.15 + i * 0.12)}>
          <span className="sx-my-track-dot" aria-hidden="true">
            {t.state === "done" && <MoneyGlyph name="check" className="size-2.5" />}
          </span>
          <span className="sx-my-track-label">
            {t.label}
            <span className="sr-only">{t.state === "done" ? " — done" : t.state === "current" ? " — current step" : " — not yet"}</span>
          </span>
          {t.note && <span className="sx-my-track-note">{t.note}</span>}
        </li>
      ))}
      </ol>
    </div>
  );
}

export function MoneyPayouts({
  payouts, tabs, tab, page, keys, filtered,
}: { payouts: PayoutCardView[]; tabs: PayoutTab[]; tab: string; page: PageInfo; keys: ListKeys; filtered: boolean }) {
  const total = tabs.find((t) => t.key === "all")?.count ?? page.total;
  return (
    <section id="your-payouts" aria-labelledby="history-title" className="sx-iv-shop">
      <div className="sx-my-list-head sx-iv-rise" style={d(0.02)}>
        <h2 id="history-title" className="sr-only">Your payouts</h2>
        <p className="sx-iv-hint">
          <MoneyGlyph name="send" className="size-3.5" />
          <span>Each payout you&rsquo;ve requested, from request to paid.</span>
        </p>
      </div>
      {total > 0 && (
        <div className="sx-iv-toolbar sx-iv-rise" style={d(0.04)}>
          <ShopTabs<PayoutTab> tabs={tabs} tab={tab} patch={payoutTabPatch} label="Show payouts" keys={keys} />
        </div>
      )}
      {payouts.length > 0 && (
        <div className="sx-iv-rise" style={d(0.06)}>
          <PagerRow page={page} noun="Payouts" tone="athlete" position="top" keys={keys} filtered={filtered} />
        </div>
      )}
      <PendingList>
        {payouts.length === 0 ? (
          filtered ? (
            <Empty icon="send" title="No payout in that state" hint="Pick another tab, or All, to see the rest." />
          ) : (
            <Empty icon="send" title="No payouts yet" hint="When you cash out, you can follow it here from request to paid." />
          )
        ) : (
          <ul aria-label="Your payouts" className="sx-my-payouts">
            {payouts.map((p, i) => (
              <li key={p.id} className="sx-my-payout sx-iv-rise" data-pay={p.stage} style={d(0.06 + i * 0.05)}>
                <span className="sx-my-payout-mark" aria-hidden="true">
                  <MoneyGlyph name={PAYOUT_GLYPH[p.stage]} className="size-[18px]" />
                </span>
                <div className="sx-my-payout-card">
                  <div className="sx-my-payout-top">
                    <span className="min-w-0">
                      <span className="sx-my-payout-amt sx-arena-num">{p.amount}</span>
                      <span className="sx-my-payout-when">
                        Requested {p.date}
                        {p.orders && ` · ${p.orders}`}
                      </span>
                    </span>
                    <span className="sx-my-payout-flags">
                      <span className="sx-my-pill" data-pay={p.stage}>
                        <span className="sx-iv-state-dot" aria-hidden="true" />
                        {p.status}
                      </span>
                      {p.auto && <span className="sx-my-pill" data-pay="paid">✓ {p.auto}</span>}
                    </span>
                  </div>
                  <Track p={p} delay={0.2 + i * 0.05} />
                  {p.fix && (
                    <p className="sx-my-fix">
                      <MoneyGlyph name="alert" className="size-4" />
                      <span>
                        <Link href={p.fix.href} className="sx-iv-inline-link">
                          {p.fix.label} →
                        </Link>
                        <span className="sx-my-fix-note">{p.fix.note}</span>
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PendingList>
      {payouts.length > 0 && <PagerRow page={page} noun="Payouts" tone="athlete" position="bottom" keys={keys} />}
    </section>
  );
}

/* ── the switch between the two lists ─────────────────────────────────── */

const LISTS: Array<{ key: MoneyList; label: string; sub: string; icon: MoneyGlyphName }> = [
  { key: "sales", label: "Money by sale", sub: "Where each sale's money is", icon: "wallet" },
  { key: "payouts", label: "Payout history", sub: "Every payout, request to paid", icon: "send" },
];

export function MoneyTabs({
  initial, salesCount, payoutsCount, ready, orders, payouts,
}: {
  initial: MoneyList;
  /** Sales with money (the orders list's total). */
  salesCount: number;
  /** Payouts in every state. */
  payoutsCount: number;
  /** Sales with money ready to cash out on this page — a dot on the tab. */
  ready: boolean;
  orders: Parameters<typeof MoneyOrders>[0];
  payouts: Parameters<typeof MoneyPayouts>[0];
}) {
  const [tab, setTab] = useState<MoneyList>(initial);
  const bar = useRef<HTMLDivElement>(null);
  const counts: Record<MoneyList, number> = { sales: salesCount, payouts: payoutsCount };

  const show = (t: MoneyList, scroll = true) => {
    setTab(t);
    /* the URL remembers it, without a round trip; the pagers' own writes keep it */
    try {
      const u = new URL(window.location.href);
      if (t === "payouts") u.searchParams.set("list", "payouts");
      else u.searchParams.delete("list");
      u.hash = "";
      window.history.replaceState(window.history.state, "", u);
    } catch {
      /* an odd URL: the tab still switches */
    }
    if (scroll) bar.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  /* a link straight to #your-payouts opens the history */
  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#your-payouts") setTab("payouts");
    };
    const t = window.setTimeout(check, 0);
    window.addEventListener("hashchange", check);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", check);
    };
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next: MoneyList = tab === "sales" ? "payouts" : "sales";
    show(next, false);
    bar.current?.querySelector<HTMLElement>(`[data-list="${next}"]`)?.focus();
  };

  return (
    <TabCtx.Provider value={show}>
      <section aria-label="Your money, sale by sale and payout by payout" className="sx-my-lists">
        <div ref={bar} role="tablist" aria-label="Show" className="sx-my-switch sx-iv-rise" data-at={tab} style={d(0.04)} onKeyDown={onKey}>
          <span aria-hidden="true" className="sx-my-switch-marker" />
          {LISTS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="tab"
              id={`money-tab-${l.key}`}
              data-list={l.key}
              aria-selected={tab === l.key}
              aria-controls={`money-panel-${l.key}`}
              tabIndex={tab === l.key ? 0 : -1}
              onClick={() => show(l.key, false)}
              className="sx-my-switch-tab"
            >
              <span className="sx-my-switch-icon" aria-hidden="true">
                <MoneyGlyph name={l.icon} className="size-[18px]" />
                {l.key === "sales" && ready && <span className="sx-my-switch-dot" />}
              </span>
              <span className="min-w-0 text-left">
                <span className="sx-my-switch-label">{l.label}</span>
                <span className="sx-my-switch-sub">{l.sub}</span>
              </span>
              <span className="sx-my-switch-n">{counts[l.key]}</span>
            </button>
          ))}
        </div>
        <div key={tab} role="tabpanel" id={`money-panel-${tab}`} aria-labelledby={`money-tab-${tab}`} className="sx-my-panel" data-from={tab === "payouts" ? "right" : "left"}>
          {tab === "sales" ? <MoneyOrders {...orders} /> : <MoneyPayouts {...payouts} />}
        </div>
      </section>
    </TabCtx.Provider>
  );
}

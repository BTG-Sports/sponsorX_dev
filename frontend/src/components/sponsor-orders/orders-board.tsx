"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { ListSearch, PagerRow, PendingList, useListNav } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";
import { orderTabPatch, type OrderCard, type OrderStage, type OrderStation, type OrderTabDef } from "@/lib/orders-board";

/* --------------------------------------------------------------------------
   POL-FE-98 — the sponsor's Orders list, drawn like the athlete's Inventory,
   Listings and Sales, on the Stadium Board. The client half:

   - OrdersHelp   "How orders work" in the head: a help button whose popup
                  is the scoreboard below (the owner's call after the
                  first look), so the page itself opens on the orders.
   - OrdersRoad   the scoreboard: how an order moves — Waiting → To pay →
                  In progress → Delivered — four lit stations on a wire a
                  light runs along, each with the API's count (counting up
                  as it arrives), and what you've spent; a click opens
                  that tab. Cancelled sits off the road, only when any.
   - PayStrip     "You have 2 orders to pay": the one thing a sponsor must
                  do, with a button that shows them.
   - OrdersShop   the tabs, the search, Cards ↔ List (remembered per
                  browser) and the orders. Each says what was bought, from
                  whom, the total, what happens next as a sentence ("Pay
                  $1,240.00 by Nov 19") flagged "Your move" when it is, and
                  the four stops: Placed → Approved → Paid → Delivered.

   The page (server) reads and words everything (lib/orders-board.ts);
   nothing here invents a number. Stadium look only (memory:
   portal-stage-identities): LED panels, lit numerals, the power-on
   entrance, blue as light. No Arena tilt or plates. Styles:
   app/(app)/sponsor/orders/orders.css (`.sx-or-*`).
   -------------------------------------------------------------------------- */

const d = (s: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${s}s`, ...extra }) as CSSProperties;

export const STAGE_GLYPH: Record<OrderStage, UiGlyph> = {
  wait: "hourglass",
  pay: "coin",
  deliver: "box",
  done: "check",
  ended: "undo",
};

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** A number that counts up to its value once, on arrival. Still under reduced motion. */
function CountUp({ value, delay = 0, format = String }: { value: number; delay?: number; format?: (n: number) => string }) {
  /* The server renders the real number; the count-up only writes the DOM, so no re-render. */
  const el = useRef<HTMLSpanElement>(null);
  const fmt = useRef(format);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const f = fmt.current;
    if (value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const run = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / 1100));
      node.textContent = f(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(run);
    };
    node.textContent = f(0);
    raf = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(raf);
      node.textContent = f(value);
    };
  }, [value, delay]);
  return <span ref={el}>{format(value)}</span>;
}

/** The light under the pointer, on an LED panel (`[data-spot]`). */
function spot(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/* ── Cards or List, remembered per browser ─────────────────────────────── */

type View = "cards" | "list";
const VIEW_KEY = "sx-or-view";
const VIEW_EVENT = "sx-or-view";
function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}
function writeView(v: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private window: lasts until reload */
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
}
function subscribeView(cb: () => void) {
  window.addEventListener(VIEW_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(VIEW_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
const useView = () => useSyncExternalStore(subscribeView, readView, () => "cards" as View);

function ViewSwitch({ view }: { view: View }) {
  return (
    <div role="group" aria-label="Show orders as" className="sx-or-views">
      {(["cards", "list"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => writeView(v)} className="sx-or-view">
          <Glyph ui={v === "cards" ? "grid" : "rows"} className="size-4" />
          <span>{v === "cards" ? "Cards" : "List"}</span>
        </button>
      ))}
    </div>
  );
}

/* ── the scoreboard: how an order moves ────────────────────────────────── */

export function OrdersRoad({
  stations, cancelled, spentCents, tab, onPick,
}: {
  stations: OrderStation[];
  cancelled: number;
  spentCents: number | null;
  tab: string;
  /** After a step is picked (the help popup closes itself). */
  onPick?: () => void;
}) {
  const { set } = useListNav();
  const go = (key: string) => {
    set(orderTabPatch(key === tab ? "all" : key));
    onPick?.();
  };
  return (
    <section aria-label="Where your orders are" className="sx-or-board sx-stadium-in" style={d(0.05)}>
      <span aria-hidden="true" className="sx-or-board-sweep" />
      <div className="sx-or-board-head">
        <div>
          <p className="sx-or-eyebrow">How an order moves</p>
          <p className="sx-or-board-tip">Tap a step to see its orders.</p>
        </div>
        {spentCents !== null && (
          <div className="sx-or-spent">
            <span className="sx-or-spent-label">Spent so far</span>
            <span className="sx-or-spent-sum sx-stadium-num">
              <CountUp value={spentCents} delay={0.35} format={money} />
            </span>
          </div>
        )}
      </div>

      <div className="sx-or-stations-wrap">
        <span aria-hidden="true" className="sx-or-wire">
          <span className="sx-or-wire-comet" />
        </span>
        <ol className="sx-or-stations">
          {stations.map((s, i) => (
            <li key={s.key} className="sx-or-station-li">
              <button
                type="button"
                data-stage={s.stage}
                data-empty={s.count === 0 ? "" : undefined}
                data-hot={s.stage === "pay" && s.count > 0 ? "" : undefined}
                aria-pressed={tab === s.key}
                onClick={() => go(s.key)}
                className="sx-or-station"
                style={d(0.18 + i * 0.1)}
              >
                <span className="sx-or-station-dot" aria-hidden="true">
                  <Glyph ui={STAGE_GLYPH[s.stage]} className="size-[18px]" />
                  {s.stage === "pay" && s.count > 0 && <span className="sx-or-station-ping" />}
                </span>
                <span className="sx-or-station-count sx-stadium-num">
                  <CountUp value={s.count} delay={0.25 + i * 0.1} />
                </span>
                <span className="sx-or-station-label">
                  <span className="sx-or-station-step" aria-hidden="true">{i + 1}</span>
                  {s.label}
                </span>
                <span className="sx-or-station-hint">{s.hint}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {cancelled > 0 && (
        <div className="sx-or-sidings">
          <span className="sx-or-sidings-or">Off the road</span>
          <button type="button" aria-pressed={tab === "cancelled"} onClick={() => go("cancelled")} className="sx-or-siding">
            <Glyph ui="undo" className="size-3.5" />
            Cancelled or refunded
            <span className="sx-or-siding-n">{cancelled}</span>
          </button>
        </div>
      )}
    </section>
  );
}

/* ── the help popup: the scoreboard behind a "?" ───────────────────────── */

/**
 * POL-FE-98 (owner, after the first look: "can you make this inside a popup
 * panel which trigger by a help button?") — the scoreboard, behind a help
 * button in the head, so the page opens on the orders. A step picked inside
 * filters the list and closes the popup. Portalled to <body> with the
 * Stadium's own class, as the shop's popups are (an ancestor's entrance
 * transform would otherwise trap position: fixed).
 */
export function OrdersHelp(props: { stations: OrderStation[]; cancelled: number; spentCents: number | null; tab: string }) {
  const [state, setState] = useState<"open" | "closing" | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const titleId = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const shut = () => {
    setState(null);
    opener.current?.focus();
  };
  const close = () => {
    if (state !== "open") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return shut();
    setState("closing");
    timer.current = window.setTimeout(shut, 260);
  };

  useEffect(() => {
    if (!state) return;
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = was;
    };
  }, [state]);
  useEffect(() => {
    if (state !== "open") return;
    const t = window.setTimeout(() => sheet.current?.querySelector<HTMLElement>(".sx-or-close")?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [state]);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const f = sheet.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href]");
    if (f.length === 0) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button ref={opener} type="button" onClick={() => setState("open")} aria-haspopup="dialog" className="sx-or-help">
        <span className="sx-or-help-q" aria-hidden="true">?</span>
        How orders work
      </button>
      {state &&
        createPortal(
          <div className="sx-stadium sx-or sx-or-modal" data-closing={state === "closing" ? "" : undefined}>
            <div className="sx-or-scrim" onClick={close} aria-hidden="true" />
            <section ref={sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sx-or-sheet" onKeyDown={onKey}>
              <div className="sx-or-sheet-head">
                <span className="sx-or-icon" aria-hidden="true">
                  <Glyph ui="box" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="sx-or-sheet-title">
                    How your orders move
                  </h2>
                  <p className="sx-or-sheet-lede">Every order goes through these four steps. Each number is how many of your orders are at that step now.</p>
                </div>
                <button type="button" onClick={close} className="sx-or-close" aria-label="Close">
                  <Glyph ui="close" className="size-4" />
                </button>
              </div>
              <div className="sx-or-sheet-body">
                <OrdersRoad {...props} onPick={close} />
                <p className="sx-or-sheet-note">
                  <Glyph ui="shield" className="size-4" />
                  Nothing is charged until an order is approved. You then pay by card on Stripe&rsquo;s secure page.
                </p>
              </div>
              <div className="sx-or-sheet-foot">
                <button type="button" onClick={close} className="sx-or-btn">
                  Got it
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── your move: something to pay ───────────────────────────────────────── */

export function PayStrip({ count, tab }: { count: number; tab: string }) {
  const { set } = useListNav();
  const open = tab === "to_pay";
  return (
    <section aria-label="Orders to pay" className="sx-or-pay sx-stadium-in" style={d(0.12)}>
      <span className="sx-or-pay-mark" aria-hidden="true">
        <Glyph ui="bolt" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sx-or-pay-title">
          Your move: {count === 1 ? "1 order is" : `${count} orders are`} approved and ready to pay
        </span>
        <span className="sx-or-pay-sub">Pay by card within 3 days of approval to lock in your dates — unpaid orders are cancelled.</span>
      </span>
      <button type="button" onClick={() => set(orderTabPatch(open ? "all" : "to_pay"))} className="sx-or-btn" data-big="">
        {open ? "Show every order" : count === 1 ? "Show it" : "Show them"}
        <Glyph ui="arrow" className="size-4" />
      </button>
    </section>
  );
}

/* ── one order ─────────────────────────────────────────────────────────── */

/** Placed → Approved → Paid → Delivered; the wire fills in, the stop it's on pulses. */
function Stops({ card, compact = false, delay }: { card: OrderCard; compact?: boolean; delay: number }) {
  const at = card.stops.findIndex((s) => s.state === "now" || s.state === "ended");
  const where = card.ended ? card.label : at === -1 ? "Delivered" : `${card.stops[at]!.label} is next`;
  return (
    <span className="sx-or-stops" data-compact={compact ? "" : undefined} data-ended={card.ended ? "" : undefined} style={d(delay, { "--p": card.progress } as CSSProperties)}>
      <span className="sr-only">Progress: {where}.</span>
      <span aria-hidden="true" className="sx-or-stops-wire">
        <span className="sx-or-stops-fill" />
      </span>
      {card.stops.map((s, i) => (
        <span key={s.label} aria-hidden="true" className="sx-or-stop" data-state={s.state} style={d(delay + 0.15 + i * 0.12)}>
          <span className="sx-or-stop-dot">
            {s.state === "done" && <Glyph ui="check" className="size-2.5" />}
            {s.state === "ended" && <Glyph ui="close" className="size-2.5" />}
          </span>
          {!compact && <span className="sx-or-stop-label">{s.label}</span>}
        </span>
      ))}
    </span>
  );
}

function Pill({ card }: { card: OrderCard }) {
  return (
    <span className="sx-or-pill" data-stage={card.stage}>
      <span className="sx-or-pill-dot" aria-hidden="true" />
      {card.label}
    </span>
  );
}

function MoveFlag() {
  return (
    <span className="sx-or-move">
      <Glyph ui="bolt" className="size-3" />
      Your move
    </span>
  );
}

function Due({ due }: { due: NonNullable<OrderCard["due"]> }) {
  return (
    <span className="sx-or-due" data-urgent={due.urgent ? "" : undefined}>
      <Glyph ui="clock" className="size-3.5" />
      {due.text}
    </span>
  );
}

function Seller({ card }: { card: OrderCard }) {
  if (!card.from) return null;
  return (
    <span className="sx-or-from">
      {card.initials && (
        <span className="sx-or-avatar" aria-hidden="true">
          {card.initials}
        </span>
      )}
      <span className="min-w-0 truncate">{card.from}</span>
    </span>
  );
}

function OrderTile({ card, i, href }: { card: OrderCard; i: number; href: string }) {
  return (
    <li className="sx-or-li sx-stadium-in" style={d(0.08 + i * 0.06)}>
      <article
        className="sx-stadium-panel sx-or-card"
        data-spot=""
        data-stage={card.stage}
        data-move={card.move ? "" : undefined}
        onPointerMove={spot}
        title={card.all}
      >
        {card.move && <span aria-hidden="true" className="sx-or-runner" />}
        <div className="sx-or-card-top">
          <span className="sx-or-icon" data-stage={card.stage} aria-hidden="true">
            <Glyph ui={STAGE_GLYPH[card.stage]} className="size-5" />
          </span>
          <span className="sx-or-card-flags">
            {card.move ? <MoveFlag /> : <Pill card={card} />}
          </span>
        </div>

        <div className="min-w-0">
          <h3 className="sx-or-card-title">
            <Link href={href} className="sx-or-stretch">
              {card.title}
              <span className="sr-only">
                {card.more > 0 ? `, and ${card.more} more` : ""}, order {card.ref}, {card.label}
              </span>
            </Link>
            {card.more > 0 && <span className="sx-or-more" aria-hidden="true">+{card.more} more</span>}
          </h3>
          <p className="sx-or-meta">
            <Seller card={card} />
            {card.dates && (
              <span className="sx-or-meta-dates">
                <Glyph ui="calendar" className="size-3.5" />
                {card.dates}
              </span>
            )}
          </p>
        </div>

        <div className="sx-or-next" data-stage={card.stage}>
          <p className="sx-or-next-title">{card.next.title}</p>
          <p className="sx-or-next-hint">{card.next.hint}</p>
          {card.due && <Due due={card.due} />}
        </div>

        <Stops card={card} delay={0.3 + i * 0.06} />

        <div className="sx-or-card-foot">
          <span className="sx-or-sum">
            <span className="sx-stadium-num" data-ended={card.ended ? "" : undefined}>{card.total}</span>
            <span className="sx-or-ref">
              {card.ref} · {card.placed}
            </span>
          </span>
          <span aria-hidden="true" className="sx-or-cta" data-move={card.move ? "" : undefined}>
            {card.cta} <Glyph ui="arrow" className="size-3.5" />
          </span>
        </div>
      </article>
    </li>
  );
}

function OrderRow({ card, i, href }: { card: OrderCard; i: number; href: string }) {
  return (
    <li className="sx-stadium-row" style={d(0.04 + i * 0.035)}>
      <div className="sx-or-row" data-stage={card.stage} data-move={card.move ? "" : undefined} title={card.all}>
        <span className="sx-or-icon sx-or-icon-sm" data-stage={card.stage} aria-hidden="true">
          <Glyph ui={STAGE_GLYPH[card.stage]} className="size-4" />
        </span>
        <span className="sx-or-row-main">
          <Link href={href} className="sx-or-stretch sx-or-row-title">
            {card.title}
            {card.more > 0 && <span className="sx-or-more"> +{card.more} more</span>}
            <span className="sr-only">, order {card.ref}</span>
          </Link>
          <span className="sx-or-row-sub">
            {card.from && <span className="truncate">{card.from}</span>}
            <span>{card.placed}</span>
          </span>
        </span>
        <span className="sx-or-row-next">
          <span className="sx-or-row-next-top">
            {card.move ? <MoveFlag /> : <Pill card={card} />}
            <span className="sx-or-row-next-title">{card.next.title}</span>
          </span>
          {card.due ? <Due due={card.due} /> : <span className="sx-or-row-next-hint">{card.next.hint}</span>}
        </span>
        <span className="sx-or-row-stops">
          <Stops card={card} compact delay={0.2 + i * 0.035} />
        </span>
        <span className="sx-or-row-sum">
          <span className="sx-stadium-num" data-ended={card.ended ? "" : undefined}>{card.total}</span>
        </span>
        <span aria-hidden="true" className="sx-or-row-go">
          <Glyph ui="arrow" className="size-4" />
        </span>
      </div>
    </li>
  );
}

/* ── the tabs ──────────────────────────────────────────────────────────── */

function Tabs({ tabs, tab }: { tabs: OrderTabDef[]; tab: string }) {
  const { set } = useListNav();
  return (
    <div role="group" aria-label="Show orders" className="sx-or-tabs">
      {tabs.map((t) => {
        const on = t.key === "all" ? tab === "all" : tab === t.key;
        return (
          <button key={t.key} type="button" aria-pressed={on} data-hot={t.hot ? "" : undefined} onClick={() => set(orderTabPatch(t.key))} className="sx-or-tab">
            {t.label}
            <span className="sx-or-tab-n" data-zero={t.count === 0 ? "" : undefined}>
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Clear the tab and the search: every order again. */
function ShowAll() {
  const { set } = useListNav();
  return (
    <button type="button" className="sx-or-ghost" onClick={() => set({ tab: null, q: null })}>
      Show every order
    </button>
  );
}

/* ── the list ──────────────────────────────────────────────────────────── */

export function OrdersShop({
  cards, tabs, tab, q, filtered, page, empty,
}: {
  cards: OrderCard[];
  tabs: OrderTabDef[];
  tab: string;
  q: string;
  filtered: boolean;
  page: PageInfo;
  empty: { title: string; hint: string };
}) {
  const view = useView();
  const href = (id: string) => `/sponsor/orders/${encodeURIComponent(id)}`;
  return (
    <div className="sx-or-shop">
      <div className="sx-or-toolbar sx-stadium-in" style={d(0.16)}>
        <Tabs tabs={tabs} tab={tab} />
        <div className="sx-or-toolbar-end">
          <div className="sx-or-search">
            <ListSearch initial={q} label="Search your orders" placeholder="Search by item or order number" tone="sponsor" />
          </div>
          <ViewSwitch view={view} />
        </div>
      </div>

      <div className="sx-stadium-in" style={d(0.2)}>
        <PagerRow page={page} noun="Orders" tone="sponsor" position="top" filtered={filtered} />
      </div>

      <PendingList>
        {cards.length === 0 ? (
          <div className="sx-stadium-panel sx-or-none sx-stadium-in" style={d(0.22)}>
            <span className="sx-or-icon sx-or-none-mark" aria-hidden="true">
              <Glyph ui="box" className="size-7" />
            </span>
            <p className="sx-or-none-title">{empty.title}</p>
            <p className="sx-or-none-hint">{empty.hint}</p>
            {tab !== "all" || q ? (
              <ShowAll />
            ) : (
              <Link href="/sponsor/shop" className="sx-or-btn">
                Browse the shop <Glyph ui="arrow" className="size-4" />
              </Link>
            )}
          </div>
        ) : view === "list" ? (
          <div key="list" className="sx-stadium-panel sx-or-list sx-stadium-in" style={d(0.22)}>
            <div className="sx-or-row sx-or-list-head" aria-hidden="true">
              <span>Order</span>
              <span>What&rsquo;s next</span>
              <span>Progress</span>
              <span className="sx-or-head-sum">Total</span>
            </div>
            <ul aria-label="Your orders">
              {cards.map((c, i) => (
                <OrderRow key={c.id} card={c} i={i} href={href(c.id)} />
              ))}
            </ul>
          </div>
        ) : (
          <ul key="cards" aria-label="Your orders" className="sx-or-grid">
            {cards.map((c, i) => (
              <OrderTile key={c.id} card={c} i={i} href={href(c.id)} />
            ))}
          </ul>
        )}
      </PendingList>

      {cards.length > 0 && <PagerRow page={page} noun="Orders" tone="sponsor" position="bottom" />}
    </div>
  );
}

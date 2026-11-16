"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { Modal, ShopTabs, ViewSwitch, tilt, untilt, usePopup, useShopView } from "@/components/athlete-inventory/inventory-shop";
import { MoneyGlyph } from "@/components/athlete-money/money-glyphs";
import { ListSearch, PagerRow, PendingList, useListNav } from "@/components/server-pager";
import type { ListKeys, PageInfo } from "@/lib/list-query";
import { salesTabPatch, type ApprovalCard, type SaleCard, type SaleStage, type SalesStation, type SalesTabDef } from "@/lib/athlete-sales-shop";

/* --------------------------------------------------------------------------
   POL-FE-95 — the athlete's Sales, drawn like their Inventory and Listings
   (POL-FE-83/84). The client half:

   - SalesRoadHelp  "How a sale moves" beside the title, opening the road
                    in a popup (owner, 2026-11-16). SalesRoad, the road:
                    the way a sale moves — Sold → Paid → Delivered →
                    Confirmed — as four stations on a flowing rail, each
                    with the API's count for its tab (counting up as it
                    arrives); a click opens that tab. Problems and
                    cancellations sit off the road as chips, only when any.
   - SalesAsks      a sponsor wants to book and the athlete must say yes or
                    no: cards with the ask, the deadline and Answer.
   - SalesShop      the tabs, the search, List ↔ Cards (the same remembered
                    choice as Inventory and Listings) and the sales. Each
                    sale says what was sold to whom and the athlete's share,
                    what happens next as a sentence ("Deliver it by Oct 17")
                    flagged "Your move" when it is theirs, and a track:
                    Paid → Delivering → Delivered → Confirmed.

   The page (server) reads and words everything (lib/athlete-sales-shop.ts);
   nothing here invents a number. Styles: the inventory's inventory.css plus
   app/(app)/athlete/sales/sales.css (`.sx-sl-*`).
   -------------------------------------------------------------------------- */

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

export const STAGE_GLYPH: Record<SaleStage, UiGlyph> = {
  pay: "clock",
  deliver: "box",
  confirm: "hourglass",
  done: "check",
  problem: "alert",
  ended: "undo",
};

/** A number that counts up to its value once, on arrival. Still under reduced motion. */
function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  /* The server renders the real number; the count-up only writes the DOM, so no re-render. */
  const el = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const node = el.current;
    if (!node || !first.current) return;
    first.current = false;
    if (value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const run = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / 900));
      node.textContent = String(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(run);
    };
    node.textContent = "0";
    raf = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(raf);
      node.textContent = String(value);
    };
  }, [value, delay]);
  return <span ref={el}>{value}</span>;
}

/* ── the road a sale travels ───────────────────────────────────────────── */

/** The road itself; `picked` runs after a step is tapped (the popup closes). */
function SalesRoad({ stations, sidings, tab, picked }: { stations: SalesStation[]; sidings: SalesStation[]; tab: string; picked: () => void }) {
  const { set } = useListNav();
  const go = (key: string) => {
    set(salesTabPatch(key === tab ? "all" : key));
    picked();
  };
  return (
    <div aria-label="Where your sales are" className="sx-sl-road">
      <div className="sx-sl-stations-wrap">
        <span aria-hidden="true" className="sx-sl-rail">
          <span className="sx-sl-rail-flow" />
        </span>
        <ol className="sx-sl-stations">
          {stations.map((s, i) => (
            <li key={s.key} className="sx-sl-station-li">
              <button
                type="button"
                data-stage={s.stage}
                data-empty={s.count === 0 ? "" : undefined}
                aria-pressed={tab === s.key}
                onClick={() => go(s.key)}
                className="sx-sl-station"
                style={d(0.16 + i * 0.09)}
              >
                <span className="sx-sl-station-dot" aria-hidden="true">
                  <Glyph ui={STAGE_GLYPH[s.stage]} className="size-[18px]" />
                  {s.count > 0 && s.stage === "deliver" && <span className="sx-sl-station-ping" />}
                </span>
                <span className="sx-sl-station-count sx-arena-num">
                  <CountUp value={s.count} delay={0.2 + i * 0.09} />
                </span>
                <span className="sx-sl-station-label">
                  <span className="sx-sl-station-step" aria-hidden="true">{i + 1}</span>
                  {s.label}
                </span>
                <span className="sx-sl-station-hint">{s.hint}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      {sidings.length > 0 && (
        <div className="sx-sl-sidings">
          <span className="sx-sl-sidings-or">Off the road</span>
          {sidings.map((s, i) => (
            <button
              key={s.key}
              type="button"
              data-stage={s.stage}
              aria-pressed={tab === s.key}
              onClick={() => go(s.key)}
              className="sx-sl-siding sx-iv-rise"
              style={d(0.5 + i * 0.06)}
            >
              <Glyph ui={STAGE_GLYPH[s.stage]} className="size-3.5" />
              {s.label}
              <span className="sx-sl-siding-n">{s.count}</span>
              <span className="sr-only">: {s.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "How a sale moves", beside the title: a help button that opens the road in
 * a popup (owner, 2026-11-16: "same in the /athlete/sales", after Payouts'
 * road went behind one). A tapped step still opens its sales (tapped again,
 * all of them), and the popup closes on it. The popup is portalled, so the
 * page's <ServerList> still reaches its steps. The button counts the sales
 * waiting to be delivered.
 */
export function SalesRoadHelp({ stations, sidings, tab }: { stations: SalesStation[]; sidings: SalesStation[]; tab: string }) {
  const { phase, opener, show, close } = usePopup();
  const toDeliver = stations.find((x) => x.stage === "deliver")?.count ?? 0;
  return (
    <>
      <button ref={opener} type="button" onClick={show} aria-haspopup="dialog" className="sx-iv-rules sx-sl-help">
        <span className="sx-sl-help-mark" aria-hidden="true">
          <MoneyGlyph name="help" className="size-4" />
        </span>
        How a sale moves
        {toDeliver > 0 && (
          <span className="sx-sl-help-n">
            {toDeliver}
            <span className="sr-only"> to deliver</span>
          </span>
        )}
      </button>
      {phase !== "closed" && (
        <Modal close={close} closing={phase === "closing"} title="How a sale moves" lede="Every sale goes left to right. Tap a step to see its sales." icon="box">
          <SalesRoad stations={stations} sidings={sidings} tab={tab} picked={close} />
          <div className="sx-sl-road-actions">
            <button type="button" onClick={close} className="sx-iv-add">
              <span className="sx-iv-add-plus" aria-hidden="true">
                <Glyph ui="check" className="size-4" />
              </span>
              Got it
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── a sponsor wants to book: yes or no ────────────────────────────────── */

export function SalesAsks({
  asks, waiting, page, keys, hrefBase,
}: { asks: ApprovalCard[]; waiting: number; page: PageInfo; keys: ListKeys; hrefBase: string }) {
  return (
    <section aria-label="Orders to approve" className="sx-sl-asks sx-iv-rise" data-hot={waiting > 0 ? "" : undefined} style={d(0.12)}>
      <div className="sx-sl-asks-head">
        <span className="sx-sl-asks-mark" aria-hidden="true">
          <Glyph ui={waiting ? "bolt" : "check"} className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="sx-sl-asks-title">
            {waiting ? (
              <>
                A sponsor wants to book you <span className="sx-sl-asks-n">{waiting}</span>
              </>
            ) : (
              "Orders you were asked to approve"
            )}
          </span>
          <span className="sx-sl-asks-sub">
            {waiting
              ? "You asked to approve these first. Accept or decline within 48 hours, or the order is cancelled."
              : "You've answered every one. Here's how each ended."}
          </span>
        </span>
      </div>
      <PagerRow page={page} noun="Approvals" tone="athlete" position="top" keys={keys} />
      <PendingList>
        <ul className="sx-sl-ask-list">
          {asks.map((a, i) => (
            <li key={a.id} className="sx-iv-rise" style={d(0.18 + i * 0.05)}>
              <div className="sx-sl-ask" data-waiting={a.waiting ? "" : undefined}>
                <span className="min-w-0 flex-1">
                  <span className="sx-sl-ask-top">
                    <strong>{a.sponsor}</strong>
                    <span className="sx-sl-ask-ref">{a.ref}</span>
                  </span>
                  <span className="sx-sl-ask-text">{a.ask}</span>
                  {a.due ? (
                    <span className="sx-sl-due" data-urgent={a.urgent ? "" : undefined}>
                      <Glyph ui="clock" className="size-3.5" />
                      {a.due}
                    </span>
                  ) : (
                    <span className="sx-sl-ask-state">{a.label}</span>
                  )}
                </span>
                <Link
                  href={`${hrefBase}/approvals/${encodeURIComponent(a.id)}`}
                  aria-label={`${a.waiting ? "Answer" : "Open"} order ${a.ref}`}
                  className={a.waiting ? "sx-iv-add sx-sl-ask-go" : "sx-sl-ghost"}
                >
                  {a.waiting && (
                    <span className="sx-iv-add-plus" aria-hidden="true">
                      <Glyph ui="arrow" className="size-4" />
                    </span>
                  )}
                  {a.waiting ? "Answer" : "Open"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </PendingList>
      <PagerRow page={page} noun="Approvals" tone="athlete" position="bottom" keys={keys} />
    </section>
  );
}

/* ── one sale ──────────────────────────────────────────────────────────── */

/** Paid → Delivering → Delivered → Confirmed; the fill grows in, the step it's on pulses. */
function Track({ card, compact = false, delay }: { card: SaleCard; compact?: boolean; delay: number }) {
  const at = card.track.findIndex((t) => t.state === "current");
  const where = card.ended ? card.label : at === -1 ? "Confirmed" : card.track[at]!.label;
  return (
    <span className="sx-sl-track" data-compact={compact ? "" : undefined} data-ended={card.ended ? "" : undefined} style={d(delay, { "--p": card.progress } as CSSProperties)}>
      <span className="sr-only">Progress: {where}.</span>
      <span aria-hidden="true" className="sx-sl-track-rail">
        <span className="sx-sl-track-fill" />
      </span>
      {card.track.map((t, i) => (
        <span key={t.label} aria-hidden="true" className="sx-sl-track-step" data-state={t.state} style={d(delay + 0.15 + i * 0.12)}>
          <span className="sx-sl-track-dot">{t.state === "done" && <Glyph ui="check" className="size-2.5" />}</span>
          {!compact && <span className="sx-sl-track-label">{t.label}</span>}
        </span>
      ))}
    </span>
  );
}

function Pill({ card }: { card: SaleCard }) {
  return (
    <span className="sx-sl-pill" data-stage={card.stage} data-late={card.late ? "" : undefined}>
      <span className="sx-iv-state-dot" aria-hidden="true" />
      {card.label}
    </span>
  );
}

function MoveFlag() {
  return (
    <span className="sx-sl-move">
      <Glyph ui="bolt" className="size-3" />
      Your move
    </span>
  );
}

function SaleRow({ card, i, href }: { card: SaleCard; i: number; href: string }) {
  return (
    <li className="sx-iv-rise" style={d(0.04 + i * 0.035)}>
      <div className="sx-iv-row sx-sl-row" data-stage={card.stage} data-on="" data-move={card.move ? "" : undefined}>
        <span className="sx-iv-icon sx-iv-icon-sm sx-sl-icon" aria-hidden="true">
          <Glyph ui={STAGE_GLYPH[card.stage]} className="size-[18px]" />
        </span>
        <span className="sx-iv-row-main">
          <Link href={href} className="sx-iv-stretch sx-iv-row-title">
            {card.title}
            <span className="sr-only"> for {card.sponsor}, {card.ref}</span>
          </Link>
          <span className="sx-iv-row-sub">
            <span>
              <strong className="sx-sl-who">{card.sponsor}</strong> · {card.units} · {card.dates}
            </span>
          </span>
        </span>
        <span className="sx-sl-row-next">
          <span className="sx-sl-row-next-top">
            {card.move ? <MoveFlag /> : <Pill card={card} />}
            <span className="sx-sl-row-next-title">{card.next.title}</span>
          </span>
          <span className="sx-sl-row-next-hint">{card.next.hint}</span>
        </span>
        <span className="sx-sl-row-track">
          <Track card={card} compact delay={0.2 + i * 0.035} />
        </span>
        <span className="sx-sl-row-share">
          <span className="sx-arena-num">{card.share}</span>
          <span className="sx-sl-row-share-cap">your share</span>
        </span>
        <span aria-hidden="true" className="sx-iv-row-go">
          <Glyph ui="arrow" className="size-4" />
        </span>
      </div>
    </li>
  );
}

function SaleTile({ card, i, href }: { card: SaleCard; i: number; href: string }) {
  return (
    <li className="sx-iv-rise" style={d(0.06 + i * 0.05)}>
      <article
        className="sx-iv-card sx-sl-card"
        data-stage={card.stage}
        data-on={card.stage === "ended" ? undefined : ""}
        data-move={card.move ? "" : undefined}
        onPointerMove={tilt}
        onPointerLeave={untilt}
      >
        <span aria-hidden="true" className="sx-iv-glare" />
        <div className="sx-iv-card-top">
          <span className="sx-iv-icon sx-sl-icon" aria-hidden="true">
            <Glyph ui={STAGE_GLYPH[card.stage]} className="size-6" />
          </span>
          <span className="sx-sl-card-flags">
            {card.move && <MoveFlag />}
            <Pill card={card} />
          </span>
        </div>
        <p className="sx-sl-card-for">
          Sold to <strong>{card.sponsor}</strong>
        </p>
        <h3 className="sx-iv-card-title">
          <Link href={href} className="sx-iv-stretch">
            {card.title}
            <span className="sr-only">, {card.ref}</span>
          </Link>
        </h3>
        <p className="sx-iv-kind">
          {card.units} · {card.dates}
        </p>

        <div className="sx-sl-next">
          <p className="sx-sl-next-title">{card.next.title}</p>
          <p className="sx-sl-next-hint">{card.next.hint}</p>
        </div>

        <Track card={card} delay={0.25 + i * 0.05} />

        <div className="sx-iv-facts">
          <p className="sx-iv-price">
            <span className="sx-arena-num">{card.share}</span>
            <span className="sx-iv-each">your share</span>
          </p>
        </div>
        <div className="sx-iv-card-foot">
          <span className="sx-sl-ref">
            {card.ref} · ordered {card.ordered}
          </span>
          <span aria-hidden="true" className="sx-sl-cta" data-move={card.move ? "" : undefined}>
            {card.cta} <Glyph ui="arrow" className="size-3.5" />
          </span>
        </div>
      </article>
    </li>
  );
}

/* ── the list ──────────────────────────────────────────────────────────── */

export function SalesShop({
  cards, tabs, tab, q, filtered, page, hrefBase, note, empty,
}: {
  cards: SaleCard[];
  tabs: SalesTabDef[];
  tab: string;
  q: string;
  filtered: boolean;
  page: PageInfo;
  hrefBase: string;
  /** Whose share is shown (shareNote). */
  note: string;
  empty: { title: string; hint: string };
}) {
  const view = useShopView();
  const href = (id: string) => `${hrefBase}/${encodeURIComponent(id)}`;
  return (
    <div className="sx-iv-shop">
      <div className="sx-iv-toolbar sx-iv-rise" style={d(0.02)}>
        <ShopTabs<SalesTabDef> tabs={tabs} tab={tab} patch={salesTabPatch} label="Show sales" />
        <div className="sx-iv-toolbar-end">
          <ListSearch initial={q} label="Search sales" placeholder="Search by item" tone="athlete" />
          <ViewSwitch view={view} />
        </div>
      </div>

      <p className="sx-iv-hint sx-iv-rise" style={d(0.05)}>
        <Glyph ui="coin" className="size-3.5" />
        <span>
          {note} Once a sponsor confirms, your share goes to{" "}
          <Link href="/athlete/money" className="sx-iv-inline-link">
            Payouts
          </Link>
          .
        </span>
      </p>

      <div className="sx-iv-rise" style={d(0.06)}>
        <PagerRow page={page} noun="Sales" tone="athlete" position="top" filtered={filtered} />
      </div>

      <PendingList>
        {cards.length === 0 ? (
          <div className="sx-iv-none sx-iv-rise" style={d(0.08)}>
            <span className="sx-iv-none-mark" aria-hidden="true">
              <Glyph ui="coin" className="size-7" />
            </span>
            <p className="sx-iv-none-title">{empty.title}</p>
            <p className="sx-iv-none-hint">{empty.hint}</p>
          </div>
        ) : view === "list" ? (
          <div key="list" className="sx-iv-list">
            <div className="sx-iv-list-head sx-sl-row" aria-hidden="true">
              <span>Sale</span>
              <span>What&rsquo;s next</span>
              <span>Progress</span>
              <span className="sx-sl-head-share">Your share</span>
            </div>
            <ul aria-label="Your sales">
              {cards.map((c, i) => (
                <SaleRow key={c.id} card={c} i={i} href={href(c.id)} />
              ))}
            </ul>
          </div>
        ) : (
          <ul key="cards" aria-label="Your sales" className="sx-iv-grid sx-sl-grid">
            {cards.map((c, i) => (
              <SaleTile key={c.id} card={c} i={i} href={href(c.id)} />
            ))}
          </ul>
        )}
      </PendingList>

      {cards.length > 0 && <PagerRow page={page} noun="Sales" tone="athlete" position="bottom" />}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { InventoryForm } from "@/components/inventory-form";
import { ListSearch, PagerRow, PendingList, useListNav } from "@/components/server-pager";
import { EMPTY_DRAFT, INVENTORY_KINDS, KIND_LABEL, type ApiInventoryItem, type InventoryBody, type InventoryKind } from "@/lib/inventory-live";
import { tabPatch, type ShopCard, type ShopTab, type TabDef } from "@/lib/inventory-shop";
import type { PageInfo } from "@/lib/list-query";
import { InventoryRestrictions } from "@/components/inventory-restrictions";
import type { RestrictionRow } from "@/lib/inventory-live";
import { Glyph, type UiGlyph } from "./glyphs";

/* --------------------------------------------------------------------------
   POL-FE-83 — the athlete's inventory as a shop window. The client half:

   - InventoryShop     the tabs (All / On sale / Paused / Not listed yet), the
                       search, the List ↔ Cards switch (List by default),
                       and the items. Each
                       item has an "On sale" switch (PATCH {active}, the same
                       action as before) that flips at once and rolls back,
                       with the API's sentence, if the save is refused.
   - InventoryAddItem  "+ Add an item": a button that opens a popup (the
                       owner: "a button then a popup like any inventory
                       system would do") holding the kind tiles and the same
                       InventoryForm as before. On an empty inventory it's
                       the big "Add your first item", with idea tiles that
                       open the popup on their kind.
   - NewItemPanel      the kind tiles + the form, inside the popup.

   The page (server) reads everything; nothing here invents a number. Motion
   is CSS (inventory.css) plus a pointer tilt on the cards that only runs on
   a fine pointer without reduced motion.
   -------------------------------------------------------------------------- */

type Result = { ok: true; id: string } | { ok: false; message: string; confirmHref?: string };
type SetActive = (id: string, active: boolean) => Promise<Result>;
type Create = (body: InventoryBody) => Promise<Result>;

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

/* ── view: list (the default — the owner's "lists first") or cards,
      remembered per browser ──────────────────────────────────────────── */

type View = "cards" | "list";
const VIEW_KEY = "sx-iv-view";
const VIEW_EVENT = "sx-iv-view";

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}
function writeView(v: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private window: the choice lasts until the page reloads */
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

/* ── tilt: a fine pointer, motion allowed ──────────────────────────────── */

let tiltOk: boolean | null = null;
function canTilt() {
  if (tiltOk === null) tiltOk = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches;
  return tiltOk;
}
function tilt(e: PointerEvent<HTMLElement>) {
  if (!canTilt()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--ry", `${(x - 0.5) * 9}deg`);
  el.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
  el.style.setProperty("--gx", `${x * 100}%`);
  el.style.setProperty("--gy", `${y * 100}%`);
}
function untilt(e: PointerEvent<HTMLElement>) {
  const s = e.currentTarget.style;
  s.removeProperty("--rx");
  s.removeProperty("--ry");
}

/* ── the on-sale switch, optimistic ────────────────────────────────────── */

function useSale(id: string, active: boolean, setActive: SetActive) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [seen, setSeen] = useState(active);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(0);
  /* memory: double-submit-needs-a-ref — a state flag lets a double click through. */
  const lock = useRef(false);
  if (active !== seen) {
    setSeen(active);
    setOn(active);
  }
  const flip = async () => {
    if (lock.current) return;
    lock.current = true;
    const next = !on;
    setOn(next);
    setError(null);
    setBusy(true);
    if (next) setPop((n) => n + 1);
    try {
      const r = await setActive(id, next);
      if (r.ok) router.refresh();
      else {
        setOn(!next);
        setError(r.message);
      }
    } catch {
      setOn(!next);
      setError("Nothing was saved. Try again in a minute.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { on, flip, busy, error, pop };
}

function SaleSwitch({ on, busy, pop, flip, title }: { on: boolean; busy: boolean; pop: number; flip: () => void; title: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${title}: on sale`}
      onClick={flip}
      data-busy={busy ? "" : undefined}
      className="sx-iv-switch"
    >
      <span className="sx-iv-switch-track" aria-hidden="true">
        <span key={pop} className="sx-iv-switch-thumb" data-pop={pop > 0 && on ? "" : undefined} />
      </span>
      <span className="sx-iv-switch-text">{on ? "On sale" : "Paused"}</span>
    </button>
  );
}

/* ── one item: a card, or a row of the list ────────────────────────────── */

function ItemCard({ card, i, href, setActive }: { card: ShopCard; i: number; href: string; setActive: SetActive }) {
  const sale = useSale(card.id, card.active, setActive);
  return (
    <li className="sx-iv-rise" style={d(0.06 + i * 0.05)}>
      <article
        className="sx-iv-card"
        data-kind={card.kind}
        data-on={sale.on ? "" : undefined}
        data-spot=""
        onPointerMove={tilt}
        onPointerLeave={untilt}
      >
        <span aria-hidden="true" className="sx-iv-glare" />
        <div className="sx-iv-card-top">
          <span className="sx-iv-icon" aria-hidden="true">
            <Glyph kind={card.kind} className="size-6" />
          </span>
          <span className="sx-iv-state" data-on={sale.on ? "" : undefined}>
            <span className="sx-iv-state-dot" aria-hidden="true" />
            {sale.on ? "On sale" : "Paused"}
          </span>
        </div>

        <h3 className="sx-iv-card-title">
          <Link href={href} className="sx-iv-stretch">
            {card.title}
          </Link>
        </h3>
        <p className="sx-iv-kind">
          {card.kindLabel}
          {card.bundle ? ` · ${card.bundle.count} ${card.bundle.count === 1 ? "item" : "items"} inside` : ""}
        </p>
        {card.blurb && <p className="sx-iv-blurb">{card.blurb}</p>}
        {card.bundle && card.bundle.names.length > 0 && (
          <ul className="sx-iv-bundle" aria-label="In this package">
            {card.bundle.names.slice(0, 3).map((n, k) => (
              <li key={k}>{n}</li>
            ))}
            {card.bundle.names.length > 3 && <li>+{card.bundle.names.length - 3} more</li>}
          </ul>
        )}

        <div className="sx-iv-facts">
          <p className="sx-iv-price">
            <span className="sx-arena-num">{card.price}</span>
            <span className="sx-iv-each">each</span>
          </p>
          <p className="sx-iv-stock" data-tone={card.stock.tone}>
            {card.stock.label}
          </p>
        </div>
        <p className="sx-iv-when" data-tone={card.when.tone}>
          <Glyph ui="calendar" className="size-3.5" />
          {card.when.label}
        </p>

        <div className="sx-iv-card-foot">
          <SaleSwitch {...sale} title={card.title} />
          <span aria-hidden="true" className="sx-iv-edit">
            View <Glyph ui="arrow" className="size-3.5" />
          </span>
        </div>
        {sale.error && (
          <p role="alert" className="sx-iv-error">
            {sale.error}
          </p>
        )}
      </article>
    </li>
  );
}

function ItemRow({ card, i, href, setActive }: { card: ShopCard; i: number; href: string; setActive: SetActive }) {
  const sale = useSale(card.id, card.active, setActive);
  return (
    <li className="sx-iv-rise" style={d(0.04 + i * 0.035)}>
      <div className="sx-iv-row" data-kind={card.kind} data-on={sale.on ? "" : undefined}>
        <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
          <Glyph kind={card.kind} className="size-[18px]" />
        </span>
        <span className="sx-iv-row-main">
          <Link href={href} className="sx-iv-stretch sx-iv-row-title">
            {card.title}
          </Link>
          <span className="sx-iv-row-sub">
            {card.kindLabel}
            {card.bundle ? ` · ${card.bundle.count} inside` : ""}
          </span>
        </span>
        <span className="sx-iv-row-cell sx-iv-row-price">
          <span className="sx-arena-num">{card.price}</span>
        </span>
        <span className="sx-iv-row-cell">
          <span className="sx-iv-stock" data-tone={card.stock.tone}>
            {card.stock.label}
          </span>
        </span>
        <span className="sx-iv-row-cell sx-iv-when" data-tone={card.when.tone}>
          {card.when.label}
        </span>
        <span className="sx-iv-row-cell sx-iv-row-switch">
          <SaleSwitch {...sale} title={card.title} />
        </span>
        <span aria-hidden="true" className="sx-iv-row-go">
          <Glyph ui="arrow" className="size-4" />
        </span>
      </div>
      {sale.error && (
        <p role="alert" className="sx-iv-error sx-iv-error-row">
          {sale.error}
        </p>
      )}
    </li>
  );
}

/* ── the tabs, with a sliding marker ───────────────────────────────────── */

function ShopTabs({ tabs, tab }: { tabs: TabDef[]; tab: ShopTab }) {
  const { set } = useListNav();
  const [current, setCurrent] = useState(tab);
  const [seen, setSeen] = useState(tab);
  if (tab !== seen) {
    setSeen(tab);
    setCurrent(tab);
  }
  const bar = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const place = () => {
      const btn = bar.current?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
      const m = marker.current;
      if (!btn || !m) return;
      m.style.setProperty("--x", `${btn.offsetLeft}px`);
      m.style.setProperty("--w", `${btn.offsetWidth}px`);
      m.dataset.ready = "";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [current, tabs]);

  const go = (t: ShopTab) => {
    if (t === current) return;
    setCurrent(t);
    set(tabPatch(t));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.key === current);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    go(next.key);
    bar.current?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus();
  };

  return (
    <div ref={bar} role="tablist" aria-label="Show items" className="sx-iv-tabs" onKeyDown={onKey}>
      <span ref={marker} aria-hidden="true" className="sx-iv-tab-marker" />
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          data-tab={t.key}
          aria-selected={t.key === current}
          tabIndex={t.key === current ? 0 : -1}
          onClick={() => go(t.key)}
          className="sx-iv-tab"
        >
          {t.label}
          <span className="sx-iv-tab-count">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

function ViewSwitch({ view }: { view: View }) {
  return (
    <div role="group" aria-label="Show as" className="sx-iv-views">
      {(["list", "cards"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => writeView(v)} className="sx-iv-view" title={v === "cards" ? "Cards" : "List"}>
          <Glyph ui={v === "cards" ? "grid" : "rows"} className="size-4" />
          <span className="sr-only">{v === "cards" ? "Cards" : "List"}</span>
        </button>
      ))}
    </div>
  );
}

/* ── the list ──────────────────────────────────────────────────────────── */

export function InventoryShop({
  cards,
  tabs,
  tab,
  q,
  filtered,
  page,
  hrefBase,
  setActive,
  empty,
}: {
  cards: ShopCard[];
  tabs: TabDef[];
  tab: ShopTab;
  q: string;
  filtered: boolean;
  page: PageInfo;
  hrefBase: string;
  setActive: SetActive;
  empty: { title: string; hint: string };
}) {
  const view = useSyncExternalStore(subscribeView, readView, () => "list" as View);
  const href = (id: string) => `${hrefBase}/${encodeURIComponent(id)}`;

  return (
    <div className="sx-iv-shop">
      <div className="sx-iv-toolbar sx-iv-rise" style={d(0.02)}>
        <ShopTabs tabs={tabs} tab={tab} />
        <div className="sx-iv-toolbar-end">
          <ListSearch initial={q} label="Search items" placeholder="Search your items" tone="athlete" />
          <ViewSwitch view={view} />
        </div>
      </div>

      <p className="sx-iv-hint sx-iv-rise" style={d(0.05)}>
        <Glyph ui="bolt" className="size-3.5" />
        <span>
          Items switched on are for sale. To show one on the marketplace, list it under{" "}
          <Link href="/athlete/listings" className="sx-iv-inline-link">
            Listings
          </Link>{" "}
          (on a team, your team lists it).
        </span>
      </p>

      <div className="sx-iv-rise" style={d(0.06)}>
        <PagerRow page={page} noun="Items" tone="athlete" position="top" filtered={filtered} />
      </div>

      <PendingList>
        {cards.length === 0 ? (
          <div className="sx-iv-none sx-iv-rise" style={d(0.08)}>
            <span className="sx-iv-none-mark" aria-hidden="true">
              <Glyph ui="box" className="size-7" />
            </span>
            <p className="sx-iv-none-title">{empty.title}</p>
            <p className="sx-iv-none-hint">{empty.hint}</p>
          </div>
        ) : view === "list" ? (
          <div key="list" className="sx-iv-list">
            <div className="sx-iv-list-head" aria-hidden="true">
              <span>Item</span>
              <span>Price</span>
              <span>Stock</span>
              <span>Available</span>
              <span>On sale</span>
            </div>
            <ul aria-label="Your items">
              {cards.map((c, i) => (
                <ItemRow key={c.id} card={c} i={i} href={href(c.id)} setActive={setActive} />
              ))}
            </ul>
          </div>
        ) : (
          <ul key="cards" aria-label="Your items" className="sx-iv-grid">
            {cards.map((c, i) => (
              <ItemCard key={c.id} card={c} i={i} href={href(c.id)} setActive={setActive} />
            ))}
          </ul>
        )}
      </PendingList>

      {cards.length > 0 && <PagerRow page={page} noun="Items" tone="athlete" position="bottom" />}
    </div>
  );
}

/* ── adding an item ────────────────────────────────────────────────────── */

/** The kind tiles over the form. Picking one sets the form's Kind; the form's own menu moves the tiles. */
export function NewItemPanel({
  create,
  components,
  savedHref,
  onCancel,
  initialKind,
}: {
  create: Create;
  components: Array<{ id: string; label: string }>;
  savedHref: string;
  onCancel?: () => void;
  /** The idea tile the popup was opened from, if any. */
  initialKind?: InventoryKind;
}) {
  const [kind, setKind] = useState<InventoryKind>(initialKind ?? EMPTY_DRAFT.kind);
  return (
    <div className="sx-iv-new">
      <p className="sx-iv-new-step">
        <span aria-hidden="true">1</span> What are you selling?
      </p>
      <div role="group" aria-label="What are you selling?" className="sx-iv-kinds">
        {INVENTORY_KINDS.map((k, i) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            data-kind={k}
            onClick={() => setKind(k)}
            className="sx-iv-kind-tile sx-iv-rise"
            style={d(0.08 + i * 0.03)}
          >
            <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
              <Glyph kind={k} className="size-[18px]" />
            </span>
            <span className="sx-iv-kind-name">{KIND_LABEL[k]}</span>
          </button>
        ))}
      </div>
      <p className="sx-iv-new-step">
        <span aria-hidden="true">2</span> Name it, price it, say when
      </p>
      <InventoryForm mode="create" create={create} components={components} savedHref={savedHref} onCancel={onCancel} kind={kind} onKindChange={setKind} />
    </div>
  );
}

/** The popup. `close` plays the exit (the owner unmounts it after); `closing` is that exit under way.
 *  `open`: short content that may spill past the edge (a dropdown inside), so nothing scrolls or clips. */
function Modal({
  close,
  closing,
  title,
  lede,
  icon,
  tone = "blue",
  open = false,
  focus,
  children,
}: {
  close: () => void;
  closing: boolean;
  title: string;
  lede: string;
  icon: UiGlyph;
  tone?: "blue" | "danger";
  open?: boolean;
  /** A selector to focus on arrival; the close button otherwise. */
  focus?: string;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    const t = window.setTimeout(() => (sheet.current?.querySelector<HTMLElement>(focus ?? ".sx-iv-close") ?? sheet.current?.querySelector<HTMLElement>(".sx-iv-close"))?.focus(), 120);
    return () => {
      root.style.overflow = was;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      /* a menu open inside the form closes itself first */
      if ((e.target as HTMLElement).closest("[role=listbox]")) return;
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const f = sheet.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex='-1'])");
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="sx-arena sx-iv-modal" data-closing={closing ? "" : undefined}>
      <div className="sx-iv-scrim" onClick={close} aria-hidden="true" />
      <section
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sx-iv-sheet"
        data-open={open ? "" : undefined}
        data-tone={tone}
        onKeyDown={onKey}
      >
        <div className="sx-iv-sheet-head">
          <span className="sx-iv-sheet-badge" aria-hidden="true">
            <Glyph ui={icon} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="sx-iv-sheet-title">
              {title}
            </h2>
            <p className="sx-iv-sheet-lede">{lede}</p>
          </div>
          <button type="button" onClick={close} className="sx-iv-close" aria-label="Close">
            <Glyph ui="close" className="size-4" />
          </button>
        </div>
        <div className="sx-iv-sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

/** A popup's life: closed → open → closing (the exit plays) → closed, focus back on the opener. */
function usePopup() {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const opener = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const shut = () => {
    setPhase("closed");
    opener.current?.focus();
  };
  const close = () => {
    if (phase !== "open") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) shut();
    else {
      setPhase("closing");
      timer.current = window.setTimeout(shut, 280);
    }
  };
  return { phase, opener, show: () => setPhase("open"), close };
}

/** The ideas an empty inventory offers, each opening the popup on its kind. */
const IDEAS: Array<{ kind: InventoryKind; hint: string }> = [
  { kind: "SOCIAL_POST", hint: "A post or story about their brand" },
  { kind: "APPEARANCE", hint: "Show up at their store or event" },
  { kind: "CAMP", hint: "Coach a session with their logo on it" },
  { kind: "AUTOGRAPH", hint: "Sign gear for their customers" },
  { kind: "VIDEO", hint: "A short video shout-out" },
  { kind: "PACKAGE", hint: "Bundle a few items at one price" },
];

/** "+ Add an item" and its popup. `hero`: the empty inventory's big button, with idea tiles under it. */
export function InventoryAddItem({
  create,
  components,
  savedHref,
  hero = false,
}: {
  create: Create;
  components: Array<{ id: string; label: string }>;
  savedHref: string;
  hero?: boolean;
}) {
  const { phase, opener: button, show, close } = usePopup();
  const [startKind, setStartKind] = useState<InventoryKind | undefined>(undefined);
  const open = (k?: InventoryKind) => {
    setStartKind(k);
    show();
  };
  const popup =
    phase !== "closed" ? (
      <Modal
        close={close}
        closing={phase === "closing"}
        title="Add an item"
        lede="Pick what it is, name it and set your price. You can change it any time after."
        icon="tag"
        focus="#inv-title"
      >
        <NewItemPanel create={create} components={components} savedHref={savedHref} onCancel={close} initialKind={startKind} />
      </Modal>
    ) : null;

  if (hero) {
    return (
      <div className="sx-iv-start">
        <button ref={button} type="button" onClick={() => open()} aria-haspopup="dialog" className="sx-iv-add sx-iv-add-big">
          <span className="sx-iv-add-plus" aria-hidden="true">
            <Glyph ui="plus" className="size-5" />
          </span>
          Add your first item
        </button>
        <p className="sx-iv-start-or">or start from an idea</p>
        <ul className="sx-iv-ideas">
          {IDEAS.map((idea, i) => (
            <li key={idea.kind} className="sx-iv-rise" style={d(0.3 + i * 0.06)}>
              <button type="button" data-kind={idea.kind} onClick={() => open(idea.kind)} aria-haspopup="dialog" className="sx-iv-idea">
                <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
                  <Glyph kind={idea.kind} className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="sx-iv-idea-name">{KIND_LABEL[idea.kind]}</span>
                  <span className="sx-iv-idea-hint">{idea.hint}</span>
                </span>
                <span className="sx-iv-idea-go" aria-hidden="true">
                  <Glyph ui="plus" className="size-3.5" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {popup}
      </div>
    );
  }
  return (
    <>
      <button ref={button} type="button" onClick={() => open()} aria-haspopup="dialog" className="sx-iv-add">
        <span className="sx-iv-add-plus" aria-hidden="true">
          <Glyph ui="plus" className="size-4" />
        </span>
        Add an item
      </button>
      {popup}
    </>
  );
}

/* ── the categories the athlete won't promote, behind a header button ──── */

type RestrictionResult = { ok: true } | { ok: false; message: string };

/** "Won't promote · n": a setting, not inventory, so it sits behind a button
 *  beside "Add an item" (the reference's "View settings") and opens the same
 *  chips-and-add panel as before in a popup. */
export function InventoryBrandRules({
  rows,
  add,
  remove,
}: {
  rows: RestrictionRow[];
  add: (category: string, reason: string) => Promise<RestrictionResult>;
  remove: (id: string) => Promise<RestrictionResult>;
}) {
  const { phase, opener, show, close } = usePopup();
  return (
    <>
      <button ref={opener} type="button" onClick={show} aria-haspopup="dialog" className="sx-iv-rules">
        <Glyph ui="ban" className="size-4" />
        Won&rsquo;t promote
        <span className="sx-iv-rules-count" data-zero={rows.length === 0 ? "" : undefined}>
          {rows.length}
        </span>
      </button>
      {phase !== "closed" && (
        <Modal
          close={close}
          closing={phase === "closing"}
          title="Categories you won't promote"
          lede="Applies to every item and every offer, for the dates shown."
          icon="ban"
          tone="danger"
          open
        >
          <InventoryRestrictions rows={rows} add={add} remove={remove} />
        </Modal>
      )}
    </>
  );
}

/* ── the item page's owner bar (POL-FE-83, /athlete/inventory/[id]) ─────── */

/** The same optimistic "On sale" switch as the list, for one item. */
export function ItemSaleSwitch({ id, active, title, setActive }: { id: string; active: boolean; title: string; setActive: SetActive }) {
  const sale = useSale(id, active, setActive);
  return (
    <span className="sx-iv-owner-switch">
      <SaleSwitch {...sale} title={title} />
      {sale.error && (
        <span role="alert" className="sx-iv-error">
          {sale.error}
        </span>
      )}
    </span>
  );
}

type Update = (id: string, patch: Partial<InventoryBody>) => Promise<Result>;

/** "Edit item": the same edit form as before, in the popup. A save refreshes the showcase behind it. */
export function InventoryEditItem({ item, update }: { item: ApiInventoryItem; update: Update }) {
  const { phase, opener, show, close } = usePopup();
  return (
    <>
      <button ref={opener} type="button" onClick={show} aria-haspopup="dialog" className="sx-iv-add">
        <span className="sx-iv-add-plus" aria-hidden="true">
          <Glyph ui="edit" className="size-4" />
        </span>
        Edit item
      </button>
      {phase !== "closed" && (
        <Modal
          close={close}
          closing={phase === "closing"}
          title={`Edit: ${item.title}`}
          lede="Orders already placed keep the price they were placed at."
          icon="edit"
          focus="#inv-title"
        >
          <InventoryForm mode="edit" item={item} update={update} tone="athlete" />
        </Modal>
      )}
    </>
  );
}

/** A box that leans toward the pointer, with a glare (fine pointers, motion allowed). */
export function Tilt({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={className} onPointerMove={tilt} onPointerLeave={untilt}>
      <span aria-hidden="true" className="sx-iv-glare" />
      {children}
    </div>
  );
}

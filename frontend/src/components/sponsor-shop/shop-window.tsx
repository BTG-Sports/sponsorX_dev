"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { addToCartAction } from "@/app/(app)/sponsor/shop/actions";
import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { DateRangePicker } from "@/components/date-range-picker";
import { Dropdown } from "@/components/filter-kit";
import { ListSearch, PagerRow, PendingList, useListNav } from "@/components/server-pager";
import { ShopDateFilter } from "@/components/shop-date-filter";
import type { PageInfo } from "@/lib/list-query";
import { CATEGORY_OPTIONS, MIN_PRICE_BANDS, PRICE_BANDS, STATE_OPTIONS, isoDay, usd, validateLine, defaultWindow, type ShopFilters } from "@/lib/shop-live";
import { KIND_RAIL, MORE_FILTER_KEYS, type FilterChipDef, type ShopItem } from "@/lib/shop-window";

/* --------------------------------------------------------------------------
   POL-FE-91 — the sponsor shop as a shop window, on the Stadium Board. The
   client half (the page reads everything; lib/shop-window.ts words it).

   The owner (2026-11-16): "do the whole thing we did in athlete inventory
   and listing; the items can be viewed before clicking add to cart, and a
   button on the item itself for add to cart; easy to understand — keep the
   theme." So, like Inventory / Listings, but the sponsor's own stage:

   - ShopWindow   the type rail (All + one chip per kind), a search, one
                  "Filters" button (the six other filters live in a popup,
                  not a row of eight controls), the filters in force as
                  removable chips, Cards ↔ List, the pager above and below.
   - each item    a card (or a list row) you can open, with its own
                  "Add to cart" button. Already in the cart → it says so.
   - ItemSheet    ONE popup, three steps: the item in full (Details) →
                  how many and which dates (Add to cart) → "Added" with
                  Keep shopping / Go to cart. "Add to cart" on a card opens
                  it straight on the second step.
   - FiltersSheet the six other filters, each with a plain label, applied
                  the moment they change; "Show n items" closes it.

   Writes: addToCartAction (POST /cart, POST /cart/lines) — unchanged. A
   sample deck or a Sponsor Viewer never gets a live button: the sample
   draws it disabled with the reason, the Viewer gets the sentence instead
   (memory QA pass 4: a demo write must not look like it went through).
   Stadium look only (memory: portal-stage-identities): LED panels, lit
   numerals, the power-on entrance, orange light. No tilt, no Arena plates.
   -------------------------------------------------------------------------- */

export type BuyMode = "buy" | "view" | "sample";

const d = (s: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${s}s`, ...extra }) as CSSProperties;

/* ── Cards or List, remembered per browser ─────────────────────────────── */

type View = "cards" | "list";
const VIEW_KEY = "sx-sh-view";
const VIEW_EVENT = "sx-sh-view";
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

function ViewSwitch({ view }: { view: View }) {
  return (
    <div role="group" aria-label="Show items as" className="sx-sh-views">
      {(["cards", "list"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => writeView(v)} className="sx-sh-view">
          <Glyph ui={v === "cards" ? "grid" : "rows"} className="size-4" />
          <span>{v === "cards" ? "Cards" : "List"}</span>
        </button>
      ))}
    </div>
  );
}

/* ── the popup shell: the Stadium's own sheet ──────────────────────────── */

function Sheet({
  close,
  closing,
  title,
  lede,
  icon,
  kind,
  roomy = false,
  foot,
  focusKey,
  children,
}: {
  close: () => void;
  closing: boolean;
  title: string;
  lede?: string;
  icon?: UiGlyph;
  kind?: string;
  /** Short content with a popover inside (a calendar, a menu): nothing clips. */
  roomy?: boolean;
  foot?: ReactNode;
  /** A new value (the next step) moves focus to its [data-autofocus] and the body back to the top. */
  focusKey?: string;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = was;
    };
  }, []);

  useEffect(() => {
    const el = sheet.current;
    el?.querySelector<HTMLElement>(".sx-sh-sheet-body")?.scrollTo({ top: 0 });
    const t = window.setTimeout(() => (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(".sx-sh-close"))?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [focusKey]);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      /* a menu or calendar open inside closes itself first */
      if ((e.target as HTMLElement).closest("[role=listbox], [role=dialog][aria-modal=false], .sx-pop")) return;
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const f = sheet.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])");
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
    <div className="sx-stadium sx-sh-modal" data-closing={closing ? "" : undefined}>
      <div className="sx-sh-scrim" onClick={close} aria-hidden="true" />
      <section
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sx-sh-sheet"
        data-roomy={roomy ? "" : undefined}
        onKeyDown={onKey}
      >
        <div className="sx-sh-sheet-head">
          <span className="sx-sh-icon" data-kind={kind} aria-hidden="true">
            {kind ? <Glyph kind={kind} className="size-5" /> : <Glyph ui={icon ?? "tag"} className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="sx-sh-sheet-title">
              {title}
            </h2>
            {lede && <p className="sx-sh-sheet-lede">{lede}</p>}
          </div>
          <button type="button" onClick={close} className="sx-sh-close" aria-label="Close">
            <Glyph ui="close" className="size-4" />
          </button>
        </div>
        <div key={focusKey} className="sx-sh-sheet-body">
          {children}
        </div>
        {foot && <div className="sx-sh-sheet-foot">{foot}</div>}
      </section>
    </div>,
    document.body,
  );
}

/** A popup's life: closed → open → closing (the exit plays) → closed; focus goes back to what opened it. */
function usePopup<T>() {
  const [state, setState] = useState<{ value: T; closing: boolean } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const open = (value: T) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.clearTimeout(timer.current);
    setState({ value, closing: false });
  };
  const shut = () => {
    setState(null);
    opener.current?.focus();
  };
  const close = () => {
    if (!state || state.closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) shut();
    else {
      setState({ ...state, closing: true });
      timer.current = window.setTimeout(shut, 260);
    }
  };
  const update = (value: T) => setState((s) => (s ? { ...s, value } : s));
  return { state, open, close, update };
}

/* ── one item: a card, or a row of the list ────────────────────────────── */

type Open = (item: ShopItem) => void;

/** An item's own page: the athlete's showcase, as a sponsor meets it (/sponsor/shop/[id]). */
export const itemHref = (id: string) => `/sponsor/shop/${encodeURIComponent(id)}`;

function InCart({ qty }: { qty: number }) {
  return (
    <span className="sx-sh-incart">
      <Glyph ui="check" className="size-3" />
      In your cart{qty > 1 ? ` · ${qty}` : ""}
    </span>
  );
}

function When({ item }: { item: ShopItem }) {
  return (
    <span className="sx-sh-when" data-tone={item.when.tone}>
      <Glyph ui="calendar" className="size-3.5" />
      <span>{item.when.label}</span>
    </span>
  );
}

/** The item's own "Add to cart": live for a buyer, drawn disabled with the reason on the sample, absent for a Viewer. */
function AddButton({ item, mode, inCart, open, small = false, big = false }: { item: ShopItem; mode: BuyMode; inCart: number; open: Open; small?: boolean; big?: boolean }) {
  if (mode === "view") return null;
  const sample = mode === "sample";
  if (item.soldOut) {
    return (
      <button type="button" disabled className={`sx-sh-add${big ? " sx-sh-add-big" : ""}`} data-small={small ? "" : undefined} title="None left to buy right now.">
        Sold out
      </button>
    );
  }
  /* The cart holds one line per item (the API: "already in the cart — change its line instead"), so a second add is a change there. */
  if (inCart > 0 && !sample) {
    return (
      <Link href="/sponsor/cart" className={`sx-sh-ghost sx-sh-tocart${big ? " sx-sh-add-big" : ""}`} data-small={small ? "" : undefined} aria-label={`Change in cart: ${item.title}`}>
        <Glyph ui="edit" className="size-4" />
        Change in cart
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => open(item)}
      disabled={sample}
      title={sample ? "Sample item. You can add to your cart once your account is linked to a sponsor." : undefined}
      aria-haspopup="dialog"
      aria-label={`Add to cart: ${item.title}`}
      className={`sx-sh-add${big ? " sx-sh-add-big" : ""}`}
      data-small={small ? "" : undefined}
    >
      <Glyph ui="plus" className="size-4" />
      Add to cart
    </button>
  );
}

function ItemCard({ item, i, mode, inCart, open }: { item: ShopItem; i: number; mode: BuyMode; inCart: number; open: Open }) {
  return (
    <li className="sx-stadium-in" style={d(0.08 + i * 0.045)}>
      <article className="sx-stadium-panel sx-sh-card" data-spot="" data-kind={item.kind} data-incart={inCart ? "" : undefined}>
        <div className="sx-sh-card-top">
          <span className="sx-sh-icon" data-kind={item.kind} aria-hidden="true">
            <Glyph kind={item.kind} className="size-5" />
          </span>
          <span className="sx-sh-kind">{item.kindLabel}</span>
          {inCart ? <InCart qty={inCart} /> : item.when.flag ? <span className="sx-sh-flag" data-tone={item.when.tone}>{item.when.flag}</span> : null}
        </div>

        <h3 className="sx-sh-card-title">
          <Link href={itemHref(item.id)} className="sx-sh-stretch">
            {item.title}
          </Link>
        </h3>

        <p className="sx-sh-who">
          <span className="sx-sh-avatar" aria-hidden="true">
            {item.initials}
          </span>
          <span className="min-w-0">
            <span className="sx-sh-who-name">{item.who}</span>
            <span className="sx-sh-who-sub">{item.whoSub ?? (item.seller.team ? item.seller.name : "Independent athlete")}</span>
          </span>
        </p>

        {item.description && <p className="sx-sh-blurb">{item.description}</p>}

        <p className="sx-sh-card-facts">
          <When item={item} />
          {item.stock && (
            <span className="sx-sh-stock" data-out={item.soldOut ? "" : undefined}>
              {item.stock}
            </span>
          )}
        </p>

        <div className="sx-sh-card-foot">
          <p className="sx-sh-price">
            <span className="sx-stadium-num">{item.price}</span>
            <span>{item.per}</span>
          </p>
          <div className="sx-sh-card-actions">
            <Link href={itemHref(item.id)} className="sx-sh-ghost" aria-label={`View: ${item.title}`}>
              View
            </Link>
            <AddButton item={item} mode={mode} inCart={inCart} open={open} />
          </div>
        </div>
      </article>
    </li>
  );
}

function ItemRow({ item, i, mode, inCart, open }: { item: ShopItem; i: number; mode: BuyMode; inCart: number; open: Open }) {
  return (
    <li className="sx-stadium-row" style={d(0.04 + i * 0.03)}>
      <div className="sx-sh-row" data-kind={item.kind} data-incart={inCart ? "" : undefined}>
        <span className="sx-sh-icon sx-sh-icon-sm" data-kind={item.kind} aria-hidden="true">
          <Glyph kind={item.kind} className="size-[18px]" />
        </span>
        <span className="sx-sh-row-main">
          <Link href={itemHref(item.id)} className="sx-sh-stretch sx-sh-row-title">
            {item.title}
          </Link>
          <span className="sx-sh-row-sub">
            <span>
              {item.who}
              {item.whoSub ? ` · ${item.whoSub}` : ""}
            </span>
            {inCart ? <InCart qty={inCart} /> : null}
          </span>
        </span>
        <span className="sx-sh-row-cell sx-sh-row-kind">{item.kindLabel}</span>
        <span className="sx-sh-row-cell sx-sh-row-when">
          <When item={item} />
        </span>
        <span className="sx-sh-row-cell sx-sh-row-price">
          <span className="sx-stadium-num">{item.price}</span>
        </span>
        <span className="sx-sh-row-cell sx-sh-row-act">
          <AddButton item={item} mode={mode} inCart={inCart} open={open} small />
        </span>
      </div>
    </li>
  );
}

/* ── the add-to-cart popup: add → added ────────────────────────────────── */

type Step = "add" | "added";
type Added = { qty: number; from: string; to: string };

function Mini({ item }: { item: ShopItem }) {
  return (
    <div className="sx-sh-mini">
      <span className="sx-sh-icon sx-sh-icon-sm" data-kind={item.kind} aria-hidden="true">
        <Glyph kind={item.kind} className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sx-sh-mini-title">{item.title}</span>
        <span className="sx-sh-mini-sub">
          {item.who} · {item.price} {item.per}
        </span>
      </span>
    </div>
  );
}

function useAddForm({ item, today, onDone, onCancel, onPage }: { item: ShopItem; today: string; onDone: (a: Added) => void; onCancel: () => void; onPage: boolean }) {
  const start = defaultWindow(item.window, today);
  const [qty, setQty] = useState(item.minQty);
  const [from, setFrom] = useState<string>(start.startsOn);
  const [to, setTo] = useState<string>(start.endsOn);
  const [problem, setProblem] = useState<{ message: string; reasons: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  /* memory: double-submit-needs-a-ref — a state flag lets a double click through. */
  const lock = useRef(false);

  const min = item.window.availableFrom ? maxDay(isoDay(item.window.availableFrom), today) : today;
  const max = item.window.availableUntil ? isoDay(item.window.availableUntil) : undefined;
  const step = (n: number) => setQty((q) => Math.min(item.maxQty, Math.max(1, q + n)));

  const submit = async () => {
    if (lock.current) return;
    const problems = validateLine({ quantity: qty, startsOn: from, endsOn: to }, item.window);
    if (problems.length) {
      setProblem({ message: "Check this first:", reasons: problems });
      return;
    }
    lock.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const r = await addToCartAction(item.id, qty, from, to);
      if (r.ok) onDone({ qty, from, to });
      else setProblem({ message: r.message, reasons: r.reasons });
    } catch {
      setProblem({ message: "Nothing was added. Try again in a minute.", reasons: [] });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return {
    body: (
      <div className="sx-sh-addform">
        <Mini item={item} />
        {!onPage && (
          <Link href={itemHref(item.id)} className="sx-sh-back">
            <Glyph ui="eye" className="size-3.5" />
            See everything about it first
          </Link>
        )}

        <div className="sx-sh-step">
          <p className="sx-sh-step-q">
            <span className="sx-sh-step-n" aria-hidden="true">
              1
            </span>
            How many?
          </p>
          <div className="sx-sh-qty" role="group" aria-label="Quantity">
            <button type="button" onClick={() => step(-1)} disabled={qty <= 1} aria-label="One fewer" className="sx-sh-qty-btn">
              −
            </button>
            <input
              data-autofocus=""
              inputMode="numeric"
              aria-label="Quantity"
              value={qty}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                setQty(Number.isFinite(n) && n > 0 ? Math.min(item.maxQty, n) : 1);
              }}
              className="sx-sh-qty-input sx-stadium-num"
            />
            <button type="button" onClick={() => step(1)} disabled={qty >= item.maxQty} aria-label="One more" className="sx-sh-qty-btn">
              +
            </button>
            <span className="sx-sh-qty-note">{item.stock ? `${item.stock} in all` : "No limit"}</span>
          </div>
        </div>

        <div className="sx-sh-step">
          <p className="sx-sh-step-q">
            <span className="sx-sh-step-n" aria-hidden="true">
              2
            </span>
            Which dates should it run?
          </p>
          <p className="sx-sh-step-hint">
            {item.when.label === "Any dates" ? "Any dates work for this item." : `This item runs ${item.when.label}.`} Pick one day, or click a second day for a range.
          </p>
          <DateRangePicker
            from={from}
            to={to === from ? null : to}
            onChange={(f, t) => {
              if (!f) return;
              setFrom(f);
              setTo(t ?? f);
            }}
            min={min}
            max={max}
            tone="sponsor"
            label="Dates it runs"
            clearable={false}
            align="left"
          />
        </div>

        <div className="sx-sh-total" aria-live="polite">
          <span>
            {qty} × {item.price}
          </span>
          <span className="sx-sh-total-sum">
            <span className="sx-stadium-num">{usd(qty * item.priceCents)}</span>
          </span>
        </div>
        <p className="sx-sh-note">
          <Glyph ui="shield" className="size-3.5" />
          Nothing is charged now. You can still change it in your cart, and you only pay after checkout.
        </p>

        {problem && (
          <div role="alert" className="sx-sh-problem">
            <p>{problem.message}</p>
            {problem.reasons.length > 0 && (
              <ul>
                {problem.reasons.map((r, k) => (
                  <li key={`${k}-${r}`}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    ),
    foot: (
      <>
        <button type="button" onClick={onCancel} className="sx-sh-ghost">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy} className="sx-sh-add sx-sh-add-big">
          <Glyph ui="plus" className="size-4" />
          {busy ? "Adding…" : `Add to cart · ${usd(qty * item.priceCents)}`}
        </button>
      </>
    ),
  };
}

const maxDay = (a: string, b: string) => (a > b ? a : b);
const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmt = (day: string) => DAY_FMT.format(new Date(`${day}T00:00:00.000Z`));

function AddedPanel({ item, added }: { item: ShopItem; added: Added }) {
  return (
    <div className="sx-sh-added" role="status">
      <span className="sx-sh-added-mark" aria-hidden="true">
        <Glyph ui="check" className="size-8" />
      </span>
      <p className="sx-sh-added-title">It&rsquo;s in your cart</p>
      <p className="sx-sh-added-line">
        {added.qty} × {item.title} · {added.from === added.to ? fmt(added.from) : `${fmt(added.from)} – ${fmt(added.to)}`}
      </p>
      <p className="sx-sh-added-sum">
        <span className="sx-stadium-num">{usd(added.qty * item.priceCents)}</span>
      </p>
      <ol className="sx-sh-next">
        <li data-done="">Pick items</li>
        <li data-now="">Check your cart</li>
        <li>Check out</li>
      </ol>
    </div>
  );
}

function ItemSheet({
  item,
  step,
  today,
  goStep,
  close,
  closing,
  onAdded,
  onPage,
}: {
  item: ShopItem;
  step: Step;
  today: string;
  goStep: (s: Step) => void;
  close: () => void;
  closing: boolean;
  onAdded: (a: Added) => void;
  /** Opened on the item's own page: no "see everything" link back to it. */
  onPage: boolean;
}) {
  const [added, setAdded] = useState<Added | null>(null);
  const form = useAddForm({
    item,
    today,
    onPage,
    onCancel: close,
    onDone: (a) => {
      setAdded(a);
      onAdded(a);
      goStep("added");
    },
  });

  if (step === "added" && added) {
    return (
      <Sheet close={close} closing={closing} title="Added to your cart" icon="check" focusKey="added" foot={
        <>
          <button type="button" onClick={close} className="sx-sh-ghost" data-autofocus="">
            {onPage ? "Stay here" : "Keep shopping"}
          </button>
          <Link href="/sponsor/cart" className="sx-sh-add sx-sh-add-big">
            Go to cart
            <Glyph ui="arrow" className="size-4" />
          </Link>
        </>
      }>
        <AddedPanel item={item} added={added} />
      </Sheet>
    );
  }

  return (
    <Sheet close={close} closing={closing} title="Add to cart" lede="Two quick choices. You can change both later in your cart." kind={item.kind} roomy focusKey="add" foot={form.foot}>
      {form.body}
    </Sheet>
  );
}

/** The add-to-cart popup and its "In your cart" count, for one or many items. */
function useBuy(mode: BuyMode, cartQty: Record<string, number>) {
  const router = useRouter();
  const popup = usePopup<{ item: ShopItem; step: Step }>();
  /* What this visit added, on top of the cart the page read — "In your cart" shows at once. */
  const [mine, setMine] = useState<Record<string, number>>({});
  /* A refresh brings the cart's own count, which already holds what was added here. */
  const [cartSeen, setCartSeen] = useState(cartQty);
  if (cartQty !== cartSeen) {
    setCartSeen(cartQty);
    setMine({});
  }
  const qtyOf = (id: string) => (cartQty[id] ?? 0) + (mine[id] ?? 0);
  const open: Open = (it) => {
    if (mode === "buy" && !it.soldOut && qtyOf(it.id) === 0) popup.open({ item: it, step: "add" });
  };
  const sheet = (today: string, onPage: boolean) =>
    popup.state ? (
      <ItemSheet
        key={popup.state.value.item.id}
        item={popup.state.value.item}
        step={popup.state.value.step}
        today={today}
        onPage={onPage}
        goStep={(s) => popup.state && popup.update({ item: popup.state.value.item, step: s })}
        close={popup.close}
        closing={popup.state.closing}
        onAdded={(a) => {
          const id = popup.state!.value.item.id;
          setMine((m) => ({ ...m, [id]: (m[id] ?? 0) + a.qty }));
          router.refresh();
        }}
      />
    ) : null;
  return { open, qtyOf, sheet };
}

/** POL-FE-91 — the item page's buy button (/sponsor/shop/[id]): the same popup as the shop's cards. */
export function ShopItemBuy({ item, mode, today, inCart }: { item: ShopItem; mode: BuyMode; today: string; inCart: Record<string, number> }) {
  const buy = useBuy(mode, inCart);
  const qty = buy.qtyOf(item.id);
  return (
    <>
      {qty > 0 && <InCart qty={qty} />}
      {mode === "view" ? (
        <span className="sx-sh-bar-note">
          <Glyph ui="eye" className="size-4" />A Sponsor Admin on your team adds to the cart.
        </span>
      ) : (
        <AddButton item={item} mode={mode} inCart={qty} open={buy.open} big />
      )}
      {buy.sheet(today, true)}
    </>
  );
}

/* ── the filters popup ─────────────────────────────────────────────────── */

function FiltersSheet({ filters, total, close, closing, clearAll, count }: { filters: ShopFilters; total: number; close: () => void; closing: boolean; clearAll: () => void; count: number }) {
  const { set } = useListNav();
  return (
    <Sheet
      close={close}
      closing={closing}
      title="Filters"
      lede="Each choice applies straight away. The items behind this update as you go."
      icon="stack"
      roomy
      foot={
        <>
          <button type="button" onClick={clearAll} disabled={count === 0} className="sx-sh-ghost">
            Clear filters
          </button>
          <button type="button" onClick={close} className="sx-sh-add sx-sh-add-big" data-autofocus="">
            Show {total.toLocaleString("en-US")} {total === 1 ? "item" : "items"}
          </button>
        </>
      }
    >
      <div className="sx-sh-filters">
        <div className="sx-sh-field">
          <span className="sx-sh-field-label">Good for brands in</span>
          <Dropdown label="Brand category" allLabel="Any category" value={filters.category} options={CATEGORY_OPTIONS} onChange={(v) => set({ category: v || null })} tone="sponsor" block />
        </div>
        <div className="sx-sh-field">
          <span className="sx-sh-field-label">Sport</span>
          <ListSearch initial={filters.sport} label="Sport" placeholder="e.g. Basketball" tone="sponsor" param="sport" />
        </div>
        <div className="sx-sh-field">
          <span className="sx-sh-field-label">State</span>
          <Dropdown label="State" allLabel="Any state" value={filters.stateCode} options={STATE_OPTIONS} onChange={(v) => set({ stateCode: v || null })} tone="sponsor" block />
        </div>
        <div className="sx-sh-field">
          <span className="sx-sh-field-label">Price</span>
          <div className="sx-sh-field-pair">
            <Dropdown label="Price from" allLabel="Any lowest price" value={filters.minPrice} options={MIN_PRICE_BANDS} onChange={(v) => set({ minPrice: v || null })} tone="sponsor" block />
            <Dropdown label="Price up to" allLabel="Any highest price" value={filters.maxPrice} options={PRICE_BANDS} onChange={(v) => set({ maxPrice: v || null })} tone="sponsor" block />
          </div>
        </div>
        <div className="sx-sh-field">
          <span className="sx-sh-field-label">Free on these dates</span>
          <ShopDateFilter availableFrom={filters.availableFrom} availableUntil={filters.availableUntil} />
        </div>
      </div>
    </Sheet>
  );
}

/* ── the type rail ─────────────────────────────────────────────────────── */

function KindRail({ kind }: { kind: string }) {
  const { set } = useListNav();
  const [current, setCurrent] = useState(kind);
  const [seen, setSeen] = useState(kind);
  if (kind !== seen) {
    setSeen(kind);
    setCurrent(kind);
  }
  const go = (k: string) => {
    if (k === current) return;
    setCurrent(k);
    set({ kind: k || null });
  };
  return (
    <div role="group" aria-label="What do you want?" className="sx-sh-rail">
      <button type="button" aria-pressed={current === ""} onClick={() => go("")} className="sx-sh-rail-chip">
        <Glyph ui="grid" className="size-4" />
        Everything
      </button>
      {KIND_RAIL.map((k) => (
        <button key={k.value} type="button" aria-pressed={current === k.value} onClick={() => go(k.value)} className="sx-sh-rail-chip" data-kind={k.value}>
          <Glyph kind={k.value} className="size-4" />
          {k.label}
        </button>
      ))}
    </div>
  );
}

/* ── the window ────────────────────────────────────────────────────────── */

export function ShopWindow({
  items,
  page,
  filters,
  filtered,
  chips,
  mode,
  today,
  inCart: cartQty,
  notes,
}: {
  items: ShopItem[];
  page: PageInfo;
  filters: ShopFilters;
  filtered: boolean;
  chips: FilterChipDef[];
  mode: BuyMode;
  today: string;
  /** listing id → quantity already in the cart. */
  inCart: Record<string, number>;
  /** Filters the page couldn't apply, or the API refused — said under the toolbar. */
  notes: string[];
}) {
  const view = useSyncExternalStore(subscribeView, readView, () => "cards" as View);
  const { set } = useListNav();
  const more = usePopup<true>();
  const { open, qtyOf, sheet } = useBuy(mode, cartQty);
  const clearMore = () => set(Object.fromEntries(MORE_FILTER_KEYS.map((k) => [k, null])));
  const clearAll = () => set({ ...Object.fromEntries(MORE_FILTER_KEYS.map((k) => [k, null])), kind: null, q: null });

  return (
    <div className="sx-sh">
      <div className="sx-sh-toolbar sx-stadium-in" style={d(0.12)}>
        <div className="sx-sh-toolbar-row">
          <div className="sx-sh-search">
            <ListSearch initial={filters.q} label="Search the shop" placeholder="Search the shop: a name, a team, an idea…" tone="sponsor" />
          </div>
          <button type="button" onClick={() => more.open(true)} aria-haspopup="dialog" className="sx-sh-filters-btn" data-on={chips.length ? "" : undefined}>
            <Glyph ui="stack" className="size-4" />
            Filters
            {chips.length > 0 && <span className="sx-stadium-badge">{chips.length}</span>}
          </button>
          <ViewSwitch view={view} />
        </div>
        <KindRail kind={filters.kind} />
        {chips.length > 0 && (
          <ul className="sx-sh-chips" aria-label="Filters in use">
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => set(c.clear)} className="sx-sh-chip" aria-label={`Remove filter: ${c.label}`}>
                  {c.label}
                  <Glyph ui="close" className="size-3" />
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={clearMore} className="sx-sh-chip-clear">
                Clear filters
              </button>
            </li>
          </ul>
        )}
        {notes.map((n) => (
          <p key={n} className="sx-sh-warn">
            {n}
          </p>
        ))}
      </div>

      <div className="sx-stadium-in" style={d(0.16)}>
        <PagerRow page={page} noun="Items" tone="sponsor" position="top" filtered={filtered && page.total > 0} />
      </div>

      <PendingList>
        {items.length === 0 ? (
          <div className="sx-stadium-panel sx-sh-none sx-stadium-in" style={d(0.18)}>
            <span className="sx-sh-icon sx-sh-none-mark" aria-hidden="true">
              <Glyph ui="box" className="size-7" />
            </span>
            <p className="sx-sh-none-title">{filtered ? "Nothing matches that" : "Nothing is on sale yet"}</p>
            <p className="sx-sh-none-hint">
              {filtered ? "Try another type, a wider price, or fewer filters." : "BTG adds new athlete items every week. Check back soon."}
            </p>
            {filtered && (
              <button type="button" onClick={clearAll} className="sx-sh-add">
                Show everything
              </button>
            )}
          </div>
        ) : view === "list" ? (
          <div key="list" className="sx-stadium-panel sx-sh-list">
            <div className="sx-sh-list-head" aria-hidden="true">
              <span>Item</span>
              <span>Type</span>
              <span>Dates</span>
              <span>Price</span>
              <span />
            </div>
            <ul aria-label="Items on sale">
              {items.map((it, i) => (
                <ItemRow key={it.id} item={it} i={i} mode={mode} inCart={qtyOf(it.id)} open={open} />
              ))}
            </ul>
          </div>
        ) : (
          <ul key="cards" aria-label="Items on sale" className="sx-sh-grid">
            {items.map((it, i) => (
              <ItemCard key={it.id} item={it} i={i} mode={mode} inCart={qtyOf(it.id)} open={open} />
            ))}
          </ul>
        )}
      </PendingList>

      {items.length > 0 && <PagerRow page={page} noun="Items" tone="sponsor" position="bottom" />}

      {sheet(today, false)}
      {more.state && <FiltersSheet filters={filters} total={page.total} close={more.close} closing={more.state.closing} clearAll={clearMore} count={chips.length} />}
    </div>
  );
}

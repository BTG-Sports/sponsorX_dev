"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";

import { removeLineAction, reserveAction, updateLineAction } from "@/app/(app)/sponsor/cart/actions";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { DateRangePicker } from "@/components/date-range-picker";
import { CART_STEPS, cartStep, clampQty, goneLines, itemCount, keptFor, maxQtyOf, runOf, type CartBoardLine } from "@/lib/cart-board";
import type { Quote } from "@/lib/checkout-gate";
import { countdown, feeText, fmtStamp, isoDay, lineSeller, lineSummary, usd, validateLine, type ShopResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   POL-FE-92 — the sponsor's cart, redrawn after the owner found the last one
   confusing. Modelled on a plain shop cart, in the Stadium's own hand
   (blue LED panels, lit numerals, the power-on entrance — cart.css):

     1. the board: "Your cart total is $X", how many items from how many
        sellers, ONE "Check out" button, and the three stops in plain words
        (review → check out, held 15 minutes → place the order, nothing
        charged until then);
     2. the items: a picture tile, the title (opens the item), who sells it
        and the price each, a − / + stepper, the dates as one button that
        opens the calendar, the line's total, and × to remove (asks first).
        A change saves by itself — there is no "Save" button to forget —
        and says "Saving…" then "Saved";
     3. the order summary beside it (below on a phone): subtotal, BTG's fee,
        the total, Check out again, and what checking out does;
     4. on a phone, a bar with the total and Check out rises once the board's
        own button has scrolled away.

   A held cart is frozen (the API refuses edits while a hold is live): the
   board says so with a live countdown and "Continue to checkout".
   Writes: ../app/(app)/sponsor/cart/actions.ts (unchanged contract).
   -------------------------------------------------------------------------- */

export type CartMode = "edit" | "view" | "held" | "sample";

type Refusal = { message: string; reasons: string[] };

const at = (s: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${s}s`, ...extra }) as CSSProperties;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/* ---------------------------------------------------------------- the board's shared state */

type Board = {
  /** A line started / finished saving: the totals wait for it. */
  begin: () => void;
  end: () => void;
  /** Re-read the cart from the server, as a transition. */
  refresh: () => void;
  busy: boolean;
  /** The sample cart only: a line's new quantity, or null once removed — kept on this page, never sent. */
  sampleSet: (lineId: string, qty: number | null) => void;
};
const BoardCtx = createContext<Board>({ begin: () => {}, end: () => {}, refresh: () => {}, busy: false, sampleSet: () => {} });

function useBoardState(sampleSet: Board["sampleSet"]): Board {
  const router = useRouter();
  const [saving, setSaving] = useState(0);
  const [refreshing, start] = useTransition();
  const begin = useCallback(() => setSaving((n) => n + 1), []);
  const end = useCallback(() => setSaving((n) => Math.max(0, n - 1)), []);
  const refresh = useCallback(() => start(() => router.refresh()), [router]);
  return useMemo(() => ({ begin, end, refresh, busy: saving > 0 || refreshing, sampleSet }), [begin, end, refresh, saving, refreshing, sampleSet]);
}

/* ---------------------------------------------------------------- a lit, rolling figure */

/** Money in cents that counts up on arrival and rolls to each new value. */
function Roll({ cents, delay = 0, className = "" }: { cents: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const node = ref.current?.firstChild;
    const el = ref.current;
    if (!node || !el) return;
    const from = shown.current ?? 0;
    shown.current = cents;
    if (from === cents || reduced()) {
      node.nodeValue = usd(cents);
      return;
    }
    const first = from === 0;
    let raf = 0;
    node.nodeValue = usd(from);
    const timer = window.setTimeout(
      () => {
        const t0 = performance.now();
        const span = first ? 1200 : 700;
        if (!first) el.setAttribute("data-bump", "");
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / span);
          node.nodeValue = usd(Math.round(from + (cents - from) * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
          else {
            node.nodeValue = usd(cents);
            el.removeAttribute("data-bump");
          }
        };
        raf = requestAnimationFrame(tick);
      },
      first ? delay * 1000 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      node.nodeValue = usd(cents);
      el.removeAttribute("data-bump");
    };
  }, [cents, delay]);

  return (
    <span ref={ref} className={`sx-stadium-num sx-ct-roll ${className}`}>
      {usd(cents)}
    </span>
  );
}

/* ---------------------------------------------------------------- buttons */

const CartIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
  </svg>
);

/** The one primary action: hold these items for 15 minutes and open checkout. */
function CheckoutButton({ mode, holdId, blocked, size = "big", id }: { mode: CartMode; holdId: string | null; blocked: string | null; size?: "big" | "bar"; id?: string }) {
  const board = useContext(BoardCtx);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [going, setGoing] = useState(false);
  /* memory: double-submit-needs-a-ref — a state flag lets a double click through. */
  const lock = useRef(false);

  if (mode === "view") return null;
  if (mode === "held" && holdId) {
    return (
      <Link id={id} href={`/sponsor/checkout?reservation=${encodeURIComponent(holdId)}`} className="sx-ct-go" data-size={size}>
        <span>Continue to checkout</span>
        <Glyph ui="arrow" className="size-4 sx-ct-go-arrow" />
      </Link>
    );
  }

  const disabled = mode === "sample" || board.busy || going || blocked !== null;
  const go = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setGoing(true);
    setRefusal(null);
    try {
      /* Success redirects to checkout; only a refusal comes back. */
      const r = await reserveAction();
      if (r && !r.ok) {
        setRefusal({ message: r.message, reasons: r.reasons });
        board.refresh();
      }
    } finally {
      lock.current = false;
      setGoing(false);
    }
  };

  const label = going ? "Holding your items…" : board.busy ? "Updating the total…" : "Check out";
  return (
    <div className="sx-ct-go-wrap">
      <button
        id={id}
        type="button"
        onClick={go}
        disabled={disabled}
        className="sx-ct-go"
        data-size={size}
        data-going={going ? "" : undefined}
        title={mode === "sample" ? "Sample data — nothing is held" : (blocked ?? undefined)}
      >
        {going ? <span className="sx-ct-spin" aria-hidden="true" /> : <Glyph ui="lock" className="size-4" />}
        <span>{label}</span>
        {!going && <Glyph ui="arrow" className="size-4 sx-ct-go-arrow" />}
      </button>
      {refusal && size === "big" && <Problem refusal={refusal} />}
    </div>
  );
}

function Problem({ refusal }: { refusal: Refusal }) {
  return (
    <div role="alert" className="sx-sh-problem sx-ct-problem">
      <p>{refusal.message}</p>
      {refusal.reasons.length > 0 && (
        <ul>
          {refusal.reasons.map((r, k) => (
            <li key={`${k}-${r}`}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- the hold countdown */

function subscribe(tick: () => void) {
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
const clientSecond = () => Math.floor(Date.now() / 1000);
const HOLD_SECONDS = 15 * 60;

function HoldBanner({ hold, serverNow }: { hold: { id: string; expiresAt: string }; serverNow: number }) {
  const { refresh } = useContext(BoardCtx);
  const second = useSyncExternalStore(subscribe, clientSecond, () => Math.floor(serverNow / 1000));
  const left = countdown(hold.expiresAt, second * 1000);

  /* Once, at zero: the server's own read (the hold gone) takes over. */
  useEffect(() => {
    if (left.expired) refresh();
  }, [left.expired, refresh]);

  const share = Math.min(1, left.seconds / HOLD_SECONDS);
  return (
    <section className="sx-ct-hold sx-stadium-in" style={at(0.12)} aria-label="Your items are held">
      <span className="sx-ct-ring" style={{ "--p": share } as CSSProperties} aria-hidden="true">
        <Glyph ui="lock" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="sx-ct-hold-title">
          {left.expired ? (
            "Your hold has ended"
          ) : (
            <>
              Held for you · <span className="sx-stadium-num tabular-nums" role="timer" aria-live="off">{left.label}</span> left
            </>
          )}
        </p>
        <p className="sx-ct-hold-text">
          {left.expired
            ? "The items went back on sale. Check out again to hold them, if they're still available."
            : `Nobody else can buy these until ${fmtStamp(hold.expiresAt)}. The cart is locked while they're held — finish checking out to place the order.`}
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- one line */

type Draft = { quantity: number; startsOn: string; endsOn: string };

export function CartLineRow({ line, mode, i = 0, today }: { line: CartBoardLine; mode: CartMode; i?: number; today: string }) {
  const board = useContext(BoardCtx);
  /* The sample cart can be clicked through; its changes stay on the page. */
  const sample = mode === "sample";
  const editable = mode === "edit" || sample;
  const info = line.info && !line.info.gone ? line.info : null;
  const gone = line.info?.gone === true;
  const max = maxQtyOf(line.info);

  const [qty, setQty] = useState(line.quantity);
  const [from, setFrom] = useState(isoDay(line.startsOn));
  const [to, setTo] = useState(isoDay(line.endsOn));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [problem, setProblem] = useState<Refusal | null>(null);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const timer = useRef<number | undefined>(undefined);
  const savedTimer = useRef<number | undefined>(undefined);
  const lock = useRef(false);
  const queued = useRef<Draft | null>(null);
  const removing = useRef(false);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(savedTimer.current);
    },
    [],
  );

  const revert = () => {
    setQty(line.quantity);
    setFrom(isoDay(line.startsOn));
    setTo(isoDay(line.endsOn));
  };

  const send = async (d: Draft): Promise<void> => {
    if (lock.current) {
      queued.current = d;
      return;
    }
    const problems = validateLine(d, info?.window);
    if (problems.length) {
      setProblem({ message: "That change wasn't saved:", reasons: problems });
      revert();
      return;
    }
    lock.current = true;
    setStatus("saving");
    setProblem(null);
    board.begin();
    try {
      const r: ShopResult = sample ? (await wait(420), { ok: true }) : await updateLineAction(line.id, d.quantity, d.startsOn, d.endsOn);
      if (r.ok) {
        setStatus("saved");
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setStatus("idle"), 2200);
        if (sample) board.sampleSet(line.id, d.quantity);
        else board.refresh();
      } else {
        setStatus("idle");
        setProblem({ message: r.message, reasons: r.reasons });
        revert();
      }
    } catch {
      setStatus("idle");
      setProblem({ message: "That change couldn't be saved. Try again in a minute.", reasons: [] });
      revert();
    } finally {
      lock.current = false;
      board.end();
      const next = queued.current;
      queued.current = null;
      if (next) void send(next);
    }
  };

  /** Save shortly after the last change, so a run of + clicks is one save. */
  const later = (d: Draft, ms: number) => {
    window.clearTimeout(timer.current);
    setStatus("saving");
    timer.current = window.setTimeout(() => void send(d), ms);
  };

  const stepQty = (n: number) => {
    const next = clampQty(qty + n, max);
    if (next === qty) return;
    setQty(next);
    later({ quantity: next, startsOn: from, endsOn: to }, 550);
  };

  const pickDates = (f: string | null, t: string | null) => {
    if (!f) return;
    const end = t ?? f;
    setFrom(f);
    setTo(end);
    later({ quantity: qty, startsOn: f, endsOn: end }, 900);
  };

  const remove = async () => {
    if (removing.current) return;
    removing.current = true;
    setAsking(false);
    setLeaving(true);
    setProblem(null);
    board.begin();
    try {
      const [r] = await Promise.all([sample ? Promise.resolve<ShopResult>({ ok: true }) : removeLineAction(line.id), wait(reduced() ? 0 : 480)]);
      if (r.ok) {
        if (sample) board.sampleSet(line.id, null);
        else board.refresh();
      }
      else {
        setLeaving(false);
        setProblem({ message: r.message, reasons: r.reasons });
      }
    } catch {
      setLeaving(false);
      setProblem({ message: "It couldn't be removed. Try again in a minute.", reasons: [] });
    } finally {
      removing.current = false;
      board.end();
    }
  };

  const run = runOf(from, to);
  const min = info?.window.availableFrom ? maxDay(isoDay(info.window.availableFrom), today) : today;
  const maxDate = info?.window.availableUntil ? isoDay(info.window.availableUntil) : undefined;
  const href = `/sponsor/shop/${encodeURIComponent(line.listingId)}`;

  return (
    <li className="sx-ct-line" data-leaving={leaving ? "" : undefined} data-gone={gone ? "" : undefined} style={at(0.22 + i * 0.07)}>
      <div className="sx-ct-line-in">
        <div className="sx-ct-row">
          <Link href={href} className="sx-ct-thumb" aria-label={`Open ${line.title}`} tabIndex={-1}>
            <span className="sx-ct-thumb-glyph">
              <Glyph kind={info?.kind ?? "OTHER"} className="size-7" />
            </span>
          </Link>

          <div className="sx-ct-main">
            {info && <span className="sx-sh-kind">{info.kindLabel}</span>}
            <Link href={href} className="sx-ct-title">
              {line.title}
            </Link>
            <p className="sx-ct-sub">
              {lineSeller(line)} · {usd(line.unitPriceCents)} each
            </p>
            {gone && (
              <p className="sx-ct-gone">
                <Glyph ui="ban" className="size-3.5" />
                No longer in the shop — remove it to check out.
              </p>
            )}
          </div>

          <div className="sx-ct-cell sx-ct-cell-qty">
            <span className="sx-ct-label">How many</span>
            {editable ? (
              <div className="sx-ct-qty" role="group" aria-label={`How many: ${line.title}`}>
                <button type="button" onClick={() => stepQty(-1)} disabled={qty <= 1 || leaving} aria-label="One fewer" className="sx-ct-qty-btn">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <span className="sx-ct-qty-n sx-stadium-num" aria-live="polite">
                  <span key={qty} className="sx-ct-flip">
                    {qty}
                  </span>
                </span>
                <button type="button" onClick={() => stepQty(1)} disabled={qty >= max || leaving || gone} aria-label="One more" className="sx-ct-qty-btn">
                  <Glyph ui="plus" className="size-3.5" />
                </button>
              </div>
            ) : (
              <span className="sx-ct-qty-read sx-stadium-num">× {qty}</span>
            )}
          </div>

          <div className="sx-ct-cell sx-ct-cell-when">
            <span className="sx-ct-label">Dates it runs</span>
            {editable ? (
              <div className="sx-ct-dates">
                <DateRangePicker
                  from={from}
                  to={to === from ? null : to}
                  onChange={pickDates}
                  min={min}
                  max={maxDate}
                  tone="sponsor"
                  label={`Dates it runs: ${line.title}`}
                  triggerText={run.label}
                  clearable={false}
                  align="left"
                />
              </div>
            ) : (
              <span className="sx-ct-when">
                <Glyph ui="calendar" className="size-3.5" />
                {run.label}
              </span>
            )}
            <span className="sx-ct-days">{run.daysLabel}</span>
          </div>

          <div className="sx-ct-cell sx-ct-cell-total">
            <span className="sx-ct-label">Total</span>
            <Roll cents={qty * line.unitPriceCents} className="sx-ct-line-total" />
            <span className="sx-ct-state" data-state={status} aria-live="polite">
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
            </span>
          </div>

          {editable && (
            <button type="button" onClick={() => setAsking(true)} disabled={leaving} className="sx-ct-x" aria-label={`Remove ${line.title}`} title="Remove">
              <Glyph ui="close" className="size-4" />
            </button>
          )}
        </div>

        {asking && (
          <div className="sx-ct-ask" role="group" aria-label="Remove this item?">
            <span>
              Remove <b>{line.title}</b> from your cart?
            </span>
            <span className="flex gap-2">
              <button type="button" className="sx-sh-ghost" onClick={() => setAsking(false)} autoFocus>
                Keep it
              </button>
              <button type="button" className="sx-ct-remove" onClick={remove}>
                Remove
              </button>
            </span>
          </div>
        )}
        {problem && <Problem refusal={problem} />}
      </div>
    </li>
  );
}

const maxDay = (a: string, b: string) => (a > b ? a : b);

/* ---------------------------------------------------------------- the stops */

function Steps({ now }: { now: number }) {
  return (
    <ol className="sx-ct-steps" aria-label="How checking out works">
      {CART_STEPS.map((s, i) => (
        <li
          key={s.title}
          className="sx-stadium-in"
          style={at(0.3 + i * 0.08)}
          data-done={i < now ? "" : undefined}
          data-now={i === now ? "" : undefined}
          aria-current={i === now ? "step" : undefined}
        >
          <span className="sx-ct-step-n" aria-hidden="true">
            {i < now ? <Glyph ui="check" className="size-3.5" /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className="sx-ct-step-title">
              {s.title}
              {i === now && <span className="sx-ct-here">You&rsquo;re here</span>}
            </span>
            <span className="sx-ct-step-text">{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- the board */

export function CartBoard({
  lines: served,
  quote: servedQuote,
  sellers: servedSellers,
  expiresAt,
  hold,
  mode,
  serverNow,
  today,
  notice,
}: {
  lines: CartBoardLine[];
  quote: Quote;
  /** "3 items · 2 sellers" (lib/shop-live lineSummary). */
  sellers: string;
  expiresAt: string;
  hold: { id: string; expiresAt: string } | null;
  mode: CartMode;
  serverNow: number;
  today: string;
  notice?: ReactNode;
}) {
  /* The sample cart's own changes: a line's quantity, or null once removed. */
  const [over, setOver] = useState<Record<string, number | null>>({});
  const sampleSet = useCallback((id: string, qty: number | null) => setOver((o) => ({ ...o, [id]: qty })), []);
  const board = useBoardState(sampleSet);
  const sample = mode === "sample";
  const lines = sample ? sampleLines(served, over) : served;
  const quote = sample ? sampleQuote(servedQuote, lines) : servedQuote;
  const sellers = sample ? lineSummary(lines) : servedSellers;

  const kept = keptFor(expiresAt, serverNow);
  const gone = goneLines(lines);
  const blocked = gone.length ? `Remove ${gone.length === 1 ? "the item that's" : "the items that are"} no longer in the shop first.` : null;
  const holdId = hold?.id ?? null;

  /* The phone bar rises once the board's own Check out has scrolled away,
     and steps aside again when the summary's Check out comes into view. */
  const [barUp, setBarUp] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("sx-ct-hero-go");
    const sum = document.getElementById("sx-ct-sum");
    if (!hero || !sum || typeof IntersectionObserver === "undefined") return;
    const seen = { heroAbove: false, sumIn: false };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) seen.heroAbove = !e.isIntersecting && e.boundingClientRect.top < 0;
        else seen.sumIn = e.isIntersecting;
      }
      setBarUp(seen.heroAbove && !seen.sumIn);
    });
    io.observe(hero);
    io.observe(sum);
    return () => io.disconnect();
  }, []);

  if (lines.length === 0) return <CartEmpty />;

  return (
    <BoardCtx.Provider value={board}>
      <div className="sx-ct" data-busy={board.busy ? "" : undefined}>
        {/* 1 · the board */}
        <section className="sx-ct-hero sx-stadium-in" style={at(0.06)} aria-label="Cart total">
          <span className="sx-ct-hero-sweep" aria-hidden="true" />
          <div className="sx-ct-hero-top">
            <div className="min-w-0">
              <p className="sx-ct-kicker">
                <CartIcon className="size-3.5" />
                Your cart total
              </p>
              <p className="sx-ct-hero-total">
                <Roll cents={quote.totalCents} delay={0.35} />
              </p>
              <p className="sx-ct-hero-sub">
                {sellers}
                <span aria-hidden="true"> · </span>
                {quote.quoted ? (quote.feesCents ? "BTG's fee included" : "No fees") : "Fee shown at checkout"}
              </p>
            </div>
            <div className="sx-ct-hero-act">
              <CheckoutButton mode={mode} holdId={holdId} blocked={blocked} id="sx-ct-hero-go" />
              <p className="sx-ct-safe">
                <Glyph ui="shield" className="size-3.5" />
                Nothing is charged until you place the order.
              </p>
            </div>
          </div>
          <Steps now={cartStep(hold !== null)} />
        </section>

        {hold && <HoldBanner hold={hold} serverNow={serverNow} />}
        {notice}

        <div className="sx-ct-body">
          {/* 2 · the items */}
          <section className="sx-ct-items sx-stadium-panel sx-stadium-in" style={at(0.16)} aria-label="Items in your cart">
            <header className="sx-ct-items-head">
              <h2 className="sx-section-title">
                In your cart <span className="sx-ct-count">{itemCount(lines)}</span>
              </h2>
              {mode === "edit" && <p className="sx-ct-tip">Changes save by themselves.</p>}
              {mode === "held" && (
                <p className="sx-ct-tip">
                  <Glyph ui="lock" className="size-3.5" />
                  Locked while held
                </p>
              )}
            </header>
            <div className="sx-ct-cols" aria-hidden="true">
              <span>Item</span>
              <span>How many</span>
              <span>Total</span>
            </div>
            <ul className="sx-ct-list">
              {lines.map((l, i) => (
                <CartLineRow key={l.id} line={l} mode={mode} i={i} today={today} />
              ))}
            </ul>
            <footer className="sx-ct-items-foot">
              <Link href="/sponsor/shop" className="sx-ct-back">
                <Glyph ui="back" className="size-4" />
                Keep shopping
              </Link>
              <div className="sx-ct-kept">
                <span>
                  {kept.expired ? "This cart has expired" : <>Cart saved for <b>{kept.label}</b> more · each change resets it to 24 hours</>}
                </span>
                <span className="sx-stadium-bar" aria-hidden="true">
                  <span className="sx-stadium-grow" style={at(0.6, { width: `${Math.round(kept.share * 100)}%` })} />
                </span>
              </div>
            </footer>
          </section>

          {/* 3 · the order summary */}
          <aside id="sx-ct-sum" className="sx-ct-sum sx-stadium-panel sx-stadium-in" style={at(0.24)} aria-label="Order summary">
            <h2 className="sx-section-title">Order summary</h2>
            <dl className="sx-ct-sum-rows">
              <div>
                <dt>Subtotal · {itemCount(lines)}</dt>
                <dd>
                  <Roll cents={quote.subtotalCents} delay={0.45} />
                </dd>
              </div>
              <div>
                <dt>BTG fee</dt>
                <dd className={quote.feesCents === null ? "sx-ct-faint" : ""}>{quote.feesCents ? <Roll cents={quote.feesCents} delay={0.5} /> : feeText(quote)}</dd>
              </div>
              <div className="sx-ct-sum-total">
                <dt>Total</dt>
                <dd>
                  <Roll cents={quote.totalCents} delay={0.55} />
                </dd>
              </div>
            </dl>
            <p className="sx-ct-sum-note">
              {quote.quoted ? "This is what you pay when you place the order." : "The fee couldn't be worked out right now; checkout shows the full total before you place the order."}
            </p>
            <CheckoutButton mode={mode} holdId={holdId} blocked={blocked} />
            {blocked && mode === "edit" && <p className="sx-ct-blocked">{blocked}</p>}
            <ul className="sx-ct-promise">
              <li>
                <Glyph ui="lock" className="size-4" />
                <span>
                  <b>Held for 15 minutes.</b> Checking out keeps these items yours while you finish.
                </span>
              </li>
              <li>
                <Glyph ui="shield" className="size-4" />
                <span>
                  <b>Nothing is charged yet.</b> You pay only after the order is placed.
                </span>
              </li>
              {mode === "edit" && (
                <li>
                  <Glyph ui="edit" className="size-4" />
                  <span>
                    <b>Change anything here</b> until you check out.
                  </span>
                </li>
              )}
            </ul>
          </aside>
        </div>
      </div>

      {/* 4 · the phone bar — outside .sx-ct, whose container query would trap a fixed bar */}
      {mode !== "view" && (
        <div className="sx-ct-bar" data-up={barUp ? "" : undefined} aria-hidden={!barUp} inert={!barUp}>
          <span className="sx-ct-bar-sum">
            <span className="sx-ct-bar-label">Total</span>
            <span className="sx-stadium-num">{usd(quote.totalCents)}</span>
          </span>
          <CheckoutButton mode={mode} holdId={holdId} blocked={blocked} size="bar" />
        </div>
      )}
    </BoardCtx.Provider>
  );
}

function sampleLines(lines: CartBoardLine[], over: Record<string, number | null>): CartBoardLine[] {
  return lines.flatMap((l) => {
    const q = over[l.id];
    if (q === null) return [];
    return typeof q === "number" ? [{ ...l, quantity: q, lineTotalCents: q * l.unitPriceCents }] : [l];
  });
}

/** The sample's figures after its own changes: the fee kept at the sample's own rate. */
function sampleQuote(q: Quote, lines: CartBoardLine[]): Quote {
  const sub = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const fee = q.feesCents !== null && q.subtotalCents > 0 ? Math.round((sub * q.feesCents) / q.subtotalCents) : null;
  return { ...q, subtotalCents: sub, feesCents: fee, totalCents: sub + (fee ?? 0) };
}

/** The empty cart: a dark LED board with the cart lit, and the way back to the shop. */
export function CartEmpty() {
  return (
    <section className="sx-ct-empty sx-stadium-in" style={at(0.08)} aria-label="Your cart is empty">
      <span className="sx-ct-empty-mark" aria-hidden="true">
        <CartIcon className="size-12" />
      </span>
      <h2 className="sx-ct-empty-title">Your cart is empty</h2>
      <p className="sx-ct-empty-text">Find something an athlete or team will do for your brand, pick how many and which dates, and it lands here.</p>
      <Link href="/sponsor/shop" className="sx-ct-go" data-size="big">
        <span>Browse the shop</span>
        <Glyph ui="arrow" className="size-4 sx-ct-go-arrow" />
      </Link>
      <ol className="sx-ct-empty-steps">
        {CART_STEPS.map((s, i) => (
          <li key={s.title} className="sx-stadium-in" style={at(0.3 + i * 0.08)}>
            <span className="sx-ct-step-n">{i + 1}</span>
            <span>
              <b>{s.title}</b> {s.text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { reserveAction } from "@/app/(app)/sponsor/cart/actions";
import { placeOrderAction, releaseHoldAction } from "@/app/(app)/sponsor/checkout/actions";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { runOf } from "@/lib/cart-board";
import {
  acceptLabel,
  billingDraftFrom,
  billingIssues,
  billingPrefillNote,
  billingPrefillSource,
  gateStatus,
  termsLabel,
  totalChanged,
  type ApiCheckout,
  type BillingDraft,
  type BillingViewer,
  type Quote,
} from "@/lib/checkout-gate";
import { afterPlacing, reachable, stepIndex, stepProblem, WIZARD_STEPS, type WizardStep } from "@/lib/checkout-wizard";
import { countdown, feeText, fmtStamp, lineSeller, usd, type ApiCartLine } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   POL-FE-93 — checkout as a step-by-step wizard, on the Stadium Board
   (../../app/(app)/sponsor/checkout/checkout.css). The owner found the old
   page, with every section open at once, confusing, so it now asks one
   thing at a time:

     the board    the total, the hold's clock (a ring that drains, red in
                  the last two minutes) and the four stops, which can be
                  clicked back to and forward to once the steps before
                  are done;
     the stage    one step, sliding in from the side it came from:
                  1 Items · 2 Invoice · 3 Terms · 4 Place order. Continue
                  is always pressable: pressed too early, it says what's
                  missing and points at it (the field, or a shake of the
                  box to tick) instead of sitting there greyed out;
     the summary  the lines, subtotal, BTG's fee, the total, the spending
                  limit, and Release hold (asks first).

   The contract gate is unchanged (2S4-FE-02, POL-FE-05): Place order sends
   the terms' body exactly as rendered on step 3, the billing contact, the
   acceptance and the total shown, and stays disabled until gateStatus is
   ready; a 409 total_changed re-reads the quote. While it's placed, a
   curtain says so; success is the order page (actions.ts redirects).
   Accessible names e2e relies on are kept: the sections labelled
   checkout-billing / checkout-terms, "Name", "Email", "PO number or your
   reference", the terms checkbox and "Place order".
   -------------------------------------------------------------------------- */

export type CheckoutLine = ApiCartLine & { kind: string | null; kindLabel: string | null };
type Refusal = { message: string; reasons: string[] };
type Limit = { text: string; over: boolean } | null;

const at = (s: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${s}s`, ...extra }) as CSSProperties;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------- the clock */

function subscribe(tick: () => void) {
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
const clientSecond = () => Math.floor(Date.now() / 1000);
const HOLD_SECONDS = 15 * 60;

/** The hold's time left, ticking each second; at zero the server's own read (the hold ended) takes over. */
function useHoldClock(expiresAt: string, serverNow: number, live: boolean) {
  const router = useRouter();
  const second = useSyncExternalStore(subscribe, clientSecond, () => Math.floor(serverNow / 1000));
  const left = countdown(expiresAt, second * 1000);
  useEffect(() => {
    if (left.expired && live) router.refresh();
  }, [left.expired, live, router]);
  return left;
}

function HoldClock({ left, expiresAt }: { left: ReturnType<typeof countdown>; expiresAt: string }) {
  const share = Math.min(1, left.seconds / HOLD_SECONDS);
  const low = !left.expired && left.seconds < 120;
  return (
    <div className="sx-co-clock" data-low={low ? "" : undefined}>
      <span className="sx-co-ring" style={{ "--p": share } as CSSProperties} aria-hidden="true">
        <span className="sx-co-ring-time sx-stadium-num">{left.label}</span>
      </span>
      <p className="sx-co-clock-text">
        <b role="timer" aria-live="off">
          {left.expired ? "Your hold has ended" : `Held for you · ${left.label} left`}
        </b>
        <span>{left.expired ? "Checking your hold…" : `Nobody else can buy these until ${fmtStamp(expiresAt)}.`}</span>
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- a lit, rolling figure */

/** Money in cents that counts up on arrival and rolls to each new value (also the order page's, POL-FE-94). */
export function Roll({ cents, delay = 0 }: { cents: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    const node = el?.firstChild;
    if (!el || !node) return;
    const from = shown.current ?? 0;
    shown.current = cents;
    if (from === cents || reduced()) {
      node.nodeValue = usd(cents);
      return;
    }
    let raf = 0;
    node.nodeValue = usd(from);
    const timer = window.setTimeout(() => {
      const t0 = performance.now();
      const span = from === 0 ? 1100 : 650;
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / span);
        node.nodeValue = usd(Math.round(from + (cents - from) * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, from === 0 ? delay * 1000 : 0);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      node.nodeValue = usd(cents);
    };
  }, [cents, delay]);
  return (
    <span ref={ref} className="sx-stadium-num">
      {usd(cents)}
    </span>
  );
}

/* ---------------------------------------------------------------- small pieces */

function Problem({ refusal }: { refusal: Refusal }) {
  return (
    <div role="alert" className="sx-sh-problem">
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

const Icon = ({ d, className = "size-4" }: { d: string; className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);
const PERSON = "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0";
const MAIL = "M3 6h18v12H3V6Zm0 0 9 7 9-7";
const HASH = "M5 9h14M5 15h14M10 3 8 21M16 3l-2 18";
const DOC = "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6";
const CLOCK = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2";
const INFO = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5m0-8h.01";

/** Release the hold: asks first, then gives the stock back and opens the cart again. */
function ReleaseHold({ reservationId, sample, label = "Release hold" }: { reservationId: string; sample: boolean; label?: string }) {
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, start] = useTransition();
  /* memory: double-submit-needs-a-ref */
  const lock = useRef(false);
  const release = () => {
    if (lock.current || sample) return;
    lock.current = true;
    setRefusal(null);
    start(async () => {
      try {
        /* Success redirects to the cart; only a refusal comes back. */
        const r = await releaseHoldAction(reservationId);
        if (r && !r.ok) setRefusal({ message: r.message, reasons: r.reasons });
      } finally {
        lock.current = false;
      }
    });
  };
  return (
    <div className="sx-co-release">
      {asking ? (
        <div className="sx-co-ask" role="group" aria-label="Release the hold?">
          <span>Release your hold? The items go back on sale for anyone to buy, and your cart opens again so you can change it.</span>
          <span className="sx-co-ask-acts">
            <button type="button" className="sx-sh-ghost" data-small="" onClick={() => setAsking(false)} disabled={pending} autoFocus>
              Keep my hold
            </button>
            <button type="button" className="sx-co-remove" onClick={release} disabled={pending || sample} title={sample ? "Sample checkout — nothing is held" : undefined}>
              {pending ? "Releasing…" : "Yes, release it"}
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className="sx-co-release-btn" onClick={() => setAsking(true)}>
          {label}
        </button>
      )}
      {refusal && <Problem refusal={refusal} />}
    </div>
  );
}

/* ---------------------------------------------------------------- shared with the read-only views */

/** The held lines: a lit tile for the item's kind, who sells it, how many, the dates, the line's total. */
export function CheckoutItems({ lines }: { lines: CheckoutLine[] }) {
  return (
    <ul className="sx-co-items" aria-label="Items in this order">
      {lines.map((l, i) => {
        const run = runOf(l.startsOn, l.endsOn);
        return (
          <li key={l.id} className="sx-co-item" style={at(0.12 + i * 0.06)}>
            <span className="sx-co-thumb" aria-hidden="true">
              <span>
                <Glyph kind={l.kind ?? "OTHER"} className="size-6" />
              </span>
            </span>
            <span className="sx-co-item-main">
              {l.kindLabel && <span className="sx-sh-kind">{l.kindLabel}</span>}
              <span className="sx-co-item-title">{l.title}</span>
              <span className="sx-co-item-sub">
                {lineSeller(l)} · {l.quantity} × {usd(l.unitPriceCents)}
              </span>
              <span className="sx-co-item-when">
                <Glyph ui="calendar" className="size-3.5" />
                {run.label} · {run.daysLabel}
              </span>
            </span>
            <span className="sx-co-item-total sx-stadium-num">{usd(l.lineTotalCents)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The order summary: the lines, subtotal, BTG's fee, the total, the spending limit. */
export function CheckoutSummary({ lines, quote, limit, delay = 0.24, children }: { lines: CheckoutLine[]; quote: Quote; limit: Limit; delay?: number; children?: ReactNode }) {
  return (
    <aside className="sx-co-sum sx-stadium-panel sx-stadium-in" style={at(delay)} aria-label="Order summary">
      <h2 className="sx-section-title">Order summary</h2>
      <ul className="sx-co-sum-lines">
        {lines.map((l) => (
          <li key={l.id}>
            <span>
              <b>{l.title}</b> × {l.quantity}
            </span>
            <span>{usd(l.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="sx-co-sum-rows">
        <div>
          <dt>Subtotal</dt>
          <dd>
            <Roll cents={quote.subtotalCents} delay={delay + 0.2} />
          </dd>
        </div>
        <div>
          <dt>BTG fee</dt>
          <dd className={quote.feesCents === null ? "sx-co-faint" : ""}>{quote.feesCents ? <Roll cents={quote.feesCents} delay={delay + 0.25} /> : feeText(quote)}</dd>
        </div>
        <div className="sx-co-sum-total">
          <dt>Total</dt>
          <dd>
            <Roll cents={quote.totalCents} delay={delay + 0.3} />
          </dd>
        </div>
      </dl>
      <p className="sx-co-sum-note">
        {quote.quoted
          ? "This is what you pay. Nothing more is added when the order is placed."
          : "The fee couldn't be worked out right now; the order page shows the exact total once it's placed."}
      </p>
      {limit && (
        <p className="sx-co-limit" data-over={limit.over ? "" : undefined}>
          <Icon d={INFO} className="size-4" />
          {limit.text}
        </p>
      )}
      <ul className="sx-co-promise">
        <li>
          <Glyph ui="shield" className="size-4" />
          <span>
            <b>Nothing is charged at checkout.</b> You pay by card from the order page, after it&rsquo;s approved.
          </span>
        </li>
        <li>
          <Glyph ui="lock" className="size-4" />
          <span>
            <b>No card or bank details here.</b> Card payment happens on the payment provider&rsquo;s own page.
          </span>
        </li>
      </ul>
      {children}
    </aside>
  );
}

/* ---------------------------------------------------------------- the wizard */

export function CheckoutWizard({
  reservationId,
  expiresAt,
  serverNow,
  lines,
  sellers,
  quote,
  limit,
  checkout,
  viewer,
  sample = false,
}: {
  reservationId: string;
  expiresAt: string;
  serverNow: number;
  lines: CheckoutLine[];
  /** "3 items · 2 sellers" (lib/shop-live lineSummary). */
  sellers: string;
  quote: Quote;
  /** POL-FE-72 — the spending limit beside the total (lib/checkout-gate limitLine). */
  limit: Limit;
  checkout: ApiCheckout;
  /** POL-FE-47 — the signed-in person, to fill billing from when the sponsor has no contact. */
  viewer?: BillingViewer | null;
  /** The sample checkout: clicks through, never holds, releases or places anything. */
  sample?: boolean;
}) {
  const router = useRouter();
  const left = useHoldClock(expiresAt, serverNow, !sample);
  const { terms } = checkout;

  const [step, setStep] = useState<WizardStep>("review");
  const [dir, setDir] = useState<"fwd" | "back" | "none">("none");
  const [billing, setBilling] = useState<BillingDraft>(() => billingDraftFrom(checkout.billingContact, viewer));
  const [touched, setTouched] = useState<Partial<Record<keyof BillingDraft, boolean>>>({});
  const [accepted, setAccepted] = useState(false);
  /** Continue was pressed while the step still needs something: say what. */
  const [pressed, setPressed] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [read, setRead] = useState(0);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [placing, startPlacing] = useTransition();
  const lock = useRef(false);
  const moved = useRef(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const state = { terms, billing, accepted };
  const now = stepIndex(step);
  const reach = reachable(state);
  const problem = stepProblem(step, state);
  const gate = gateStatus(state);
  const meta = WIZARD_STEPS[now];
  const issues = billingIssues(billing);
  const shown = (k: keyof BillingDraft) => (touched[k] ? issues[k] : undefined);
  const prefill = billingPrefillSource(checkout.billingContact, viewer);

  /* A new step: its heading takes focus (screen readers hear where they are), and the stage scrolls into view if it's off screen. */
  useEffect(() => {
    if (!moved.current) return;
    headRef.current?.focus({ preventScroll: true });
    const top = stageRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 64 || top > window.innerHeight * 0.55) stageRef.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  }, [step]);

  /* Step 3: how far through the terms the sponsor has scrolled. */
  useEffect(() => {
    if (step !== "terms") return;
    const el = docRef.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollHeight - el.clientHeight;
      setRead(max <= 4 ? 1 : Math.min(1, el.scrollTop / max));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    return () => el.removeEventListener("scroll", measure);
  }, [step]);

  const go = (i: number) => {
    if (i < 0 || i >= WIZARD_STEPS.length || i === now) return;
    if (i > now && i > reach) return;
    moved.current = true;
    setDir(i > now ? "fwd" : "back");
    setPressed(false);
    setRefusal(null);
    setStep(WIZARD_STEPS[i].key);
  };

  const next = () => {
    if (!problem) return go(now + 1);
    setPressed(true);
    if (step === "billing") {
      setTouched({ name: true, email: true, reference: true });
      const first = (["name", "email", "reference"] as const).find((k) => issues[k]);
      if (first) document.getElementById(`co-billing-${first}`)?.focus();
    }
    if (step === "terms" && terms) setNudge((n) => n + 1);
  };

  const place = () => {
    if (lock.current || !gate.ready || !terms || sample) return;
    lock.current = true;
    setRefusal(null);
    startPlacing(async () => {
      try {
        /* Success redirects to the order page; only a refusal comes back. */
        const r = await placeOrderAction(reservationId, { id: terms.id, body: terms.body }, billing, accepted, quote.quoted ? quote.totalCents : undefined);
        if (r && !r.ok) {
          setRefusal({ message: r.message, reasons: r.reasons });
          /* The total moved: re-read the quote so the figures, and the next try's totalCentsShown, are the new ones. */
          if (totalChanged(r)) router.refresh();
        }
      } finally {
        lock.current = false;
      }
    });
  };

  const set = (k: keyof BillingDraft) => (e: ChangeEvent<HTMLInputElement>) => setBilling((b) => ({ ...b, [k]: e.target.value }));
  const blur = (k: keyof BillingDraft) => () => setTouched((t) => ({ ...t, [k]: true }));

  const field = (k: keyof BillingDraft, label: ReactNode, icon: string, input: { type?: string; autoComplete: string; maxLength: number; required?: boolean; placeholder?: string }, wide = false) => {
    const err = k === "reference" ? issues.reference : shown(k);
    const ok = !issues[k] && billing[k].trim() !== "";
    return (
      <label className="sx-co-field" data-wide={wide ? "" : undefined}>
        <span className="sx-co-field-label">{label}</span>
        <span className="sx-co-input">
          <Icon d={icon} className="size-4" />
          <input
            id={`co-billing-${k}`}
            type={input.type ?? "text"}
            value={billing[k]}
            onChange={set(k)}
            onBlur={blur(k)}
            required={input.required}
            maxLength={input.maxLength}
            autoComplete={input.autoComplete}
            placeholder={input.placeholder}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? `co-billing-${k}-err` : undefined}
          />
          {ok && (
            <span className="sx-co-ok" aria-hidden="true">
              <Glyph ui="check" className="size-3" />
            </span>
          )}
        </span>
        {err && (
          <span id={`co-billing-${k}-err`} className="sx-co-err">
            {err}
          </span>
        )}
      </label>
    );
  };

  /* ------------------------------------------------ each step's body */

  let body: ReactNode;
  if (step === "review") {
    body = (
      <>
        <div className="sx-co-block">
          <CheckoutItems lines={lines} />
          <p className="sx-co-items-foot">
            <span>{sellers}</span>
            <span>
              Total <Roll cents={quote.totalCents} delay={0.3} />
            </span>
          </p>
        </div>
        <div className="sx-co-block sx-co-locked">
          <span>
            <Glyph ui="lock" className="size-4" />
            Your cart is locked while these are held. To change an item, release the hold and edit the cart.
          </span>
          <ReleaseHold reservationId={reservationId} sample={sample} label="Release hold to change items" />
        </div>
      </>
    );
  } else if (step === "billing") {
    body = (
      <form
        id="co-billing-form"
        className="sx-co-block space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <p className="sx-co-prefill" data-none={prefill === "none" ? "" : undefined}>
          {prefill === "none" ? <Icon d={INFO} className="size-3.5" /> : <Glyph ui="check" className="size-3.5" />}
          {billingPrefillNote(prefill)}
        </p>
        <div className="sx-co-fields">
          {field("name", "Name", PERSON, { autoComplete: "name", maxLength: 200, required: true, placeholder: "Who the invoice is addressed to" })}
          {field("email", "Email", MAIL, { type: "email", autoComplete: "email", maxLength: 320, required: true, placeholder: "name@company.com" })}
          {field(
            "reference",
            <>
              PO number or your reference <small>(optional)</small>
            </>,
            HASH,
            { autoComplete: "off", maxLength: 100, placeholder: "e.g. PO-2026-114" },
            true,
          )}
        </div>
        <p className="sx-co-safe">
          <Glyph ui="shield" className="size-4" />
          No card or bank details are asked for here. You pay by card later, on the payment provider&rsquo;s own page.
        </p>
        {/* Enter in a field continues */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    );
  } else if (step === "terms") {
    body = terms ? (
      <>
        <div className="sx-co-block">
          <div className="sx-co-doc-wrap" data-read={read >= 0.98 ? "" : undefined}>
            <div ref={docRef} role="document" tabIndex={0} aria-label={termsLabel(terms)} className="sx-co-doc">
              {terms.body}
            </div>
            <span className="sx-stadium-bar sx-co-doc-bar" aria-hidden="true">
              <span style={{ "--read": read } as CSSProperties} />
            </span>
          </div>
          <p className="sx-co-doc-meta">
            <span>{termsLabel(terms)}</span>
            <span>{read >= 0.98 ? "Read to the end ✓" : "Scroll to read it all"}</span>
          </p>
        </div>
        <label className="sx-co-block sx-co-accept" data-nudge={nudge ? (nudge % 2 ? "a" : "b") : undefined}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span className="sx-co-box" aria-hidden="true">
            <Glyph ui="check" className="size-4" />
          </span>
          <span className="sx-co-accept-text">
            {acceptLabel(checkout.sponsorName)}
            <small>Accepting records this version, the time and a fingerprint of exactly this text, so what you agreed to can always be shown.</small>
          </span>
        </label>
      </>
    ) : (
      <p role="status" className="sx-co-block sx-co-warn">
        The order terms aren&rsquo;t available right now, so this order can&rsquo;t be placed yet. Your hold still stands until it runs out. Try
        again shortly, or ask BTG.
      </p>
    );
  } else {
    const next3 = afterPlacing({ paymentsOpen: checkout.paymentsOpen, overLimit: limit ? limit.over : null });
    body = (
      <>
        <ul className="sx-co-block sx-co-recap" aria-label="Your order">
          <li style={at(0.1)}>
            <span className="sx-co-recap-head">
              <span className="sx-co-recap-label">
                <Glyph ui="check" className="size-3.5" />
                Items
              </span>
              <button type="button" className="sx-co-change" onClick={() => go(0)}>
                See items
              </button>
            </span>
            <span className="sx-co-recap-value">{sellers}</span>
            <span className="sx-co-recap-more">{lines.map((l) => l.title).join(", ")}</span>
          </li>
          <li style={at(0.16)}>
            <span className="sx-co-recap-head">
              <span className="sx-co-recap-label">
                <Glyph ui="check" className="size-3.5" />
                Invoice to
              </span>
              <button type="button" className="sx-co-change" onClick={() => go(1)}>
                Change
              </button>
            </span>
            <span className="sx-co-recap-value">{billing.name.trim()}</span>
            <span className="sx-co-recap-more">
              {billing.email.trim()}
              {billing.reference.trim() && ` · Ref ${billing.reference.trim()}`}
            </span>
          </li>
          <li style={at(0.22)}>
            <span className="sx-co-recap-head">
              <span className="sx-co-recap-label">
                <Glyph ui="check" className="size-3.5" />
                Terms
              </span>
              <button type="button" className="sx-co-change" onClick={() => go(2)}>
                Read again
              </button>
            </span>
            <span className="sx-co-recap-value">Accepted</span>
            <span className="sx-co-recap-more">{terms ? termsLabel(terms) : ""}</span>
          </li>
        </ul>
        <div className="sx-co-block sx-co-pay">
          <p className="sx-co-pay-label">
            Total you&rsquo;ll pay
            <small>{quote.quoted ? "Nothing more is added. Nothing is charged today." : "The order page shows the exact total once it's placed."}</small>
          </p>
          <Roll cents={quote.totalCents} delay={0.25} />
        </div>
        <div className="sx-co-block">
          <h3 className="sx-section-title">What happens next</h3>
          <ol className="sx-co-next mt-3" role={checkout.paymentsOpen === false ? "status" : undefined}>
            {next3.map((s, i) => (
              <li key={s.title} style={at(0.3 + i * 0.12)}>
                <span className="sx-co-next-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <b>{s.title}</b>
                  <span>{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </>
    );
  }

  const hint = pressed && problem ? problem : step === "place" && !gate.ready ? problem : null;

  return (
    <div className="sx-co">
      {/* the board */}
      <section className="sx-co-board sx-stadium-in" style={at(0.06)} aria-label="Checkout">
        <span className="sx-co-sweep" aria-hidden="true" />
        <div className="sx-co-board-top">
          <div className="min-w-0">
            <p className="sx-co-kicker">
              <Glyph ui="lock" className="size-3.5" />
              Secure checkout
            </p>
            <p className="sx-co-total">
              <Roll cents={quote.totalCents} delay={0.35} />
            </p>
            <p className="sx-co-sub">
              {sellers}
              <span aria-hidden="true"> · </span>
              {quote.quoted ? (quote.feesCents ? "BTG's fee included" : "No fees") : "Fee shown on the order"}
            </p>
          </div>
          <HoldClock left={left} expiresAt={expiresAt} />
        </div>
        <nav aria-label="Checkout steps">
          <ol className="sx-co-rail">
            <li className="sx-co-track" aria-hidden="true">
              <span style={{ "--fill": now / (WIZARD_STEPS.length - 1) } as CSSProperties} />
            </li>
            {WIZARD_STEPS.map((s, i) => (
              <li key={s.key} data-done={i < now ? "" : undefined} data-now={i === now ? "" : undefined}>
                <button
                  type="button"
                  className="sx-co-rail-btn"
                  onClick={() => go(i)}
                  disabled={i === now || (i > now && i > reach)}
                  aria-current={i === now ? "step" : undefined}
                  aria-label={`Step ${i + 1}: ${s.short}${i < now ? " (done)" : ""}`}
                >
                  <span className="sx-co-rail-n">{i < now ? <Glyph ui="check" className="size-4 sx-co-rail-check" /> : i + 1}</span>
                  <span className="sx-co-rail-label">{s.short}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </section>

      {sample && (
        <p className="sx-sh-viewer">
          <Glyph ui="eye" className="size-4" />
          Sample checkout. This is how checkout looks. Nothing here is held, saved or placed.
        </p>
      )}

      <div className="sx-co-body">
        {/* the stage: one step at a time */}
        <section ref={stageRef} className="sx-co-stage sx-stadium-panel sx-stadium-in" style={at(0.14)} aria-label={`Step ${now + 1} of ${WIZARD_STEPS.length}`}>
          <section key={step} className="sx-co-pane" data-dir={dir} aria-labelledby={`checkout-${step}`}>
            <p className="sx-co-step-kicker">
              Step {now + 1} of {WIZARD_STEPS.length}
              <span className="sx-stadium-bar" aria-hidden="true">
                <span style={{ width: `${((now + 1) / WIZARD_STEPS.length) * 100}%` }} />
              </span>
            </p>
            <h2 id={`checkout-${step}`} ref={headRef} tabIndex={-1} className="sx-co-title">
              {meta.title}
            </h2>
            <p className="sx-co-lead">{meta.lead}</p>
            {body}
          </section>

          <footer className="sx-co-nav">
            {now > 0 ? (
              <button type="button" className="sx-co-back" onClick={() => go(now - 1)} disabled={placing}>
                <Glyph ui="back" className="size-4" />
                Back
              </button>
            ) : (
              <Link href="/sponsor/cart" className="sx-co-back" aria-label="Back to cart">
                <Glyph ui="back" className="size-4" />
                <span>
                  Back<span className="sx-co-wide"> to cart</span>
                </span>
              </Link>
            )}
            {step === "place" ? (
                <button
                  type="button"
                  className="sx-co-go"
                  data-size="big"
                  onClick={place}
                  disabled={!gate.ready || placing || sample}
                  aria-describedby={hint ? "checkout-gate-hint" : undefined}
                  title={sample ? "Sample checkout — nothing is placed" : undefined}
                >
                  {placing ? <span className="sx-co-spin" aria-hidden="true" /> : <Glyph ui="lock" className="size-4" />}
                  <span>{placing ? "Placing your order…" : "Place order"}</span>
                  {!placing && <Glyph ui="arrow" className="size-4" />}
                </button>
              ) : (
                <button type="button" className="sx-co-go" onClick={next} data-wait={problem ? "" : undefined} aria-describedby={hint ? "checkout-gate-hint" : undefined}>
                  <span>{meta.next}</span>
                  <Glyph ui="arrow" className="size-4" />
                </button>
              )}
            {(hint || refusal || step === "place") && (
              <div className="sx-co-nav-msg">
                {hint && (
                  <p id="checkout-gate-hint" role="alert" className="sx-co-hint">
                    <Icon d={INFO} className="size-4" />
                    {hint}
                  </p>
                )}
                {step === "place" && !hint && <p className="sx-co-safe">Nothing is charged when you place it.</p>}
                {refusal && <Problem refusal={refusal} />}
              </div>
            )}
          </footer>
        </section>

        <CheckoutSummary lines={lines} quote={quote} limit={limit}>
          <ReleaseHold reservationId={reservationId} sample={sample} />
        </CheckoutSummary>
      </div>

      {/* the curtain while the order is placed — on <body>, clear of any transformed ancestor */}
      {placing &&
        createPortal(
          <div className="sx-co-curtain" role="status" aria-live="polite">
            <div className="sx-co-curtain-card">
              <span className="sx-co-curtain-ring" aria-hidden="true">
                <Glyph ui="lock" className="size-7" />
              </span>
              <p className="sx-co-curtain-title">Placing your order…</p>
              <p className="sx-co-curtain-text">Checking the terms and your total with the seller&rsquo;s stock. This takes a few seconds. Please keep this page open.</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ---------------------------------------------------------------- the other states */

/** "Hold again for 15 minutes" after a hold ends: holds the cart again and opens its new checkout. */
export function HoldAgainButton() {
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, start] = useTransition();
  const lock = useRef(false);
  const go = () => {
    if (lock.current) return;
    lock.current = true;
    setRefusal(null);
    start(async () => {
      try {
        const r = await reserveAction();
        if (r && !r.ok) setRefusal({ message: r.message, reasons: r.reasons });
      } finally {
        lock.current = false;
      }
    });
  };
  return (
    <>
      <button type="button" className="sx-co-go" onClick={go} disabled={pending}>
        {pending ? <span className="sx-co-spin" aria-hidden="true" /> : <Icon d={CLOCK} className="size-4" />}
        <span>{pending ? "Holding your items…" : "Hold again for 15 minutes"}</span>
      </button>
      {refusal && <Problem refusal={refusal} />}
    </>
  );
}

const MARKS = { clock: CLOCK, lock: "M6 11h12v10H6V11Zm2.5 0V7.5a3.5 3.5 0 0 1 7 0V11", doc: DOC, eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" } as const;

/** A hold that has ended, was released, or can't be checked out here: what happened, and the way on. */
export function CheckoutState({
  mark,
  tone,
  title,
  text,
  holdAgain = false,
  links = [],
}: {
  mark: keyof typeof MARKS;
  tone?: "late";
  title: string;
  text: string;
  holdAgain?: boolean;
  links?: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <section className="sx-co-state sx-stadium-in" data-tone={tone} style={at(0.08)} aria-label={title}>
      <span className="sx-co-state-mark" aria-hidden="true">
        <Icon d={MARKS[mark]} className="size-10" />
      </span>
      <h2 className="sx-co-state-title">{title}</h2>
      <p className="sx-co-state-text">{text}</p>
      <div className="sx-co-state-acts">
        {holdAgain && <HoldAgainButton />}
        {links.map((l) => (
          <Link key={l.href + l.label} href={l.href} className={l.primary ? "sx-co-go" : "sx-sh-ghost"}>
            <span>{l.label}</span>
            {l.primary && <Glyph ui="arrow" className="size-4" />}
          </Link>
        ))}
      </div>
    </section>
  );
}

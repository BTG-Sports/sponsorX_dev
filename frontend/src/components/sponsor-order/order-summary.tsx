import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { OrderPayButton, PaymentRefresher } from "@/components/order-payment";
import { ShopCancelOrder } from "@/components/shop-checkout";
import { Roll } from "@/components/sponsor-checkout/checkout-wizard";
import { runOf } from "@/lib/cart-board";
import { billingLines, termsLabel } from "@/lib/checkout-gate";
import type { Deadline, StatusCard } from "@/lib/order-automation-live";
import { NOT_CONNECTED_NOTE, PAY_NOTE, TEST_PROVIDER_BADGE, stripeCta, type ApiOrderPayment, type PaymentView } from "@/lib/order-payment-live";
import type { JourneyStop, NextStep, OrderHero, OrderMood } from "@/lib/order-summary";
import { fmtStamp, lineSeller, orderRef, usd, type ApiOrder, type ApiOrderLine } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   POL-FE-94 — the sponsor's order page as the payment wizard's summary, on
   the Stadium Board (../../app/(app)/sponsor/orders/[id]/order.css). The
   checkout wizard (POL-FE-93) ends here, so it reads the same way: one lit
   board saying what is happening, one card saying what to do, and the
   order's facts and summary underneath — never a wall of boxes.

     OrderBoard     the mark (a tick that draws itself and throws sparks once
                    placed or paid), the headline, the total counting up, and
                    the four stops with their dates;
     OrderNextCard  the order's status in words (order-automation-live's
                    sponsorStatus, or the payment's own banner), the ONE pay
                    button on the page, and "What happens next";
     OrderItems     what was bought, as lit tiles;
     OrderFacts     Invoice to · Payment · Order terms (the contract gate's
                    record, 2S4-FE-02);
     OrderSummary   lines, subtotal, BTG fee, total, refunds, Cancel order.

   No hooks here — a server-page piece; the client islands it uses (the
   rolling figure, the pay button, the refresher, Cancel) take plain props.
   e2e relies on: the one "Pay $X by card" button, and the banner titles
   "Payment received — confirming…" / "Paid ✓ · confirmed by …".
   -------------------------------------------------------------------------- */

export type OrderLineKind = { kind: string | null; kindLabel: string | null };
type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

const at = (s: number, extra?: Record<string, string | number>) => ({ "--sx-reveal-delay": `${s}s`, ...extra }) as CSSProperties;

/* ---------------------------------------------------------------- the mark */

const MARK: Record<OrderMood, string> = {
  placed: "m5 12.5 4.5 4.5L19 7",
  paid: "m5 12.5 4.5 4.5L19 7",
  done: "M8 21h8m-4-4v4M6 4h12v5a6 6 0 0 1-12 0V4Zm0 2H3v1a4 4 0 0 0 4 4M18 6h3v1a4 4 0 0 1-4 4",
  wait: "M7 3h10M7 21h10M8 3c0 4.5 8 5 8 9s-8 4.5-8 9M16 3c0 4.5-8 5-8 9s8 4.5 8 9",
  pay: "M3 6h18v12H3V6Zm0 4h18M7 15h3",
  confirming: "M3 6h18v12H3V6Zm0 4h18M7 15h3",
  failed: "M12 6.5v7m0 4h.01",
  ended: "M7 7l10 10M17 7 7 17",
};
const CELEBRATE = new Set<OrderMood>(["placed", "paid", "done"]);

function Mark({ mood }: { mood: OrderMood }) {
  return (
    <span className="sx-od-mark" data-mood={mood} aria-hidden="true">
      <svg viewBox="0 0 96 96" className="sx-od-mark-svg">
        <circle className="sx-od-mark-track" cx="48" cy="48" r="43" />
        <circle className="sx-od-mark-ring" cx="48" cy="48" r="43" pathLength={1} />
        <g transform="translate(24 24) scale(2)">
          <path className="sx-od-mark-icon" d={MARK[mood]} pathLength={1} />
        </g>
      </svg>
      {CELEBRATE.has(mood) && (
        <span className="sx-od-sparks">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ "--a": `${(360 / 14) * i}deg`, "--d": `${0.9 + (i % 3) * 0.12}s`, "--r": `${4.4 + (i % 2) * 1.2}rem` } as CSSProperties} />
          ))}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- the board */

export function OrderBoard({
  hero,
  order,
  stops,
  fill,
  payStatus,
  payTone,
  badge,
}: {
  hero: OrderHero;
  order: ApiOrder;
  stops: JourneyStop[];
  fill: number;
  payStatus: string | null;
  payTone: Tone;
  badge: ReactNode;
}) {
  return (
    <section className="sx-od-board sx-stadium-in" data-mood={hero.mood} style={at(0.06)} aria-labelledby="sx-od-title">
      <span className="sx-od-sweep" aria-hidden="true" />
      <div className="sx-od-board-top">
        <Mark mood={hero.mood} />
        <div className="sx-od-hero">
          <p className="sx-od-kicker">{hero.kicker}</p>
          <h2 id="sx-od-title" className="sx-od-title">
            {hero.title}
          </h2>
          <p className="sx-od-lead">{hero.text}</p>
          <p className="sx-od-meta">
            <span className="sx-od-ref">{orderRef(order.id)}</span>
            <span>Placed {fmtStamp(order.createdAt)}</span>
            {badge}
          </p>
        </div>
        <div className="sx-od-total">
          <span className="sx-od-total-label">{hero.mood === "paid" || hero.mood === "done" ? "Total paid" : "Order total"}</span>
          <span className="sx-od-total-num">
            <Roll cents={order.totalCents} delay={0.45} />
          </span>
          {payStatus && (
            <span className="sx-od-chip" data-tone={payTone}>
              {payStatus}
            </span>
          )}
        </div>
      </div>

      <ol className="sx-od-rail" aria-label="Order progress">
        <li className="sx-od-track" aria-hidden="true">
          <span style={{ "--fill": fill } as CSSProperties} />
        </li>
        {stops.map((s, i) => (
          <li key={s.label} data-state={s.state} aria-current={s.state === "now" ? "step" : undefined} style={at(0.5 + i * 0.12)}>
            <span className="sx-od-stop-n">
              {s.state === "done" ? <Glyph ui="check" className="size-4" /> : s.state === "ended" ? <Glyph ui="close" className="size-3.5" /> : i + 1}
            </span>
            <span className="sx-od-stop-label">
              {s.label}
              <span className="sr-only">{s.state === "done" ? " — done" : s.state === "now" ? " — now" : s.state === "ended" ? " — stopped here" : ""}</span>
            </span>
            {s.note && <span className="sx-od-stop-note">{s.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- the next step */

function DeadlineLine({ d }: { d: Deadline }) {
  return (
    <span role="timer" aria-live="off" className="sx-od-deadline" data-tone={d.tone}>
      <Glyph ui="calendar" className="size-4" />
      {d.label}
    </span>
  );
}

const btn = "sx-od-go";

/** "Pay by Nov 19, 11:41 am UTC · in 3 days" → { key: "Pay by", when: "Nov 19, 11:41 am UTC", left: "in 3 days" }. */
export function splitDeadline(label: string): { key: string; when: string; left: string | null } {
  const m = /^(Pay by|Cancelled at|Seller answers by)\s+(.+?)(?:\s+·\s+(.+))?$/.exec(label);
  if (!m) return { key: "Deadline", when: label, left: null };
  return { key: m[1] === "Cancelled at" ? "Pay before" : (m[1] ?? "Deadline"), when: m[2] ?? label, left: m[3] ?? null };
}

export function OrderNextCard({
  order,
  status,
  pay,
  payment,
  steps,
  canWrite,
  sample,
}: {
  order: ApiOrder;
  status: StatusCard | null;
  pay: PaymentView;
  payment: ApiOrderPayment | null;
  steps: NextStep[];
  canWrite: boolean;
  sample: boolean;
}) {
  /* One message: the automation's status card, else the payment's own banner (paid, confirming, failed). */
  const banner = status ? null : pay.banner;
  const amount = usd(payment?.amountCents ?? order.totalCents);
  const cta = status?.pay ? stripeCta(`Pay ${amount} by card`) : !status && pay.cta ? pay.cta : null;
  const tone: Tone = status?.tone ?? (pay.kind === "failed" ? "danger" : pay.kind === "paid" ? "accent" : "primary");
  if (!status && !banner && steps.length === 0) return null;
  /* While payment is due, the board above already says why — the card is only the ticket: amount, pay-by, the button. */
  const ticketOnly = Boolean(status?.pay);
  const due = status?.deadline ? splitDeadline(status.deadline.label) : null;
  return (
    <section className="sx-od-next sx-stadium-panel sx-stadium-in" data-tone={tone} style={at(0.16)} aria-labelledby="sx-od-next-title">
      <div className="sx-od-next-main">
        <p className="sx-od-next-kicker">
          <span className="sx-od-dot" aria-hidden="true" />
          {cta ? "Your next step" : "Where it stands"}
          {status && status.tag && <span className="sx-od-next-tag">{status.tag}</span>}
        </p>

        {ticketOnly ? (
          <h3 id="sx-od-next-title" className="sx-od-next-title">
            Pay by card to lock in your dates
          </h3>
        ) : (
          <div
            role={banner?.role === "alert" ? "alert" : "status"}
            aria-live={banner?.role === "alert" ? "assertive" : "polite"}
            aria-label="Order status"
            className="sx-od-msg"
          >
            <h3 id="sx-od-next-title" className="sx-od-next-title">
              {status?.title ?? banner?.title ?? "What happens next"}
            </h3>
            {(status?.text ?? banner?.text) && <p className="sx-od-next-text">{status?.text ?? banner?.text}</p>}
            {status?.quote && <p className="sx-od-quote">{status.quote}</p>}
            {banner?.detail && <p className="sx-od-detail">{banner.detail}</p>}
            {status?.deadline && <DeadlineLine d={status.deadline} />}
            {!cta && pay.note && pay.kind === "processing" && <p className="sx-od-next-text">{pay.note}</p>}
          </div>
        )}

        {cta && (
          /* One strip, as wide as the card: Amount due | Pay by | the button; the Stripe note under it. */
          <div className="sx-od-ticket" data-tone={status?.deadline?.tone ?? tone}>
            <div className="sx-od-ticket-row">
              <div className="sx-od-ticket-cell">
                <span className="sx-od-ticket-label">Amount due</span>
                <span className="sx-od-ticket-amount">
                  <Roll cents={payment?.amountCents ?? order.totalCents} delay={0.5} />
                </span>
              </div>
              {due && (
                <div className="sx-od-ticket-cell" role="timer" aria-live="off">
                  <span className="sx-od-ticket-label">
                    <Glyph ui="calendar" className="size-3.5" />
                    {due.key}
                  </span>
                  <span className="sx-od-ticket-when">{due.when}</span>
                  {due.left && <span className="sx-od-ticket-left">{due.left}</span>}
                </div>
              )}
              <div className="sx-od-ticket-cell sx-od-ticket-act">
                {canWrite ? (
                  <OrderPayButton orderId={order.id} label={cta.label} ariaLabel={cta.ariaLabel} disabled={!payment?.canPay} className={btn} sample={sample} />
                ) : (
                  <p className="sx-od-viewer">
                    <Glyph ui="eye" className="size-4" />A Sponsor Admin in your organisation pays this order by card. You can follow its progress here.
                  </p>
                )}
              </div>
            </div>
            <p className="sx-od-safe">
              <span>
                <Glyph ui="lock" className="size-4" />
                {!payment ? "The payment status couldn’t be loaded just now. Refresh the page in a minute." : payment.canPay ? PAY_NOTE : NOT_CONNECTED_NOTE}
              </span>
              {payment?.testProvider && <span className="sx-od-test">{TEST_PROVIDER_BADGE}</span>}
            </p>
          </div>
        )}
        {status?.again && (
          /* POL-FE-72 — a Shop order is ordered again from the Shop, not Packages. */
          <Link href="/sponsor/shop" className="sx-od-go sx-od-go-link">
            Order again
            <Glyph ui="arrow" className="size-4" />
          </Link>
        )}
        {pay.poll && <PaymentRefresher />}
        {payment?.testProvider && !cta && pay.kind === "processing" && <p className="sx-od-test">{TEST_PROVIDER_BADGE}</p>}
      </div>

      {steps.length > 0 && (
        /* Along the bottom, left to right: the step it's on lit, the two after it waiting. */
        <div className="sx-od-next-foot">
          <h3 className="sx-od-side-title">What happens next</h3>
          <ol className="sx-od-steps">
            {steps.map((s, i) => (
              <li key={s.title} style={at(0.3 + i * 0.1)}>
                <span className="sx-od-step-head">
                  <span className="sx-od-step-n">{i + 1}</span>
                  {i < steps.length - 1 && <span className="sx-od-step-wire" aria-hidden="true" />}
                </span>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- the items */

export function OrderItems({ lines, kinds }: { lines: ApiOrderLine[]; kinds: Record<string, OrderLineKind> }) {
  return (
    <section className="sx-od-panel sx-stadium-panel sx-stadium-in" style={at(0.24)} aria-labelledby="sx-od-items">
      <div className="sx-od-panel-head">
        <h2 id="sx-od-items" className="sx-section-title">
          What you bought
        </h2>
        <span className="sx-od-count">
          {lines.length} {lines.length === 1 ? "item" : "items"}
        </span>
      </div>
      <ul className="sx-od-items" aria-label="Items in this order">
        {lines.map((l, i) => {
          const run = runOf(l.startsOn, l.endsOn);
          const k = kinds[l.id];
          return (
            <li key={l.id} className="sx-od-item" style={at(0.32 + i * 0.07)}>
              <span className="sx-od-thumb" aria-hidden="true">
                <span>
                  <Glyph kind={k?.kind ?? "OTHER"} className="size-6" />
                </span>
              </span>
              <span className="sx-od-item-main">
                {k?.kindLabel && <span className="sx-sh-kind">{k.kindLabel}</span>}
                <span className="sx-od-item-title">{l.title}</span>
                <span className="sx-od-item-sub">
                  {lineSeller(l)} · {l.quantity} × {usd(l.unitPriceCents)}
                </span>
                <span className="sx-od-item-when">
                  <Glyph ui="calendar" className="size-3.5" />
                  {run.label} · {run.daysLabel}
                </span>
              </span>
              <span className="sx-od-item-total sx-stadium-num">{usd(l.lineTotalCents)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- the facts */

function paymentFact(order: ApiOrder, pay: PaymentView): { value: string; more: string } {
  switch (pay.kind) {
    case "paid":
      return { value: pay.status, more: order.paidAt ? `By card · ${fmtStamp(order.paidAt)}` : "Payment recorded" };
    case "due":
      return { value: pay.status === "Unavailable" ? "Couldn't be loaded" : "Due now", more: "By card, on Stripe's secure page" };
    case "held":
      return { value: "Held for you", more: "Card payment opens soon — we'll email your pay-by date" };
    case "processing":
      return { value: "Confirming…", more: "The payment provider is confirming it" };
    case "failed":
      return { value: "Not paid", more: "The last card payment didn't go through — nothing was charged" };
    case "not-open":
      return { value: "Not due yet", more: "You pay by card once it's approved" };
    default:
      return { value: order.state === "REFUNDED" ? "Refunded" : "Nothing charged", more: order.state === "REFUNDED" ? "Back the way you paid" : "This order was never paid" };
  }
}

export function OrderFacts({ order, pay }: { order: ApiOrder; pay: PaymentView }) {
  const billing = billingLines(order);
  const a = order.acceptance;
  const p = paymentFact(order, pay);
  return (
    <ul className="sx-od-facts" aria-label="Order details">
      <li style={at(0.36)}>
        <span className="sx-od-fact-label">
          <Glyph ui="users" className="size-4" />
          Invoice to
        </span>
        {billing ? (
          <>
            <span className="sx-od-fact-value">{billing[0]}</span>
            {billing.slice(1).map((b) => (
              <span key={b} className="sx-od-fact-more">
                {b}
              </span>
            ))}
          </>
        ) : (
          <span className="sx-od-fact-more">None recorded — this order was placed before checkout asked for one.</span>
        )}
      </li>
      <li style={at(0.42)}>
        <span className="sx-od-fact-label">
          <Glyph ui="shield" className="size-4" />
          Payment
        </span>
        <span className="sx-od-fact-value">{p.value}</span>
        <span className="sx-od-fact-more">{p.more}</span>
      </li>
      <li style={at(0.48)}>
        <span className="sx-od-fact-label">
          <Glyph ui="edit" className="size-4" />
          Order terms
        </span>
        {a ? (
          <>
            <span className="sx-od-fact-value">Accepted ✓</span>
            <span className="sx-od-fact-more">
              {termsLabel(a.agreement)} · {fmtStamp(a.acceptedAt)}
              {a.user?.email ? ` · ${a.user.email}` : ""}
            </span>
          </>
        ) : (
          <span className="sx-od-fact-more">No acceptance recorded — this order was placed before checkout asked for one.</span>
        )}
      </li>
    </ul>
  );
}

/* ---------------------------------------------------------------- the summary */

export function OrderSummary({
  order,
  pay,
  cancellable,
  sample,
  children,
}: {
  order: ApiOrder;
  pay: PaymentView;
  cancellable: boolean;
  sample: boolean;
  /** Refunds and extra payments going back, when there are any. */
  children?: ReactNode;
}) {
  return (
    <aside className="sx-od-sum sx-stadium-panel sx-stadium-in" style={at(0.28)} aria-label="Order summary">
      <h2 className="sx-section-title">Order summary</h2>
      <ul className="sx-od-sum-lines">
        {order.lines.map((l) => (
          <li key={l.id}>
            <span>
              <b>{l.title}</b> × {l.quantity}
            </span>
            <span>{usd(l.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="sx-od-sum-rows">
        <div>
          <dt>Subtotal</dt>
          <dd>
            <Roll cents={order.subtotalCents} delay={0.5} />
          </dd>
        </div>
        <div>
          <dt>BTG fee</dt>
          <dd>
            <Roll cents={order.feesCents} delay={0.55} />
          </dd>
        </div>
        <div className="sx-od-sum-total">
          <dt>{pay.kind === "paid" ? "Total paid" : "Total"}</dt>
          <dd>
            <Roll cents={order.totalCents} delay={0.6} />
          </dd>
        </div>
      </dl>
      {pay.status && (
        <p className="sx-od-sum-status">
          <span>Payment</span>
          <span className="sx-od-chip" data-tone={pay.tone}>
            {pay.status}
          </span>
        </p>
      )}
      <ul className="sx-od-promise">
        <li>
          <Glyph ui="lock" className="size-4" />
          <span>
            <b>Card payments happen on Stripe&rsquo;s page.</b> SponsorX never sees your card or bank details.
          </span>
        </li>
        <li>
          <Glyph ui="shield" className="size-4" />
          <span>
            <b>Refunds go back the way you paid.</b> Cancel any time before you pay.
          </span>
        </li>
      </ul>
      {children}
      <div className="sx-od-sum-foot">
        {cancellable &&
          (sample ? (
            <p className="sx-od-fact-more">Cancel order is here on a real order, until it&rsquo;s paid.</p>
          ) : (
            <div className="sx-od-cancel">
              <p>You can cancel until the order is paid.</p>
              <ShopCancelOrder orderId={order.id} state={order.state} />
            </div>
          ))}
        <div className="sx-od-links">
          <Link href="/sponsor/orders" className="sx-od-ghost">
            <Glyph ui="rows" className="size-4" />
            All orders
          </Link>
          <Link href="/sponsor/shop" className="sx-od-ghost">
            <Glyph ui="tag" className="size-4" />
            Keep shopping
          </Link>
        </div>
      </div>
    </aside>
  );
}

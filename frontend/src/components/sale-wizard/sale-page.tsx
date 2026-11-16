import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaCount } from "@/components/arena-fx";
import { OrdersHead } from "@/components/seller-orders";
import { SellerProblemAnswer } from "@/components/seller-problem-answer";
import { SellerCancelBox, SellerCantDeliver } from "@/components/seller-order-cancel";
import { Lock, Medal, Tick, d } from "@/components/wizard-kit";
import { LISTINGS_CHECKED_NOTE, listingsChecked, sellerCancelBanner, sellerRefundCents } from "@/lib/cancellations-live";
import {
  SAMPLE_STATES, answeringProblem, cancelAsked, checkDueAt, cheerFor, saleJourney, type SampleState,
} from "@/lib/sale-journey";
import {
  CONFIRM_HOURS, SELLER, datesText, dayOf, lineSummary, lineTotalCents, markControl, orderBanner, shareUsd, stamp,
  type ApiSellerOrder, type SellerBanner,
} from "@/lib/seller-orders-live";

import { CheckClock } from "./check-clock";
import { DeliverSteps } from "./deliver-steps";
import { SaleWizard, type SaleCheer, type SalePanel } from "./sale-wizard";

/* --------------------------------------------------------------------------
   POL-FE-96 — the athlete's sale page (/athlete/sales/<id>), on the Arena:

     the ticket   what was sold, to whom, your share counting up, and one
                  callout saying whose move it is, in words
     the wizard   Sponsor pays → You deliver it → Sponsor checks it → You
                  get paid (components/sale-wizard/sale-wizard.tsx), opening
                  on the step the sale is at

   This server component decides every word; the step logic is
   lib/sale-journey.ts. Reads and writes are the ones the old detail had
   (GET /sales/:id; mark delivered, the problem answer, the cancel answer
   and "Can't deliver" through seller-sales-actions.ts), so nothing about
   who may do what changed — only how it reads. The property portal keeps
   SellerOrderDetail (seller-orders.tsx).

   `sample` is the ?demo=sample walk: a made-up sale (sampleSale) in any of
   SAMPLE_STATES, with a strip to switch state. Its Mark delivered moves
   the sample on rather than writing.
   -------------------------------------------------------------------------- */

const BASE = SELLER.athlete.basePath;

export function AthleteSale({ order: o, now = new Date(), sample = null }: { order: ApiSellerOrder; now?: Date; sample?: SampleState | null }) {
  const j = saleJourney(o, now);
  const units = `${o.line.quantity} ${o.line.quantity === 1 ? o.line.unit : `${o.line.unit}s`}`;
  const cheers: SaleCheer[] = j.stops.map((_, i) => cheerFor(i - 1, i, o));
  const panels = j.stops.map((stop) => PANELS[stop.key](o, stop.status === "off" ? "stopped" : stop.status, { now, units, sample: sample !== null }));

  return (
    <div className="space-y-6">
      <OrdersHead kind="athlete" now={now} pill={sample ? <span>Sample data</span> : undefined} />
      {sample && <SampleStrip on={sample} />}

      <Link href={BASE} className="sx-cw-rise inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text" style={d(0.02)}>
        <span aria-hidden="true">←</span> All sales
      </Link>

      <Ticket o={o} units={units} turn={j.turn} step={j.complete ? j.stops.length : j.current + 1} of={j.stops.length} ended={j.ended} />

      {listingsChecked(o.cancellation) && (
        <p role="status" className="sx-sl-note sx-cw-rise" data-tone="warn" style={d(0.3)}>
          <strong>Your listings:</strong> {LISTINGS_CHECKED_NOTE}
        </p>
      )}

      <SaleWizard
        stops={j.stops}
        current={j.current}
        turn={j.turn}
        panels={panels}
        cheers={cheers}
        finish={j.complete ? { href: SELLER.athlete.moneyHref, label: "Go to Payouts" } : { href: BASE, label: "Back to all sales" }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- ticket */

function Ticket({ o, units, turn, step, of, ended }: {
  o: ApiSellerOrder; units: string; turn: ReturnType<typeof saleJourney>["turn"]; step: number; of: number; ended: boolean;
}) {
  return (
    <section aria-label={`Order ${o.ref}`} className="sx-arena-plate sx-sl-ticket sx-cw-rise" data-tone={turn.tone} style={d(0.06)}>
      <span aria-hidden="true" className="sx-sl-ticket-streak" />
      <div className="sx-sl-ticket-main">
        <p className="sx-sl-ticket-ref">
          <span>Order {o.ref}</span>
          <span aria-hidden="true">·</span>
          <span>Ordered {dayOf(o.placedAt)}</span>
        </p>
        <h2 className="sx-sl-ticket-title">{o.line.title}</h2>
        <p className="sx-sl-ticket-sub">
          For <strong>{o.sponsor.name}</strong> · {units} · {datesText(o.line.dates)}
        </p>
        <div className="sx-sl-turn" data-tone={turn.tone}>
          <span aria-hidden="true" className="sx-sl-turn-dot" />
          <span className="min-w-0">
            <strong className="block">{turn.label}</strong>
            <span className="block">{turn.text}</span>
          </span>
        </div>
      </div>

      <div className="sx-sl-ticket-stub">
        <p className="sx-sl-stub-label">{ended ? "Would have been your share" : "Your share"}</p>
        <ArenaCount value={o.shareCents} format="usd" delay={0.35} className="sx-arena-num sx-sl-share" />
        <p className="sx-sl-stub-cap">{lineSummary(o.line)} · sold by {o.line.soldBy}</p>
        <div className="sx-sl-lane" aria-label={ended ? "This sale ended" : `Step ${step} of ${of}`} role="img">
          {Array.from({ length: of }, (_, i) => (
            <i key={i} data-on={i < step ? "" : undefined} data-ended={ended && i === step - 1 ? "" : undefined} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <p className="sx-sl-stub-cap">{ended ? "This sale ended" : step >= of && turn.tone === "win" ? "All four steps done" : `Step ${step} of ${of}`}</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- panels */

type Ctx = { now: Date; units: string; sample: boolean };
type Builder = (o: ApiSellerOrder, status: "done" | "now" | "later" | "stopped", c: Ctx) => SalePanel;

const PANELS: Record<"pay" | "deliver" | "check" | "paid", Builder> = {
  pay: (o, st, c) => {
    const s = o.sponsor.name;
    const facts = <Facts o={o} units={c.units} delay={0.3} />;
    if (st === "now") {
      return {
        title: `Waiting for ${s} to pay`,
        lede: `${s} ordered this, but hasn't paid yet. Don't start on it until it's paid — we'll email you the moment it is.`,
        body: <>{facts}<Note tone="wait" icon={<Hourglass />} title="Nothing for you to do yet" text="Their contact details show here once they've paid." delay={0.38} /></>,
        hint: "Nothing to do here — the next step opens once they pay.",
      };
    }
    if (st === "stopped") {
      return {
        title: "This sale was cancelled",
        lede: "It ended before it was paid, so there's nothing to deliver.",
        body: <>{endedBox(o, c.now)}{facts}</>,
        hint: "Nothing more to do on this sale.",
      };
    }
    return {
      title: `${s} paid for it`,
      lede: "Here's what they bought and how to reach them if you need to sort out details.",
      body: (
        <>
          <Note tone="win" icon={<Tick />} title={o.paidAt ? `Paid on ${stamp(o.paidAt)}` : "Paid"} text="The money is held safely until the delivery is confirmed." delay={0.26} />
          {facts}
          <Contact o={o} />
        </>
      ),
      hint: "Done — look back here any time for the details.",
    };
  },

  deliver: (o, st, c) => {
    const s = o.sponsor.name;
    if (st === "later") {
      return {
        title: "You deliver it",
        lede: `Once ${s} pays, this is where you mark it delivered. Plan for ${datesText(o.line.dates)}.`,
        body: <Locked text={`Opens when ${s} has paid.`} />,
        hint: "Coming up — not yet.",
      };
    }
    if (st === "stopped") {
      return { title: "This sale was stopped", lede: "It ended here, so there's nothing to deliver.", body: endedBox(o, c.now), hint: "Nothing more to do on this sale." };
    }
    if (st === "done") {
      return {
        title: "You delivered it",
        lede: `This is what you told ${s}.`,
        body: <DeliveryRecord o={o} />,
        hint: "Done.",
      };
    }
    /* now */
    const mark = markControl(o);
    const asked = cancelAsked(o);
    const cancelBox = sellerCancelBanner(o, lineTotalCents(o), c.now);
    const banner = orderBanner(o, c.now);
    return {
      title: asked ? `${s} asked to cancel` : o.redeliverOn ? `Deliver it again on ${dayOf(o.redeliverOn)}` : "Deliver it, then tell us",
      lede: asked
        ? "Answer them first: agree to cancel, or keep it and say why. If you keep it, BTG decides."
        : `Do what you sold on ${datesText(o.line.dates)}. When it's done, fill in the three steps below — it takes a minute.`,
      body: (
        <>
          {cancelBox && (
            <div className="sx-cw-rise" style={d(0.2)}>
              <SellerCancelBox lineId={o.id} title={o.line.title} sponsor={s} refundCents={sellerRefundCents(o)} banner={cancelBox} />
            </div>
          )}
          {banner && <BannerNote b={banner} delay={0.22} />}
          {mark.applies ? (
            <DeliverSteps lineId={o.id} sponsor={s} summary={`${o.line.title} · ${c.units} · ${datesText(o.line.dates)}`} sample={c.sample} />
          ) : (
            !asked && <Note tone="wait" icon={<Hourglass />} title="You can't mark it delivered just now" text={mark.why} delay={0.26} />
          )}
          {o.cancellation?.canCancel && !asked && (
            <div className="sx-sl-cant sx-cw-rise" style={d(0.44)}>
              <span className="text-xs text-muted">Something came up?</span>
              <SellerCantDeliver lineId={o.id} title={o.line.title} sponsor={s} refundCents={sellerRefundCents(o)} cancellation={o.cancellation} />
            </div>
          )}
        </>
      ),
      hint: asked ? "Answer the request above first." : mark.applies ? "Write what you did, add proof if you have it, then press Mark delivered." : mark.why,
    };
  },

  check: (o, st, c) => {
    const s = o.sponsor.name;
    if (st === "later") {
      return {
        title: `${s} checks it`,
        lede: `After you mark it delivered, ${s} gets ${CONFIRM_HOURS} hours to confirm it or report a problem. If they don't answer, it counts as confirmed.`,
        body: <Locked text="Opens once you've marked it delivered." />,
        hint: "Coming up — not yet.",
      };
    }
    if (st === "stopped") {
      return { title: "This sale was refunded", lede: `${s} got their money back, so there's no share to pay out.`, body: endedBox(o, c.now), hint: "Nothing more to do on this sale." };
    }
    if (st === "done") {
      const b = orderBanner(o, c.now);
      return {
        title: `${s} is happy with it`,
        lede: "The delivery is confirmed. Nothing more to check.",
        body: <><Note tone="win" icon={<Tick />} title={b?.title ?? "Confirmed ✓"} text={o.confirmedAt ? `On ${stamp(o.confirmedAt)}.` : ""} quote={b?.quote} delay={0.26} /><DeliveryRecord o={o} compact /></>,
        hint: "Done.",
      };
    }
    /* now: waiting for the check, or a problem */
    if (o.state === "PROBLEM") {
      const answering = answeringProblem(o) ? o.issue! : null;
      const b = orderBanner(o, c.now);
      return {
        title: answering ? `${s} reported a problem` : "The problem is being sorted",
        lede: answering
          ? "Pick how you'll fix it: deliver it again, refund it, or explain why it was fine. They then accept or reject your answer."
          : "You've done your part for now. You'll hear by email when it's settled.",
        body: (
          <>
            {answering ? (
              <div className="sx-cw-rise" style={d(0.22)}>
                <SellerProblemAnswer
                  lineId={o.id}
                  sponsor={s}
                  problem={answering.problem}
                  sellerDueAt={answering.sellerDueAt!}
                  refundCents={lineTotalCents(o)}
                  now={c.now.toISOString()}
                />
              </div>
            ) : (
              b && <BannerNote b={b} delay={0.22} />
            )}
            <DeliveryRecord o={o} compact />
          </>
        ),
        hint: answering ? "Choose an answer and send it." : "Nothing for you to do right now.",
      };
    }
    const due = checkDueAt(o);
    return {
      title: `${s} is checking it`,
      lede: `You marked it delivered. Now ${s} confirms it — or, if something's wrong, tells you.`,
      body: (
        <>
          {due && o.markedAt && (
            <div className="sx-cw-rise" style={d(0.22)}>
              <CheckClock markedAt={o.markedAt} dueAt={due} serverNow={c.now.getTime()} sponsor={s} due={stamp(due)} />
            </div>
          )}
          <DeliveryRecord o={o} compact />
        </>
      ),
      hint: "Nothing to do — the clock runs out in your favour.",
    };
  },

  paid: (o, st, c) => {
    const s = o.sponsor.name;
    if (st === "done") {
      const b = orderBanner(o, c.now);
      return {
        title: "You earned it",
        lede: b?.text ?? "Your share becomes payable once the payout hold ends — Payouts shows when.",
        body: (
          <div className="sx-sl-payout">
            <Medal size="lg" burst={26} />
            <p className="sx-sl-payout-label sx-cw-rise" style={d(0.55)}>Your share</p>
            <p className="sx-arena-num sx-sl-payout-sum sx-cw-shimmer sx-cw-rise" style={d(0.6)}>{shareUsd(o.shareCents)}</p>
            <p className="sx-cw-rise text-[13px] text-muted" style={d(0.7)}>for {o.line.title} · {s}</p>
          </div>
        ),
        hint: "All four steps done. Payouts shows when it's paid.",
      };
    }
    if (st === "stopped") {
      return { title: "No payout for this one", lede: "It was cancelled or refunded, so your share is $0.00.", body: endedBox(o, c.now), hint: "Nothing more to do on this sale." };
    }
    return {
      title: "You get paid",
      lede: `Once ${s} confirms the delivery, your share of ${shareUsd(o.shareCents)} becomes payable after the payout hold. Payouts shows when.`,
      body: <Locked text={`Unlocks when ${s} confirms.`} medal />,
      hint: "The finish line.",
    };
  },
};

/* ----------------------------------------------------------------- parts */

const TONE_OF: Record<SellerBanner["tone"], NoteTone> = { warn: "warn", accent: "win", danger: "danger", primary: "wait" };

type NoteTone = "win" | "wait" | "warn" | "danger";

function Note({ tone, icon, title, text, quote, delay = 0.24 }: { tone: NoteTone; icon: ReactNode; title: string; text?: string; quote?: string; delay?: number }) {
  return (
    <div className="sx-sl-note sx-cw-rise" data-tone={tone} style={d(delay)} role={tone === "danger" || tone === "warn" ? "status" : undefined}>
      <span aria-hidden="true" className="sx-sl-note-icon">{icon}</span>
      <span className="min-w-0">
        <strong className="block text-sm text-text">{title}</strong>
        {text && <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{text}</span>}
        {quote && <span className="sx-sl-quote mt-2.5 block">{quote}</span>}
      </span>
    </div>
  );
}

function BannerNote({ b, delay }: { b: SellerBanner; delay?: number }) {
  const tone = TONE_OF[b.tone];
  return (
    <div className="space-y-2">
      <Note tone={tone} icon={tone === "win" ? <Tick /> : <Bang />} title={b.title} text={b.text} quote={b.quote} delay={delay} />
      {b.money && <Link href={SELLER.athlete.moneyHref} className="sx-sl-textlink">{SELLER.athlete.moneyLabel} →</Link>}
    </div>
  );
}

/** How the sale ended: the cancellation's own words, else the order's banner. */
function endedBox(o: ApiSellerOrder, now: Date) {
  const c = sellerCancelBanner(o, lineTotalCents(o), now);
  if (c) return <Note tone={c.tone === "accent" ? "win" : "wait"} icon={<Bang />} title={c.title} text={c.text} quote={c.quote} />;
  const b = orderBanner(o, now);
  if (b) return <BannerNote b={b} />;
  return <Note tone="wait" icon={<Bang />} title={o.state === "REFUNDED" ? "This sale was refunded" : "This sale was cancelled"} text={`${o.sponsor.name} isn't charged for it, so there's nothing to deliver and no share to pay out.`} />;
}

function Facts({ o, units, delay }: { o: ApiSellerOrder; units: string; delay: number }) {
  const ended = o.state === "CANCELLED" || o.state === "REFUNDED";
  const rows: [string, string][] = [
    ["What", o.line.title],
    ["When", datesText(o.line.dates)],
    ["How many", units],
    [ended ? "Would have been yours" : "Your share", shareUsd(o.shareCents)],
  ];
  return (
    <dl className="sx-sl-facts">
      {rows.map(([k, v], i) => (
        <div key={k} className="sx-cw-rise" style={d(delay + i * 0.05)}>
          <dt>{k}</dt>
          <dd className={i === 3 ? (ended ? "sx-arena-num text-muted line-through" : "sx-arena-num text-athlete") : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Contact({ o }: { o: ApiSellerOrder }) {
  const c = o.sponsor.contact;
  return (
    <div className="sx-sl-contact sx-cw-rise" style={d(0.5)}>
      <span aria-hidden="true" className="sx-sl-avatar">{initials(o.sponsor.name)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Your contact at {o.sponsor.name}</p>
        {c ? (
          <p className="mt-1 text-sm text-text">
            <strong>{c.name}</strong>
            <span className="text-muted"> · </span>
            <a href={`mailto:${c.email}`} className="break-all text-athlete hover:underline">{c.email}</a>
            {c.phone && <><span className="text-muted"> · </span><a href={`tel:${c.phone}`} className="text-athlete hover:underline">{c.phone}</a></>}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">Shows here once they&rsquo;ve paid.</p>
        )}
      </div>
    </div>
  );
}

function DeliveryRecord({ o, compact = false }: { o: ApiSellerOrder; compact?: boolean }) {
  if (!o.deliveryNote || !o.markedAt) return null;
  return (
    <figure className="sx-sl-record sx-cw-rise" data-compact={compact ? "" : undefined} style={d(compact ? 0.34 : 0.24)}>
      <figcaption className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Your delivery note</figcaption>
      <blockquote className="sx-sl-quote mt-2">{o.deliveryNote}</blockquote>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>Marked by {o.markedBy ?? "you"} · {stamp(o.markedAt)}</span>
        {o.proof.photo && <span className="sx-sl-chip" data-tone="win">Photo attached</span>}
        {o.proof.link && (
          <a href={o.proof.link} target="_blank" rel="noopener noreferrer" className="break-all text-athlete hover:underline">{o.proof.link}</a>
        )}
      </p>
    </figure>
  );
}

function Locked({ text, medal = false }: { text: string; medal?: boolean }) {
  return (
    <div className="sx-sl-locked sx-cw-rise" data-medal={medal ? "" : undefined} style={d(0.22)}>
      <span aria-hidden="true" className="sx-sl-locked-icon"><Lock /></span>
      <p className="text-sm font-semibold text-text">{text}</p>
      <p className="text-xs text-faint">You can look ahead — nothing here needs you yet.</p>
    </div>
  );
}

function SampleStrip({ on }: { on: SampleState }) {
  return (
    <nav aria-label="Sample states" className="sx-sl-sample sx-cw-rise" style={d(0.02)}>
      <span className="text-[11px] font-semibold text-faint">Sample sale · try a state:</span>
      {SAMPLE_STATES.map((k) => (
        <Link key={k} href={`?demo=sample&as=${k}`} scroll={false} aria-current={k === on ? "page" : undefined} className="sx-cw-chip-btn" data-on={k === on ? "" : undefined}>
          {k}
        </Link>
      ))}
    </nav>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "•";

function Hourglass() {
  return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9" /></svg>;
}
function Bang() {
  return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 6v8M12 18.5v.01" /></svg>;
}

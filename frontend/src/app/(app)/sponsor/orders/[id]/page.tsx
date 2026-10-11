import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { OrderGateRecordCard } from "@/components/order-gate-record";
import { OrderPayButton, PaymentRefresher } from "@/components/order-payment";
import { ShopLineRow, ShopSteps } from "@/components/shop-bits";
import { ShopCancelOrder } from "@/components/shop-checkout";
import { SponsorOrderDelivery } from "@/components/sponsor-order-delivery";
import { SponsorOrderStatus } from "@/components/sponsor-order-status";
import { StatePill, StatusBox } from "@/components/order-bits";
import { StadiumChip, StadiumHead, StadiumSteps, StadiumTile, StadiumTiles } from "@/components/stadium-stage";
import { sellerCancelledBanner } from "@/lib/cancellations-live";
import { sponsorBadge, sponsorStatus } from "@/lib/order-automation-live";
import { refundWords } from "@/lib/refunds-live";
import type { ApiOrderDeliveries } from "@/lib/sponsor-delivery-live";
import { TEST_PROVIDER_BADGE, paymentHint, paymentView, type ApiOrderPayment, type PaymentView } from "@/lib/order-payment-live";
import { canCancel, fmtStamp, orderCopy, orderRef, usd, type ApiOrder } from "@/lib/shop-live";
import { orderWord } from "@/lib/sponsor-words";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Order — 2S4-FE-02, payment 2S5-FE-05. One marketplace order: its state,
   the order-progress tracker, lines, subtotal, fees and total, why BTG is
   reviewing it (if it is), BTG's decision notes, the Payment card (designs
   E1 due / E2 confirming / E3 paid / E4 failed), the billing contact and
   order-terms acceptance recorded at checkout (2S4-FE-02) and Cancel. With ?placed=1
   (checkout's redirect) it is the Confirmation step; ?payment=returned is the
   provider sending the browser back — the card reads the same API either way.

   Reads  GET /marketplace-orders/:id
          GET /marketplace-orders/:id/payment   (due, canPay, testProvider, latest attempt)
   Writes (ShopCancelOrder → actions.ts)
          POST /marketplace-orders/:id/transition {to:"CANCELLED"} — the only
          move a sponsor may make, and only before payment.
          (OrderPayButton → payment-actions.ts)
          POST /marketplace-orders/:id/pay → redirect to the provider's page.
   2S4-FE-04 — delivery (SponsorOrderDelivery → delivery-actions.ts):
   Reads  GET /marketplace-orders/:id/deliveries  (each line's delivery; no shares)
   Writes POST /deliveries/:lineId/confirm · POST /deliveries/:lineId/problem
          — within 24 hours of the seller marking it; silence confirms.

   2S4-FE-05 (SponsorOrderUpdates.dc.html) — the status card on top says
   what the order waits on and by when (SponsorOrderStatus: approved and due
   in 3 days / 1 day / the last day, waiting for the seller, declined by the
   seller, held for BTG above the spending limit, cancelled unpaid), from the
   order's waitingOn / deadlineAt / paymentDueAt / cancelReason /
   sellerApprovals (2S4-BE-09 / -10). A reported problem's exchange — the
   seller's answer, Accept / Reject — is in SponsorOrderDelivery
   (POST /deliveries/:lineId/problem-answer, 2S4-BE-11).

   2S4-FE-06 (OrderCancellations.dc.html, CX-1 … CX-5b) — cancelling a paid
   line is in SponsorOrderDelivery (POST /deliveries/:lineId/cancel). Here:
   the box on top when a seller cancelled a line (CX-5), and the Refunds
   card — each refund of the order from GET /marketplace-orders/:id
   `refunds`, on its way or sent on a date. Never how it was sent, nor any
   reference: the API doesn't give the sponsor either.

   2S3-FE-03 — each line names who sells it (the line's `seller`: the team,
   or the independent athlete — such a line has no property).

   While the provider confirms (latest PROCESSING) the page refreshes itself
   every 3s until the order is PAID. Honest gaps: no receipt or invoice link
   (the API returns none), no per-line fee breakdown for sponsors (the
   financials route is BTG/finance only) — the order's own feesCents is shown.
   Roles. SPONSOR_ADMIN may pay and cancel; SPONSOR_ANALYST reads.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const placed = sp.placed === "1";

  const back = (
    <Link href="/sponsor/orders" className="text-xs text-muted hover:text-text">
      ← All orders
    </Link>
  );

  const [res, payRes, deliveryRes] = await Promise.all([
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}`),
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}/payment`).catch(() => null),
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}/deliveries`).catch(() => null),
  ]);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState
          mark="inbox"
          title="This order isn't available"
          hint="It doesn't exist, or it belongs to another sponsor."
          action={{ label: "Go to orders", href: "/sponsor/orders" }}
        />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Order unavailable (${res.status}).`);
  const o = (await res.json()) as ApiOrder;
  const c = orderCopy(o.state);
  const word = orderWord(o.state);
  const cancelledLike = o.state === "CANCELLED" || o.state === "REFUNDED";
  /* A failed payment read degrades the card to "couldn't be loaded", never the page. */
  const payment = payRes?.ok ? ((await payRes.json()) as ApiOrderPayment) : null;
  const pay = paymentView(o.state, payment);
  /* Delivery rows exist from contract time; a failed read hides the section, never the page. */
  const deliveries = deliveryRes?.ok ? ((await deliveryRes.json()) as ApiOrderDeliveries) : null;
  const now = new Date();
  const status = sponsorStatus(o, pay.kind, now);
  const badge = sponsorBadge(o, pay.kind, now);
  /* While payment is due the status card carries the Stripe button; the side card then shows the status only. */
  const payInStatus = Boolean(status?.pay);
  /* 2S4-FE-06 — a seller cancelled a line and its refund is on its way (CX-5). */
  const sellerCancels = (deliveries?.lines ?? []).flatMap((l) => {
    const b = sellerCancelledBanner(l);
    return b ? [{ id: l.lineId, ...b }] : [];
  });
  const refunds = o.refunds ?? [];
  const lineTitle = new Map(o.lines.map((l) => [l.id, l.title]));

  return (
    <div className="space-y-6">
      {back}
      {placed && <ShopSteps active="confirmed" />}

      <StadiumHead title={`Order ${orderRef(o.id)}`}>
        <p className="mt-1 text-xs text-muted">
          Placed {fmtStamp(o.createdAt)}
          {o.contractedAt ? ` · confirmed ${fmtStamp(o.contractedAt)}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
          {badge && <StatePill p={badge} />}
        </div>
      </StadiumHead>

      {cancelledLike ? (
        <StadiumChip tone="late">{word.text}</StadiumChip>
      ) : (
        <StadiumSteps steps={ORDER_STEPS} now={orderStepNow(o.state)} label="Order progress" />
      )}

      <OrderTiles order={o} pay={pay} payment={payment} deliveries={deliveries} />

      {placed && (
        <Card className="border-accent/30 bg-accent/8">
          <p className="text-xs text-accent">
            {o.state === "PENDING_SELLER"
              ? "Your order is placed and sent to the seller, who has 48 hours to accept. The items stay yours while they decide."
              : o.state === "PENDING_APPROVAL"
              ? "Your order is placed. It's above your spending limit, so BTG checks it first. The items stay yours while they do."
              : "Your order is placed and approved automatically."}{" "}
            {o.state === "PENDING_SELLER"
              ? "Nothing was charged — you pay by card once it is accepted."
              : o.state === "PENDING_APPROVAL"
              ? "Nothing was charged — you pay by card once BTG approves it."
              : "Nothing was charged yet — pay the total by card within 3 days."}
          </p>
        </Card>
      )}

      {status && (
        <SponsorOrderStatus card={status} orderId={o.id} amount={usd(payment?.amountCents ?? o.totalCents)} canWrite={canWrite} canPay={Boolean(payment?.canPay)} unavailable={!payment} />
      )}

      {pay.banner && !(status && pay.kind === "due") && <PaymentBanner banner={pay.banner} kind={pay.kind} />}

      {sellerCancels.map((b) => (
        <div key={b.id} className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-warn">{b.tag}</p>
          <StatusBox tone="warn" title={b.title} quote={b.quote ?? undefined} />
        </div>
      ))}

      {o.decisionNotes && o.cancelReason !== "BTG_REJECTED" && (
        <Card>
          <p className="text-[11px] uppercase tracking-wide text-muted">
            BTG&rsquo;s note{o.decidedAt ? ` · ${fmtStamp(o.decidedAt)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-xs">{o.decisionNotes}</p>
        </Card>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Lines</h2>
          <ul className="space-y-2">
            {o.lines.map((l) => (
              <ShopLineRow key={l.id} line={l} />
            ))}
          </ul>
          <p className="text-[11px] text-muted">{paymentHint(pay.kind) ?? c.hint}</p>
          {deliveries && deliveries.lines.length > 0 && (
            <div className="pt-2">
              <SponsorOrderDelivery
                orderId={o.id}
                lines={deliveries.lines}
                canWrite={canWrite}
                now={now.toISOString()}
                lineTotals={Object.fromEntries(o.lines.map((l) => [l.id, l.lineTotalCents]))}
              />
            </div>
          )}
        </section>

        <aside className="mt-5 space-y-3 lg:mt-0">
          <Card className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">Totals</p>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Subtotal</span>
              <span className="tabular-nums">{usd(o.subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Fees</span>
              <span className="tabular-nums">{usd(o.feesCents)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-line-soft pt-2">
              <span className="text-xs text-muted">Total</span>
              <span className="text-lg font-semibold tabular-nums">{usd(o.totalCents)}</span>
            </div>
          </Card>
          {refunds.length > 0 && (
            <Card className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">Refunds</p>
              <ul className="space-y-2">
                {refunds.map((r) => {
                  const w = refundWords(r);
                  return (
                    <li key={r.id} className="flex flex-col gap-0.5 text-xs">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-muted">{r.lineId ? lineTitle.get(r.lineId) ?? "A line" : refunds.some((x) => x.lineId) ? "The rest of the order" : "The whole order"}</span>
                        <span className="font-semibold tabular-nums">{usd(r.amountCents)}</span>
                      </span>
                      <span className={`font-semibold ${w.tone === "accent" ? "text-accent" : "text-warn"}`}>
                        <span aria-hidden="true" className="mr-1">{w.mark}</span>
                        {w.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-muted">Refunds go back the way you paid. SponsorX never sees bank or card details.</p>
            </Card>
          )}
          <OrderGateRecordCard order={o} />
          {pay.kind !== "none" && (
            <PaymentCard orderId={o.id} totalCents={payment?.amountCents ?? o.totalCents} pay={pay} payment={payment} canWrite={canWrite} ctaAbove={payInStatus} />
          )}
          {canWrite && canCancel(o.state) && (
            <Card className="space-y-2">
              <p className="text-xs text-muted">You can cancel until the order is paid.</p>
              <ShopCancelOrder orderId={o.id} state={o.state} />
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the steps */

/** Where the order stands on the Stadium Board's mini steps (P1-ART-23 Task
 *  15). CANCELLED / REFUNDED never reach here — the page shows a `late` chip
 *  instead, since none of these four steps describes "it didn't happen". */
const ORDER_STEPS = ["Placed", "Approved", "Paid", "Delivered"];
function orderStepNow(state: string): number {
  switch (state) {
    case "PENDING_SELLER":
    case "PENDING_APPROVAL":
      return 0;
    case "APPROVED":
    case "AWAITING_PAYMENT":
      return 1;
    case "PAID":
    case "IN_DELIVERY":
      return 2;
    case "FULFILLED":
    case "CLOSED":
      return 4;
    default:
      return 0;
  }
}

/* ------------------------------------------------------------ the tiles */

/** Total, Payment and Delivered x/y — every figure the order itself already
 *  carries (memory: stats-must-be-retrievable), never guessed when a read
 *  degraded (payment / deliveries both tolerate a failed fetch elsewhere on
 *  this page; a tile is simply left out rather than show a wrong number). */
function OrderTiles({
  order, pay, payment, deliveries,
}: {
  order: ApiOrder;
  pay: PaymentView;
  payment: ApiOrderPayment | null;
  deliveries: ApiOrderDeliveries | null;
}) {
  const tiles = [
    <StadiumTile key="total" label="Total" value={order.totalCents} format="usd" hint="What this order comes to, fees included." delay={0.1} />,
  ];
  if (pay.kind !== "none") {
    tiles.push(
      <StadiumTile
        key="payment"
        label="Payment"
        value={payment?.amountCents ?? order.totalCents}
        format="usd0"
        tone={pay.kind === "failed" ? "late" : pay.kind === "due" ? "you" : undefined}
        caption={pay.status}
        hint="Whether payment is due, confirming, or already paid."
        delay={0.16}
      />,
    );
  }
  const lines = deliveries?.lines ?? [];
  if (lines.length > 0) {
    const done = lines.filter((l) => l.state === "CONFIRMED").length;
    tiles.push(
      <StadiumTile
        key="delivered"
        label="Delivered"
        value={done}
        caption={`of ${lines.length} ${lines.length === 1 ? "item" : "items"}`}
        share={done / lines.length}
        hint="Lines you've confirmed as delivered, out of every line on this order."
        delay={0.22}
      />,
    );
  }
  return <StadiumTiles cols={tiles.length >= 3 ? 3 : 2}>{tiles}</StadiumTiles>;
}

/* ------------------------------------------------------------ the payment */

const BANNER_TONE: Record<string, string> = {
  due: "border-warn/40 bg-warn/8",
  processing: "border-primary/40 bg-primary/8",
  paid: "border-accent/40 bg-accent/8",
  failed: "border-danger/40 bg-danger/8",
};
const BANNER_TITLE: Record<string, string> = {
  due: "text-warn",
  processing: "text-primary-soft",
  paid: "text-accent",
  failed: "text-danger",
};

function PaymentBanner({ banner, kind }: { banner: NonNullable<PaymentView["banner"]>; kind: PaymentView["kind"] }) {
  return (
    <div
      role={banner.role}
      aria-live={banner.role === "alert" ? "assertive" : banner.role === "status" ? "polite" : undefined}
      aria-label={banner.role === "region" ? "Payment" : undefined}
      className={`rounded-xl border px-5 py-4 ${BANNER_TONE[kind] ?? "border-line bg-surface"}`}
    >
      <p className={`text-sm font-semibold ${BANNER_TITLE[kind] ?? ""}`}>{banner.title}</p>
      <p className="mt-1 text-xs text-muted">{banner.text}</p>
      {banner.detail && <p className="mt-1.5 font-mono text-[11px] text-muted">{banner.detail}</p>}
    </div>
  );
}

function PaymentCard({
  orderId,
  totalCents,
  pay,
  payment,
  canWrite,
  ctaAbove = false,
}: {
  orderId: string;
  totalCents: number;
  pay: PaymentView;
  payment: ApiOrderPayment | null;
  canWrite: boolean;
  /** The status card above already carries the Stripe button (2S4-FE-05). */
  ctaAbove?: boolean;
}) {
  const open = pay.kind === "due" || pay.kind === "failed";
  const cta = ctaAbove ? null : pay.cta;
  return (
    <Card className={`space-y-3 ${open && cta ? "border-primary/40" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted">Payment</p>
      <div className="flex justify-between text-xs">
        <span className="text-muted">Order total</span>
        <span className="font-semibold tabular-nums">{usd(totalCents)}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Status</span>
        <Badge tone={pay.tone}>{pay.status}</Badge>
      </div>

      {cta && canWrite && (
        <OrderPayButton orderId={orderId} label={cta.label} ariaLabel={cta.ariaLabel} disabled={!payment?.canPay} />
      )}
      {cta && !canWrite && (
        <p className="rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          A Sponsor Admin in your organisation pays this order by card. You can follow its progress here.
        </p>
      )}
      {pay.note && !ctaAbove && (!cta || canWrite) && <p className="text-[11px] text-muted">{pay.note}</p>}
      {ctaAbove && <p className="text-[11px] text-muted">Not paid yet — pay from the box at the top of the page.</p>}
      {pay.poll && <PaymentRefresher />}
      {payment?.testProvider && (pay.cta || pay.kind === "processing") && (
        <p>
          <Badge>{TEST_PROVIDER_BADGE}</Badge>
        </p>
      )}
    </Card>
  );
}

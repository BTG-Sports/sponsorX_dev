import Link from "next/link";

import { ChatDock } from "@/components/deal-chat/chat-dock";
import { OrderDealChats } from "@/components/deal-chat/order-deal-chats";
import { chatRow } from "@/lib/deal-chat";
import { sampleChats } from "@/lib/deal-chat-sample";
import { dealChatRows } from "@/server/deal-chat";
import { EmptyState } from "@/components/states";
import { StatePill } from "@/components/order-bits";
import { SponsorOrderDelivery } from "@/components/sponsor-order-delivery";
import { OrderBoard, OrderFacts, OrderItems, OrderNextCard, OrderSummary, type OrderLineKind } from "@/components/sponsor-order/order-summary";
import { StadiumHead, StadiumUpdated } from "@/components/stadium-stage";
import { sellerCancelledBanner } from "@/lib/cancellations-live";
import { sponsorBadge, sponsorStatus } from "@/lib/order-automation-live";
import { paymentView, type ApiOrderPayment } from "@/lib/order-payment-live";
import { orderHero, orderJourney, sampleAs, sampleOrder, whatNext } from "@/lib/order-summary";
import { extraPaymentWords, refundWords, splitRefunds } from "@/lib/refunds-live";
import type { ApiOrderDeliveries } from "@/lib/sponsor-delivery-live";
import { canCancel, DEMO_LISTINGS, fmtStamp, orderRef, usd, type ApiOrder } from "@/lib/shop-live";
import type { ApiCatalogListing } from "@/lib/shop-showcase";
import { shopItem } from "@/lib/shop-window";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { supportContact } from "@/server/support";

import "../../shop/shop.css";
import "./order.css";

/* --------------------------------------------------------------------------
   Order — 2S4-FE-02, payment 2S5-FE-05. One marketplace order: its state,
   the order-progress tracker, lines, subtotal, fees and total, why BTG is
   reviewing it (if it is), BTG's decision notes, the payment (designs E1
   due / E2 confirming / E3 paid / E4 failed), the billing contact and
   order-terms acceptance recorded at checkout (2S4-FE-02) and Cancel. With
   ?placed=1 (checkout's redirect) it is the Confirmation step; ?payment=returned
   is the provider sending the browser back — the page reads the same API
   either way.

   POL-FE-94 (2026-11-16) — redrawn as the payment wizard's summary after the
   owner found the old page (a head, mini steps, tiles, a placed box, a
   status card, a banner, then a column of side cards) confusing. It now
   reads top to bottom, in checkout's Stadium look (./order.css):
     1 the board    what is happening now in one headline, the mark (a tick
                    that draws itself once placed or paid), the total, and
                    Placed → Approved → Paid → Delivered with dates;
     2 next step    the status in words, the ONE pay button, and what
                    happens after it;
     3 the order    what was bought, delivery, Invoice to · Payment · Terms,
                    and the order summary beside them (refunds, Cancel).
   components/sponsor-order/order-summary.tsx draws it; lib/order-summary.ts
   has the words for each state.

   Reads  GET /marketplace-orders/:id
          GET /marketplace-orders/:id/payment   (due, canPay, testProvider, latest attempt)
          GET /marketplace-orders/:id/deliveries  (each line's delivery; no shares)
          GET /marketplace/search/:listingId    per line, for its picture (the
                                                item's kind); a failure draws the
                                                plain tile, never a guess
   Writes (ShopCancelOrder → actions.ts)
          POST /marketplace-orders/:id/transition {to:"CANCELLED"} — the only
          move a sponsor may make, and only before payment.
          (OrderPayButton → payment-actions.ts)
          POST /marketplace-orders/:id/pay → redirect to the provider's page.
          (SponsorOrderDelivery → delivery-actions.ts, 2S4-FE-04/-06)
          POST /deliveries/:lineId/confirm · /problem · /problem-answer · /cancel

   2S4-FE-05 — the status words are order-automation-live's sponsorStatus
   (approved and due in 3 days / 1 day / the last day, waiting for the
   seller, declined, held for BTG, cancelled unpaid). 2S4-FE-06 — a seller
   cancelling a line (CX-5) and the Refunds list; POL-FE-06 — an extra
   payment going back is shown apart from the order's own refunds.

   While the provider confirms (latest PROCESSING) the page refreshes itself
   every 3s until the order is PAID. Honest gaps: no receipt or invoice link
   (the API returns none), no per-line fee breakdown for sponsors — the
   order's own feesCents is shown. Roles. SPONSOR_ADMIN may pay and cancel;
   SPONSOR_ANALYST reads.

   `?demo=sample&as=placed|seller|btg|due|held|confirming|failed|paid|delivered|cancelled`
   draws a sample order in that state; nothing on it pays or cancels.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

/** The line's item kind, for its lit tile; the plain tile when the item can't be read. */
async function kindOf(listingId: string, today: string): Promise<OrderLineKind> {
  try {
    const res = await apiFetch(`/marketplace/search/${encodeURIComponent(listingId)}`);
    if (!res.ok) return { kind: null, kindLabel: null };
    const item = shopItem((await res.json()) as ApiCatalogListing, today);
    return { kind: item.kind, kindLabel: item.kindLabel };
  } catch {
    return { kind: null, kindLabel: null };
  }
}

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
  const sample = sp.demo === "sample";
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const back = (
    <Link href="/sponsor/orders" className="text-xs text-muted hover:text-text">
      ← All orders
    </Link>
  );

  let o: ApiOrder;
  let payment: ApiOrderPayment | null;
  let deliveries: ApiOrderDeliveries | null;
  let supportEmail: string | null = null;
  let kinds: Record<string, OrderLineKind>;
  let placed = sp.placed === "1";

  if (sample) {
    const as = sampleAs(sp.as);
    const s = sampleOrder(as, now.getTime());
    o = s.order;
    payment = s.payment;
    deliveries = null;
    placed = as === "placed";
    kinds = Object.fromEntries(
      o.lines.map((l) => {
        const r = DEMO_LISTINGS.find((d) => d.id === l.listingId);
        const item = r ? shopItem(r, today) : null;
        return [l.id, { kind: item?.kind ?? null, kindLabel: item?.kindLabel ?? null }];
      }),
    );
  } else {
    const [res, payRes, deliveryRes, support] = await Promise.all([
      apiFetch(`/marketplace-orders/${encodeURIComponent(id)}`),
      apiFetch(`/marketplace-orders/${encodeURIComponent(id)}/payment`).catch(() => null),
      apiFetch(`/marketplace-orders/${encodeURIComponent(id)}/deliveries`).catch(() => null),
      /* POL-FE-31 — the support address a failed card payment points to. */
      supportContact(),
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
    o = (await res.json()) as ApiOrder;
    /* A failed payment read degrades the payment to "couldn't be loaded", never the page. */
    payment = payRes?.ok ? ((await payRes.json()) as ApiOrderPayment) : null;
    /* Delivery rows exist from contract time; a failed read hides the section, never the page. */
    deliveries = deliveryRes?.ok ? ((await deliveryRes.json()) as ApiOrderDeliveries) : null;
    supportEmail = support.email;
    /* One read per distinct item, for its picture — an order is a handful of lines. */
    const ids = [...new Set(o.lines.map((l) => l.listingId))];
    const byListing = new Map(await Promise.all(ids.map(async (lid) => [lid, await kindOf(lid, today)] as const)));
    kinds = Object.fromEntries(o.lines.map((l) => [l.id, byListing.get(l.listingId) ?? { kind: null, kindLabel: null }]));
  }

  /* 2S4-FE-07 — Deal Chat: a chat per seller on this order (none on a sample, or with the switch off). A failed read hides the card, never the page. */
  /* `?demo=sample&as=chat` shows the stage with a sample chat and the round Messages button. */
  const sampleDeal = sample && sampleAs(sp.as) === "chat" ? sampleChats(now.getTime(), "SPONSOR") : null;
  const dealChats = sampleDeal ? sampleDeal.slice(0, 1).map(chatRow) : sample ? [] : await dealChatRows(undefined, o.id).catch(() => []);

  const pay = paymentView(o.state, payment, { supportEmail });
  const status = sponsorStatus(o, pay.kind, now);
  const badge = sponsorBadge(o, pay.kind, now);
  /* A cancelled line never delivers — out of the count entirely, or a partly-cancelled order reads as worse than it is. */
  const live = (deliveries?.lines ?? []).filter((l) => l.state !== "CANCELLED");
  const delivered = live.length ? { done: live.filter((l) => l.state === "CONFIRMED").length, total: live.length } : null;
  const hero = orderHero(o, pay.kind, placed);
  const journey = orderJourney(o, pay.kind, delivered);
  /* 2S4-FE-06 — a seller cancelled a line and its refund is on its way (CX-5). */
  const sellerCancels = (deliveries?.lines ?? []).flatMap((l) => {
    const b = sellerCancelledBanner(l);
    return b ? [{ id: l.lineId, ...b }] : [];
  });
  /* POL-FE-06 — an extra payment (paid twice, or after the refund) going back is shown apart from the order's own refunds. */
  const { own: refunds, extra: extraPayments } = splitRefunds(o.refunds ?? []);
  const lineTitle = new Map(o.lines.map((l) => [l.id, l.title]));

  return (
    <div className="space-y-6">
      {back}
      {/* Read time = this render: the order, payment and deliveries were all read just above. */}
      <StadiumHead title={`Order ${orderRef(o.id)}`} pill={sample ? "Sample data" : <StadiumUpdated iso={now.toISOString()} />} />

      <div className="sx-od">
        <OrderBoard
          hero={hero}
          order={o}
          stops={journey.stops}
          fill={journey.fill}
          payStatus={pay.kind === "none" ? null : pay.status}
          payTone={pay.tone}
          badge={badge ? <StatePill p={badge} /> : null}
        />

        <OrderNextCard order={o} status={status} pay={pay} payment={payment} steps={whatNext(o, pay.kind)} canWrite={canWrite} sample={sample} />

        {/* 2S4-FE-07 — the order's deal chats, one per seller: where each stands, and the way in. */}
        {dealChats.length > 0 && <OrderDealChats rows={dealChats} portal="sponsor" />}
        {sampleDeal && <ChatDock viewer={{ portal: "sponsor", guardian: false }} unread={0} sample={sampleDeal} />}

        {sellerCancels.map((b) => (
          <div key={b.id} role="status" className="sx-od-alert sx-stadium-in" data-tone="warn">
            <p className="sx-od-tag">{b.tag}</p>
            <p className="sx-od-alert-title">{b.title}</p>
            {b.quote && <p className="sx-od-quote">{b.quote}</p>}
          </div>
        ))}

        {o.decisionNotes && o.cancelReason !== "BTG_REJECTED" && (
          <div className="sx-od-alert sx-stadium-in">
            <p className="sx-od-tag">BTG&rsquo;s note{o.decidedAt ? ` · ${fmtStamp(o.decidedAt)}` : ""}</p>
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-text">{o.decisionNotes}</p>
          </div>
        )}

        <div className="sx-od-body">
          <div className="sx-od-main">
            <OrderItems lines={o.lines} kinds={kinds} />
            {deliveries && deliveries.lines.length > 0 && (
              <section className="sx-od-panel sx-stadium-panel sx-stadium-in" aria-label="Delivery">
                <SponsorOrderDelivery
                  orderId={o.id}
                  lines={deliveries.lines}
                  canWrite={canWrite}
                  now={now.toISOString()}
                  lineTotals={Object.fromEntries(o.lines.map((l) => [l.id, l.lineTotalCents]))}
                />
              </section>
            )}
            <OrderFacts order={o} pay={pay} />
          </div>

          <OrderSummary order={o} pay={pay} cancellable={canWrite && canCancel(o.state)} sample={sample}>
            {extraPayments.length > 0 && (
              <div className="sx-od-refunds" data-tone="warn">
                <p className="sx-od-tag">{extraPayments.length === 1 ? "An extra payment is going back to you" : "Extra payments are going back to you"}</p>
                <ul>
                  {extraPayments.map((r) => (
                    <li key={r.id}>{extraPaymentWords(r, "sponsor")}</li>
                  ))}
                </ul>
                <p className="sx-od-fact-more">Your order stands as it is — this is the extra payment only. It goes back the way you paid.</p>
              </div>
            )}
            {refunds.length > 0 && (
              <div className="sx-od-refunds">
                <p className="sx-od-tag">Refunds</p>
                <ul>
                  {refunds.map((r) => {
                    const w = refundWords(r);
                    return (
                      <li key={r.id}>
                        <span className="sx-od-refund-row">
                          <span>{r.lineId ? lineTitle.get(r.lineId) ?? "A line" : refunds.some((x) => x.lineId) ? "The rest of the order" : "The whole order"}</span>
                          <b>{usd(r.amountCents)}</b>
                        </span>
                        <span className="sx-od-refund-state" data-tone={w.tone}>
                          <span aria-hidden="true">{w.mark}</span> {w.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </OrderSummary>
        </div>
      </div>
    </div>
  );
}

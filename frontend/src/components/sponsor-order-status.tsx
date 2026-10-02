import Link from "next/link";

import { OrderPayButton } from "@/components/order-payment";
import { BOX, DeadlineChip } from "@/components/order-bits";
import type { StatusCard } from "@/lib/order-automation-live";
import { PAY_NOTE, NOT_CONNECTED_NOTE, stripeCta } from "@/lib/order-payment-live";

/* --------------------------------------------------------------------------
   2S4-FE-05 — the status card at the top of the sponsor's order page
   (SponsorOrderUpdates.dc.html, views auto · oneday · lastday · waiting ·
   declined · held · cancelled). The words are order-automation-live's
   `sponsorStatus`, from GET /marketplace-orders/:id (waitingOn, deadlineAt,
   paymentDueAt, cancelReason, sellerApprovals, spendingLimitCents).

   While payment is due the card carries the Stripe button itself
   (POST /marketplace-orders/:id/pay → the provider's page); the side card
   then shows the status only. A Sponsor Analyst sees why they can't pay.
   -------------------------------------------------------------------------- */

export function SponsorOrderStatus({ card, orderId, amount, canWrite, canPay, unavailable = false }: {
  card: StatusCard;
  orderId: string;
  /** "$1,000.00" — what the button pays. */
  amount: string;
  canWrite: boolean;
  /** The provider is connected (GET …/payment canPay). */
  canPay: boolean;
  /** The payment read failed — say so rather than blame the provider. */
  unavailable?: boolean;
}) {
  const t = BOX[card.tone];
  const cta = stripeCta(`Pay ${amount} by card`);
  return (
    <section role="status" aria-label="Order status" className={`flex flex-col gap-2.5 rounded-xl border px-4 py-4 sm:px-5 ${t.box}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${t.title}`}>{card.tag}</p>
      <h2 className="text-[17px] font-semibold leading-snug">{card.title}</h2>
      {card.text && <p className="text-[13px] leading-relaxed text-text/85">{card.text}</p>}
      {card.quote && <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed">{card.quote}</p>}
      {card.deadline && <DeadlineChip d={card.deadline} />}
      {card.pay && (
        canWrite ? (
          <div className="flex flex-col items-start gap-1.5">
            <OrderPayButton orderId={orderId} label={cta.label} ariaLabel={cta.ariaLabel} disabled={!canPay} />
            <p className="text-xs text-muted">
              {unavailable ? "The payment status couldn’t be loaded just now. Refresh the page in a minute." : canPay ? PAY_NOTE : NOT_CONNECTED_NOTE}
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            A Sponsor Admin in your organisation pays this order by card.
          </p>
        )
      )}
      {card.again && (
        <Link href="/sponsor/marketplace" className="inline-flex min-h-12 items-center justify-center self-start rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
          Order again
        </Link>
      )}
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ShopPaymentNote, ShopSteps } from "@/components/shop-bits";
import { ShopCheckoutActions, ShopReserveButton } from "@/components/shop-checkout";
import { ShopCountdown } from "@/components/shop-countdown";
import {
  fmtDay,
  fmtStamp,
  lineSummary,
  reservationCopy,
  usd,
  type ApiCart,
  type ApiReservation,
} from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Checkout — 2S4-FE-02. /sponsor/checkout?reservation=<id>: the 15-minute
   hold, reviewed, then placed as an order.

   Reads  GET /reservations/:id   state HELD | RELEASED | EXPIRED | CONVERTED
                                  (EXPIRED once past expiresAt), expiresAt
          GET /cart               the held lines and their total
                                  (a CONVERTED hold carries its orderId)
   Writes (ShopCheckoutActions → actions.ts)
          POST /marketplace-orders {reservationId}   → /sponsor/orders/:id?placed=1
          POST /reservations/:id/release             → /sponsor/cart
          POST /cart/reserve ("hold again" after a hold ends)

   Steps follow the design (Commerce.dc) but ONLY what the API supports:
   Review → Place order → Confirmation. Honest gaps, shown as such:
     - no contract / order-agreement step — placeOrder involves no agreement;
     - no payment — no payment provider exists, so the payment step is an
       inert note ("BTG will invoice you") and no card / PO fields are asked;
     - no billing-contact step — the API has no billing fields;
     - no fee or total preview — the fee rate and approval threshold are not
       exposed, so the cart total is shown as the subtotal, fees added when
       the order is placed.
   Roles. SPONSOR_ADMIN places and releases; SPONSOR_ANALYST reads only.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");
  const sp = await searchParams;
  const reservationId = typeof sp.reservation === "string" && sp.reservation ? sp.reservation : null;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Checkout</h1>
        <p className="mt-1 text-xs text-muted">Review what&rsquo;s held for you, then place the order.</p>
      </div>
    </div>
  );

  if (!reservationId) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="clock"
          title="Nothing is held for checkout"
          hint="Checkout starts from the cart: “Reserve & check out” holds the items for 15 minutes."
          action={{ label: "Go to the cart", href: "/sponsor/cart" }}
        />
      </div>
    );
  }

  const rRes = await apiFetch(`/reservations/${encodeURIComponent(reservationId)}`);
  if (rRes.status === 403 || rRes.status === 404) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="clock"
          title="This hold isn't available"
          hint="It doesn't exist, or it belongs to another sponsor. Start again from your cart."
          action={{ label: "Go to the cart", href: "/sponsor/cart" }}
        />
      </div>
    );
  }
  if (!rRes.ok) throw new Error(`Reservation unavailable (${rRes.status}).`);
  const hold = (await rRes.json()) as ApiReservation;

  /* Held and placed: the order is where the buyer goes now. */
  if (hold.state === "CONVERTED") {
    if (hold.orderId) redirect(`/sponsor/orders/${encodeURIComponent(hold.orderId)}`);
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="This hold became an order"
          hint="The order was placed. Find it in your orders."
          action={{ label: "Go to orders", href: "/sponsor/orders" }}
        />
      </div>
    );
  }

  const cRes = await apiFetch("/cart");
  if (!cRes.ok && cRes.status !== 403) throw new Error(`Cart unavailable (${cRes.status}).`);
  const cart = cRes.ok ? ((await cRes.json()) as { cart: ApiCart | null }).cart : null;
  const lines = cart && cart.id === hold.cartId ? cart : null;
  const copy = reservationCopy(hold.state);
  const serverNow = new Date().getTime();

  return (
    <div className="space-y-6">
      {heading}
      <ShopSteps active="review" />

      {hold.state === "HELD" && (
        <Card className="border-accent/30 bg-accent/8">
          <p className="text-xs text-accent">
            Held for you until {fmtStamp(hold.expiresAt)} · <ShopCountdown expiresAt={hold.expiresAt} serverNow={serverNow} />{" "}
            left · nobody else can buy these while the hold lasts.
          </p>
        </Card>
      )}
      {hold.state === "EXPIRED" && (
        <Card className="space-y-3 border-warn/30 bg-warn/8">
          <p className="text-xs text-warn">
            Your hold ended at {fmtStamp(hold.expiresAt)}. The items went back on sale, but your cart is still here.
            Nothing was charged.
          </p>
          {canWrite && lines && <ShopReserveButton label="Hold again for 15 minutes" />}
        </Card>
      )}
      {hold.state === "RELEASED" && (
        <Card className="border-line bg-surface-2">
          <p className="text-xs text-muted">
            This hold was released{hold.releasedAt ? ` at ${fmtStamp(hold.releasedAt)}` : ""} and the items went back on
            sale. Your cart is editable again.{" "}
            <Link href="/sponsor/cart" className="font-medium text-primary underline">
              Back to the cart →
            </Link>
          </p>
        </Card>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">What you&rsquo;re buying</h2>
            <Badge tone={copy.tone}>{copy.label}</Badge>
          </div>
          {lines ? (
            <ul className="space-y-2">
              {lines.lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{l.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {l.propertyName} · {l.quantity} × {usd(l.unitPriceCents)} · {fmtDay(l.startsOn)} – {fmtDay(l.endsOn)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{usd(l.lineTotalCents)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted">
              The cart for this hold is no longer open, so its lines can&rsquo;t be shown.{" "}
              <Link href="/sponsor/cart" className="text-primary underline">
                Go to the cart
              </Link>
            </p>
          )}
          {lines && hold.state === "HELD" && (
            <Link
              href="/sponsor/cart"
              className="inline-block text-xs text-muted hover:text-text"
            >
              ← Back to cart
            </Link>
          )}
        </section>

        <aside className="mt-5 space-y-3 lg:mt-0">
          {lines && (
            <Card className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Summary</p>
              <p className="text-xs text-muted">{lineSummary(lines.lines)}</p>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">Subtotal</span>
                <span className="text-lg font-semibold tabular-nums">{usd(lines.totalCents)}</span>
              </div>
              <p className="text-[11px] text-faint">Fees are added when the order is placed.</p>
              {hold.state === "HELD" &&
                (canWrite ? (
                  <ShopCheckoutActions reservationId={hold.id} />
                ) : (
                  <p className="text-[11px] text-muted">A Sponsor Admin places the order.</p>
                ))}
              <p className="text-[11px] text-faint">
                BTG may review some orders before confirming them. If this one needs review, the order page says why.
              </p>
            </Card>
          )}
          <ShopPaymentNote />
        </aside>
      </div>
    </div>
  );
}

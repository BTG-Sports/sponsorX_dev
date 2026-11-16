import { redirect } from "next/navigation";

import { CheckoutItems, CheckoutState, CheckoutSummary, CheckoutWizard, type CheckoutLine } from "@/components/sponsor-checkout/checkout-wizard";
import { StadiumHead } from "@/components/stadium-stage";
import { limitLine, quoteFor, type ApiCheckout } from "@/lib/checkout-gate";
import { DEMO_LISTINGS, fmtStamp, lineSummary, usd, type ApiCart, type ApiCartLine, type ApiReservation } from "@/lib/shop-live";
import type { ApiCatalogListing } from "@/lib/shop-showcase";
import { shopItem } from "@/lib/shop-window";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { viewerContact } from "@/server/viewer";

import "../shop/shop.css";
import "./checkout.css";

/* --------------------------------------------------------------------------
   Checkout and contract gate — on the Stadium Board (P1-ART-23 Task 14, spec
   2026-10-11 §7.9, 2S4-FE-02). /sponsor/checkout?reservation=<id>: the
   15-minute hold, reviewed, the billing contact confirmed, the order terms
   accepted, then placed as an order.

   POL-FE-93 (2026-11-16) — redrawn as a step-by-step wizard after the owner
   found the page, with every section open at once, confusing. One step at
   a time, in the cart's Stadium look (./checkout.css):
   Items → Invoice → Terms → Place order, with the total and the hold's
   clock on the board above and the order summary beside it.
   components/sponsor-checkout/checkout-wizard.tsx draws it;
   lib/checkout-wizard.ts has the steps' words and rules.

   Reads  GET /reservations/:id   state HELD | RELEASED | EXPIRED | CONVERTED
                                  (EXPIRED once past expiresAt), expiresAt;
                                  a live hold's `checkout` — the tenant's
                                  MARKETPLACE_ORDER terms (body + hash), the
                                  sponsor's name, the primary contact to
                                  prefill billing with (POL-FE-47: none →
                                  the signed-in person, Clerk currentUser()),
                                  the `quote` (POL-FE-05: subtotal, fees,
                                  total) and the spending limit (POL-FE-72)
          GET /cart               the held lines, their sum and the same
                                  `quote` (a CONVERTED hold carries its orderId)
          GET /marketplace/search/:id   per line, for its picture (the item's
                                  kind); a failure draws the plain tile,
                                  never a guess. A hold is a handful of lines.
   Writes (checkout-wizard.tsx → actions.ts, unchanged)
          POST /marketplace-orders {reservationId, agreementId, bodyHashShown,
                                    billing{name, email, reference?},
                                    totalCentsShown}
                                  → /sponsor/orders/:id?placed=1
                                  409 total_changed → the quote is re-read
          POST /reservations/:id/release             → /sponsor/cart
          POST /cart/reserve ("hold again" after a hold ends)

   The API refuses an order without the acceptance or the billing contact
   (422) and re-checks the terms' fingerprint itself (409 on a mismatch).
   Payment is full payment by card on the order page, after approval — no
   card or bank details are asked at checkout.

   `?demo=sample` draws a sample checkout from the shop's demo deck: it can
   be clicked through, and nothing is held, released or placed.
   Roles. SPONSOR_ADMIN places and releases; SPONSOR_ANALYST reads only.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

/** A line with the item's kind, for its lit tile; null when the item can't be read. */
async function withKind(line: ApiCartLine, today: string): Promise<CheckoutLine> {
  try {
    const res = await apiFetch(`/marketplace/search/${encodeURIComponent(line.listingId)}`);
    if (!res.ok) return { ...line, kind: null, kindLabel: null };
    const item = shopItem((await res.json()) as ApiCatalogListing, today);
    return { ...line, kind: item.kind, kindLabel: item.kindLabel };
  } catch {
    return { ...line, kind: null, kindLabel: null };
  }
}

const SAMPLE_TERMS = `SAMPLE — Marketplace order terms

1. What you're buying. The items listed in this order, for the dates shown, from the sellers named.

2. Approval. Orders within your spending limit are approved straight away, unless a seller asks to accept first (they have 48 hours). Orders above your limit are checked by BTG first.

3. Payment. You pay the full total by card from the order page, on the payment provider's own page, within 3 days of approval. Nothing is charged when the order is placed.

4. Cancelling. You may cancel before you pay; the items go back on sale.

This is sample wording for the sample checkout only. The real order terms are shown on a live checkout.`;

/** The sample checkout: three items from the shop's demo deck, a 5% fee, a fresh 15-minute hold. */
function sampleCheckout(now: number, today: string) {
  const picks: Array<[string, number, number, number]> = [
    ["demo-1", 2, 3, 9],
    ["demo-2", 1, 10, 10],
    ["demo-3", 1, 14, 14],
  ];
  const base = new Date(now);
  const day = (n: number) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + n)).toISOString();
  const lines: CheckoutLine[] = picks.flatMap(([id, quantity, a, b], k) => {
    const r = DEMO_LISTINGS.find((l) => l.id === id);
    if (!r) return [];
    const item = shopItem(r, today);
    return [
      {
        id: `demo-line-${k}`,
        listingId: r.id,
        quantity,
        startsOn: day(a),
        endsOn: day(b),
        unitPriceCents: r.item.priceCents,
        title: r.title,
        propertyName: r.property?.name ?? null,
        sellerName: r.property?.name ?? null,
        lineTotalCents: quantity * r.item.priceCents,
        kind: item.kind,
        kindLabel: item.kindLabel,
      },
    ];
  });
  const sub = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const fee = Math.round(sub * 0.05);
  const checkout: ApiCheckout = {
    terms: { id: "demo-terms", kind: "MARKETPLACE_ORDER", version: 1, bodyHash: "sha256:demo", body: SAMPLE_TERMS },
    sponsorName: "Your company",
    billingContact: null,
    paymentsOpen: true,
    quote: { currency: "USD", subtotalCents: sub, feesCents: fee, totalCents: sub + fee },
    spendingLimitCents: 500_000,
  };
  return { lines, checkout, expiresAt: new Date(now + 15 * 60_000).toISOString() };
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");
  const sp = await searchParams;
  const reservationId = typeof sp.reservation === "string" && sp.reservation ? sp.reservation : null;
  const serverNow = new Date().getTime();
  const today = new Date(serverNow).toISOString().slice(0, 10);

  const head = (pill?: string) => <StadiumHead title="Checkout" pill={pill} />;
  const toCart = { href: "/sponsor/cart", label: "Go to your cart", primary: true };

  if (sp.demo === "sample") {
    const s = sampleCheckout(serverNow, today);
    const quote = quoteFor(s.checkout.quote, 0);
    return (
      <div className="space-y-6">
        {head("Sample data")}
        <CheckoutWizard
          reservationId="demo-hold"
          expiresAt={s.expiresAt}
          serverNow={serverNow}
          lines={s.lines}
          sellers={lineSummary(s.lines)}
          quote={quote}
          limit={limitLine(quote.totalCents, s.checkout.spendingLimitCents, usd)}
          checkout={s.checkout}
          viewer={await viewerContact()}
          sample
        />
      </div>
    );
  }

  if (!reservationId) {
    return (
      <div className="space-y-6">
        {head()}
        <CheckoutState
          mark="clock"
          title="Nothing is held for checkout"
          text="Checkout starts from your cart: press Check out there, and we hold the items for you for 15 minutes while you finish."
          links={[toCart]}
        />
      </div>
    );
  }

  const rRes = await apiFetch(`/reservations/${encodeURIComponent(reservationId)}`);
  if (rRes.status === 403 || rRes.status === 404) {
    return (
      <div className="space-y-6">
        {head()}
        <CheckoutState
          mark="lock"
          title="This hold isn't available"
          text="It doesn't exist, or it belongs to another sponsor. Start again from your cart."
          links={[toCart]}
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
        {head()}
        <CheckoutState
          mark="doc"
          title="This hold became an order"
          text="The order was placed. You'll find it in your orders."
          links={[{ href: "/sponsor/orders", label: "Go to your orders", primary: true }]}
        />
      </div>
    );
  }

  const cRes = await apiFetch("/cart");
  if (!cRes.ok && cRes.status !== 403) throw new Error(`Cart unavailable (${cRes.status}).`);
  const cart = cRes.ok ? ((await cRes.json()) as { cart: ApiCart | null }).cart : null;
  const held = cart && cart.id === hold.cartId ? cart : null;

  if (hold.state === "EXPIRED") {
    return (
      <div className="space-y-6">
        {head()}
        <CheckoutState
          mark="clock"
          tone="late"
          title="Your hold has ended"
          text={`It ended at ${fmtStamp(hold.expiresAt)}, and the items went back on sale. Nothing was charged, and your cart is still here.${held && canWrite ? " Hold them again if they're still available." : ""}`}
          holdAgain={Boolean(held && canWrite)}
          links={[{ ...toCart, label: "Back to your cart", primary: !(held && canWrite) }]}
        />
      </div>
    );
  }
  if (hold.state === "RELEASED") {
    return (
      <div className="space-y-6">
        {head()}
        <CheckoutState
          mark="lock"
          title="This hold was released"
          text={`It was released${hold.releasedAt ? ` at ${fmtStamp(hold.releasedAt)}` : ""} and the items went back on sale. Nothing was charged, and your cart can be changed again.`}
          links={[{ ...toCart, label: "Back to your cart" }]}
        />
      </div>
    );
  }
  if (!held) {
    return (
      <div className="space-y-6">
        {head()}
        <CheckoutState
          mark="lock"
          title="These items can't be shown"
          text="The cart for this hold is no longer open, so its items can't be shown here. Start again from your cart."
          links={[toCart]}
        />
      </div>
    );
  }

  const lines = await Promise.all(held.lines.map((l) => withKind(l, today)));
  /* POL-FE-05 — the total charged, from the hold's quote (or the cart's, the same figures). */
  const quote = quoteFor(hold.checkout?.quote ?? held.quote, held.totalCents);
  /* POL-FE-72 — the spending limit beside the total. */
  const limit = limitLine(quote.totalCents, hold.checkout?.spendingLimitCents, usd);

  if (!canWrite || !hold.checkout) {
    return (
      <div className="space-y-6">
        {head()}
        <div className="sx-co">
          <CheckoutState
            mark={canWrite ? "lock" : "eye"}
            title={canWrite ? "Checkout can't open right now" : "These items are held for your team"}
            text={
              canWrite
                ? "The hold stands, but checkout couldn't be loaded. Reload the page in a moment, or go back to your cart."
                : `They're held until ${fmtStamp(hold.expiresAt)}. A Sponsor Admin on your team places the order; you can see what's in it below.`
            }
            links={[{ ...toCart, label: "Back to your cart", primary: false }]}
          />
          <div className="sx-co-body">
            <section className="sx-stadium-panel sx-stadium-in p-4" aria-label="What's held">
              <CheckoutItems lines={lines} />
            </section>
            <CheckoutSummary lines={lines} quote={quote} limit={limit} />
          </div>
        </div>
      </div>
    );
  }

  /* POL-FE-47 — with no contact on file, billing starts from the signed-in person (Clerk). */
  const viewer = hold.checkout.billingContact ? null : await viewerContact();

  return (
    <div className="space-y-6">
      {head()}
      <CheckoutWizard
        reservationId={hold.id}
        expiresAt={hold.expiresAt}
        serverNow={serverNow}
        lines={lines}
        sellers={lineSummary(held.lines)}
        quote={quote}
        limit={limit}
        checkout={hold.checkout}
        viewer={viewer}
      />
    </div>
  );
}

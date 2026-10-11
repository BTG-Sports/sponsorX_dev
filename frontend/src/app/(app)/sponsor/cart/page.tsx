import Link from "next/link";

import { EmptyState } from "@/components/states";
import { ShopCartLine } from "@/components/shop-cart-line";
import { ShopReserveButton } from "@/components/shop-checkout";
import { StadiumHead, StadiumPanel, StadiumUpdated } from "@/components/stadium-stage";
import { fmtStamp, lineSummary, usd, type ApiCart } from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Cart — on the Stadium Board (P1-ART-23 Task 14, spec 2026-10-11 §7.9,
   2S4-FE-01). The sponsor's open cart: lines with quantity and dates
   editable, remove, the total, and the cart's sliding 24-hour expiry.
   "Reserve & check out" holds exactly these lines for 15 minutes and opens
   checkout.

   Reads  GET /cart                     ({cart: null} → the empty state;
                                        activeReservation → the frozen state)
   Writes (ShopCartLine / ShopReserveButton → actions.ts)
          PATCH /cart/lines/:id, DELETE /cart/lines/:id, POST /cart/reserve

   A held cart is frozen: the API refuses line edits with 409 while a hold is
   live, and GET /cart names that hold, so the page shows the freeze and links
   to its checkout.

   Bounded, not paged — a cart never grows past what one sponsor is about to
   buy (memory: pagination-pattern).

   Roles. SPONSOR_ADMIN edits and reserves; SPONSOR_ANALYST reads only.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");
  const updatedAt = new Date().toISOString();

  const actions = (
    <>
      <Link href="/sponsor/shop" className="text-xs font-medium text-muted hover:text-text">
        ← Keep shopping
      </Link>
      <Link href="/sponsor/orders" className="text-xs font-medium text-muted hover:text-text">
        Orders →
      </Link>
    </>
  );

  const res = await apiFetch("/cart");
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        <StadiumHead title="Your cart" pill={<StadiumUpdated iso={updatedAt} />} actions={actions} />
        <EmptyState
          mark="users"
          title="The cart isn't open to this account"
          hint="A cart belongs to a sponsor organisation. Ask BTG to link your account to yours."
        />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Cart unavailable (${res.status}).`);
  const { cart } = (await res.json()) as { cart: ApiCart | null };

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="space-y-6">
        <StadiumHead title="Your cart" pill={<StadiumUpdated iso={updatedAt} />} actions={actions} />
        <StadiumPanel delay={0.1} className="text-center">
          <p className="text-base font-semibold text-text">Your cart is empty</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Add items from the shop. A cart is kept for 24 hours after its last change.
          </p>
          <Link href="/sponsor/shop" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold text-cta-ink">
            Browse the shop →
          </Link>
        </StadiumPanel>
      </div>
    );
  }

  /* The frozen state: the cart's live hold, if any. */
  const hold = cart.activeReservation;
  const editable = canWrite && !hold;

  return (
    <div className="space-y-6">
      <StadiumHead title="Your cart" pill={<StadiumUpdated iso={updatedAt} />} actions={actions} />

      {hold && (
        <StadiumPanel tone="you" delay={0.08}>
          <p className="text-sm text-text">
            These items are held for you until {fmtStamp(hold.expiresAt)}, so the cart is frozen — nobody else can buy
            them while the hold lasts.{" "}
            <Link href={`/sponsor/checkout?reservation=${encodeURIComponent(hold.id)}`} className="font-semibold underline">
              Continue to checkout →
            </Link>
          </p>
        </StadiumPanel>
      )}
      {!canWrite && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
          You&rsquo;re signed in as a Sponsor Analyst — you can read the cart; a Sponsor Admin changes it and checks out.
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <StadiumPanel flush delay={0.14}>
          <ul>
            {cart.lines.map((l, i) => (
              <ShopCartLine key={`${l.id}-${l.quantity}-${l.startsOn}-${l.endsOn}`} line={l} editable={editable} i={i} />
            ))}
          </ul>
        </StadiumPanel>

        <aside className="mt-5 space-y-3 lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <StadiumPanel delay={0.22}>
            <p className="text-[11px] uppercase tracking-wide text-muted">Summary</p>
            <p className="mt-1 text-xs text-muted">{lineSummary(cart.lines)}</p>
            <div className="mt-3 space-y-1.5 border-t border-line-soft pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">Subtotal</span>
                <span className="text-sm font-semibold tabular-nums text-text">{usd(cart.totalCents)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">Fees</span>
                <span className="text-[11px] text-faint">Added when you place the order</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line-soft pt-1.5">
                <span className="text-xs font-semibold text-text">Total so far</span>
                <span className="text-lg font-semibold tabular-nums text-text">{usd(cart.totalCents)}</span>
              </div>
            </div>
            {canWrite && !hold && (
              <div className="mt-3">
                <ShopReserveButton />
              </div>
            )}
            <p className="mt-2 text-[11px] text-faint">
              Reserving holds these items for 15 minutes while you check out. If the hold ends they go back on sale, and
              you can hold them again if they&rsquo;re still available.
            </p>
          </StadiumPanel>
          <p className="px-1 text-[11px] text-faint">Cart kept until {fmtStamp(cart.expiresAt)} — every change extends it 24 hours.</p>
        </aside>
      </div>
    </div>
  );
}

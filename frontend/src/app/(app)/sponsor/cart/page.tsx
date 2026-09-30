import Link from "next/link";

import { Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ShopCartLine } from "@/components/shop-cart-line";
import { ShopReserveButton } from "@/components/shop-checkout";
import { fmtStamp, lineSummary, usd, type ApiCart } from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Cart — 2S4-FE-01. The sponsor's open cart: lines with quantity and dates
   editable, remove, the total, and the cart's sliding 24-hour expiry. "Reserve
   & check out" holds exactly these lines for 15 minutes and opens checkout.

   Reads  GET /cart                     ({cart: null} → the empty state;
                                        activeReservation → the frozen state)
   Writes (ShopCartLine / ShopReserveButton → actions.ts)
          PATCH /cart/lines/:id, DELETE /cart/lines/:id, POST /cart/reserve

   A held cart is frozen: the API refuses line edits with 409 while a hold is
   live, and GET /cart names that hold, so the page shows the freeze and links
   to its checkout.

   Roles. SPONSOR_ADMIN edits and reserves; SPONSOR_ANALYST reads only.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cart</h1>
        <p className="mt-1 text-xs text-muted">Everything you&rsquo;re about to buy, before it&rsquo;s held for checkout.</p>
      </div>
      <div className="flex gap-3 text-xs">
        <Link href="/sponsor/shop" className="text-primary hover:underline">
          ← Keep shopping
        </Link>
        <Link href="/sponsor/orders" className="text-primary hover:underline">
          Orders →
        </Link>
      </div>
    </div>
  );

  const res = await apiFetch("/cart");
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
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
        {heading}
        <EmptyState
          mark="inbox"
          title="Your cart is empty"
          hint="Add items from the shop. A cart is kept for 24 hours after its last change."
          action={{ label: "Go to the shop", href: "/sponsor/shop" }}
        />
      </div>
    );
  }

  /* The frozen state: the cart's live hold, if any. */
  const hold = cart.activeReservation;
  const editable = canWrite && !hold;

  return (
    <div className="space-y-6">
      {heading}

      {hold && (
        <Card className="border-accent/30 bg-accent/8">
          <p className="text-xs text-accent">
            These items are held for you until {fmtStamp(hold.expiresAt)}, so the cart is frozen — nobody else can buy
            them while the hold lasts.{" "}
            <Link href={`/sponsor/checkout?reservation=${encodeURIComponent(hold.id)}`} className="font-medium underline">
              Continue to checkout →
            </Link>
          </p>
        </Card>
      )}
      {!canWrite && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
          You&rsquo;re signed in as a Sponsor Analyst — you can read the cart; a Sponsor Admin changes it and checks out.
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <ul className="space-y-3">
          {cart.lines.map((l) => (
            <ShopCartLine key={`${l.id}-${l.quantity}-${l.startsOn}-${l.endsOn}`} line={l} editable={editable} />
          ))}
        </ul>

        <aside className="mt-5 space-y-3 lg:mt-0">
          <Card className="space-y-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Summary</p>
            <p className="text-xs text-muted">{lineSummary(cart.lines)}</p>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">Subtotal</span>
              <span className="text-lg font-semibold tabular-nums">{usd(cart.totalCents)}</span>
            </div>
            <p className="text-[11px] text-faint">Fees are added when the order is placed.</p>
            {canWrite && !hold && <ShopReserveButton />}
            <p className="text-[11px] text-faint">
              Reserving holds these items for 15 minutes while you check out. If the hold ends they go back on sale, and
              you can hold them again if they&rsquo;re still available.
            </p>
          </Card>
          <p className="px-1 text-[11px] text-faint">Cart kept until {fmtStamp(cart.expiresAt)} — every change extends it 24 hours.</p>
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { CartBoard, CartEmpty, type CartMode } from "@/components/sponsor-cart/cart-board";
import { EmptyState } from "@/components/states";
import { StadiumGhost, StadiumHead, StadiumUpdated } from "@/components/stadium-stage";
import type { CartBoardLine, CartLineInfo } from "@/lib/cart-board";
import { quoteFor } from "@/lib/checkout-gate";
import type { SearchParams } from "@/lib/list-query";
import { DEMO_LISTINGS, lineSummary, type ApiCart, type ApiCartLine } from "@/lib/shop-live";
import type { ApiCatalogListing } from "@/lib/shop-showcase";
import { shopItem } from "@/lib/shop-window";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "../shop/shop.css";
import "./cart.css";

/* --------------------------------------------------------------------------
   Cart — on the Stadium Board (P1-ART-23 Task 14, spec 2026-10-11 §7.9,
   2S4-FE-01).

   POL-FE-92 (2026-11-16) — redrawn as a plain shop cart after the owner
   found the last one confusing ("what you did before is so confusing for a
   human"), in the shop window's own Stadium look (../shop/shop.css). The
   board says the total and has ONE Check out; the three stops say what
   happens (review → held 15 minutes → place the order, nothing charged
   until then); each item has a − / + stepper and its dates as one button,
   and saves by itself; the order summary sits beside it.
   components/sponsor-cart/cart-board.tsx draws it; lib/cart-board.ts has
   the words and figures.

   Reads  GET /cart                       ({cart: null} → the empty state;
                                          activeReservation → the frozen state;
                                          `quote` → subtotal, fees and the total
                                          placing it charges — POL-FE-05)
          GET /marketplace/search/:id     per line, for its picture (the
                                          item's kind), its date window and
                                          how many there are. 403/404 → "no
                                          longer in the shop"; any other
                                          failure → drawn without, never
                                          guessed. A cart is a handful of
                                          lines (bounded, not paged — memory:
                                          pagination-pattern).
   Writes (cart-board.tsx → actions.ts, unchanged)
          PATCH /cart/lines/:id, DELETE /cart/lines/:id, POST /cart/reserve

   A held cart is frozen: the API refuses line edits with 409 while a hold is
   live, and GET /cart names that hold, so the page shows the freeze, a live
   countdown, and links to its checkout.

   `?demo=sample` draws a sample cart from the shop's demo deck, read-only
   (nothing is saved); `?demo=empty` / `?demo=loading` the other states.

   Roles. SPONSOR_ADMIN edits and checks out; SPONSOR_ANALYST reads only.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function lineInfo(line: ApiCartLine, today: string): Promise<CartLineInfo | null> {
  try {
    const res = await apiFetch(`/marketplace/search/${encodeURIComponent(line.listingId)}`);
    if (res.status === 403 || res.status === 404) return { gone: true };
    if (!res.ok) return null;
    const item = shopItem((await res.json()) as ApiCatalogListing, today);
    return { gone: false, kind: item.kind, kindLabel: item.kindLabel, who: item.who, initials: item.initials, window: item.window, maxQty: item.maxQty };
  } catch {
    return null;
  }
}

/** A sample cart from the shop's demo deck — what a sponsor's cart looks like. */
function sampleCart(now: number, today: string): { cart: ApiCart; lines: CartBoardLine[] } {
  const picks: Array<[string, number, number, number]> = [
    ["demo-1", 2, 3, 9],
    ["demo-2", 1, 10, 10],
    ["demo-3", 1, 14, 14],
  ];
  const day = (n: number) => new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + n)).toISOString();
  const lines: CartBoardLine[] = picks.flatMap(([id, quantity, a, b], k) => {
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
        info: { gone: false, kind: item.kind, kindLabel: item.kindLabel, who: item.who, initials: item.initials, window: { availableFrom: null, availableUntil: null }, maxQty: item.maxQty },
      },
    ];
  });
  const sub = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const fee = Math.round(sub * 0.05);
  const cart: ApiCart = {
    id: "demo-cart",
    sponsorId: "demo",
    currency: "USD",
    state: "ACTIVE",
    expiresAt: new Date(now + 21.5 * 3_600_000).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    lines,
    totalCents: sub,
    quote: { currency: "USD", subtotalCents: sub, feesCents: fee, totalCents: sub + fee },
    activeReservation: null,
  };
  return { cart, lines };
}

export default async function CartPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");
  const sp = await searchParams;
  const demo = Array.isArray(sp.demo) ? sp.demo[0] : sp.demo;
  const now = new Date().getTime();
  const updatedAt = new Date(now).toISOString();
  const today = updatedAt.slice(0, 10);

  const actions = (
    <>
      <Link href="/sponsor/shop" className="sx-sh-head-link">
        ← Keep shopping
      </Link>
      <Link href="/sponsor/orders" className="sx-sh-head-link">
        Your orders
      </Link>
    </>
  );
  const head = (pill: ReactNode = <StadiumUpdated iso={updatedAt} />) => <StadiumHead title="Your cart" pill={pill} actions={actions} />;

  if (demo === "loading") return <StadiumGhost label="Loading your cart" tiles={2} />;
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {head("Sample data")}
        <CartEmpty />
      </div>
    );
  }
  if (demo === "sample") {
    const { cart, lines } = sampleCart(now, today);
    return (
      <div className="space-y-6">
        {head("Sample data")}
        <CartBoard
          lines={lines}
          quote={quoteFor(cart.quote, cart.totalCents)}
          sellers={lineSummary(lines)}
          expiresAt={cart.expiresAt}
          hold={null}
          mode="sample"
          serverNow={now}
          today={today}
          notice={
            <p className="sx-sh-viewer">
              <Glyph ui="eye" className="size-4" />
              Sample cart — this is how a sponsor&rsquo;s cart looks. Nothing here is saved or held.
            </p>
          }
        />
      </div>
    );
  }

  const res = await apiFetch("/cart");
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {head()}
        <EmptyState mark="users" title="The cart isn't open to this account" hint="A cart belongs to a sponsor organisation. Ask BTG to link your account to yours." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Cart unavailable (${res.status}).`);
  const { cart } = (await res.json()) as { cart: ApiCart | null };

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="space-y-6">
        {head()}
        <CartEmpty />
      </div>
    );
  }

  const infos = await Promise.all(cart.lines.map((l) => lineInfo(l, today)));
  const lines: CartBoardLine[] = cart.lines.map((l, k) => ({ ...l, info: infos[k] }));

  /* The frozen state: the cart's live hold, if any. */
  const hold = cart.activeReservation;
  const mode: CartMode = !canWrite ? "view" : hold ? "held" : "edit";
  /* POL-FE-05 — the cart's own totalCents is the lines' sum; the quote adds BTG's buyer fee. */
  const quote = quoteFor(cart.quote, cart.totalCents);

  return (
    <div className="space-y-6">
      {head()}
      <CartBoard
        lines={lines}
        quote={quote}
        sellers={lineSummary(cart.lines)}
        expiresAt={cart.expiresAt}
        hold={hold}
        mode={mode}
        serverNow={now}
        today={today}
        notice={
          !canWrite ? (
            <p className="sx-sh-viewer">
              <Glyph ui="eye" className="size-4" />
              You&rsquo;re a Sponsor Viewer: you can see the cart. A Sponsor Admin on your team changes it and checks out.
            </p>
          ) : undefined
        }
      />
    </div>
  );
}

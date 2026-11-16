import Link from "next/link";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { ItemShowcase } from "@/components/athlete-inventory/item-showcase";
import { ShopItemBuy, type BuyMode } from "@/components/sponsor-shop/shop-window";
import { StadiumHead, StadiumPanel } from "@/components/stadium-stage";
import type { PublicAthlete } from "@/lib/public-athlete";
import { usd, type ApiCart } from "@/lib/shop-live";
import { catalogSeller, catalogShowcase, type ApiCatalogListing } from "@/lib/shop-showcase";
import { shopItem } from "@/lib/shop-window";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "../../../athlete/inventory/inventory.css";
import "../../../athlete/inventory/[id]/item.css";
import "../../../athlete/listings/[id]/listing.css";
import "../shop.css";
import "./item-stadium.css";

/* --------------------------------------------------------------------------
   One item in the shop — POL-FE-91. Sponsor portal.

   The owner (2026-11-16): "the view page must be a new page which shows what
   the athlete would show — we need to be consistent", with a screenshot of
   /athlete/listings/[id]. So this page IS that showcase: the athlete's own
   ItemShowcase component (the stage with the price tag and "Offered by",
   the title, the pitch, price and stock, Available / Stock / Status, what a
   package holds, "A good fit for", "Who you're working with" with reach and
   track record). What the athlete reads as "the way sponsors meet it" is
   now exactly what a sponsor meets. Only the bar on top is the sponsor's:
   back to the shop, where it stands, Add to cart and the cart. It is drawn
   in the Stadium's orange (./item-stadium.css re-points the showcase's
   tokens), never the Arena's blue (memory: portal-stage-identities).

   "View Athlete Profile" (the owner, 2026-11-16) opens the athlete's page
   INSIDE the portal (/sponsor/athletes/[slug], "inside the dashboard, not a
   new tab"), its way back returning to this item — only when that page is
   up. No private panel, no owner controls.

   Reads
     GET /marketplace/search/:id   the item, as the shop lists it — the same
                                   visibility; anything the shop wouldn't
                                   list is a 403, said as "not in the shop"
     GET /public/athletes/:slug    when the row carries a slug: photo,
                                   school, reach, track record — the answer
                                   every sponsor gets; missing → left out
     GET /cart                     the bar's "In your cart" and Cart count
   Writes  addToCartAction (POST /cart, POST /cart/lines), via ShopItemBuy.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function json<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default async function ShopItemPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePortalAccess("sponsor");
  const mode: BuyMode = actor.roles.includes("SPONSOR_ADMIN") ? "buy" : "view";
  const { id } = await params;

  const [res, cartAnswer] = await Promise.all([apiFetch(`/marketplace/search/${encodeURIComponent(id)}`), json<{ cart: ApiCart | null }>("/cart")]);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <StadiumHead
          title="Item"
          actions={
            <Link href="/sponsor/shop" className="sx-sh-head-link">
              ← Shop
            </Link>
          }
        />
        <StadiumPanel delay={0.1} className="p-5">
          <p className="text-sm font-semibold">This item isn&rsquo;t in the shop</p>
          <p className="mt-1 text-xs text-muted">It may have sold out, been paused by its seller, or the link is wrong. Everything you can buy is in the shop.</p>
          <Link href="/sponsor/shop" className="sx-sh-add mt-4">
            Back to the shop
          </Link>
        </StadiumPanel>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Shop item unavailable (${res.status}).`);
  const row = (await res.json()) as ApiCatalogListing;

  const pub = row.athleteSlug ? await json<PublicAthlete>(`/public/athletes/${encodeURIComponent(row.athleteSlug)}`) : null;
  const now = new Date().getTime();
  const today = new Date(now).toISOString().slice(0, 10);
  const item = shopItem(row, today);

  const lines = cartAnswer?.cart?.lines ?? [];
  const inCart: Record<string, number> = {};
  for (const l of lines) inCart[l.listingId] = (inCart[l.listingId] ?? 0) + l.quantity;
  const here = inCart[row.id] ?? 0;
  const status = item.soldOut
    ? { tone: "ended", label: "Sold out", note: "None left to buy right now. It comes back when the seller adds more." }
    : here > 0
      ? { tone: "live", label: "In your cart", note: `${here} in your cart. Change how many or the dates there, then check out.` }
      : { tone: "live", label: "On sale now", note: mode === "buy" ? "You can buy it now. Pick how many and which dates." : "Open to buy. A Sponsor Admin on your team adds to the cart." };
  const stops = [
    { key: "pick", label: "Pick it", state: here ? "done" : "now" },
    { key: "cart", label: "Cart", state: here ? "now" : "next" },
    { key: "out", label: "Check out", state: "next" },
  ];

  const bar = (
    <div className="sx-ld-top">
      <div className="sx-ld-bar sx-iv-rise" data-tone={status.tone} style={{ "--d": "0s" } as React.CSSProperties}>
        <Link href="/sponsor/shop" className="sx-is-back">
          <Glyph ui="back" className="size-4" />
          Shop
        </Link>
        <div className="sx-ld-bar-status">
          <span className="sx-ld-beacon-dot" aria-hidden="true">
            <Glyph ui={item.soldOut ? "ban" : "bolt"} className="size-4" />
          </span>
          <span className="min-w-0">
            <strong>{status.label}</strong>
            <span>{status.note}</span>
          </span>
        </div>
        <ol className="sx-ld-trail" aria-label="Buying it">
          {stops.map((s) => (
            <li key={s.key} data-state={s.state} aria-current={s.state === "now" ? "step" : undefined}>
              <span aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ol>
        <div className="sx-ld-bar-actions">
          <ShopItemBuy item={item} mode={mode} today={today} inCart={inCart} />
          <Link href="/sponsor/cart" className="sx-sh-head-link" aria-label={`Cart: ${lines.length} ${lines.length === 1 ? "item" : "items"}`}>
            Cart · {lines.length}
            {lines.length > 0 && cartAnswer?.cart ? ` · ${usd(cartAnswer.cart.totalCents)}` : ""}
          </Link>
        </div>
      </div>
      <p className="sx-ld-sponsor-view sx-is-bar-note sx-iv-rise" style={{ "--d": "0.08s" } as React.CSSProperties}>
        <Glyph ui="eye" className="size-3.5" />
        <span>Everything the seller offers with this item. Nothing is charged until you check out.</span>
      </p>
    </div>
  );

  return (
    <ItemShowcase
      id={row.item.id}
      s={catalogShowcase(row, now)}
      seller={catalogSeller(row, pub)}
      market={null}
      privatePanel={false}
      profileLink={row.athleteSlug ? { label: "View Athlete Profile", href: `/sponsor/athletes/${encodeURIComponent(row.athleteSlug)}?item=${encodeURIComponent(row.id)}` } : null}
      viewer="sponsor"
      fitsEmpty="Any kind of brand. The seller hasn't named the brands it suits best."
      bar={bar}
    />
  );
}

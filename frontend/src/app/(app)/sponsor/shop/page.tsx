import Link from "next/link";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { RoleCannotSee } from "@/components/not-in-role";
import { ServerList } from "@/components/server-pager";
import { ShopWindow, type BuyMode } from "@/components/sponsor-shop/shop-window";
import { StadiumGhost, StadiumHead, StadiumUpdated, at } from "@/components/stadium-stage";
import { demoState } from "@/lib/demo";
import { apiListQuery, pageParams, type PageInfo, type SearchParams } from "@/lib/list-query";
import {
  DEMO_CART,
  DEMO_LISTINGS,
  demoShopSearch,
  hasFilters,
  shopSearchExtras,
  shownFilters,
  usd,
  type ApiCart,
  type ApiSearchResult,
} from "@/lib/shop-live";
import { filterChips, shopItem } from "@/lib/shop-window";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "./shop.css";

/* --------------------------------------------------------------------------
   Shop — the sponsor's self-service buying (2S4-FE-01), on the Stadium Board.

   POL-FE-91 (2026-11-16) — redrawn as a shop window after the owner found the
   last one confusing ("what you did before is so confusing for a human"):
   the same shape as the athlete's Inventory and Listings (POL-FE-83/84),
   in the sponsor's own Stadium look. Top to bottom:
     1. the title, Orders, and the Cart button carrying its count and total;
        one strip saying how buying works (look → add → check out, nothing
        charged until then);
     2. the window (components/sponsor-shop/shop-window.tsx): a search, a
        type rail, ONE "Filters" button for the rest (with the filters in use
        as chips you can remove), Cards ↔ List, the items. Every item opens
        in full before buying ("Details"), and carries its own "Add to cart",
        which asks two things (how many, which dates) and says when it's in.
   Words and figures are worked out here (lib/shop-window.ts).

   Reads  GET /marketplace/search?page&size&…   server-paged
          GET /cart                             the Cart button's count and
                                                total, and which items are
                                                already in it — never summed
                                                from the rows on screen; if
                                                the read fails the button
                                                says just "Cart", never 0.
   Writes POST /cart, POST /cart/lines          (./actions.ts, unchanged)

   LIVE vs DEMO. A linked sponsor sees the real catalogue. `?demo=` gets the
   fixture deck (lib/shop-live.ts DEMO_LISTINGS) under "Sample data", filtered
   and paged the same way, with "Add to cart" drawn disabled and saying why
   (memory QA pass 4 — a demo write must not look like it went through).
   A refused read for a signed-in user is RoleCannotSee (POL-FE-40).

   Roles. SPONSOR_ADMIN adds to the cart; SPONSOR_ANALYST (a Viewer) can look
   at everything but not write, so the add buttons aren't drawn for them.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

/** The cart as the header and the cards use it, or null when it couldn't be read. */
type CartFigures = { lines: number; totalCents: number; byListing: Record<string, number> } | null;

async function liveShop(
  sp: SearchParams,
  extras: Record<string, string>,
): Promise<{ results: ApiSearchResult[]; page: PageInfo; cart: CartFigures; refused: string | null } | null> {
  const query = apiListQuery(sp, extras);
  const [searchRes, cartRes] = await Promise.all([apiFetch(`/marketplace/search${query}`), apiFetch("/cart")]);
  if (searchRes.status === 403) return null;

  let results: ApiSearchResult[] = [];
  let page: PageInfo = { page: 1, size: 12, total: 0, pages: 1 };
  let refused: string | null = null;
  if (searchRes.status === 400) {
    /* The builder only sends what the contract accepts, so this is rare — a
       filter the API still refused. Say so rather than fail the page. */
    const body = (await searchRes.json().catch(() => null)) as { error?: { issues?: { message?: string }[]; message?: string } } | null;
    refused = body?.error?.issues?.[0]?.message ?? body?.error?.message ?? "One of the filters wasn't accepted.";
  } else if (!searchRes.ok) {
    throw new Error(`Shop search unavailable (${searchRes.status}).`);
  } else {
    const data = (await searchRes.json()) as { results: ApiSearchResult[]; page: PageInfo };
    results = data.results;
    page = data.page;
  }

  /* No cart yet is a real, empty cart. A failed or refused read is unknown —
     the button says just "Cart" rather than claim an empty one. */
  let cart: CartFigures = null;
  if (cartRes.ok) {
    const body = (await cartRes.json().catch(() => null)) as { cart: ApiCart | null } | null;
    if (body) {
      const lines = body.cart?.lines ?? [];
      const byListing: Record<string, number> = {};
      for (const l of lines) byListing[l.listingId] = (byListing[l.listingId] ?? 0) + l.quantity;
      cart = { lines: lines.length, totalCents: body.cart?.totalCents ?? 0, byListing };
    }
  }
  return { results, page, cart, refused };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");

  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading the shop" tiles={3} />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const { filters, extras, ignored } = shopSearchExtras(sp);
  const pr = pageParams(sp);
  const today = new Date().toISOString().slice(0, 10);

  const live = demo === null ? await liveShop(sp, extras) : null;
  if (live) {
    return (
      <Shop
        sp={sp}
        ignored={ignored}
        refused={live.refused}
        results={live.results}
        page={live.page}
        cart={live.cart}
        mode={canWrite ? "buy" : "view"}
        today={today}
      />
    );
  }

  /* POL-FE-40: everyone here is signed in (the layout saw to that), so a
     refused shop read means the role can't see it — say so, never show the
     sample listings. They stay for ?demo= walks. */
  if (demo === null) {
    return <RoleCannotSee title="Shop" what="the shop" back={{ label: "Back to your dashboard", href: "/sponsor" }} />;
  }

  const empty = demo === "empty";
  const deck = empty ? { results: [], page: { page: 1, size: pr.size, total: 0, pages: 1 } } : demoShopSearch(filters, pr);
  return (
    <Shop
      sp={sp}
      ignored={ignored}
      refused={null}
      results={deck.results}
      page={deck.page}
      cart={empty ? { lines: 0, totalCents: 0, byListing: {} } : { ...DEMO_CART, byListing: {} }}
      mode="sample"
      today={today}
    />
  );
}

/* ------------------------------------------------------------- the page */

const STEPS = [
  { n: 1, title: "Look around", text: "Open any item to see everything about it." },
  { n: 2, title: "Add to cart", text: "Pick how many and which dates." },
  { n: 3, title: "Check out", text: "Review it all, then place the order." },
] as const;

function Shop({
  sp,
  ignored,
  refused,
  results,
  page,
  cart,
  mode,
  today,
}: {
  sp: SearchParams;
  ignored: string[];
  refused: string | null;
  results: ApiSearchResult[];
  page: PageInfo;
  cart: CartFigures;
  mode: BuyMode;
  today: string;
}) {
  const { filters: raw } = shopSearchExtras(sp);
  const filters = shownFilters(raw);
  const pill = mode === "sample" ? "Sample data" : <StadiumUpdated iso={new Date().toISOString()} />;
  const notes = [
    ...(ignored.length ? [`Not applied (not a valid value): ${ignored.join(", ")}.`] : []),
    ...(refused ? [refused] : []),
  ];

  const headActions = (
    <>
      <Link href="/sponsor/orders" className="sx-sh-head-link">
        Your orders
      </Link>
      <Link href="/sponsor/cart" className="sx-sh-cart" aria-label={cart ? `Cart: ${cart.lines} ${cart.lines === 1 ? "item" : "items"}, ${usd(cart.totalCents)}` : "Cart"}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9.5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
        </svg>
        <span>Cart</span>
        {cart && (
          <>
            <span className="sx-stadium-badge" data-zero={cart.lines === 0 ? "" : undefined}>
              {cart.lines}
            </span>
            {cart.lines > 0 && <span className="sx-sh-cart-total">{usd(cart.totalCents)}</span>}
          </>
        )}
      </Link>
    </>
  );

  return (
    <ServerList>
      <div className="space-y-6">
        <StadiumHead title="Shop" pill={pill} actions={headActions}>
          <p className="sx-sh-lede sx-stadium-in" style={at(0.06)}>
            Things athletes and teams will do for your brand, at the price they set. Open one to see it all, then add it to your cart.
          </p>
          <ol className="sx-sh-how" aria-label="How buying works">
            {STEPS.map((s, i) => (
              <li key={s.n} className="sx-stadium-panel sx-stadium-in" style={at(0.08 + i * 0.05)}>
                <span className="sx-sh-how-n sx-stadium-num" aria-hidden="true">
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="sx-sh-how-title">{s.title}</span>
                  <span className="sx-sh-how-text">{s.text}</span>
                </span>
              </li>
            ))}
            <li className="sx-sh-how-safe sx-stadium-in" style={at(0.24)}>
              <Glyph ui="shield" className="size-4" />
              Nothing is charged until you check out.
            </li>
          </ol>
        </StadiumHead>

        {mode === "view" && (
          <p className="sx-sh-viewer">
            <Glyph ui="eye" className="size-4" />
            You&rsquo;re a Sponsor Viewer: you can open and compare everything here. A Sponsor Admin on your team adds items to the cart.
          </p>
        )}

        <section aria-label="On sale now">
          <ShopWindow
            items={results.map((r) => shopItem(r, today))}
            page={page}
            filters={filters}
            filtered={hasFilters(raw)}
            chips={filterChips(filters)}
            mode={mode}
            today={today}
            inCart={cart?.byListing ?? {}}
            notes={notes}
          />
        </section>

        {mode === "sample" && (
          <p className="text-[10px] text-faint">
            Sample items: {DEMO_LISTINGS.length} examples, shown the way a linked sponsor&rsquo;s own shop looks.
          </p>
        )}
      </div>
    </ServerList>
  );
}

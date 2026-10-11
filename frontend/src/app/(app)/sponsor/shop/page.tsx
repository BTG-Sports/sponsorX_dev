import Link from "next/link";
import type { ReactNode } from "react";

import { ShopAddToCart } from "@/components/shop-add-to-cart";
import { ShopDateFilter } from "@/components/shop-date-filter";
import { ShopStadiumCard } from "@/components/shop-stadium-card";
import { ListFilter, ListSearch, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { StadiumGhost, StadiumHead, StadiumPanel, StadiumTile, StadiumTiles, StadiumUpdated } from "@/components/stadium-stage";
import { demoState } from "@/lib/demo";
import { apiListQuery, pageParams, type PageInfo, type SearchParams } from "@/lib/list-query";
import {
  CATEGORY_OPTIONS,
  DEMO_LISTINGS,
  KIND_OPTIONS,
  PRICE_BANDS,
  demoShopSearch,
  hasFilters,
  shopSearchExtras,
  type ApiCart,
  type ApiSearchResult,
  type ShopFilters,
} from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Shop — on the Stadium Board (P1-ART-23 Task 13, spec 2026-10-11 §7.8).
   Phase 2 self-service buying, statistics first and app-like for a
   non-technical sponsor: search what properties and athletes have
   published, filter instantly (no Apply button, no native <select>), and
   add it to the cart in place.

   Reads  GET /marketplace/search?page&size&…   server-paged (Task 3);
                                                 without ?page the old
                                                 capped read, which this
                                                 page never uses any more.
          GET /cart                             "In your cart" / "Cart
                                                 total" — never summed from
                                                 the rows on screen.
   Writes (ShopAddToCart → ./actions.ts)         POST /cart, POST /cart/lines

   LIVE vs DEMO. A signed-in sponsor whose account is linked sees the real
   catalogue. Anyone else — an account not yet linked to a sponsor
   organisation, or `?demo=` — gets the fixture deck (lib/shop-live.ts
   DEMO_LISTINGS) under a "Sample data" pill, filtered and paged the same
   way, with "Add to cart" drawn disabled (never a fake success: memory
   QA pass 4 — a demo write must not look like it went through).

   Roles. SPONSOR_ADMIN adds to the cart; SPONSOR_ANALYST can search but not
   write (the cart write is 403 for them), so the add control isn't shown.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/sponsor/shop";

async function liveShop(
  sp: SearchParams,
  extras: Record<string, string>,
): Promise<{ results: ApiSearchResult[]; page: PageInfo; cartLines: number; cartTotalCents: number; refused: string | null } | null> {
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

  let cartLines = 0;
  let cartTotalCents = 0;
  if (cartRes.ok) {
    const { cart } = (await cartRes.json()) as { cart: ApiCart | null };
    if (cart) {
      cartLines = cart.lines.length;
      cartTotalCents = cart.totalCents;
    }
  }
  return { results, page, cartLines, cartTotalCents, refused };
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

  const live = demo === null ? await liveShop(sp, extras) : null;
  if (live) {
    return (
      <Shop
        filters={filters}
        ignored={ignored}
        refused={live.refused}
        results={live.results}
        page={live.page}
        cartLines={live.cartLines}
        cartTotalCents={live.cartTotalCents}
        canWrite={canWrite}
        sample={false}
        updatedAt={new Date().toISOString()}
      />
    );
  }

  const empty = demo === "empty";
  const deck = empty ? { results: [], page: { page: 1, size: pr.size, total: 0, pages: 1 } } : demoShopSearch(filters, pr);
  return (
    <Shop
      filters={filters}
      ignored={ignored}
      refused={null}
      results={deck.results}
      page={deck.page}
      cartLines={empty ? 0 : 2}
      cartTotalCents={empty ? 0 : 148_000}
      canWrite={false}
      sample
      updatedAt={new Date().toISOString()}
    />
  );
}

/* ------------------------------------------------------------- the page */

function Shop({
  filters, ignored, refused, results, page, cartLines, cartTotalCents, canWrite, sample, updatedAt,
}: {
  filters: ShopFilters;
  ignored: string[];
  refused: string | null;
  results: ApiSearchResult[];
  page: PageInfo;
  cartLines: number;
  cartTotalCents: number;
  canWrite: boolean;
  sample: boolean;
  updatedAt: string;
}) {
  const pill = sample ? "Sample data" : <StadiumUpdated iso={updatedAt} />;
  const filtered = hasFilters(filters);
  const today = new Date().toISOString().slice(0, 10);

  const cartAction = (
    <Link href="/sponsor/cart" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft">
      Cart · {cartLines}
    </Link>
  );

  return (
    <div className="space-y-6">
      <StadiumHead title="Shop" pill={pill} actions={cartAction}>
        <StadiumTiles cols={3}>
          <StadiumTile
            label="Spots for sale"
            value={page.total}
            hint="How many items are on sale right now, from every seller you can buy from."
            delay={0.1}
          />
          <StadiumTile
            label="In your cart"
            value={cartLines}
            href="/sponsor/cart"
            hint="Lines in your cart, before you check out."
            delay={0.16}
          />
          <StadiumTile
            label="Cart total"
            value={cartTotalCents}
            format="usd0"
            href="/sponsor/cart"
            hint="What everything in your cart adds up to, before fees."
            delay={0.22}
          />
        </StadiumTiles>
      </StadiumHead>

      {!canWrite && !sample && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
          You&rsquo;re signed in as a Sponsor Analyst — you can search and read, and a Sponsor Admin adds to the cart and
          places orders.
        </p>
      )}

      <section className="min-w-0" aria-labelledby="sx-shop-items">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="sx-shop-items" className="sx-section-title">
            On sale now
          </h2>
        </div>
        <ServerList>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-64">
              <ListSearch initial={filters.q} label="Search the shop" placeholder="Title or description…" tone="sponsor" />
            </div>
            <ListFilter param="kind" value={filters.kind} label="Type" allLabel="Any type" options={KIND_OPTIONS} tone="sponsor" />
            <ListFilter
              param="category"
              value={filters.category}
              label="Brand category"
              allLabel="Any category"
              options={CATEGORY_OPTIONS}
              tone="sponsor"
            />
            <ListSearch initial={filters.sport} label="Filter by sport" placeholder="Sport" tone="sponsor" param="sport" />
            <ListSearch initial={filters.stateCode} label="Filter by state" placeholder="State" tone="sponsor" param="stateCode" />
            <ListFilter param="maxPrice" value={filters.maxPrice} label="Price" allLabel="Any price" options={PRICE_BANDS} tone="sponsor" />
            <ShopDateFilter availableFrom={filters.availableFrom} availableUntil={filters.availableUntil} />
          </div>
          {ignored.length > 0 && <p className="mb-2 text-[11px] text-warn">Not applied (not a valid value): {ignored.join(", ")}.</p>}
          {refused && <p className="mb-2 text-[11px] text-warn">{refused}</p>}

          {results.length === 0 ? (
            <PendingList>
              <StadiumPanel className="text-center">
                <p className="text-sm font-semibold text-text">{filtered ? "Nothing matches. Try clearing a filter." : "Nothing is on sale yet"}</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
                  {filtered
                    ? "A wider price range, any type, or dropping the sport or state filter usually finds something."
                    : "BTG curates new athlete inventory weekly — check back soon."}
                </p>
                {filtered && (
                  <Link href={PATH} className="mt-4 inline-block rounded-md border border-line px-4 py-2 text-xs font-semibold text-text hover:bg-surface-2">
                    Clear filters
                  </Link>
                )}
              </StadiumPanel>
            </PendingList>
          ) : (
            <>
              <PagerRow page={page} noun="Items" tone="sponsor" position="top" filtered={filtered} />
              <PendingList>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map((r, i) => (
                    <ShopStadiumCard key={r.id} result={r} i={i} action={cardAction(r, canWrite, sample, today)} />
                  ))}
                </ul>
              </PendingList>
              <PagerRow page={page} noun="Items" tone="sponsor" position="bottom" />
            </>
          )}
        </ServerList>
      </section>

      {sample && (
        <p className="text-[10px] text-faint">
          Sample data — {DEMO_LISTINGS.length} demo listings, shown the way a linked sponsor&rsquo;s own shop would be.
        </p>
      )}
    </div>
  );
}

/** One card's action slot: the real add-to-cart island for a linked, writing
 *  sponsor; a disabled button for an analyst or the sample deck — never a
 *  faked success (memory QA pass 4: a demo write must not look like it went
 *  through). */
function cardAction(r: ApiSearchResult, canWrite: boolean, sample: boolean, today: string): ReactNode {
  if (sample) {
    return (
      <button
        type="button"
        disabled
        title="Sample data — add to cart once your account is linked to a sponsor organisation."
        className="cursor-not-allowed self-start rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink opacity-40"
      >
        Add to cart
      </button>
    );
  }
  if (!canWrite) return null;
  return (
    <ShopAddToCart
      listingId={r.id}
      item={{ availableFrom: r.item.availableFrom, availableUntil: r.item.availableUntil, packageRules: r.item.packageRules }}
      today={today}
    />
  );
}

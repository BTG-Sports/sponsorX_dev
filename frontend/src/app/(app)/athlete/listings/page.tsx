import Link from "next/link";

import { ArenaHead, ArenaPanel, ArenaUpdated } from "@/components/arena-stage";
import { RosteredPanel } from "@/components/athlete-listing-bits";
import { AddItemFirst, FirstListingHero } from "@/components/athlete-listings/listings-board";
import { ListAnItem, ListingsShop } from "@/components/athlete-listings/listings-shop";
import { ServerList } from "@/components/server-pager";
import { EmptyState } from "@/components/states";
import {
  SELLING_STATES, listChecks, listingScope, listingsView, readyRows, rosterFrom,
  type ApiListingsPage, type ListingScope,
} from "@/lib/athlete-listings-live";
import { listingCard, listingTab, listingTabs, readyItem, tabState, type ReadyItem } from "@/lib/athlete-listings-shop";
import type { ApiInventoryList } from "@/lib/inventory-live";
import { apiListQuery, textParam, type SearchParams } from "@/lib/list-query";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { sellerContext } from "./load";

import "../inventory/inventory.css";
import "./listings.css";

/* --------------------------------------------------------------------------
   List my item — 2S3-FE-02 (Claude Design ListMyItem.dc.html; the rostered
   view, and the way into compose). Athlete portal, over 2S3-BE-05.

   A roster athlete — the API names it through a team's listing of their
   item, or their own listing's "on a team" blocker — sees "Your team lists
   your items" and the team's listings, read-only. Otherwise: their own
   listings, and a way to list the items that have none. A 403 (a
   guardian's login) is explained; any other failure is the error page.

   P1-ART-22 (2026-10-11) — on the Arena, SERVER-PAGED (memory:
   pagination-pattern).

   POL-FE-84 (2026-11-16) — redrawn like the inventory (POL-FE-83). The
   owner: "the visual design is too much confusing, do like what we did in
   the inventory page". The KPI plates, the two tables and the separate
   compose page gave way to, top to bottom:
     1. the title and one button, "+ List an item" (with how many items
        have no listing yet): a popup that picks the item, then takes what
        the sponsor gets beside "What's checked", then List it or Save as
        draft, and ends on what happened (Live ✓, or BTG taking a look);
     2. the listings, and nothing else: tabs carrying the API's counts
        (All / Live / In review / Drafts / Paused / Ended — the URL's
        `state`, so the old filter links still work), search, List ↔
        Cards, one line on how listing works, and per listing a status in
        plain words ("Draft" no longer reads "Not listed yet") and, on the
        seller's own live or paused one, a Live switch (Pause / Resume).
   No listing of their own yet: a hero with the three steps and the items
   as tiles, each opening the popup on its own. Reads

     GET /listings?page&size&scope=own|team&state&q   one tab's page +
                                                      counts { own, team,
                                                      byState }
     GET /inventory?page=1&size=60&unlisted=true      the items the popup
                                                      offers + counts
     GET /athletes/me · /restrictions · /payouts/account   (./load.ts) —
                                                      approved? and each
                                                      item's checklist

   `counts.byState` is over every listing the athlete may read (theirs and
   their team's); in practice one of the two is empty. The compose page
   (./new?item=) stays for links from elsewhere; a listing still opens on
   ./[id]. Words: lib/athlete-listings-shop.ts. Styles: the inventory's
   inventory.css and ./listings.css.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/athlete/listings";
const TITLE = "Listings";
const POPUP_SIZE = 60;

async function readListings(sp: SearchParams, scope: ListingScope, state: string, q: string): Promise<Response> {
  return apiFetch(`/listings${apiListQuery(sp, { scope, state, q })}`);
}

export default async function AthleteListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  const tabRaw = textParam(sp, "tab", ["own", "team"]);
  const tab = listingTab(sp);
  const state = tabState(tab);
  const q = textParam(sp, "q");
  const askedScope: ListingScope = tabRaw === "team" ? "team" : "own";

  const [lRes, iRes] = await Promise.all([
    readListings(sp, askedScope, state, q),
    apiFetch(`/inventory?page=1&size=${POPUP_SIZE}&unlisted=true`),
  ]);
  if (lRes.status === 403 || iRes.status === 403) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} />
        <EmptyState mark="users" title="Listings are the athlete’s to manage" hint="An athlete lists their own items from their own login. A guardian’s login can’t list them." />
      </div>
    );
  }
  if (!lRes.ok) throw new Error(`Listings unavailable (${lRes.status}).`);
  if (!iRes.ok) throw new Error(`Inventory unavailable (${iRes.status}).`);
  let res = (await lRes.json()) as ApiListingsPage;
  const inv = (await iRes.json()) as ApiInventoryList;

  /* No scope asked and nothing of their own while their team lists: open on the team's. */
  let view = listingsView(res, askedScope, state);
  const scope = listingScope(tabRaw, view.counts);
  if (scope !== askedScope) {
    if (view.paged) {
      const again = await readListings(sp, scope, state, q);
      if (!again.ok) throw new Error(`Listings unavailable (${again.status}).`);
      res = (await again.json()) as ApiListingsPage;
    }
    view = listingsView(res, scope, state);
  }
  const { rows, page, counts } = view;
  const roster = rosterFrom(counts, rows);
  const ctx = roster.onTeam ? null : await sellerContext();
  const approved = !ctx?.athleteState || SELLING_STATES.includes(ctx.athleteState);

  /* The popup's items: the API's unlisted page, or (legacy) every item minus the listed ones. */
  const now = new Date();
  const ready: ReadyItem[] = ctx
    ? readyRows(inv.items, res.listings, inv.page !== undefined).map((i) =>
        readyItem(i, listChecks({ item: i, description: i.description?.trim() ?? "", blockers: [], athleteState: ctx.athleteState, wontPromote: ctx.wontPromote, payout: ctx.payout, now })),
      )
    : [];
  const more = Math.max(0, (inv.counts?.unlisted ?? ready.length) - ready.length);
  const noItems = inv.counts ? inv.counts.total === 0 : inv.items.length === 0;

  const cards = rows.map((l) => listingCard(l, now.getTime()));
  const filtered = Boolean(state || q);
  const firstListing = !roster.onTeam && scope === "own" && counts.own === 0 && !filtered;
  const both = counts.own > 0 && counts.team > 0;

  return (
    <ServerList>
      <div className="sx-iv space-y-8">
        <ArenaHead
          title={TITLE}
          pill={<ArenaUpdated />}
          actions={!roster.onTeam && !firstListing ? <ListAnItem ready={ready} more={more} hrefBase={PATH} /> : undefined}
        >
          <p className="sx-iv-lede sx-iv-rise" style={{ "--d": "0.06s" } as React.CSSProperties}>
            {roster.onTeam ? "Your team puts your items on the marketplace. Here’s where each one stands." : "Your items on the marketplace, and where each one stands."}
          </p>
        </ArenaHead>

        {roster.onTeam && (
          <div className="sx-iv-rise" style={{ "--d": "0.1s" } as React.CSSProperties}>
            <RosteredPanel teamName={roster.teamName} />
          </div>
        )}
        {!roster.onTeam && !approved && (
          <ArenaPanel tone="warn" delay={0.1} spot>
            <div role="status" className="text-xs">
              <p className="text-sm font-semibold">Listing opens once your profile is approved</p>
              <p className="mt-1 text-muted">You can get your items ready in Inventory meanwhile.</p>
            </div>
          </ArenaPanel>
        )}

        {firstListing ? (
          <FirstListingHero noItems={noItems}>
            {noItems ? <AddItemFirst /> : <ListAnItem ready={ready} more={more} hrefBase={PATH} hero />}
          </FirstListingHero>
        ) : (
          <section aria-label="Your listings" className="space-y-3">
            {both && (
              <nav aria-label="Whose listings" className="sx-ls-scope sx-iv-rise">
                <Link href={`${PATH}?tab=own`} aria-current={scope === "own" ? "page" : undefined}>
                  Yours <span>{counts.own}</span>
                </Link>
                <Link href={`${PATH}?tab=team`} aria-current={scope === "team" ? "page" : undefined}>
                  Your team&rsquo;s <span>{counts.team}</span>
                </Link>
              </nav>
            )}
            <ListingsShop
              cards={cards}
              tabs={listingTabs(counts.byState, tab)}
              tab={tab}
              q={q}
              filtered={filtered}
              page={page}
              hrefBase={PATH}
              empty={
                q
                  ? { title: "No listings match your search", hint: "Try another word, or clear the search to see every listing." }
                  : tab === "live"
                    ? { title: "Nothing is live", hint: "A listing goes live as soon as its checks pass. Open a draft to finish it and submit." }
                    : tab === "review"
                      ? { title: "Nothing is waiting on BTG", hint: "BTG only takes a look when something needs it, and emails you." }
                      : tab === "draft"
                        ? { title: "No drafts", hint: "Every listing has been submitted." }
                        : tab === "paused"
                          ? { title: "Nothing is paused", hint: "Switch a live listing to Paused to hide it from sponsors for a while." }
                          : tab === "ended"
                            ? { title: "Nothing has ended", hint: "Ending a listing takes it off the marketplace for good." }
                            : roster.onTeam
                              ? { title: "Your team hasn’t listed any of your items", hint: "When your team puts one of your items on the marketplace, it shows here." }
                              : { title: "No listings here", hint: "List an item to put it on the marketplace." }
              }
            />
          </section>
        )}
      </div>
    </ServerList>
  );
}

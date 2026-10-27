import Link from "next/link";

import { ArenaHead, ArenaUpdated, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles } from "@/components/arena-stage";
import { ListingPill, RosteredPanel } from "@/components/athlete-listing-bits";
import { ListFilter, ListSearch, ServerList } from "@/components/server-pager";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import {
  LISTING_STATES, LISTING_STATE_OPTIONS, SELLING_STATES, isOwn, itemLine, listingScope, listingTiles, listingsView, price, readyRows, rosterFrom,
  type ApiListingsPage, type ListingScope,
} from "@/lib/athlete-listings-live";
import { fmtDay, pageOrAll, type ApiInventoryList } from "@/lib/inventory-live";
import { apiListQuery, pageParamsFor, textParam, type ListKeys, type SearchParams } from "@/lib/list-query";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { sellerContext } from "./load";

/* --------------------------------------------------------------------------
   List my item — 2S3-FE-02 (Claude Design ListMyItem.dc.html; the rostered
   view, and the way into compose). Athlete portal, over 2S3-BE-05.

   Reads  GET /listings        every listing of the athlete's items: their
                               own, and their team's of them (read "own")
          GET /inventory       their own items — the ones with no live
                               listing can be listed
          GET /athletes/me     approved or not (./load.ts)

   A roster athlete — the API names it through a team's listing of their
   item, or their own listing's "on a team" blocker — sees "Your team lists
   your items" and the team's listings, read-only. Otherwise: their own
   listings, and the items ready to list. A 403 (a guardian's login) is
   explained; any other failure is the error page.

   P1-ART-22 (2026-10-11) — redrawn on the Arena as a dashboard, and the two
   lists SERVER-PAGED (memory: pagination-pattern), each with its own URL
   keys:

     GET /listings?page&size&scope=own|team&state&q    ?page/?size — one tab's
                                                       page + counts { own,
                                                       team, byState }
     GET /inventory?page&size&unlisted=true            ?ipage/?isize — the
                                                       items with no listing
                                                       yet + counts

   Title row with the provenance pill; KPI plates from `counts.byState`
   (live · held for BTG · drafts & paused) and the unlisted count; the
   Your listings / Your team's tabs with the API's counts, the state filter
   and search, instant and URL-driven; a table per list with the pager
   above and below. Rostered is decided from the counts (the team has
   listings, the athlete none of their own) or from what the rows say, as
   before; the "listing opens once approved" notice stays. Until the API
   pages (built alongside), `page` and `counts` are missing and the page
   derives the tab, the state and "ready to list" from every row exactly
   as it did before (lib/athlete-listings-live listingsView / readyRows).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/athlete/listings";
const TITLE = "Listings";
const INTRO = "Put an item from your inventory on the marketplace. It goes live as soon as the checks pass.";
const ITEM_KEYS: ListKeys = { page: "ipage", size: "isize" };

const LISTING_COLUMNS: Column[] = [
  { key: "listing", label: "Listing" },
  { key: "status", label: "Status" },
  { key: "price", label: "Price", num: true },
  { key: "updated", label: "Updated" },
  { key: "action", label: "Open", srOnly: true },
];
const READY_COLUMNS: Column[] = [
  { key: "item", label: "Item" },
  { key: "price", label: "Price", num: true },
  { key: "action", label: "List", srOnly: true },
];

const linkCls = "inline-flex min-h-9 items-center justify-center rounded-full px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-athlete/50";

async function readListings(sp: SearchParams, scope: ListingScope, state: string, q: string): Promise<Response> {
  return apiFetch(`/listings${apiListQuery(sp, { scope, state, q })}`);
}

export default async function AthleteListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  const tabRaw = textParam(sp, "tab", ["own", "team"]);
  const state = textParam(sp, "state", LISTING_STATES);
  const q = textParam(sp, "q");
  const ip = pageParamsFor(sp, ITEM_KEYS);
  const askedScope: ListingScope = tabRaw === "team" ? "team" : "own";

  const [lRes, iRes] = await Promise.all([
    readListings(sp, askedScope, state, q),
    apiFetch(`/inventory?page=${ip.page}&size=${ip.size}&unlisted=true`),
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

  /* No tab asked and nothing of their own while their team lists: open on the team's. */
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

  /* Ready to list: the API's unlisted page, or (legacy) every item minus the listed ones. */
  const invPaged = inv.page !== undefined;
  const ready = readyRows(inv.items, res.listings, invPaged);
  const readyPage = pageOrAll(ready, inv.page);
  const noItems = inv.counts ? inv.counts.total === 0 : inv.items.length === 0;
  const unlisted = inv.counts?.unlisted ?? (invPaged ? readyPage.total : view.paged ? null : ready.length);
  const tiles = listingTiles(counts.byState, roster.onTeam ? null : unlisted);
  const filtered = Boolean(state || q);
  const tabTotal = scope === "own" ? counts.own : counts.team;

  const listingsTable = (
    <PagedTable bare page={page} noun="Listings" tone="athlete" filtered={filtered} label={scope === "own" ? "Your listings" : "Your team's listings"} columns={LISTING_COLUMNS}>
      {rows.map((l, i) => (
        <Tr key={l.id} i={i} tone={l.state === "PENDING_APPROVAL" || (l.state === "DRAFT" && l.reviewNotes) ? "warn" : undefined}>
          <Td>
            <Primary sub={`${itemLine(l.item)}${isOwn(l) ? "" : ` · listed by ${l.seller.name}`}`}>{l.title}</Primary>
          </Td>
          <Td label="Status"><ListingPill listing={l} /></Td>
          <Td label="Price" num><span className="sx-arena-num text-sm">{price(l.item.priceCents)}</span></Td>
          <Td label="Updated" muted>{fmtDay(l.updatedAt)}</Td>
          <Td act>
            <Link href={`${PATH}/${encodeURIComponent(l.id)}`} aria-label={`Open ${l.title}`} className={`${linkCls} border border-line text-text hover:bg-surface-2`}>
              Open →
            </Link>
          </Td>
        </Tr>
      ))}
    </PagedTable>
  );

  return (
    <ServerList>
      <div className="space-y-8">
        <ArenaHead title={TITLE} pill={<ArenaUpdated />} lede={INTRO}>
          <ArenaTiles cols={tiles.length === 3 ? 3 : 4}>
            {tiles.map((t, i) => (
              <ArenaTile
                key={t.key}
                label={t.label}
                value={t.value}
                caption={t.caption}
                tone={t.tone}
                href={t.key === "ready" ? "#ready-to-list" : undefined}
                delay={0.1 + i * 0.06}
              />
            ))}
          </ArenaTiles>
        </ArenaHead>

        {roster.onTeam && (
          <div className="sx-arena-in" style={{ "--sx-reveal-delay": "0.3s" } as React.CSSProperties}>
            <RosteredPanel teamName={roster.teamName} />
          </div>
        )}
        {!roster.onTeam && !approved && (
          <ArenaPanel tone="warn" delay={0.3} spot>
            <div role="status" className="text-xs">
              <p className="text-sm font-semibold">Listing opens once your profile is approved</p>
              <p className="mt-1 text-muted">You can get your items ready in Inventory meanwhile.</p>
            </div>
          </ArenaPanel>
        )}

        {/* -------------------------------------------------- the listings */}
        <section aria-label="Listings">
          <ArenaSection
            title={roster.onTeam ? "Your items on the marketplace" : "Your listings"}
            hint={roster.onTeam ? "Listed by your team. Every sale shows on your Orders page." : "One listing per item. Open one to edit, pause, resume or end it."}
            delay={0.34}
          />
          <div className="sx-arena-in mb-3 flex flex-wrap items-center gap-2" style={{ "--sx-reveal-delay": "0.36s" } as React.CSSProperties}>
            <TabStrip label="Whose listings">
              <TabLink href={`${PATH}?tab=own`} on={scope === "own"} count={counts.own}>Your listings</TabLink>
              <TabLink href={`${PATH}?tab=team`} on={scope === "team"} count={counts.team}>Your team’s</TabLink>
            </TabStrip>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ListSearch initial={q} label="Search listings" placeholder="Search by title" tone="athlete" />
              <ListFilter param="state" value={state} label="Filter by status" allLabel="Every status" options={[...LISTING_STATE_OPTIONS]} tone="athlete" />
            </div>
          </div>
          {rows.length === 0 ? (
            tabTotal === 0 && !filtered ? (
              <ArenaPanel tone="ink" delay={0.4}>
                <p className="text-sm font-semibold">{scope === "own" ? "No listings of your own yet" : "Your team hasn’t listed any of your items"}</p>
                <p className="mt-1 text-xs text-muted">
                  {scope === "own" ? "Pick an item under Ready to list below." : "When your team puts one of your items on the marketplace, it shows here."}
                </p>
              </ArenaPanel>
            ) : (
              <ArenaPanel tone="ink" delay={0.4}>
                <p className="text-sm font-semibold">No listings match</p>
                <p className="mt-1 text-xs text-muted">Clear the search or the status filter to see every listing on this tab.</p>
              </ArenaPanel>
            )
          ) : (
            <div className="sx-arena-in" style={{ "--sx-reveal-delay": "0.4s" } as React.CSSProperties}>
              {listingsTable}
            </div>
          )}
        </section>

        {/* ---------------------------------------------- ready to list */}
        {!roster.onTeam && (
          <section id="ready-to-list" aria-label="Ready to list" className="scroll-mt-6">
            <ArenaSection
              title="Ready to list"
              hint="Items from your Inventory with no listing yet. One listing per item."
              action={<Link href="/athlete/inventory" className="text-xs font-medium text-athlete hover:underline">Inventory →</Link>}
              delay={0.5}
            />
            {noItems ? (
              <EmptyState mark="inbox" title="Nothing in your inventory yet" hint="Add what you’d sell — a clinic, a post, an appearance — at your price, then list it here." action={{ label: "Go to Inventory", href: "/athlete/inventory" }} />
            ) : ready.length === 0 ? (
              <ArenaPanel tone="win" delay={0.54}>
                <p className="text-sm font-semibold">Every item already has a listing</p>
                <p className="mt-1 text-xs text-muted">
                  Add another in <Link href="/athlete/inventory" className="font-medium text-athlete hover:underline">Inventory</Link>.
                </p>
              </ArenaPanel>
            ) : (
              <div className="sx-arena-in" style={{ "--sx-reveal-delay": "0.54s" } as React.CSSProperties}>
                <PagedTable bare page={readyPage} noun="Items" tone="athlete" keys={ITEM_KEYS} label="Items ready to list" columns={READY_COLUMNS}>
                  {ready.map((i, n) => (
                    <Tr key={i.id} i={n}>
                      <Td>
                        <Primary sub={`${itemLine(i)}${i.active ? "" : " · paused in Inventory"}`}>{i.title}</Primary>
                      </Td>
                      <Td label="Price" num><span className="sx-arena-num text-sm">{price(i.priceCents)}</span></Td>
                      <Td act>
                        <Link href={`${PATH}/new?item=${encodeURIComponent(i.id)}`} aria-label={`List ${i.title}`} className={`${linkCls} bg-primary px-4 text-cta-ink hover:bg-primary-soft`}>
                          List this item
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </PagedTable>
              </div>
            )}
          </section>
        )}
      </div>
    </ServerList>
  );
}

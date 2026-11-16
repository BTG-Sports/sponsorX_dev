import { ArenaHead, ArenaUpdated } from "@/components/arena-stage";
import { FirstItemHero } from "@/components/athlete-inventory/inventory-board";
import { InventoryAddItem, InventoryBrandRules, InventoryShop } from "@/components/athlete-inventory/inventory-shop";
import { ServerList } from "@/components/server-pager";
import { EmptyState } from "@/components/states";
import {
  componentOptions,
  inventoryCounts,
  pageOrAll,
  toRestrictionRow,
  type ApiInventoryItem,
  type ApiInventoryList,
  type ApiRestriction,
} from "@/lib/inventory-live";
import type { ApiAthleteListing } from "@/lib/athlete-listings-live";
import { listingFor, shopCard, shopTab, shopTabs, tabQuery } from "@/lib/inventory-shop";
import { apiListQuery, textParam, type SearchParams } from "@/lib/list-query";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import {
  addRestrictionAction,
  createItemAction,
  removeRestrictionAction,
  setItemActiveAction,
} from "./actions";

import "./inventory.css";

/* --------------------------------------------------------------------------
   My inventory — 2S2-FE-02. Athlete portal.

   What the athlete sells, at their price: each item's kind, price, stock,
   availability window, with an on-sale switch and a form for a new item (a
   single item or a PACKAGE of their own items).

   Live only. Reads GET /inventory (inventoryItem read "own") and GET
   /restrictions (brandRestriction read "own"). Writes through ./actions:
   POST /inventory, PATCH /inventory/:id, POST/DELETE /restrictions. A 403
   (a guardian's login — inventory is the athlete's) is explained, not
   faked; any other failure is the error page.

   Honest gaps:
     · Creating needs the athlete to be APPROVED or ACTIVE — the API answers
       409 and the form says "Inventory opens once your profile is
       approved". The page can't tell beforehand (GET /inventory carries no
       athlete state), so the form is always offered.
     · No "sold" count: the API returns raw stock only.
     · No delete (no route) — pause instead.
     · An athlete with no team lists these themselves on /athlete/listings
       (2S3-BE-05); a roster athlete's team lists them.

   P1-ART-22 (2026-10-11) — on the Arena, SERVER-PAGED (memory:
   pagination-pattern).

   POL-FE-83 (2026-11-16) — redrawn as a shop window after the owner's three
   references (an inventory table, a product list under a statistics row, an
   app store of cards with Activate/Deactivate): "easy to understand", keep
   the Arena theme, animation and wow. Reads

     GET /inventory?page&size&q&active=true|false&unlisted=true
                                     one page of the athlete's items +
                                     counts { total, active, paused,
                                     unlisted } over the whole scope
     GET /inventory?page=1&size=60&active=true   what a new package may bundle
     GET /restrictions                            unchanged
     GET /listings                    the athlete's listings (the legacy whole
                                      list, as /athlete/listings/new reads it),
                                      for each item's marketplace badge

   The owner then added a fourth reference: "when you go to the page you
   would see the lists first and there's a button that will say add". So
   the page reads top to bottom:
     1. the title, then two buttons: "Won't promote · n" (the categories
        the athlete won't promote — a setting, so behind a button, like the
        reference's "View settings"; a popup of chips) and "+ Add an item"
        (a popup: kind tiles, then the form);
     2. the items, and nothing else: tabs that carry the counts (All /
        Available / Paused / Not listed yet — the API's whole-scope counts),
        search, List ↔ Cards (List by default), one line on how selling
        works, and per item an "Available" switch (Activate/Deactivate in
        the reference) that flips at once, beside a badge saying where it
        stands on the marketplace ("Not listed", "On the marketplace" …).
        The switch is not the shop (the owner caught an "On sale" item
        under "Not listed yet"): a sponsor finds an item only through a
        published listing whose item is switched on.
   An empty inventory gets a hero instead of 2: what an item is, the three
   steps, and a big "Add your first item" with idea tiles, each opening the
   same popup on its kind. Words worked out server-side in
   lib/inventory-shop.ts; styles in ./inventory.css.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "Inventory";
const BASE = "/athlete/inventory";

export default async function AthleteInventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  const q = textParam(sp, "q");
  const tab = shopTab(sp);
  const filtered = Boolean(q || tab !== "all");

  const [invRes, partsRes, resRes, listRes] = await Promise.all([
    apiFetch(`/inventory${apiListQuery(sp, { q, ...tabQuery(tab) })}`),
    apiFetch("/inventory?page=1&size=60&active=true"),
    apiFetch("/restrictions"),
    apiFetch("/listings"),
  ]);
  if (invRes.status === 403) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} />
        <EmptyState
          mark="users"
          title="Inventory is the athlete's to manage"
          hint="Items are priced and edited from the athlete's own login. A guardian's login can't change them."
        />
      </div>
    );
  }
  if (!invRes.ok) throw new Error(`Inventory unavailable (${invRes.status}).`);
  if (!partsRes.ok) throw new Error(`Inventory unavailable (${partsRes.status}).`);
  if (!resRes.ok && resRes.status !== 403) throw new Error(`Restrictions unavailable (${resRes.status}).`);
  if (!listRes.ok && listRes.status !== 403) throw new Error(`Listings unavailable (${listRes.status}).`);

  const list = (await invRes.json()) as ApiInventoryList;
  const { items: parts } = (await partsRes.json()) as { items: ApiInventoryItem[] };
  const restrictions = resRes.ok ? ((await resRes.json()) as { restrictions: ApiRestriction[] }).restrictions : null;
  const now = new Date().getTime();
  const listings = listRes.ok ? ((await listRes.json()) as { listings: ApiAthleteListing[] }).listings : [];
  const cards = list.items.map((i) => shopCard(i, now, listingFor(i.id, listings)));
  const page = pageOrAll(cards, list.page);
  const counts = inventoryCounts(list);
  const firstItem = counts.total === 0 && !filtered;
  const options = componentOptions(parts);

  return (
    <ServerList>
      <div className="sx-iv space-y-8">
        <ArenaHead
          title={TITLE}
          pill={<ArenaUpdated />}
          actions={
            <>
              {restrictions && <InventoryBrandRules rows={restrictions.map(toRestrictionRow)} add={addRestrictionAction} remove={removeRestrictionAction} />}
              {!firstItem && <InventoryAddItem create={createItemAction} components={options} savedHref={`${BASE}/{id}`} />}
            </>
          }
        >
          <p className="sx-iv-lede sx-iv-rise" style={{ "--d": "0.06s" } as React.CSSProperties}>
            The things you sell to sponsors, at your price. BTG takes its fee on each order.
          </p>
        </ArenaHead>

        {firstItem ? (
          <FirstItemHero>
            <InventoryAddItem create={createItemAction} components={options} savedHref={`${BASE}/{id}`} hero />
          </FirstItemHero>
        ) : (
          <section aria-label="Your items">
              <InventoryShop
                cards={cards}
                tabs={shopTabs(counts)}
                tab={tab}
                q={q}
                filtered={filtered}
                page={page}
                hrefBase={BASE}
                setActive={setItemActiveAction}
                empty={
                  q
                    ? { title: "No items match your search", hint: "Try another word, or clear the search to see every item." }
                    : tab === "on"
                      ? { title: "Nothing is available", hint: "Switch an item to Available under All items so sponsors can buy it again." }
                      : tab === "paused"
                        ? { title: "Nothing is paused", hint: "Every item is available. Switch one to Paused under All items when you need a break." }
                        : tab === "unlisted"
                          ? { title: "Every item is listed", hint: "Each item already has a listing on the marketplace." }
                          : { title: "No items here", hint: "Add an item to start selling." }
                }
              />
          </section>
        )}
      </div>
    </ServerList>
  );
}

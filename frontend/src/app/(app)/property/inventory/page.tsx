import { InventoryNewItem } from "@/components/inventory-controls";
import { InventoryManager } from "@/components/inventory-manager";
import { ListSearch, PagerRow, ServerList } from "@/components/server-pager";
import { EmptyState } from "@/components/states";
import { componentOptions, teamItemRow, type ApiInventoryItem, type ApiTeamItem } from "@/lib/inventory-live";
import { apiListQuery, textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { createItemAction, setItemActiveAction } from "@/app/(app)/athlete/inventory/actions";

/* --------------------------------------------------------------------------
   Team inventory — 2S2-FE-02 (the team half, with 2S2-BE-04). Property
   portal, PROPERTY_MGR.

   The same manager the athlete uses (components/inventory-manager), over
   the team's view: the team's own items, which the manager prices, pauses
   and edits, and its roster athletes' items, which are shown with their
   owner and are read-only here (inventoryItem write is "own" — the API
   refuses a manager's write to an athlete's item regardless).

   Reads GET /team/inventory?page&size&q (server-paged, own property, each
   row with `owner` = the athlete's display name or null for the team's) and
   GET /inventory (the whole own-property set — only to offer a new
   package's contents). Writes through the shared inventory actions:
   POST /inventory (the owner is the caller's property), PATCH
   /inventory/:id. A 403 from /team/inventory is a login with no property
   linked yet. Other failures are the error page.

   Honest gaps: no "sold" count (raw stock only); no delete route; listing
   an item on the marketplace is a separate step (a listing, reviewed by
   BTG) not on this page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyInventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("property");
  const sp = await searchParams;
  const q = textParam(sp, "q");

  const [pageRes, allRes] = await Promise.all([apiFetch(`/team/inventory${apiListQuery(sp, { q })}`), apiFetch("/inventory")]);
  if (pageRes.status === 403) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Team inventory</h1>
        <EmptyState mark="users" title="No property is linked to this login yet" hint="Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!pageRes.ok) throw new Error(`Team inventory unavailable (${pageRes.status}).`);
  if (!allRes.ok) throw new Error(`Inventory unavailable (${allRes.status}).`);
  const page = (await pageRes.json()) as { inventory: ApiTeamItem[]; page: PageInfo; counts: { items: number; active: number } };
  const { items } = (await allRes.json()) as { items: ApiInventoryItem[] };
  const rows = page.inventory.map(teamItemRow);
  const hasAny = page.counts.items > 0;

  return (
    <ServerList>
      <InventoryManager
        title="Team inventory"
        intro={`What your team and its athletes sell, at their own price. ${page.counts.items} items · ${page.counts.active} active.`}
        note="You price and edit the team's own items. Roster athletes' items are theirs — shown here, changed only from their login."
        create={
          <InventoryNewItem
            create={createItemAction}
            components={componentOptions(items)}
            savedHref="/property/inventory/{id}"
            startOpen={!hasAny}
          />
        }
        rows={rows}
        hrefBase="/property/inventory"
        setActive={setItemActiveAction}
        showOwner
        empty={{
          title: q ? "No items match that search" : "No inventory yet",
          hint: "Signage, tickets, appearances and packages all go here. You set the price and the brand categories you won't sell to.",
        }}
        pagerTop={
          hasAny ? (
            <div className="space-y-3">
              <ListSearch initial={q} label="Search items" placeholder="Search by title" tone="property" />
              <PagerRow page={page.page} noun="Items" tone="property" position="top" filtered={Boolean(q)} />
            </div>
          ) : undefined
        }
        pagerBottom={hasAny ? <PagerRow page={page.page} noun="Items" tone="property" position="bottom" /> : undefined}
      />
    </ServerList>
  );
}

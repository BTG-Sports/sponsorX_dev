import { ArenaHead, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles } from "@/components/arena-stage";
import { InventoryNewItem } from "@/components/inventory-controls";
import { InventoryManager } from "@/components/inventory-manager";
import { InventoryRestrictions } from "@/components/inventory-restrictions";
import { ListFilter, ListSearch, PagerRow, ServerList } from "@/components/server-pager";
import { EmptyState } from "@/components/states";
import {
  ACTIVE_OPTIONS,
  activeParam,
  componentOptions,
  inventoryCounts,
  pageOrAll,
  toInventoryRow,
  toRestrictionRow,
  type ApiInventoryItem,
  type ApiInventoryList,
  type ApiRestriction,
} from "@/lib/inventory-live";
import { apiListQuery, textParam, type SearchParams } from "@/lib/list-query";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import {
  addRestrictionAction,
  createItemAction,
  removeRestrictionAction,
  setItemActiveAction,
} from "./actions";

/* --------------------------------------------------------------------------
   My inventory — 2S2-FE-02. Athlete portal.

   What the athlete sells, at their price: each item's kind, price, stock,
   availability window and brand categories, with pause/resume and a form
   for a new item (a single item or a PACKAGE of their own items).

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
     · packageRules (min/max per order, bundle-only, exclusive, needs
       approval) aren't editable here yet — the API keeps what it has.

   P1-ART-22 (2026-10-11) — redrawn on the Arena as a dashboard, and
   SERVER-PAGED (memory: pagination-pattern). Reads

     GET /inventory?page&size&q&active=true|false   one page of the athlete's
                                                     items + counts { total,
                                                     active, paused, unlisted }
     GET /inventory?page=1&size=60&active=true       the items a new package
                                                     may bundle (bounded to
                                                     the house maximum; a
                                                     paused item can't be sold
                                                     in a bundle anyway)
     GET /restrictions                                unchanged

   Title row with the provenance pill and "New item"; four KPI plates from
   `counts` (never from the rows; "Not yet listed" opens Listings); search
   and the Active/Paused filter, instant and URL-driven; the pager above and
   below the plates; the restrictions on a plate of their own. Until the API
   pages (it's being built alongside), `page` and `counts` are missing from
   the answer and the page falls back to one page of every row with the
   counts taken from them — and no "Not yet listed" plate, rather than a
   made-up figure (memory: stats-must-be-retrievable).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "Inventory";

export default async function AthleteInventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  const q = textParam(sp, "q");
  const active = activeParam(sp);
  const filtered = Boolean(q || active);

  const [invRes, partsRes, resRes] = await Promise.all([
    apiFetch(`/inventory${apiListQuery(sp, { q, active })}`),
    apiFetch("/inventory?page=1&size=60&active=true"),
    apiFetch("/restrictions"),
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

  const list = (await invRes.json()) as ApiInventoryList;
  const { items: parts } = (await partsRes.json()) as { items: ApiInventoryItem[] };
  const restrictions = resRes.ok ? ((await resRes.json()) as { restrictions: ApiRestriction[] }).restrictions : null;
  const rows = list.items.map((i) => toInventoryRow(i));
  const page = pageOrAll(rows, list.page);
  const counts = inventoryCounts(list);
  const hasAny = counts.total > 0 || filtered;
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <ServerList>
      <div className="space-y-8">
        <ArenaHead
          title={TITLE}
          pill={`Postgres · read ${readAt}`}
          lede="What you sell, at your price. Sponsors buy these; BTG takes its fee on each order."
        >
          <ArenaTiles cols={counts.unlisted === null ? 3 : 4}>
            <ArenaTile label="Items" value={counts.total} caption={counts.total ? "in your inventory" : "add what you'd sell"} tone={counts.total ? "blue" : "ink"} delay={0.1} />
            <ArenaTile
              label="Active"
              value={counts.active}
              caption={counts.active ? "on offer to sponsors" : "nothing on offer"}
              tone={counts.active ? "win" : "ink"}
              share={counts.total ? counts.active / counts.total : undefined}
              delay={0.16}
            />
            <ArenaTile label="Paused" value={counts.paused} caption={counts.paused ? "switched off for now" : "nothing paused"} tone={counts.paused ? "warn" : "ink"} delay={0.22} />
            {counts.unlisted !== null && (
              <ArenaTile
                label="Not yet listed"
                value={counts.unlisted}
                caption={counts.unlisted ? "ready to put on the marketplace" : "every item has a listing"}
                tone={counts.unlisted ? "flare" : "ink"}
                href="/athlete/listings"
                delay={0.28}
              />
            )}
          </ArenaTiles>
          {/* The "New item" control: a pill at the end of the KPI row that opens the form in place, full width. */}
          <div className="sx-arena-in mt-4 flex flex-col items-end" style={{ "--sx-reveal-delay": "0.3s" } as React.CSSProperties}>
            <InventoryNewItem
              create={createItemAction}
              components={componentOptions(parts)}
              savedHref="/athlete/inventory/{id}"
              startOpen={counts.total === 0 && !filtered}
            />
          </div>
        </ArenaHead>

        <InventoryManager
          stage="arena"
          title="Your items"
          intro=""
          note="With no team, you list these yourself under Listings; on a team, your team lists them."
          rows={rows}
          hrefBase="/athlete/inventory"
          setActive={setItemActiveAction}
          empty={{
            title: filtered ? "No items match" : "Nothing listed yet",
            hint: filtered
              ? "Clear the search or the filter to see every item."
              : "Add what you'd sell to a local business: a clinic session, a sponsored post, an appearance. You set the price and who you won't work with.",
          }}
          pagerTop={
            hasAny ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ListSearch initial={q} label="Search items" placeholder="Search by title" tone="athlete" />
                  <ListFilter param="active" value={active} label="Filter by state" allLabel="Active and paused" options={[...ACTIVE_OPTIONS]} tone="athlete" />
                </div>
                <PagerRow page={page} noun="Items" tone="athlete" position="top" filtered={filtered} />
              </div>
            ) : undefined
          }
          pagerBottom={hasAny ? <PagerRow page={page} noun="Items" tone="athlete" position="bottom" /> : undefined}
        >
          {restrictions && (
            <section aria-label="Categories you won't promote">
              <ArenaSection title="Categories you won't promote" hint="Applies to every item and every offer, for the dates shown." delay={0.5} />
              <ArenaPanel tone="flare" delay={0.54} spot>
                <InventoryRestrictions
                  rows={restrictions.map(toRestrictionRow)}
                  add={addRestrictionAction}
                  remove={removeRestrictionAction}
                />
              </ArenaPanel>
            </section>
          )}
        </InventoryManager>
      </div>
    </ServerList>
  );
}

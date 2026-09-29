import Link from "next/link";

import { Badge, Card, SectionHeading } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ListFilter, ListSearch, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { PropertyListingCreate } from "@/components/property-listing-form";
import { PropertyPackageContents } from "@/components/property-package";
import { apiListQuery, textParam, type SearchParams } from "@/lib/list-query";
import {
  inventoryOption,
  itemSummary,
  liveListingByItem,
  type ApiInventoryItem,
  type ApiListing,
  type ApiTeamInventoryPage,
} from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   New listing — 2S3-FE-01 (design Listing.dc.html). Two steps in the URL:

     /property/listings/new           pick an item — GET /team/inventory
                                      (the team's items and its roster
                                      athletes', paged, with each owner) and
                                      GET /listings (which items already have
                                      a live listing — the API allows one)
     /property/listings/new?item=ID   write it — GET /inventory/:id (and its
                                      components when it is a PACKAGE), then
                                      POST /listings from the client island

   Create preconditions are the API's: onboarding not approved, listing
   access not granted, or the item already live all answer 409, and the form
   shows that message as given. A package is an inventory item of kind
   PACKAGE — the listing only points at it; bundles are built in Inventory.
   No listing photos exist in the API, so there is no upload.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const ACTIVE = [
  { value: "true", label: "Active" },
  { value: "false", label: "Paused" },
];

export default async function NewListingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("property");
  const sp = await searchParams;
  const itemId = textParam(sp, "item");

  const heading = (
    <div>
      <Link href="/property/listings" className="text-xs text-primary hover:underline">
        ← Listings
      </Link>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">New listing</h1>
      <p className="mt-1 text-xs text-muted">{itemId ? "Say what the sponsor gets. It starts as a draft." : "Choose the item to sell. A listing puts one item — or one package — on the marketplace."}</p>
    </div>
  );

  if (itemId) {
    const res = await apiFetch(`/inventory/${encodeURIComponent(itemId)}`);
    if (res.status === 403 || res.status === 404) {
      return (
        <div className="space-y-6">
          {heading}
          <EmptyState mark="inbox" title="That item isn't yours to list" hint="Only your team's items and your roster athletes' items can be listed." action={{ label: "Choose an item", href: "/property/listings/new" }} />
        </div>
      );
    }
    if (!res.ok) throw new Error(`Item unavailable (${res.status}).`);
    const item = (await res.json()) as ApiInventoryItem;
    const s = itemSummary(item);
    return (
      <div className="space-y-6">
        {heading}
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted">{s.owner}</p>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="mt-0.5 text-[11px] text-muted">{[s.kind, s.qty, s.window].filter(Boolean).join(" · ")}</p>
            </div>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">{s.price}</span>
              <Badge tone={item.active ? "accent" : "neutral"}>{s.status}</Badge>
            </span>
          </div>
          {!item.active && <p className="mt-3 text-[11px] text-warn">This item is paused, so the listing can&rsquo;t go live until the item is active again.</p>}
          {s.isPackage && (
            <div className="mt-4 border-t border-line-soft pt-4">
              <PropertyPackageContents item={item} />
            </div>
          )}
          <p className="mt-3 text-[11px] text-faint">Price, stock and dates are the item&rsquo;s — change them in Inventory.</p>
        </Card>
        <PropertyListingCreate itemId={item.id} itemTitle={item.title} itemDescription={item.description} availableUntil={item.availableUntil} />
      </div>
    );
  }

  const q = textParam(sp, "q");
  const active = textParam(sp, "active", ["true", "false"]);
  const [invRes, listRes] = await Promise.all([apiFetch(`/team/inventory${apiListQuery(sp, { q, active })}`), apiFetch("/listings")]);
  if (invRes.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="inbox" title="No property is linked to this login" hint="Listings belong to a property's manager. Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!invRes.ok) throw new Error(`Inventory unavailable (${invRes.status}).`);
  if (!listRes.ok) throw new Error(`Listings unavailable (${listRes.status}).`);
  const inv = (await invRes.json()) as ApiTeamInventoryPage;
  const live = liveListingByItem(((await listRes.json()) as { listings: ApiListing[] }).listings);
  const rows = inv.inventory.map(inventoryOption);

  return (
    <div className="space-y-6">
      {heading}
      <section>
        <SectionHeading title="Your inventory" hint="Your team's items and your roster athletes' items." />
        {inv.counts.items === 0 ? (
          <EmptyState mark="inbox" title="Nothing to list yet" hint="Add an item in Inventory first — signage, tickets, appearances, or a package of them." />
        ) : (
          <ServerList>
            <div className="flex flex-wrap items-end gap-3">
              <ListSearch initial={q} label="Search items" placeholder="Search by title" tone="property" />
              <ListFilter param="active" value={active} label="Status" allLabel="Any status" options={ACTIVE} tone="property" />
            </div>
            <div className="mt-3" />
            <PagerRow page={inv.page} noun="Items" tone="property" position="top" filtered={!!(q || active)} />
            <div className="mt-3" />
            <PendingList>
              {rows.length === 0 ? (
                <Card>
                  <p className="text-sm font-semibold">No items match</p>
                  <p className="mt-1 text-xs text-muted">Clear the search or the status filter.</p>
                </Card>
              ) : (
                <Card className="p-0">
                  <ul className="divide-y divide-line-soft">
                    {rows.map((i) => {
                      const listingId = live.get(i.id);
                      return (
                        <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{i.title}</span>
                            <span className="block truncate text-[11px] text-muted">{[i.owner, i.kind, i.qty, i.window].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold tabular-nums">{i.price}</span>
                            {!i.active && <Badge>Paused</Badge>}
                            {listingId ? (
                              <Link href={`/property/listings/${listingId}`} className="text-[11px] text-muted hover:text-text">
                                Already listed →
                              </Link>
                            ) : (
                              <Link href={`/property/listings/new?item=${encodeURIComponent(i.id)}`} className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium hover:bg-surface-2">
                                List this
                              </Link>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </PendingList>
            <PagerRow page={inv.page} noun="Items" tone="property" position="bottom" />
          </ServerList>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { AthleteListCompose } from "@/components/athlete-listing-form";
import { ListingItemCard, RosteredPanel } from "@/components/athlete-listing-bits";
import { EmptyState } from "@/components/states";
import { listChecks, suggestedDescription, teamFromListings, type ApiAthleteListing, type ListableItem } from "@/lib/athlete-listings-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { sellerContext } from "../load";

/* --------------------------------------------------------------------------
   List my item · compose — 2S3-FE-02 (Claude Design ListMyItem.dc.html,
   compose view). /athlete/listings/new?item=ID.

   Reads  GET /inventory/:id     the athlete's own item (403/404 otherwise)
          GET /listings          already listed? on a team?
          GET /athletes/me · /restrictions · /payouts/account   (../load.ts)
   Writes POST /listings, then POST /listings/:id/submit   (../actions.ts)

   The listing's title is the item's (the design asks only what the sponsor
   gets); visibility is public. The checks are the API's governance rules
   plus two the seller should see but that never stop a listing: brands they
   won't work with, and the payout account on Stripe (with its button). The
   design's "No restricted words" row is left out — BTG's restricted-words
   check doesn't run on listings yet (agreed 2026-10-01: listings follow).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function NewAthleteListingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const raw = (await searchParams).item;
  const itemId = Array.isArray(raw) ? raw[0] : raw;
  if (!itemId) redirect("/athlete/listings");

  const heading = (
    <div>
      <Link href="/athlete/listings" className="text-xs text-muted hover:text-text">← List my item</Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">List my item</h1>
      <p className="mt-1 text-xs text-muted">Put an item from your inventory on the marketplace. It goes live as soon as the checks pass.</p>
    </div>
  );

  const [iRes, lRes] = await Promise.all([apiFetch(`/inventory/${encodeURIComponent(itemId)}`), apiFetch("/listings")]);
  if (iRes.status === 403 || iRes.status === 404) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="inbox" title="That item isn’t yours to list" hint="Only items in your own Inventory can be listed." action={{ label: "Choose an item", href: "/athlete/listings" }} />
      </div>
    );
  }
  if (!iRes.ok) throw new Error(`Item unavailable (${iRes.status}).`);
  if (!lRes.ok && lRes.status !== 403) throw new Error(`Listings unavailable (${lRes.status}).`);
  const item = (await iRes.json()) as ListableItem;
  const listings = lRes.ok ? ((await lRes.json()) as { listings: ApiAthleteListing[] }).listings : [];

  const team = teamFromListings(listings);
  if (team.onTeam) {
    return (
      <div className="space-y-6">
        {heading}
        <RosteredPanel teamName={team.teamName} />
      </div>
    );
  }

  const existing = listings.find((l) => l.inventoryItemId === item.id && l.state !== "ARCHIVED");
  if (existing) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="inbox" title="This item already has a listing" hint="One listing per item. Open it to see where it stands." action={{ label: "Open the listing", href: `/athlete/listings/${existing.id}` }} />
      </div>
    );
  }

  const ctx = await sellerContext();
  const initial = suggestedDescription(item);
  const checks = listChecks({ item, description: initial, blockers: [], athleteState: ctx.athleteState, wontPromote: ctx.wontPromote, payout: ctx.payout });

  return (
    <div className="space-y-6">
      {heading}
      <AthleteListCompose
        itemId={item.id}
        itemTitle={item.title}
        initial={initial}
        checks={checks}
        itemCard={<ListingItemCard item={item} owner={ctx.displayName ?? item.title} listing={null} />}
      />
    </div>
  );
}

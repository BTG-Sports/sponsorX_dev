import Link from "next/link";

import { AthleteListingEditor } from "@/components/athlete-listing-form";
import { ListingItemCard, ListingPill, RosteredPanel } from "@/components/athlete-listing-bits";
import { EmptyState } from "@/components/states";
import { isOwn, listChecks, listingTrack, statusText, type ApiAthleteListing } from "@/lib/athlete-listings-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { sellerContext } from "../load";

/* --------------------------------------------------------------------------
   One of my listings — 2S3-FE-02 (Claude Design ListMyItem.dc.html,
   submitted · live views; a draft to finish; paused and ended).

   Reads  GET  /listings/:id               the listing, its item, and the API's
                                           governance `blockers[]`
          GET  /athletes/me · /restrictions · /payouts/account   (../load.ts)
   Writes PATCH /listings/:id              what the sponsor gets (DRAFT/PAUSED)
          POST /listings/:id/submit        DRAFT → with BTG (422 problems[])
          POST /listings/:id/transition    Pause · Resume · End listing
   Links  ./preview                        the listing as a sponsor sees it in
                                           the shop (own listings)

   A team's listing of the athlete's item opens read-only: the API refuses
   the athlete's writes on it (listing write "own" is only what they sell).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;
  const back = <Link href="/athlete/listings" className="text-xs text-muted hover:text-text">← List my item</Link>;

  const res = await apiFetch(`/listings/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState mark="inbox" title="No listing of yours matches this link" hint="It may be someone else’s listing, or the link is wrong." action={{ label: "Your listings", href: "/athlete/listings" }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Listing unavailable (${res.status}).`);
  const listing = (await res.json()) as ApiAthleteListing;

  const heading = (
    <div>
      {back}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{listing.title}</h1>
        <ListingPill listing={listing} />
      </div>
      <p className="mt-1 text-xs text-muted">Put an item from your inventory on the marketplace. BTG checks it and puts it live.</p>
      {isOwn(listing) && (
        <Link
          href={`/athlete/listings/${encodeURIComponent(listing.id)}/preview`}
          className="mt-3 inline-flex rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface-2"
        >
          Preview as a sponsor sees it →
        </Link>
      )}
    </div>
  );

  if (!isOwn(listing)) {
    return (
      <div className="space-y-6">
        {heading}
        <RosteredPanel teamName={listing.seller.name} />
        <p className="text-xs text-muted">{statusText(listing)}</p>
      </div>
    );
  }

  const ctx = await sellerContext();
  const checks = listing.state === "ARCHIVED"
    ? []
    : listChecks({ item: listing.item, description: listing.description ?? "", blockers: listing.blockers, athleteState: ctx.athleteState, wontPromote: ctx.wontPromote, payout: ctx.payout });
  const changesAsked = listing.state === "DRAFT" && !!listing.reviewNotes;

  return (
    <div className="space-y-6">
      {heading}
      {listing.reviewNotes && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-xs ${changesAsked ? "border-warn/30 bg-warn/8" : "border-line bg-surface"}`}>
          <p className={`font-semibold ${changesAsked ? "text-warn" : ""}`}>{changesAsked ? "BTG asked for changes" : "BTG’s note"}</p>
          <p className="mt-1 whitespace-pre-line">{listing.reviewNotes}</p>
        </div>
      )}
      <AthleteListingEditor
        listing={listing}
        checks={checks}
        steps={listingTrack(listing)}
        status={statusText(listing)}
        itemCard={<ListingItemCard item={listing.item} owner={ctx.displayName ?? listing.seller.name} listing={listing} />}
      />
    </div>
  );
}

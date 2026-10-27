import Link from "next/link";

import { ArenaHead, ArenaPanel } from "@/components/arena-stage";
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
   Writes PATCH /listings/:id              what the sponsor gets (DRAFT/PAUSED,
                                           or held for BTG — back to DRAFT)
          POST /listings/:id/submit        DRAFT → live when the checks pass,
                                           else held for BTG with `hold`
                                           (422 problems[]) — 2S3-FE-04
          POST /listings/:id/transition    Pause · Resume · End listing
   Links  ./preview                        the listing as a sponsor sees it in
                                           the shop (own listings)

   A team's listing of the athlete's item opens read-only: the API refuses
   the athlete's writes on it (listing write "own" is only what they sell).

   P1-ART-22 (2026-10-11) — on the Arena: the title row is an ArenaHead
   (the status pill in its line; the back link and the sponsor's-eye
   preview as its actions) and BTG's note sits on a toned plate. The
   editor island is unchanged — same reads, same writes.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const backCls = "rounded-md text-xs font-medium text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-athlete/50";

export default async function AthleteListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;
  const back = <Link href="/athlete/listings" className={backCls}>← Listings</Link>;

  const res = await apiFetch(`/listings/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <ArenaHead title="Listing" actions={back} />
        <EmptyState mark="inbox" title="No listing of yours matches this link" hint="It may be someone else’s listing, or the link is wrong." action={{ label: "Your listings", href: "/athlete/listings" }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Listing unavailable (${res.status}).`);
  const listing = (await res.json()) as ApiAthleteListing;

  const heading = (
    <ArenaHead
      title={listing.title}
      lede={
        <span className="flex flex-wrap items-center gap-2">
          <ListingPill listing={listing} />
          <span>Put an item from your inventory on the marketplace.</span>
        </span>
      }
      actions={
        <>
          {back}
          {isOwn(listing) && (
            <Link
              href={`/athlete/listings/${encodeURIComponent(listing.id)}/preview`}
              className="inline-flex rounded-full border border-line px-3.5 py-2 text-xs font-medium text-text outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-athlete/50"
            >
              Preview as a sponsor sees it →
            </Link>
          )}
        </>
      }
    />
  );

  if (!isOwn(listing)) {
    return (
      <div className="space-y-6">
        {heading}
        <div className="sx-arena-in" style={{ "--sx-reveal-delay": "0.12s" } as React.CSSProperties}>
          <RosteredPanel teamName={listing.seller.name} />
        </div>
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
        <ArenaPanel tone={changesAsked ? "warn" : "blue"} delay={0.12} spot>
          <div role="status" className="text-xs">
            <p className={`text-sm font-semibold ${changesAsked ? "text-warn" : ""}`}>{changesAsked ? "BTG asked for changes" : "BTG’s note"}</p>
            <p className="mt-1 whitespace-pre-line">{listing.reviewNotes}</p>
          </div>
        </ArenaPanel>
      )}
      <div className="sx-arena-in" style={{ "--sx-reveal-delay": "0.18s" } as React.CSSProperties}>
        <AthleteListingEditor
          listing={listing}
          checks={checks}
          steps={listingTrack(listing)}
          status={statusText(listing)}
          itemCard={<ListingItemCard item={listing.item} owner={ctx.displayName ?? listing.seller.name} listing={listing} />}
        />
      </div>
    </div>
  );
}

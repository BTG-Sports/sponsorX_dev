import Link from "next/link";

import { ArenaHead } from "@/components/arena-stage";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { ItemShowcase } from "@/components/athlete-inventory/item-showcase";
import { EndListing, ListingBar, ListingWizard, type DeskItem } from "@/components/athlete-listings/listing-desk";
import { EmptyState } from "@/components/states";
import { deskControls, journey, wizardStart } from "@/lib/athlete-listing-desk";
import { initials, isOwn, listChecks, type ApiAthleteListing } from "@/lib/athlete-listings-live";
import { listingNote, listingStatus } from "@/lib/athlete-listings-shop";
import { kindLabel, usd, type ApiInventoryItem } from "@/lib/inventory-live";
import { stockOf, whenOf } from "@/lib/inventory-shop";
import { showcaseOf, type Showcase } from "@/lib/inventory-showcase";
import { btgNote } from "@/lib/listing-outcome";
import type { ApiMyProfile } from "@/lib/profile-live";
import type { PublicAthlete } from "@/lib/public-athlete";
import { showcaseSeller } from "@/lib/showcase-seller";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { sellerContext } from "../load";

import "../../inventory/inventory.css";
import "../../inventory/[id]/item.css";
import "../listings.css";
import "./listing.css";

/* --------------------------------------------------------------------------
   One of my listings — 2S3-FE-02 (Claude Design ListMyItem.dc.html).

   POL-FE-85 (2026-11-16) — redrawn. The programme owner: "more professional
   look + wow factor … easy to understand by human + not too cluttered + not
   to many informations at once", "maybe a step by step wizard too?", and
   "after its live/submitted, you will hide the step by step wizard and will
   show the public page of the item plus a options on how to end this item".
   So:

   - a DRAFT of the athlete's own is a three-step wizard (the item → what
     the sponsor gets → go live), opening on the first step with something
     to fix, a sponsor's-eye card beside it; "Discard this draft" at the
     foot;
   - anything else is the item's public showcase (the inventory item page's
     ItemShowcase, POL-FE-83, with the listing's own title and words) under
     a bar that says where it stands, Written → Checked → Live, and holds
     the one control its state allows, and the ways off, small: the Live
     switch pauses, "End listing" ends it for good (the owner moved these
     up from a section under the showcase: "put this at the top … so that
     it won't take much space"). After a submit or a resume the page opens
     on what happened (`?done=1`).

   Reads  GET /listings/:id                  the listing, its item, `blockers`
          GET /inventory/:itemId             the item, for the showcase
          GET /athletes/me (+ /public/athletes/:slug once live)   the byline
          GET /athletes/me · /restrictions · /payouts/account   (../load.ts)
                                             a draft's checks
   Writes ../actions — PATCH /listings/:id, POST …/submit, POST …/transition.
   A team's listing of the athlete's item opens read-only (no controls).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function json<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The showcase: the item's, with the listing's title and the words the sponsor reads. Without the item, the listing's own fields. */
function showcaseFor(l: ApiAthleteListing, item: ApiInventoryItem | null, now: number): Showcase {
  const words = l.description?.trim() || null;
  if (item) return { ...showcaseOf(item, now), title: l.title, description: words ?? item.description?.trim() ?? null };
  return {
    title: l.title,
    kind: l.item.kind,
    kindLabel: kindLabel(l.item.kind),
    price: usd(l.item.priceCents),
    description: words,
    stock: stockOf(l.item.quantity),
    when: whenOf(null, l.item.availableUntil, now),
    active: l.item.active,
    bundle: [],
    fits: [],
    rules: [],
    private: { wontSellTo: [], version: 0, updatedAt: l.updatedAt },
  };
}

export default async function AthleteListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;
  const done = (await searchParams).done === "1";

  const res = await apiFetch(`/listings/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <ArenaHead
          title="Listing"
          actions={
            <Link href="/athlete/listings" className="rounded-md text-xs font-medium text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-athlete/50">
              ← Listings
            </Link>
          }
        />
        <EmptyState mark="inbox" title="No listing of yours matches this link" hint="It may be someone else’s listing, or the link is wrong." action={{ label: "Your listings", href: "/athlete/listings" }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Listing unavailable (${res.status}).`);
  const listing = (await res.json()) as ApiAthleteListing;
  const now = new Date().getTime();
  const own = isOwn(listing);

  const [item, me] = await Promise.all([
    json<ApiInventoryItem>(`/inventory/${encodeURIComponent(listing.inventoryItemId)}`),
    json<ApiMyProfile>("/athletes/me"),
  ]);

  /* ── a draft of their own: the wizard ── */
  if (own && listing.state === "DRAFT") {
    const ctx = await sellerContext();
    const checks = listChecks({ item: item ?? listing.item, description: listing.description ?? "", blockers: listing.blockers, athleteState: ctx.athleteState, wontPromote: ctx.wontPromote, payout: ctx.payout });
    const desk: DeskItem = {
      kind: listing.item.kind,
      kindLabel: kindLabel(listing.item.kind),
      price: usd(listing.item.priceCents),
      stock: stockOf(listing.item.quantity).label,
      when: whenOf(item?.availableFrom ?? null, listing.item.availableUntil, now).label,
      itemHref: `/athlete/inventory/${encodeURIComponent(listing.inventoryItemId)}`,
    };
    const name = ctx.displayName ?? me?.displayName ?? listing.seller.name;
    return (
      <div className="sx-iv sx-ld space-y-6">
        <header className="sx-ld-head sx-iv-rise">
          <Link href="/athlete/listings" className="sx-is-back">
            <Glyph ui="back" className="size-4" />
            Listings
          </Link>
          <div>
            <p className="sx-ld-eyebrow">{listing.reviewNotes ? "Changes asked" : "New listing"}</p>
            <h1 className="sx-ld-title">{listing.title}</h1>
          </div>
        </header>
        {listing.reviewNotes && (
          <div className="sx-ld-btg sx-iv-rise" role="status">
            <strong>BTG asked for changes.</strong> {listing.reviewNotes}
          </div>
        )}
        <ListingWizard listing={listing} checks={checks} start={wizardStart(checks, listing.description ?? "")} item={desk} seller={{ name, initials: initials(name) }} />
        <div className="sx-ld-foot">
          <EndListing listing={listing} />
        </div>
      </div>
    );
  }

  /* ── submitted, live, paused or ended: the public page, with its bar and the ways off ── */
  const pub = me?.state === "ACTIVE" ? await json<PublicAthlete>(`/public/athletes/${encodeURIComponent(me.slug)}`) : null;
  const btg = btgNote(listing) ?? (listing.reviewNotes && listing.state !== "PENDING_APPROVAL" ? `BTG's note: ${listing.reviewNotes}` : null);
  return (
    <ItemShowcase
      id={listing.inventoryItemId}
      s={showcaseFor(listing, item, now)}
      seller={showcaseSeller(me, pub)}
      market={null}
      privatePanel={false}
      fitsEmpty="Any kind of brand. Pick the ones it suits best on the item in Inventory, so the right sponsors notice it."
      bar={
        <ListingBar
          listing={listing}
          status={listingStatus(listing, now)}
          note={listingNote(listing, now)}
          stops={journey(listing, now)}
          controls={deskControls(listing)}
          done={done}
          btg={btg}
        />
      }
    />
  );
}

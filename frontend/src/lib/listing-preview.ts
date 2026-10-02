/* --------------------------------------------------------------------------
   2S3-FE-01 (and 2S3-FE-02) — "Preview as a sponsor sees it". The pure
   pieces: turn the seller's own reads into the exact shape the sponsor shop
   renders (an ApiSearchResult, the GET /marketplace/search row), so the
   preview draws the SAME card the shop draws (ShopListingCard) — never a
   look-alike.

   Every field comes from a named read the seller is allowed:

     GET /listings/:id      title, description, publishedAt, item price/kind,
                            propertyName, seller            (any state, DRAFT too)
     GET /inventory/:itemId availableFrom/Until, categories, packageRules
     GET /properties/mine   the property line: name, kind, city, state
     GET /team/roster       a roster athlete's display name, sport, position
     GET /athletes/me       the independent athlete's own (2S3-FE-02)

   Search builds its row from the same columns (backend/src/domain/
   marketplace-search.ts SELECT), so a field the preview has is a field the
   sponsor sees. A read that fails is filled from the listing itself and
   named in the banner (previewGaps), never invented.
   -------------------------------------------------------------------------- */

import { fmtDay, type ApiSearchResult, type PackageRules } from "@/lib/shop-live";

/** The fields of GET /listings/:id the preview reads — both the property's
 *  ApiListing and the athlete's ApiAthleteListing satisfy it. */
export type PreviewListing = {
  id: string;
  title: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  state: "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
  publishAt: string | null;
  publishedAt: string | null;
  propertyName: string | null;
  seller?: { type: "PROPERTY" | "ATHLETE"; id: string; name: string };
  blockers: string[];
  item: {
    id: string;
    kind: string;
    priceCents: number;
    quantity: number | null;
    availableUntil: string | null;
    active: boolean;
    athleteId: string | null;
  };
};

/** The GET /inventory/:id fields search also selects. */
export type PreviewItem = {
  kind: string;
  priceCents: number;
  quantity: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  categories: string[];
  packageRules: PackageRules;
};

export type PreviewProperty = { id: string; name: string; kind: string; city: string | null; stateCode: string | null };
export type PreviewAthlete = { displayName: string; sport: string | null; position: string | null };

/**
 * The shop row this listing becomes once it is on sale. `item` null means
 * the inventory read failed: price and kind still come from the listing,
 * but the start date, categories and package rules are unknown — the page
 * names that gap (previewGaps).
 */
export function shopResultFrom(
  listing: PreviewListing,
  src: { item: PreviewItem | null; property: PreviewProperty | null; athlete: PreviewAthlete | null },
): { result: ApiSearchResult } {
  const it = src.item;
  /* A property's listing names its property even when /properties/mine
     failed — from the listing's own propertyName, with no kind or place. */
  const property: ApiSearchResult["property"] =
    src.property ??
    (listing.propertyName && listing.seller?.type !== "ATHLETE"
      ? { id: listing.seller?.id ?? "", name: listing.propertyName, kind: "", city: null, stateCode: null }
      : null);
  return {
    result: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      publishedAt: listing.publishedAt,
      property,
      seller: listing.seller,
      athlete: listing.item.athleteId && src.athlete ? { ...src.athlete } : null,
      item: {
        id: listing.item.id,
        kind: it?.kind ?? listing.item.kind,
        priceCents: it?.priceCents ?? listing.item.priceCents,
        quantity: it ? it.quantity : listing.item.quantity,
        availableFrom: it ? it.availableFrom : null,
        availableUntil: it ? it.availableUntil : listing.item.availableUntil,
        categories: it?.categories ?? [],
        packageRules: it?.packageRules ?? null,
      },
    },
  };
}

/** The banner's headline: on sale now, or once it goes live (2S3-BE-06: as soon as its checks pass). */
export function previewHeadline(state: PreviewListing["state"]): string {
  return state === "PUBLISHED"
    ? "Preview — this is how sponsors see it in the shop"
    : "Preview — sponsors see this once it goes live";
}

/**
 * Why a sponsor might not see this card right now, in plain words — the
 * rules search applies (state, visibility, publish day, item on sale) and
 * the governance blockers still open. Empty when it is on sale and visible.
 */
export function previewNotes(listing: PreviewListing, nowMs: number): string[] {
  const out: string[] = [];
  if (listing.state === "DRAFT") out.push("It's a draft — only you can see it until you submit it. It goes live as soon as the checks pass.");
  if (listing.state === "PENDING_APPROVAL") out.push("BTG is taking a look — it goes on sale when they approve it. We'll email you.");
  if (listing.state === "PAUSED") out.push("It's paused — hidden from sponsors until you resume it.");
  if (listing.state === "ARCHIVED") out.push("It's archived — sponsors won't see it again.");
  if (listing.visibility === "PRIVATE") out.push("It's private — kept out of the shop's search.");
  if (listing.publishAt && new Date(listing.publishAt).getTime() > nowMs) {
    out.push(`It's set to go on sale on ${fmtDay(listing.publishAt)}.`);
  }
  if (!listing.item.active) out.push("Its item is switched off in inventory, so the shop hides it.");
  if (listing.state !== "ARCHIVED" && listing.blockers.length > 0) {
    out.push(
      `${listing.blockers.length} ${listing.blockers.length === 1 ? "point" : "points"} on the checklist ${listing.blockers.length === 1 ? "is" : "are"} still open — see the editor.`,
    );
  }
  return out;
}

/** The parts of the card a best-effort read couldn't fill, named for the
 *  banner. The property's details are expected only where they can be read
 *  (`readsProperty` — the property portal); an independent athlete's listing
 *  has no property at all (2S3-BE-05). */
export function previewGaps(
  listing: PreviewListing,
  src: { item: PreviewItem | null; property: PreviewProperty | null; athlete: PreviewAthlete | null },
  readsProperty: boolean,
): string[] {
  const out: string[] = [];
  if (!src.item) out.push("the item's dates and package rules");
  if (readsProperty && !src.property && listing.seller?.type !== "ATHLETE") out.push("the property's type and place");
  if (listing.item.athleteId && !src.athlete) out.push("the athlete's line");
  return out;
}

import Link from "next/link";

import { EmptyState } from "@/components/states";
import { ListingShopPreview } from "@/components/listing-shop-preview";
import type { ApiAthleteListing } from "@/lib/athlete-listings-live";
import {
  previewGaps,
  previewHeadline,
  previewNotes,
  shopResultFrom,
  type PreviewAthlete,
  type PreviewItem,
} from "@/lib/listing-preview";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Listing preview — 2S3-FE-02 (the independent athlete's "List my item"),
   the same preview as the property's (2S3-FE-01): the listing exactly as a
   sponsor sees it in the shop, drawn by the shop's own ShopListingCard,
   with "Add to cart" disabled.

   Reads  GET /listings/:id         the listing, in any state (DRAFT too)
          GET /inventory/:itemId    dates, categories, package rules
          GET /athletes/me          the athlete line (display name, sport,
                                    position) — the item is the athlete's own
   Writes none.

   An independent athlete's listing has no property: the shop names them
   as the seller (sellerLine). A team's listing of the athlete's item shows
   the team by name only — the athlete can't read the team's place.
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

export default async function AthleteListingPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;

  const res = await apiFetch(`/listings/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <Link href="/athlete/listings" className="text-xs text-muted hover:text-text">
          ← List my item
        </Link>
        <EmptyState mark="inbox" title="No listing of yours matches this link" hint="It may be someone else’s listing, or the link is wrong." action={{ label: "Your listings", href: "/athlete/listings" }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Listing unavailable (${res.status}).`);
  const listing = (await res.json()) as ApiAthleteListing;

  const [item, me] = await Promise.all([
    json<PreviewItem>(`/inventory/${encodeURIComponent(listing.item.id)}`),
    json<PreviewAthlete>("/athletes/me"),
  ]);
  const athlete: PreviewAthlete | null = me?.displayName
    ? { displayName: me.displayName, sport: me.sport ?? null, position: me.position ?? null }
    : null;
  /* No property read: an athlete can't call /properties/mine. A team's
     listing falls back to its name from the listing (shopResultFrom). */
  const src = { item, property: null, athlete };
  const { result } = shopResultFrom(listing, src);
  const nowMs = new Date().getTime(); /* request time — the page is force-dynamic */

  return (
    <ListingShopPreview
      result={result}
      headline={previewHeadline(listing.state)}
      notes={previewNotes(listing, nowMs)}
      gaps={previewGaps(listing, src, false)}
      back={{ href: `/athlete/listings/${encodeURIComponent(id)}`, label: "Back to your listing" }}
    />
  );
}

import Link from "next/link";

import { EmptyState } from "@/components/states";
import { ListingShopPreview } from "@/components/listing-shop-preview";
import {
  previewGaps,
  previewHeadline,
  previewNotes,
  shopResultFrom,
  type PreviewAthlete,
  type PreviewItem,
  type PreviewProperty,
} from "@/lib/listing-preview";
import type { ApiListing } from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Listing preview — 2S3-FE-01 (the listing editor's "preview"). The
   property's listing exactly as a sponsor sees it in the shop
   (/sponsor/shop): the shop's own ShopListingCard, fed the fields search
   would return, with "Add to cart" disabled.

   Reads  GET /listings/:id         the listing, in any state (DRAFT too) —
                                    the property reads its own
          GET /inventory/:itemId    dates, categories, package rules
          GET /properties/mine      the property line (name · kind · place)
          GET /team/roster          only for a roster athlete's item — their
                                    display name, sport and position
   Writes none.

   The last three are best-effort: a refused read falls back to what the
   listing itself carries and the page says which part may differ.
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

export default async function PropertyListingPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("property");
  const { id } = await params;
  const editor = `/property/listings/${encodeURIComponent(id)}`;

  const res = await apiFetch(`/listings/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <Link href="/property/listings" className="text-xs text-primary hover:underline">
          ← Listings
        </Link>
        <EmptyState mark="inbox" title="This listing isn't one of yours" hint="It may belong to another property, or the link is wrong." action={{ label: "Your listings", href: "/property/listings" }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Listing unavailable (${res.status}).`);
  const listing = (await res.json()) as ApiListing & { seller?: { type: "PROPERTY" | "ATHLETE"; id: string; name: string } };

  const [item, property, roster] = await Promise.all([
    json<PreviewItem>(`/inventory/${encodeURIComponent(listing.item.id)}`),
    json<PreviewProperty>("/properties/mine"),
    listing.item.athleteId
      ? json<{ athletes: Array<PreviewAthlete & { id: string }> }>("/team/roster")
      : Promise.resolve(null),
  ]);
  const rosterAthlete = roster?.athletes.find((a) => a.id === listing.item.athleteId) ?? null;
  const athlete: PreviewAthlete | null = rosterAthlete
    ? { displayName: rosterAthlete.displayName, sport: rosterAthlete.sport, position: rosterAthlete.position }
    : null;

  const src = { item, property, athlete };
  const { result } = shopResultFrom(listing, src);
  const nowMs = new Date().getTime(); /* request time — the page is force-dynamic */

  return (
    <ListingShopPreview
      result={result}
      headline={previewHeadline(listing.state)}
      notes={previewNotes(listing, nowMs)}
      gaps={previewGaps(listing, src, true)}
      back={{ href: editor, label: "Back to the listing editor" }}
    />
  );
}

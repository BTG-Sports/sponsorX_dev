import Link from "next/link";

import { ArenaHead } from "@/components/arena-stage";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { PreviewWindow } from "@/components/athlete-listings/preview-window";
import { ShopListingCard } from "@/components/shop-listing-card";
import { EmptyState } from "@/components/states";
import type { ApiAthleteListing } from "@/lib/athlete-listings-live";
import {
  previewGaps,
  previewNotes,
  shopResultFrom,
  type PreviewAthlete,
  type PreviewItem,
} from "@/lib/listing-preview";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

import "../../../inventory/inventory.css";
import "./preview.css";

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

   P1-ART-22 (2026-10-11) — on the Arena: ListingShopPreview `arena` draws
   the title row as an ArenaHead (back link as its action) and the preview
   banner on a plate; the not-found answer sits under the same head. Visual
   only — same reads, still no writes.

   POL-FE-86 (2026-11-16) — redrawn (the programme owner: "lets redesign
   this also", after the listing page's POL-FE-85). The shop's own card,
   untouched, now sits in a shop window among blank placeholder cards, with
   a Desktop ↔ Phone switch (components/athlete-listings/preview-window.tsx).
   Over it, one bar: back to the listing, whether sponsors can see it now
   (green) or not yet (amber) in one line, and the reasons as short chips
   (previewNotes, unchanged). The property's preview keeps
   ListingShopPreview. Same reads, still no writes.
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
        <ArenaHead
          title="Preview"
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

  const notes = previewNotes(listing, nowMs);
  const gaps = previewGaps(listing, src, false);
  const visible = listing.state === "PUBLISHED" && notes.length === 0;
  const back = `/athlete/listings/${encodeURIComponent(id)}`;

  return (
    <div className="sx-iv sx-pv">
      <div className="sx-pv-bar sx-iv-rise" data-visible={visible ? "" : undefined}>
        <Link href={back} className="sx-pv-back">
          <Glyph ui="back" className="size-4" />
          Your listing
        </Link>
        <div className="sx-pv-say">
          <span className="sx-pv-dot" aria-hidden="true">
            <Glyph ui={visible ? "eye" : "lock"} className="size-4" />
          </span>
          <span className="min-w-0">
            <strong>{visible ? "Sponsors can see this now" : "Sponsors will see this once it's live"}</strong>
            <span>This is the shop&rsquo;s own card, drawn from what you&rsquo;ve saved. Its button is switched off here.</span>
          </span>
        </div>
      </div>

      {(notes.length > 0 || gaps.length > 0) && (
        <ul className="sx-pv-notes sx-iv-rise" style={{ "--d": "0.06s" } as React.CSSProperties} aria-label="Why sponsors don't see it yet">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {gaps.length > 0 && <li data-tone="warn">Couldn&rsquo;t read {gaps.join(" or ")} just now, so that part may differ in the shop.</li>}
        </ul>
      )}

      <PreviewWindow>
        <ShopListingCard
          result={result}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled
                title="Preview only — sponsors add it to their cart once it's on sale."
                className="cursor-not-allowed rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink opacity-40"
              >
                Add to cart
              </button>
            </div>
          }
        />
      </PreviewWindow>

      <p className="sx-pv-foot">Sponsors in a brand category you&rsquo;ve said you won&rsquo;t promote never see it.</p>
    </div>
  );
}

import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PropertyListingEditor } from "@/components/property-listing-form";
import { PropertyPackageContents } from "@/components/property-package";
import { dateLabel, itemSummary, listingState, type ApiInventoryItem, type ApiListing } from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Listing editor — 2S3-FE-01 (design Listing.dc.html).

   Reads  GET  /listings/:id                 the listing, its item and its
                                             governance `blockers[]`
          GET  /inventory/:itemId            only for a PACKAGE — its components
   Links  ./preview                          the listing as a sponsor sees it
                                             in the shop (ShopListingCard)
   Writes PATCH /listings/:id                while DRAFT, PAUSED or held for BTG
                                             (the edit takes a held one back to DRAFT)
          POST /listings/:id/submit          DRAFT → PUBLISHED when the checks pass,
                                             else held for BTG (422 problems[])
          POST /listings/:id/transition      pause · resume (the same path) · archive

   `blockers` drive the governance checklist; `reviewNotes` are shown when
   BTG sent it back; `hold` says why BTG is taking a look (2S3-FE-04);
   `publishedBy` says how it went live. Read-only while on sale, apart from
   the moves the state machine allows. Honest gaps: no photos, no delete, and
   the item can't be swapped after creation (archive and list again).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function ListingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("property");
  const { id } = await params;

  const back = (
    <Link href="/property/listings" className="text-xs text-primary hover:underline">
      ← Listings
    </Link>
  );

  const res = await apiFetch(`/listings/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState mark="inbox" title="This listing isn't one of yours" hint="It may belong to another property, or the link is wrong." action={{ label: "Your listings", href: "/property/listings" }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Listing unavailable (${res.status}).`);
  const listing = (await res.json()) as ApiListing;

  let pkg: ApiInventoryItem | null = null;
  if (listing.item.kind === "PACKAGE") {
    const r = await apiFetch(`/inventory/${encodeURIComponent(listing.item.id)}`);
    if (!r.ok && r.status !== 403 && r.status !== 404) throw new Error(`Package unavailable (${r.status}).`);
    pkg = r.ok ? ((await r.json()) as ApiInventoryItem) : null;
  }

  const st = listingState(listing.state);
  const s = itemSummary(listing.item);
  const changesRequested = listing.state === "DRAFT" && !!listing.reviewNotes;
  const dates = [
    listing.submittedAt ? `Submitted ${dateLabel(listing.submittedAt)}` : null,
    listing.decidedAt ? `BTG decided ${dateLabel(listing.decidedAt)}` : null,
    listing.publishedAt
      ? `${listing.publishedBy === "AUTOMATIC" ? "Went live automatically" : listing.publishedBy === "BTG" ? "Approved by BTG" : "On sale"} ${dateLabel(listing.publishedAt)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        {back}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{listing.title}</h1>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">{st.detail}</p>
        {dates.length > 0 && <p className="mt-0.5 text-[11px] text-faint">{dates.join(" · ")}</p>}
        <Link
          href={`/property/listings/${encodeURIComponent(listing.id)}/preview`}
          className="mt-3 inline-flex rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface-2"
        >
          Preview as a sponsor sees it →
        </Link>
      </div>

      {listing.reviewNotes && (
        <div className={`rounded-lg border px-4 py-3 text-xs ${changesRequested ? "border-warn/30 bg-warn/8" : "border-line bg-surface"}`}>
          <p className={`font-semibold ${changesRequested ? "text-warn" : ""}`}>{changesRequested ? "BTG asked for changes" : "BTG's note"}</p>
          <p className="mt-1 whitespace-pre-line text-text">{listing.reviewNotes}</p>
          {changesRequested && <p className="mt-1 text-[11px] text-muted">Make the changes, then submit it again.</p>}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted">
              {s.owner} · {listing.propertyName}
            </p>
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="mt-0.5 text-[11px] text-muted">{[s.kind, s.qty, s.window].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">{s.price}</span>
            <Badge tone={listing.item.active ? "accent" : "neutral"}>{s.status}</Badge>
          </span>
        </div>
        {pkg && (
          <div className="mt-4 border-t border-line-soft pt-4">
            <PropertyPackageContents item={pkg} />
          </div>
        )}
        <p className="mt-3 text-[11px] text-faint">
          Price, stock and dates are the item&rsquo;s — change them in Inventory{listing.state === "PUBLISHED" ? " after pausing this listing" : ""}.
        </p>
      </Card>

      <PropertyListingEditor listing={listing} />
    </div>
  );
}

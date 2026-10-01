import Link from "next/link";

import { Badge } from "@/components/ui";
import { initials, itemLine, listingBadge, type ApiAthleteListing, type ListableItem } from "@/lib/athlete-listings-live";

/* --------------------------------------------------------------------------
   2S3-FE-02 — the pieces "List my item" repeats (ListMyItem.dc.html): the
   status pill, the item card, and the rostered panel. Server components.
   -------------------------------------------------------------------------- */

export function ListingPill({ listing }: { listing: Pick<ApiAthleteListing, "state" | "reviewNotes" | "publishAt"> | null }) {
  const b = listingBadge(listing);
  return (
    <Badge tone={b.tone}>
      <span aria-hidden="true" className="mr-1">{b.mark}</span>
      {b.label}
    </Badge>
  );
}

export function ListingItemCard({ item, owner, listing }: { item: ListableItem; owner: string; listing: Pick<ApiAthleteListing, "state" | "reviewNotes" | "publishAt"> | null }) {
  return (
    <section aria-label="Item" className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-soft text-[11px] font-bold text-cta-ink">
          {initials(owner)}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold">{item.title}</strong>
          <span className="text-xs text-muted">{itemLine(item)} · from your Inventory</span>
        </span>
        <ListingPill listing={listing} />
      </div>
    </section>
  );
}

export function RosteredPanel({ teamName }: { teamName: string | null }) {
  const team = teamName ?? "your team";
  return (
    <section role="status" aria-label="Your team lists your items" className="space-y-2.5 rounded-xl border border-line bg-surface p-5">
      <p className="text-[15px] font-semibold">Your team lists your items</p>
      <p className="text-[13px] leading-relaxed text-text/85">
        You&rsquo;re on {teamName ? `the ${teamName}` : "a team’s"} roster, so {team} puts your items on the marketplace. Ask your team manager to list an item for you.
      </p>
      <Link href="/athlete/team" className="inline-block text-[13px] font-semibold text-primary-soft hover:underline">See your team →</Link>
    </section>
  );
}

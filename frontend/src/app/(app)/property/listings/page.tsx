import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { textParam, type SearchParams } from "@/lib/list-query";
import { LISTING_STATE_OPTIONS, LISTING_STATES, listingRow, type ApiListing } from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Listings — 2S3-FE-01 (design Listing.dc.html, the list side). What the
   property has put, or is putting, on the marketplace, by state.

   Reads GET /listings?state=   the property's listings (own-property scope);
                                not paged — the API returns them all.

   Each row opens the editor at /property/listings/[id]; "New listing" picks
   an inventory item first. A 403 is a login with no property. No listing
   views, requests or photos exist in the API, so none are shown.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("property");
  const sp = await searchParams;
  const state = textParam(sp, "state", LISTING_STATES);

  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Listings</h1>
        <p className="mt-1 text-xs text-muted">What you sell on the marketplace. A listing goes live as soon as its checks pass; BTG takes a look only when something is flagged.</p>
      </div>
      <Link href="/property/listings/new" className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft">
        New listing
      </Link>
    </div>
  );

  const res = await apiFetch(`/listings${state ? `?state=${state}` : ""}`);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="inbox" title="No property is linked to this login" hint="Listings belong to a property's manager. Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Listings unavailable (${res.status}).`);
  const { listings } = (await res.json()) as { listings: ApiListing[] };
  const rows = listings.map(listingRow);

  const chip = (value: string, label: string) => {
    const on = state === value;
    return (
      <Link
        key={value || "all"}
        href={value ? `/property/listings?state=${value}` : "/property/listings"}
        aria-current={on ? "page" : undefined}
        className={`rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-primary-soft" : "text-muted hover:text-text"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      {heading}
      <nav aria-label="Filter by state" className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 sm:w-fit">
        {chip("", "All")}
        {LISTING_STATE_OPTIONS.map((o) => chip(o.value, o.label))}
      </nav>

      {rows.length === 0 ? (
        state ? (
          <EmptyState mark="inbox" title="No listings in this state" hint="Pick another state, or All, to see the rest." action={{ label: "Show all", href: "/property/listings" }} />
        ) : (
          <EmptyState
            mark="inbox"
            title="No listings yet"
            hint="List what you sell — signage, tickets, appearances, or a roster athlete's item. Each one starts as a draft."
            action={{ label: "Create a listing", href: "/property/listings/new" }}
          />
        )
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/property/listings/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {r.item}
                      {r.updated ? ` · updated ${r.updated}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums">{r.price}</span>
                    {r.changesRequested && <Badge tone="warn">Changes requested</Badge>}
                    {r.blockers > 0 && <Badge tone="warn">{`${r.blockers} to fix`}</Badge>}
                    <Badge tone={r.stateTone}>{r.stateLabel}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

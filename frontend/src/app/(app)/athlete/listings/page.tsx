import Link from "next/link";

import { ListingPill, RosteredPanel } from "@/components/athlete-listing-bits";
import { EmptyState } from "@/components/states";
import { Card, SectionHeading } from "@/components/ui";
import {
  SELLING_STATES, isOwn, itemLine, itemsToList, teamFromListings, type ApiAthleteListing, type ListableItem,
} from "@/lib/athlete-listings-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { sellerContext } from "./load";

/* --------------------------------------------------------------------------
   List my item — 2S3-FE-02 (Claude Design ListMyItem.dc.html; the rostered
   view, and the way into compose). Athlete portal, over 2S3-BE-05.

   Reads  GET /listings        every listing of the athlete's items: their
                               own, and their team's of them (read "own")
          GET /inventory       their own items — the ones with no live
                               listing can be listed
          GET /athletes/me     approved or not (./load.ts)

   A roster athlete — the API names it through a team's listing of their
   item, or their own listing's "on a team" blocker — sees "Your team lists
   your items" and the team's listings, read-only. Otherwise: their own
   listings, and the items ready to list. A 403 (a guardian's login) is
   explained; any other failure is the error page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "List my item";
const INTRO = "Put an item from your inventory on the marketplace. BTG checks it and puts it live.";

function Row({ l }: { l: ApiAthleteListing }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-xs">
      <span className="min-w-[12rem] flex-1">
        <span className="block text-[13px] font-medium">{l.title}</span>
        <span className="block text-[11px] text-muted">{itemLine(l.item)}{isOwn(l) ? "" : ` · listed by ${l.seller.name}`}</span>
      </span>
      <ListingPill listing={l} />
      <Link href={`/athlete/listings/${l.id}`} aria-label={`Open ${l.title}`} className="font-medium text-primary hover:underline">Open →</Link>
    </li>
  );
}

export default async function AthleteListingsPage() {
  await requirePortalAccess("athlete");
  const [lRes, iRes] = await Promise.all([apiFetch("/listings"), apiFetch("/inventory")]);
  if (lRes.status === 403 || iRes.status === 403) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <EmptyState mark="users" title="Listings are the athlete’s to manage" hint="An athlete lists their own items from their own login. A guardian’s login can’t list them." />
      </div>
    );
  }
  if (!lRes.ok) throw new Error(`Listings unavailable (${lRes.status}).`);
  if (!iRes.ok) throw new Error(`Inventory unavailable (${iRes.status}).`);
  const { listings } = (await lRes.json()) as { listings: ApiAthleteListing[] };
  const { items } = (await iRes.json()) as { items: ListableItem[] };
  const team = teamFromListings(listings);
  const ctx = team.onTeam ? null : await sellerContext();
  const approved = !ctx?.athleteState || SELLING_STATES.includes(ctx.athleteState);

  const own = listings.filter(isOwn).sort((a, b) => Number(a.state === "ARCHIVED") - Number(b.state === "ARCHIVED"));
  const theirs = listings.filter((l) => !isOwn(l) && l.state !== "ARCHIVED");
  const ready = itemsToList(items, listings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">{INTRO}</p>
      </div>

      {team.onTeam ? (
        <>
          <RosteredPanel teamName={team.teamName} />
          {theirs.length > 0 && (
            <section>
              <SectionHeading title="Your items on the marketplace" hint="Listed by your team. Every sale shows on your Orders page." />
              <Card className="p-0"><ul className="divide-y divide-line-soft">{theirs.map((l) => <Row key={l.id} l={l} />)}</ul></Card>
            </section>
          )}
        </>
      ) : (
        <>
          {!approved && (
            <div role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-xs">
              <p className="font-semibold">Listing opens once BTG approves your profile</p>
              <p className="mt-1 text-muted">You can get your items ready in Inventory meanwhile.</p>
            </div>
          )}

          {own.length > 0 && (
            <section>
              <SectionHeading title="Your listings" />
              <Card className="p-0"><ul className="divide-y divide-line-soft">{own.map((l) => <Row key={l.id} l={l} />)}</ul></Card>
            </section>
          )}

          <section>
            <SectionHeading title="Ready to list" hint="Items from your Inventory with no listing yet. One listing per item." />
            {items.length === 0 ? (
              <EmptyState mark="inbox" title="Nothing in your inventory yet" hint="Add what you’d sell — a clinic, a post, an appearance — at your price, then list it here." action={{ label: "Go to Inventory", href: "/athlete/inventory" }} />
            ) : ready.length === 0 ? (
              <p className="text-xs text-muted">Every item already has a listing. Add another in <Link href="/athlete/inventory" className="text-primary hover:underline">Inventory</Link>.</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-line-soft">
                  {ready.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-xs">
                      <span className="min-w-[12rem] flex-1">
                        <span className="block text-[13px] font-medium">{i.title}</span>
                        <span className="block text-[11px] text-muted">{itemLine(i)}{i.active ? "" : " · paused in Inventory"}</span>
                      </span>
                      <Link
                        href={`/athlete/listings/new?item=${encodeURIComponent(i.id)}`}
                        aria-label={`List ${i.title}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink hover:bg-primary-soft"
                      >
                        List this item
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

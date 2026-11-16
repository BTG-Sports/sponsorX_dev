import Link from "next/link";

import { ArenaHead, ArenaPanel } from "@/components/arena-stage";
import { ItemShowcase, type ShowcaseSeller } from "@/components/athlete-inventory/item-showcase";
import { InventoryEditItem, ItemSaleSwitch } from "@/components/athlete-inventory/inventory-shop";
import { teamFromListings, type ApiAthleteListing } from "@/lib/athlete-listings-live";
import type { ApiInventoryItem } from "@/lib/inventory-live";
import { marketStatus, showcaseOf } from "@/lib/inventory-showcase";
import type { ApiMyProfile } from "@/lib/profile-live";
import { reach, type PublicAthlete } from "@/lib/public-athlete";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { setItemActiveAction, updateItemAction } from "../actions";

import "../inventory.css";
import "./item.css";

/* --------------------------------------------------------------------------
   One item — 2S2-FE-02. Athlete portal.

   POL-FE-83 (2026-11-16) — the owner: "instead of edit, it must be view,
   and the view page of that item must show like in the public profile of
   the athlete because athletes are selling their product it must have a
   public view also before the edit, the design must caught the attention
   of the sponsors". So the page opens on the item's showcase, in the public
   athlete page's hand (components/athlete-public-page): a product stage in
   the kind's colour, the title, the athlete selling it, the price, what's
   in it, who it suits. Edit is a button (the same form, in a popup); the
   "On sale" switch sits beside it. What sponsors never see is one panel at
   the end, marked "Only you see this". Owner-framed, inside the portal
   (memory: portal-views-stay-in-portal): no inert sponsor button — where a
   sponsor buys it is said plainly, with the athlete's next step.

   Reads
     GET /inventory/:id            the item (own scope; 403 is "not yours"
                                   and "no such item" alike)
     GET /athletes/me              the seller line: name, sport, school,
                                   photo; state (ACTIVE = live)
     GET /public/athletes/:slug    once ACTIVE: reach and track record, the
                                   same answer sponsors get. If it fails the
                                   showcase leaves those numbers out (the
                                   item is this page's job), never a guess.
     GET /listings                 is it on the marketplace, or does a team
                                   list for them (as /athlete/listings/new)
   Writes PATCH /inventory/:id through ../actions — {active} from the switch,
   the changed fields from the form. A package's contents stay fixed.
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

function sellerFrom(me: ApiMyProfile | null, pub: PublicAthlete | null): ShowcaseSeller | null {
  if (!me) return null;
  const r = pub ? reach(pub.socials) : null;
  return {
    name: me.displayName,
    roleLine: [me.position, me.sport].filter(Boolean).join(" · "),
    school: me.school,
    place: [me.city, me.stateCode].filter(Boolean).join(", ") || null,
    photoUrl: pub?.photoUrl ?? me.photoUrl ?? null,
    live: me.state === "ACTIVE",
    reach: r && r.total > 0 ? { total: r.total, verified: r.allVerified } : null,
    track: pub?.track ? { campaigns: pub.track.campaignsCompleted, postsLive: pub.track.postsLive, brands: pub.track.brands } : null,
  };
}

export default async function AthleteInventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;
  const [res, me, listingsAnswer] = await Promise.all([
    apiFetch(`/inventory/${encodeURIComponent(id)}`),
    json<ApiMyProfile>("/athletes/me"),
    json<{ listings: ApiAthleteListing[] }>("/listings"),
  ]);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <ArenaHead
          title="Item"
          actions={
            <Link href="/athlete/inventory" className="rounded-md text-xs font-medium text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-athlete/50">
              ← All items
            </Link>
          }
        />
        <ArenaPanel tone="ink" delay={0.12}>
          <p className="text-sm font-medium">Item not found</p>
          <p className="mt-1 text-xs text-muted">This item doesn&rsquo;t exist or isn&rsquo;t yours to view.</p>
        </ArenaPanel>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Inventory item unavailable (${res.status}).`);
  const item = (await res.json()) as ApiInventoryItem;

  const pub = me?.state === "ACTIVE" ? await json<PublicAthlete>(`/public/athletes/${encodeURIComponent(me.slug)}`) : null;
  const listings = listingsAnswer?.listings ?? [];
  const now = new Date().getTime();

  return (
    <ItemShowcase
      id={item.id}
      s={showcaseOf(item, now)}
      seller={sellerFrom(me, pub)}
      market={marketStatus(item.id, listings, teamFromListings(listings).onTeam)}
      sale={<ItemSaleSwitch id={item.id} active={item.active} title={item.title} setActive={setItemActiveAction} />}
      edit={<InventoryEditItem item={item} update={updateItemAction} />}
    />
  );
}

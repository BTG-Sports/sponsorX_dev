import type { ShowcaseSeller } from "@/components/athlete-inventory/item-showcase";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { kindLabel, usd } from "@/lib/inventory-live";
import { stockOf, whenOf } from "@/lib/inventory-shop";
import { rulesLines, type Showcase } from "@/lib/inventory-showcase";
import { reach, type PublicAthlete } from "@/lib/public-athlete";
import type { ApiSearchResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   POL-FE-91 — a shop item's own page (/sponsor/shop/[id]) is the SAME
   showcase the athlete sees on /athlete/inventory/[id] and
   /athlete/listings/[id] (the owner: "the view page must be a new page
   which shows what the athlete would show — we need to be consistent").
   So the sponsor's page renders the athlete's ItemShowcase, fed from
   GET /marketplace/search/:id through the same word functions the athlete
   side uses (stockOf, whenOf, rulesLines, kindLabel) — one item, one way of
   saying it, on both sides.

   Pure, so tests read it directly. Reach and track record come only from
   the athlete's public answer (GET /public/athletes/:slug), the one every
   sponsor gets; without it they're left out, never guessed.
   -------------------------------------------------------------------------- */

/** GET /marketplace/search/:id — the search row plus what the item page needs. */
export type ApiCatalogListing = ApiSearchResult & {
  bundle: Array<{ title: string; kind: string; quantity: number }>;
  /** The athlete's public page slug, when that page is up. */
  athleteSlug: string | null;
};

export function catalogShowcase(r: ApiCatalogListing, now: number): Showcase {
  return {
    title: r.title,
    kind: r.item.kind,
    kindLabel: kindLabel(r.item.kind),
    price: usd(r.item.priceCents),
    description: r.description?.trim() || null,
    stock: stockOf(r.item.quantity),
    when: whenOf(r.item.availableFrom, r.item.availableUntil, now),
    /* the catalogue holds only items on sale */
    active: true,
    bundle: (r.bundle ?? []).map((b) => ({ title: b.title, kind: b.kind, kindLabel: kindLabel(b.kind), quantity: b.quantity })),
    fits: (r.item.categories ?? []).map((c) => categoryLabel(c as BrandCategory)),
    rules: rulesLines(r.item.packageRules as Record<string, unknown> | null),
    /* never shown to a sponsor (privatePanel off) */
    private: { wontSellTo: [], version: 0, updatedAt: r.publishedAt ?? new Date(now).toISOString() },
  };
}

/** "Offered by" and "Who you're working with": the athlete (from the row, then their public page), or the team. */
export function catalogSeller(r: ApiCatalogListing, pub: PublicAthlete | null): ShowcaseSeller {
  if (!r.athlete) {
    return {
      name: r.seller?.name ?? r.property?.name ?? "Seller",
      roleLine: r.property ? "Team" : "",
      school: null,
      place: r.property ? [r.property.city, r.property.stateCode].filter(Boolean).join(", ") || null : null,
      photoUrl: null,
      live: false,
      reach: null,
      track: null,
    };
  }
  const total = pub ? reach(pub.socials) : null;
  return {
    name: r.athlete.displayName,
    roleLine: [r.athlete.position, r.athlete.sport].filter(Boolean).join(" · "),
    school: pub?.school ?? (r.property?.kind === "SCHOOL" ? r.property.name : null),
    place: pub ? [pub.city, pub.stateCode].filter(Boolean).join(", ") || null : r.property ? [r.property.city, r.property.stateCode].filter(Boolean).join(", ") || null : null,
    photoUrl: pub?.photoUrl ?? null,
    live: Boolean(r.athleteSlug),
    reach: total && total.total > 0 ? { total: total.total, verified: total.allVerified } : null,
    track: pub?.track ? { campaigns: pub.track.campaignsCompleted, postsLive: pub.track.postsLive, brands: pub.track.brands } : null,
  };
}

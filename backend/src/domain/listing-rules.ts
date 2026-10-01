/**
 * The listing lifecycle and its governance — 2S3-BE-01. Pure.
 *
 * documentation/SponsorX-Phase2-State-Machines.md §2, transcribed:
 *
 *   DRAFT → PENDING_APPROVAL → PUBLISHED ⇄ PAUSED → ARCHIVED
 *   PENDING_APPROVAL → DRAFT   (changes requested)
 *
 * Illegal, named: any listing for a property that isn't approved, or for an
 * athlete BTG hasn't approved or who is on a team (2S3-BE-05); DRAFT →
 * PUBLISHED (it skips BTG's approval); ARCHIVED → anything; editing price or
 * inventory while PUBLISHED (inventory.ts refuses it — pause first).
 */
import type { AthleteState, Prisma } from "../generated/prisma/client";

export type ListingState = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
export const LISTING_STATES: readonly ListingState[] = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "PAUSED", "ARCHIVED"];

const TRANSITIONS: Readonly<Record<ListingState, readonly ListingState[]>> = {
  DRAFT: ["PENDING_APPROVAL", "ARCHIVED"],
  PENDING_APPROVAL: ["PUBLISHED", "DRAFT"],
  PUBLISHED: ["PAUSED", "ARCHIVED"],
  PAUSED: ["PUBLISHED", "ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionListing(from: ListingState, to: ListingState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalListingTransitionError extends Error {
  readonly status = 409;
  constructor(from: ListingState, to: ListingState) {
    super(`A listing cannot go from ${from} to ${to}. Legal moves from ${from}: ${TRANSITIONS[from].join(", ") || "none — it is terminal"}.`);
    this.name = "IllegalListingTransitionError";
  }
}

/** The owner may edit wording and visibility only while nothing is live or under review. */
export const LISTING_EDITABLE: ReadonlySet<ListingState> = new Set(["DRAFT", "PAUSED"]);

/** An athlete may sell only once BTG approved them (the same bar as inventory.ts). */
export const SELLING_ATHLETE_STATES: readonly string[] = ["APPROVED", "ACTIVE"];

/**
 * 2S3-BE-05 — who sells. A property's listing needs the property's listing
 * access; an independent athlete's needs the athlete approved AND still
 * without a team — a roster athlete's items go through their team.
 */
export type ListingSeller = {
  property?: { listingAccessAt: Date | null } | null;
  sellerAthlete?: { state: string; propertyId: string | null } | null;
};

export function sellerProblems(s: ListingSeller): string[] {
  if (s.property) return s.property.listingAccessAt ? [] : ["property: not approved to list (onboarding not approved, or suspended)"];
  if (s.sellerAthlete) {
    const out: string[] = [];
    if (!SELLING_ATHLETE_STATES.includes(s.sellerAthlete.state)) out.push("athlete: not approved by BTG");
    if (s.sellerAthlete.propertyId) out.push("athlete: on a team — their team lists their items");
    return out;
  }
  return ["listing: no seller"];
}

/**
 * The same rule as a query fragment, for every read that must show only what
 * a buyer can buy (the catalogue scope, search). Wrapped in AND by callers
 * that already use OR.
 */
export function sellerCanSell(): Prisma.ListingWhereInput {
  return {
    OR: [
      { propertyId: { not: null }, property: { listingAccessAt: { not: null } } },
      { propertyId: null, sellerAthlete: { state: { in: SELLING_ATHLETE_STATES as AthleteState[] }, propertyId: null } },
    ],
  };
}

export type GovernanceInput = ListingSeller & {
  item: {
    active: boolean; priceCents: number; quantity: number | null; availableUntil: Date | null;
    /** 2S2-BE-05 — whose item it is, and the team that athlete is on now. */
    athleteId?: string | null; athleteTeamId?: string | null;
  };
  listing: { title: string; description: string | null; publishAt: Date | null; propertyId?: string | null };
  now: Date;
};

/**
 * What stops this listing going live — empty means nothing does. Checked when
 * it is submitted, again when BTG approves it, and again when it resumes from
 * a pause, because the property can be suspended and the item can sell out
 * or run past its window in between.
 */
export function governanceProblems(g: GovernanceInput): string[] {
  const out: string[] = [];
  out.push(...sellerProblems(g));
  /* 2S2-BE-05 — a team lists its roster athletes' items; an athlete who left
     (or was removed) is not on its roster, so the team's listing of their
     item cannot go live again unless they rejoin. */
  if (g.listing.propertyId && g.item.athleteId && g.item.athleteTeamId !== undefined && g.item.athleteTeamId !== g.listing.propertyId) {
    out.push("item: its athlete is no longer on this team");
  }
  if (!g.item.active) out.push("item: inactive");
  if (g.item.priceCents < 100) out.push("item: not priced");
  if (g.item.quantity === 0) out.push("item: none left to sell");
  if (g.item.availableUntil && g.item.availableUntil <= g.now) out.push("item: availability has ended");
  if (!g.listing.title.trim()) out.push("listing: no title");
  if ((g.listing.description ?? "").trim().length < 20) out.push("listing: a description of at least 20 characters");
  if (g.listing.publishAt && g.item.availableUntil && g.listing.publishAt >= g.item.availableUntil) {
    out.push("listing: publishes after the item stops being available");
  }
  return out;
}

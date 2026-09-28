/**
 * The listing lifecycle and its governance — 2S3-BE-01. Pure.
 *
 * documentation/SponsorX-Phase2-State-Machines.md §2, transcribed:
 *
 *   DRAFT → PENDING_APPROVAL → PUBLISHED ⇄ PAUSED → ARCHIVED
 *   PENDING_APPROVAL → DRAFT   (changes requested)
 *
 * Illegal, named: any listing for a property that isn't approved; DRAFT →
 * PUBLISHED (it skips BTG's approval); ARCHIVED → anything; editing price or
 * inventory while PUBLISHED (inventory.ts refuses it — pause first).
 */
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

export type GovernanceInput = {
  property: { listingAccessAt: Date | null };
  item: { active: boolean; priceCents: number; quantity: number | null; availableUntil: Date | null };
  listing: { title: string; description: string | null; publishAt: Date | null };
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
  if (!g.property.listingAccessAt) out.push("property: not approved to list (onboarding not approved, or suspended)");
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

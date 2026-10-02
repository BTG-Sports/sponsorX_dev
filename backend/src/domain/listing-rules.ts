/**
 * The listing lifecycle and its governance — 2S3-BE-01. Pure.
 *
 * documentation/SponsorX-Phase2-State-Machines.md §2, transcribed — and
 * 2S3-BE-06 (programme owner, 2026-10-02): listings publish automatically,
 * BTG handles the exceptions:
 *
 *   DRAFT → PUBLISHED          (submitted, every check passed, nothing flagged)
 *   DRAFT → PENDING_APPROVAL   (submitted, flagged — waits for BTG)
 *   PENDING_APPROVAL → PUBLISHED | DRAFT | ARCHIVED
 *                              (BTG approves / sends it back / rejects it;
 *                               the seller editing it takes it back to DRAFT)
 *   PUBLISHED ⇄ PAUSED → ARCHIVED
 *   PAUSED → PENDING_APPROVAL  (resumed, but flagged — or BTG paused it)
 *
 * Illegal, named: any listing for a property that isn't approved, or for an
 * athlete BTG hasn't approved or who is on a team (2S3-BE-05); going live
 * with a governance problem (the submit is refused with the list); ARCHIVED →
 * anything; editing price or inventory while PUBLISHED (inventory.ts refuses
 * it — pause first). DRAFT → PUBLISHED is never a transition anyone asks for:
 * only the submit's automatic path takes it (listing.ts `goLive`).
 */
import type { AthleteState, Prisma } from "../generated/prisma/client";
import { comingOfAgeOpen } from "./age-of-majority-rules";
import { requiresGuardian } from "./guardian-rules";

export type ListingState = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
export const LISTING_STATES: readonly ListingState[] = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "PAUSED", "ARCHIVED"];

const TRANSITIONS: Readonly<Record<ListingState, readonly ListingState[]>> = {
  DRAFT: ["PUBLISHED", "PENDING_APPROVAL", "ARCHIVED"],
  PENDING_APPROVAL: ["PUBLISHED", "DRAFT", "ARCHIVED"],
  PUBLISHED: ["PAUSED", "ARCHIVED"],
  PAUSED: ["PUBLISHED", "PENDING_APPROVAL", "ARCHIVED"],
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

/**
 * The owner may edit wording and visibility only while nothing is live.
 * 2S3-BE-06 — a held listing (PENDING_APPROVAL) is editable too, so a seller
 * told about restricted words can take them out: the edit takes it out of
 * BTG's queue, back to DRAFT, to be submitted again.
 */
export const LISTING_EDITABLE: ReadonlySet<ListingState> = new Set(["DRAFT", "PENDING_APPROVAL", "PAUSED"]);

/** An athlete may sell only once BTG approved them (the same bar as inventory.ts). */
export const SELLING_ATHLETE_STATES: readonly string[] = ["APPROVED", "ACTIVE"];

/**
 * 2S1-BE-13 — an athlete's account standing: closed (an open AccountClosure,
 * mirrored on `accountClosedAt`), rejected by BTG after approval
 * (2S1-BE-09 / -10), or ended by the coming-of-age rule (2S1-BE-12). Any of
 * them, and nothing of theirs sells — their own listings, or a team's
 * listing of their item. Optional so a caller that never reads them (an
 * older select) is not broken; every selling path selects them.
 */
export type SellerAccount = { accountClosedAt?: Date | null; signupRejectedAt?: Date | null; comingOfAgeTerminatedAt?: Date | null };

/**
 * 2S3-BE-05 — who sells. A property's listing needs the property's listing
 * access (a Reject or a self-closure takes it away); an independent
 * athlete's needs the athlete approved AND still without a team — a roster
 * athlete's items go through their team. Either way the athlete whose item
 * it is must still have an open account (2S1-BE-13).
 */
export type ListingSeller = {
  property?: { listingAccessAt: Date | null } | null;
  sellerAthlete?: ({ state: string; propertyId: string | null } & SellerAccount) | null;
  /** The athlete whose item a team lists (2S2-BE-05), when it is an athlete's item. */
  itemAthlete?: SellerAccount | null;
};

function accountProblems(who: string, a: SellerAccount | null | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  if (a.signupRejectedAt) out.push(`${who}: rejected by BTG`);
  if (a.comingOfAgeTerminatedAt) out.push(`${who}: account ended (coming of age)`);
  else if (a.accountClosedAt && !a.signupRejectedAt) out.push(`${who}: account closed`);
  return out;
}

export function sellerProblems(s: ListingSeller): string[] {
  if (s.property) {
    return [
      ...(s.property.listingAccessAt ? [] : ["property: not approved to list (onboarding not approved, suspended, rejected or closed)"]),
      ...accountProblems("item's athlete", s.itemAthlete),
    ];
  }
  if (s.sellerAthlete) {
    const out: string[] = [];
    if (!SELLING_ATHLETE_STATES.includes(s.sellerAthlete.state)) out.push("athlete: not approved by BTG");
    if (s.sellerAthlete.propertyId) out.push("athlete: on a team — their team lists their items");
    out.push(...accountProblems("athlete", s.sellerAthlete));
    return out;
  }
  return ["listing: no seller"];
}

/** An athlete account that can still sell, as a query fragment (the same rule as `accountProblems`). */
const ACCOUNT_OPEN = { accountClosedAt: null, signupRejectedAt: null, comingOfAgeTerminatedAt: null } as const;

/**
 * The same rule as a query fragment, for every read that must show only what
 * a buyer can buy (the catalogue scope, search). Wrapped in AND by callers
 * that already use OR.
 */
export function sellerCanSell(): Prisma.ListingWhereInput {
  return {
    OR: [
      {
        propertyId: { not: null }, property: { listingAccessAt: { not: null } },
        item: { is: { OR: [{ athleteId: null }, { athlete: { is: { ...ACCOUNT_OPEN } } }] } },
      },
      { propertyId: null, sellerAthlete: { state: { in: SELLING_ATHLETE_STATES as AthleteState[] }, propertyId: null, ...ACCOUNT_OPEN } },
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

/* ── 2S3-BE-06 — what holds a listing for BTG ───────────────────────────── */

/** The reason a listing's restricted words give — the one the seller is told in full. */
export function restrictedReason(words: readonly string[]): string | null {
  const unique = [...new Set(words)];
  return unique.length ? `Restricted words: ${unique.map((w) => `"${w}"`).join(", ")}` : null;
}

/** An athlete as the standing check reads them: the coming-of-age pause, and a minor's guardian. */
export type StandingAthlete = {
  displayName?: string | null;
  birthDate?: Date | null; ageBand?: string | null; majorityAge?: number | null;
  comingOfAgeStartedAt?: Date | null; comingOfAgeCompletedAt?: Date | null; comingOfAgeTerminatedAt?: Date | null;
  guardianPendingSince?: Date | null;
  guardian?: { verifiedAt: Date | null } | null;
};

/**
 * 2S4-BE-12 (programme owner, 2026-10-02) — "a seller with 2 or more seller
 * cancellations in 90 days loses good standing, so their new listings are
 * held for BTG". A seller's cancellation is a paid line it cancelled itself
 * (OrderLineDelivery.cancelledBy = SELLER), counted against the line's seller
 * — the property, or the independent athlete.
 */
export const SELLER_CANCELLATION_LIMIT = 2;
export const SELLER_CANCELLATION_WINDOW_DAYS = 90;

/** The standing reason for a seller's own cancellations, or null below the limit. Pure. */
export function cancellationReason(count: number): string | null {
  return count >= SELLER_CANCELLATION_LIMIT ? `Seller cancelled ${count} sold sessions in the last ${SELLER_CANCELLATION_WINDOW_DAYS} days` : null;
}

export type StandingInput = {
  /** 2S4-BE-12 — how many sold lines the seller cancelled itself in the last 90 days. */
  sellerCancellations?: number;
  /** The selling property: its payouts held, and its organisation's flags (a required document missing). */
  property?: { payoutsHeldAt?: Date | null; onboarding?: { flags: string[]; flaggedAt: Date | null } | null } | null;
  /** The independent athlete selling their own item. */
  sellerAthlete?: StandingAthlete | null;
  /** The athlete whose item a team lists. */
  itemAthlete?: StandingAthlete | null;
};

function athleteStanding(who: string, a: StandingAthlete | null | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  if (comingOfAgeOpen(a)) out.push(`${who}: in the coming-of-age pause (no government ID yet)`);
  if (requiresGuardian(a) && (!a.guardian?.verifiedAt || a.guardianPendingSince)) out.push(`${who}: a minor whose guardian isn't verified yet`);
  return out;
}

/**
 * Is the seller in good standing — the half of the hold that is BTG's call,
 * not a refusal. What already stops a sale outright stays a governance
 * problem (sellerProblems: closed, rejected, ended, listing access withdrawn,
 * not approved), and for an independent athlete the guardian and coming-of-
 * age rules already refuse the submit itself (guardian-acts.ts). What is left
 * is what BTG decides: an organisation flagged for a missing required
 * document (2S1-BE-07 keeps its listings live and leaves it to BTG), payouts
 * held while listing access is on, and an athlete in the coming-of-age pause
 * or a minor whose guardian isn't verified — on a team's listing of their
 * item, or on a resume that isn't new. And (2S4-BE-12) a seller who cancelled
 * SELLER_CANCELLATION_LIMIT or more sold lines in the last 90 days.
 */
export function standingReasons(s: StandingInput): string[] {
  const out: string[] = [];
  if (s.property) {
    for (const f of s.property.onboarding?.flaggedAt ? s.property.onboarding.flags : []) out.push(`Organisation flagged: ${f}`);
    if (s.property.onboarding?.flaggedAt && !s.property.onboarding.flags.length) out.push("Organisation flagged for BTG");
    if (s.property.payoutsHeldAt) out.push("Organisation: payouts are on hold");
  }
  out.push(...athleteStanding("Athlete", s.sellerAthlete));
  out.push(...athleteStanding(s.itemAthlete?.displayName ? `Item's athlete (${s.itemAthlete.displayName})` : "Item's athlete", s.itemAthlete));
  const cancelled = cancellationReason(s.sellerCancellations ?? 0);
  if (cancelled) out.push(cancelled);
  return out;
}

/**
 * What the seller is told about a hold. The restricted words, in full, so
 * they can edit them out; anything about their standing only as "BTG is
 * checking your account" — the internal reasons are BTG's. Pure.
 */
export function sellerHold(listing: { state: string; reviewReasons: readonly string[]; heldWords: readonly string[]; btgAction?: string | null }) {
  if (listing.state !== "PENDING_APPROVAL") return null;
  const words = restrictedReason(listing.heldWords);
  const other = listing.reviewReasons.filter((r) => r !== words);
  const accountCheck = other.some((r) => !r.startsWith("Paused by BTG"));
  const pausedByBtg = other.some((r) => r.startsWith("Paused by BTG"));
  return {
    restrictedWords: [...new Set(listing.heldWords)],
    accountCheck,
    pausedByBtg,
    message: [
      "BTG is taking a look — we'll email you.",
      ...(words ? [`${words}. Edit them out and submit again, or wait for BTG.`] : []),
      ...(accountCheck ? ["BTG is checking your account."] : []),
      ...(pausedByBtg ? ["BTG paused this listing, so BTG puts it back live."] : []),
    ].join(" "),
  };
}

/** The BTG pause / end reason, bounded like every reason the seller is emailed. */
export const BTG_REASON_MAX = 2000;

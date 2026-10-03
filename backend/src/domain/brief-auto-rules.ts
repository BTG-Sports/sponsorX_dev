/**
 * Sponsor briefs approved automatically — P4-BE-11, the rules.
 *
 * The programme owner (2026-10-03), for Phase 2: automation and safety come
 * first. A brief is approved by the system when EVERY safety check passes,
 * and held for BTG, with the reasons in words, when any one fails — the
 * pattern listings (listing.ts) and marketplace orders already follow.
 *
 * Pure: no database, no clock. `brief-auto.ts` gathers the inputs.
 *
 * THE CHECKS, ALL OF WHICH MUST PASS.
 *   1. The P4-BE-07 readiness checks (brief-readiness-rules.ts): objective,
 *      dates, budget at the price floor, sponsor standing, someone eligible.
 *   2. A package still on sale, with the budget at least its `priceLow`. A
 *      custom brief with no package (or one taken off sale) needs BTG to
 *      price it.
 *   3. Enough athletes fit: at least the package's `athleteCountMin`, after
 *      conflicts with the brief's AND the sponsor's categories — the same
 *      union an invitation is refused on (invitation.ts), so the count is of
 *      athletes BTG could actually invite.
 *   4. No sensitive category (brand-categories.ts SENSITIVE_CATEGORIES) on
 *      the brief or among the sponsor's own categories.
 *   5. The sponsor isn't on hold or closed (readiness's sponsor standing).
 *
 * Each failure is one `Hold`: a key from HOLD_KEYS (what the daily re-check
 * and the database's CHECK read) and a sentence for BTG. A sponsor never
 * sees these — they see `sponsorBriefStatus`, which never names a reason.
 */
import { SENSITIVE_CATEGORIES, SENSITIVE_CATEGORY_WORDS } from "./brand-categories";
import { briefReadiness, isReady, type ReadinessCheck, type ReadinessInput } from "./brief-readiness-rules";
import type { BriefState } from "./brief-state";

/** Every reason a brief is held — the migration's CHECK lists the same. */
export const HOLD_KEYS = ["OBJECTIVE", "DATES", "NO_PACKAGE", "BUDGET", "ATHLETES", "SENSITIVE", "SPONSOR"] as const;
export type HoldKey = (typeof HOLD_KEYS)[number];
export type Hold = { key: HoldKey; text: string };

export type AutoApprovalInput = Omit<ReadinessInput, "package" | "eligibleCount" | "conflictCount"> & {
  /** priceLow in whole dollars, the catalogue's unit. `active: false` — a
   *  package taken off sale, whose price may be stale: BTG prices it. */
  package: { name: string; priceLow: number; athleteCountMin: number; active?: boolean } | null;
  /** ACTIVE athletes in the brief's tenant who fit its targeting, after
   *  conflicts with the brief's and the sponsor's categories. */
  fitCount: number;
  briefCategories: readonly string[];
  sponsorCategories: readonly string[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How many athletes must fit: the package's minimum, and never fewer than one. */
export function athletesNeeded(pkg: AutoApprovalInput["package"]): number {
  return Math.max(1, pkg?.athleteCountMin ?? 1);
}

/** The readiness checklist as the automatic path reads it (the fit count as
 *  the eligible count; conflicts inform and never decide). Pure. */
export function autoReadiness(i: AutoApprovalInput): ReadinessCheck[] {
  return briefReadiness({
    ...i,
    package: i.package ? { name: i.package.name, priceLow: i.package.priceLow } : null,
    eligibleCount: i.fitCount,
    conflictCount: 0,
  });
}

/**
 * Why a brief can't be approved automatically — empty when it can. Pure.
 * In a fixed order (the brief's own content first, then pricing, staffing,
 * category, the sponsor), so the same brief always reads the same.
 */
export function autoApprovalHolds(i: AutoApprovalInput): Hold[] {
  const checks = autoReadiness(i);
  const failed = (k: ReadinessCheck["key"]) => checks.find((c) => c.key === k && !c.ok);
  const holds: Hold[] = [];

  const objective = failed("objective");
  if (objective) holds.push({ key: "OBJECTIVE", text: objective.text });
  const dates = failed("dates");
  if (dates) holds.push({ key: "DATES", text: dates.text });

  if (!i.package) holds.push({ key: "NO_PACKAGE", text: "No package — BTG prices custom requests" });
  else if (i.package.active === false) {
    holds.push({ key: "NO_PACKAGE", text: `The ${i.package.name} package is no longer offered — BTG prices this request` });
  }
  /* With a package, readiness checks the budget against its priceLow — rule
     2's price; without one, against the lowest NIL floor. Either way it is
     the price check, said once. */
  const budget = failed("budget");
  if (budget) holds.push({ key: "BUDGET", text: budget.text });

  const need = athletesNeeded(i.package);
  if (i.fitCount < need) {
    holds.push({
      key: "ATHLETES",
      text: i.fitCount === 0
        ? i.package ? `No athletes fit yet; the package needs ${need}` : "No athletes fit this brief yet"
        : i.package
          ? `Only ${plural(i.fitCount, "athlete fits", "athletes fit")}; the package needs ${need}`
          : `Only ${plural(i.fitCount, "athlete fits", "athletes fit")}`,
    });
  }

  for (const c of SENSITIVE_CATEGORIES) {
    if (i.briefCategories.includes(c)) {
      holds.push({ key: "SENSITIVE", text: `${SENSITIVE_CATEGORY_WORDS[c]} is a sensitive category — BTG reviews these` });
    } else if (i.sponsorCategories.includes(c)) {
      holds.push({ key: "SENSITIVE", text: `The sponsor sells in ${SENSITIVE_CATEGORY_WORDS[c].toLowerCase()}, a sensitive category — BTG reviews these` });
    }
  }

  const sponsor = failed("sponsor");
  if (sponsor) holds.push({ key: "SPONSOR", text: sponsor.text });

  /* Belt and braces: never approve what readiness itself would not call
     ready. By construction every failing deciding check is a hold above. */
  if (holds.length === 0 && !isReady("DRAFT", checks)) {
    holds.push({ key: "ATHLETES", text: "No athletes fit this brief yet" });
  }
  return holds;
}

/** The distinct keys of a set of holds, in HOLD_KEYS order. Pure. */
export function holdKeys(holds: readonly Hold[]): HoldKey[] {
  return HOLD_KEYS.filter((k) => holds.some((h) => h.key === k));
}

/** Held ONLY because too few athletes fit — what the daily re-check picks up,
 *  since athletes can join later. Pure. */
export function heldOnlyForAthletes(keys: readonly string[]): boolean {
  return keys.length === 1 && keys[0] === "ATHLETES";
}

/* --- what the sponsor is told ----------------------------------------- */

export const SPONSOR_REVIEWING = "BTG is reviewing your request — usually within a working day";
export const SPONSOR_APPROVED = "Approved — your campaign is being staffed";
export const SPONSOR_CLOSED = "This request is closed";

export type SponsorBriefStatus = { key: "REVIEWING" | "APPROVED" | "CLOSED"; text: string };

/**
 * The sponsor-safe status of a brief. Pure. The same for a brief the system
 * approved and one BTG approved by hand, and the same for a brief held for
 * BTG and one simply not yet taken on: the sponsor is never told why a brief
 * waits — the rule listing holds follow (listing-rules.ts `sellerHold`).
 */
export function sponsorBriefStatus(state: BriefState | string): SponsorBriefStatus {
  if (state === "APPROVED" || state === "CAMPAIGN_CREATED") return { key: "APPROVED", text: SPONSOR_APPROVED };
  if (state === "CLOSED") return { key: "CLOSED", text: SPONSOR_CLOSED };
  return { key: "REVIEWING", text: SPONSOR_REVIEWING };
}

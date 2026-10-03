/**
 * Content trust — P5-BE-10: when a draft may skip BTG's review and go
 * straight to the sponsor.
 *
 * The programme owner (2026-10-03): Phase 2 automates what is safe to
 * automate, and BTG gets the exceptions. A draft that passed every automatic
 * check (P5-BE-09) skips BTG when ALL of these hold:
 *
 *   1. CLEAN RECORD. The athlete's last TRUSTED_DRAFT_COUNT (3) deliverables
 *      BTG reviewed, across every campaign in the tenant, were passed by BTG
 *      with no revision asked for by BTG. Read as "deliverables BTG passed
 *      after the athlete's latest BTG revision, that BTG never revised
 *      themselves" (`content-trust.ts`), so a BTG revision on ANY draft —
 *      including a skipped one, while it is with the sponsor — resets the
 *      streak to 0 and the next 3 must be clean again. The system's own
 *      revisions (failed checks) and the sponsor's do not count against the
 *      athlete. There is no "rejected" verdict for a deliverable in the state
 *      machine, so "none was rejected" holds by construction.
 *   2. NOT A MINOR — nor an athlete whose guardian still acts for them (the
 *      coming-of-age allowance), nor one whose age is not on file. Unknown age
 *      is "adult" elsewhere in the codebase; for skipping a safety review it
 *      is the other way round.
 *   3. NO SENSITIVE CATEGORY on the campaign's sponsor or its brief.
 *   4. NO BTG REVISION on an earlier version of this deliverable.
 *   5. The sponsor has someone to review it (an active SPONSOR_ADMIN). Not in
 *      the brief's list; added so a skipped draft can never sit on a desk
 *      nobody reads — the sponsor still reviews every draft.
 *
 * Otherwise it goes to BTG exactly as before. Pure: no database, no clock.
 */

/** How many clean BTG-reviewed deliverables make an athlete trusted. */
export const TRUSTED_DRAFT_COUNT = 3;

/**
 * The sensitive categories: always reviewed by BTG. The same list as
 * `CATEGORY_DISCLOSURES` in offer-draft.ts (the age-gated ones) — kept here
 * as a literal because offer-draft reaches the database and this file must
 * not; tests/content-trust-rules.test.ts pins the two together.
 */
export const SENSITIVE_CATEGORIES: readonly string[] = ["ALCOHOL", "TOBACCO_VAPE", "CANNABIS", "GAMBLING"];

export type ContentTrust = { trusted: boolean; cleanStreak: number; needed: number };

/** The athlete's standing, from their raw clean count. */
export function contentTrust(clean: number): ContentTrust {
  const cleanStreak = Math.max(0, Math.min(TRUSTED_DRAFT_COUNT, Math.floor(clean)));
  return { trusted: cleanStreak >= TRUSTED_DRAFT_COUNT, cleanStreak, needed: TRUSTED_DRAFT_COUNT };
}

/** The sensitive categories among these, de-duplicated, in list order. */
export function sensitiveIn(categories: readonly (string | null | undefined)[]): string[] {
  const have = new Set(categories.filter((c): c is string => Boolean(c)).map((c) => c.trim().toUpperCase()));
  return SENSITIVE_CATEGORIES.filter((c) => have.has(c));
}

export type SkipInput = {
  /** The athlete's clean count (content-trust.ts cleanCount). */
  clean: number;
  /** Under their place's age of majority, or their guardian still acts. */
  minor: boolean;
  /** A date of birth or an age band is on file. */
  ageKnown: boolean;
  /** The campaign sponsor's and its brief's categories. */
  sponsorCategories: readonly string[];
  briefCategories: readonly string[];
  /** BTG asked for a revision on this deliverable before. */
  btgRevisedBefore: boolean;
  /** The sponsor has an active SPONSOR_ADMIN to review it. */
  sponsorReviewer: boolean;
};

export type SkipDecision = { skip: true; reason: string } | { skip: false; reason: string };

const catWords = (cats: string[]) => cats.map((c) => c.toLowerCase().replace(/_/g, " ")).join(" and ");

/** Does this passing draft skip BTG's review? The reason, either way, in words. */
export function skipDecision(i: SkipInput): SkipDecision {
  if (!i.ageKnown) return { skip: false, reason: "Age not on file — reviewed by BTG" };
  if (i.minor) return { skip: false, reason: "Athlete is a minor — always reviewed by BTG" };
  const onBrief = sensitiveIn(i.briefCategories);
  const onSponsor = sensitiveIn(i.sponsorCategories);
  if (onSponsor.length) return { skip: false, reason: `Sponsor is in a sensitive category (${catWords(onSponsor)}) — always reviewed by BTG` };
  if (onBrief.length) return { skip: false, reason: `Brief is in a sensitive category (${catWords(onBrief)}) — always reviewed by BTG` };
  if (i.btgRevisedBefore) return { skip: false, reason: "BTG asked for changes on an earlier version — reviewed by BTG" };
  const t = contentTrust(i.clean);
  if (!t.trusted) {
    return { skip: false, reason: `Not trusted yet: ${t.cleanStreak} of ${t.needed} clean drafts — reviewed by BTG` };
  }
  if (!i.sponsorReviewer) return { skip: false, reason: "The sponsor has no one to review it — reviewed by BTG" };
  return { skip: true, reason: `Trusted: last ${TRUSTED_DRAFT_COUNT} drafts approved without changes` };
}

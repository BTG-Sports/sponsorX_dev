/**
 * Who needs a guardian, and when — P3-BE-03, §4, §11, §26, §37.
 *
 * Pure, like `athlete-state.ts`: no Prisma, no config. The rule about minors
 * is the single most consequential one in Phase 1 — a quarter of the network
 * is expected to be under 18 — and it has to be testable without a database
 * or it will quietly stop being tested.
 *
 * WHY THIS IS A SEPARATE CONCEPT FROM "HAS A GUARDIAN ROW".
 * Three distinct states get conflated in conversation and must not be in
 * code:
 *
 *   1. The athlete is an adult            → no guardian needed at all
 *   2. A minor with no guardian linked    → cannot participate; someone must
 *                                            collect the guardian's details
 *   3. A minor with an unverified one     → cannot participate; BTG must
 *                                            verify the adult is who they say
 *
 * Only (1) and a *verified* (3) may take part. Collapsing (2) and (3) into
 * "no guardian" would let an athlete self-declare a parent and proceed.
 */

export type GuardianReadiness =
  | { status: "not-required"; reason: "athlete is an adult" }
  | { status: "missing"; reason: "minor has no guardian linked" }
  | { status: "unverified"; reason: "guardian is linked but not verified" }
  | { status: "ready" };

/**
 * Under 18 **now**, not at application time.
 *
 * Deliberately evaluated against the current date on every check rather than
 * stored as a flag: an athlete who applies at 17 and is activated at 18 is an
 * adult, and a stored boolean would keep them a minor forever. §26 ties the
 * workflow to age, and age moves.
 *
 * `null` means unknown, and unknown is treated as adult — because §11 allows
 * an age *band* instead of a date, and the band is checked separately by
 * `isMinorBand`. A caller with neither has failed validation upstream.
 */
export function isMinorOn(birthDate: Date | null | undefined, on: Date = new Date()): boolean {
  if (!birthDate) return false;
  const eighteenth = new Date(birthDate);
  eighteenth.setFullYear(eighteenth.getFullYear() + 18);
  return eighteenth > on;
}

/** §11 permits an age band where a date of birth is not given. */
export function isMinorBand(ageBand: string | null | undefined): boolean {
  return ageBand === "UNDER_16" || ageBand === "16_17";
}

/** Either signal says minor. Neither present means adult, per `isMinorOn`. */
export function requiresGuardian(athlete: {
  birthDate?: Date | null;
  ageBand?: string | null;
}): boolean {
  return isMinorOn(athlete.birthDate) || isMinorBand(athlete.ageBand);
}

/**
 * The one question every downstream gate asks: may this athlete take part?
 *
 * Used by the ACTIVE transition today and by Campaign Order acceptance in B4
 * — the acceptance's "unverified guardian blocks acceptance downstream". One
 * function so the two cannot drift, which is exactly how a minor ends up able
 * to accept paid work that they could not be activated for.
 */
export function guardianReadiness(athlete: {
  birthDate?: Date | null;
  ageBand?: string | null;
  guardianId?: string | null;
  guardianVerifiedAt?: Date | null;
}): GuardianReadiness {
  if (!requiresGuardian(athlete)) {
    return { status: "not-required", reason: "athlete is an adult" };
  }
  if (!athlete.guardianId) {
    return { status: "missing", reason: "minor has no guardian linked" };
  }
  if (!athlete.guardianVerifiedAt) {
    return { status: "unverified", reason: "guardian is linked but not verified" };
  }
  return { status: "ready" };
}

/** May this athlete participate — accept invitations, orders, deliverables? */
export function mayParticipate(athlete: Parameters<typeof guardianReadiness>[0]): boolean {
  const readiness = guardianReadiness(athlete);
  return readiness.status === "not-required" || readiness.status === "ready";
}

/** §4 — the relationships an authorised adult may hold. Text in the schema
 *  rather than an enum, so the vocabulary lives here. */
export const GUARDIAN_RELATIONSHIPS = [
  "PARENT",
  "LEGAL_GUARDIAN",
  "AUTHORIZED_REP",
] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

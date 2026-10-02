/**
 * The edition lifecycle — P9-BE-02, spec §5.2.
 *
 * Pure, and separate from persistence, like every other state file here.
 *
 * PLANNING → SELLING → CLOSED → IN_PRODUCTION → PUBLISHED_DIGITAL
 *   → PRINTED → DISTRIBUTED, with CANCELLED reachable until production.
 *
 * V1 is a FREE DIGITAL edition (principle 10), so PUBLISHED_DIGITAL is a
 * complete outcome on its own; print is an optional layer after it.
 *
 * THE PRODUCTION GATE. An edition enters production only when all three V3 §3
 * conditions hold — content ready, rights cleared, revenue met — and they are
 * columns, not an opinion computed at the moment someone clicks. SponsorX
 * makes this call, not the school (§5.2). P9-BE-16 adds a fourth, computed at
 * the transition like rightsCleared: every SOLD slot's artwork is APPROVED on
 * the approval board (`artworkApproved`, edition-artwork.ts).
 *
 * WHY CANCELLED STOPS AT CLOSED. Once in production, advertisers have been
 * sold a published placement and the cost is being spent; stopping then is a
 * refund decision, not a state change.
 */

export type EditionState =
  | "PLANNING"
  | "SELLING"
  | "CLOSED"
  | "IN_PRODUCTION"
  | "PUBLISHED_DIGITAL"
  | "PRINTED"
  | "DISTRIBUTED"
  | "CANCELLED";

export const EDITION_STATES: readonly EditionState[] = [
  "PLANNING", "SELLING", "CLOSED", "IN_PRODUCTION", "PUBLISHED_DIGITAL",
  "PRINTED", "DISTRIBUTED", "CANCELLED",
] as const;

const TRANSITIONS: Readonly<Record<EditionState, readonly EditionState[]>> = {
  PLANNING: ["SELLING", "CANCELLED"],
  SELLING: ["CLOSED", "CANCELLED"],
  CLOSED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["PUBLISHED_DIGITAL"],
  PUBLISHED_DIGITAL: ["PRINTED"],
  PRINTED: ["DISTRIBUTED"],
  DISTRIBUTED: [],
  CANCELLED: [],
};

/** States in which the edition is live to readers — events may be recorded. */
export const PUBLISHED_STATES: readonly EditionState[] = ["PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED"];

export type ProductionConditions = {
  contentReady: boolean;
  rightsCleared: boolean;
  revenueMet: boolean;
  /** P9-BE-16 — every sold slot's artwork APPROVED by its sponsor. */
  artworkApproved: boolean;
};

export class IllegalEditionTransitionError extends Error {
  readonly status = 409;
  constructor(from: EditionState, to: EditionState) {
    super(
      `An edition cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${TRANSITIONS[from].join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalEditionTransitionError";
  }
}

export class ProductionGateError extends Error {
  readonly status = 409;
  readonly missing: string[];
  /** What to fix, in words — e.g. each slot whose artwork is not approved. */
  readonly problems: string[];
  constructor(missing: string[], problems: string[] = []) {
    super(
      `An edition goes to production only when content, rights, revenue and every sold ad's artwork are all in place. ` +
        `Missing: ${missing.join(", ")}.${problems.length ? ` ${problems.join(" ")}` : ""}`,
    );
    this.name = "ProductionGateError";
    this.missing = missing;
    this.problems = problems;
  }
}

export function canTransitionEdition(from: EditionState, to: EditionState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws unless `from → to` is legal and, for production, all four hold.
 *  `problems` is the detail the caller already has (which slots' artwork is
 *  not approved), carried on the refusal. */
export function assertEditionTransition(
  from: EditionState,
  to: EditionState,
  conditions: ProductionConditions,
  problems: string[] = [],
): void {
  if (!canTransitionEdition(from, to)) throw new IllegalEditionTransitionError(from, to);
  if (to === "IN_PRODUCTION") {
    const missing = [
      ...(conditions.contentReady ? [] : ["contentReady"]),
      ...(conditions.rightsCleared ? [] : ["rightsCleared"]),
      ...(conditions.revenueMet ? [] : ["revenueMet"]),
      ...(conditions.artworkApproved ? [] : ["artworkApproved"]),
    ];
    if (missing.length) throw new ProductionGateError(missing, conditions.artworkApproved ? [] : problems);
  }
}

export class EditionNotSellingError extends Error {
  readonly status = 409;
  constructor(state: EditionState, closeDate: Date) {
    super(
      state !== "SELLING"
        ? `This edition is ${state}, not SELLING — its inventory cannot be sold.`
        : `This edition closed for ads on ${closeDate.toISOString().slice(0, 10)}.`,
    );
    this.name = "EditionNotSellingError";
  }
}

/** A sale needs SELLING and a close date still ahead. Postgres checks the
 *  same thing (trigger adslot_guard_sale) for the writes that bypass this. */
export function assertCanSell(state: EditionState, closeDate: Date, now: Date = new Date()): void {
  if (state !== "SELLING" || now.getTime() >= closeDate.getTime()) throw new EditionNotSellingError(state, closeDate);
}

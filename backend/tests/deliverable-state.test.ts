/**
 * P5-BE-05 — the deliverable state machine.
 *
 * The acceptance names one happy path and one loop:
 *   NOT_STARTED→DRAFT_SUBMITTED→BTG_REVIEW→SPONSOR_REVIEW→APPROVED→
 *   PUBLISHED→VERIFIED enforced; revision requests return to DRAFT_SUBMITTED.
 *
 * "Enforced" is the word doing the work — it is not enough that the legal
 * moves are allowed, every other move has to be refused. So the table below
 * is exhaustive: all 49 ordered pairs are asserted, not just the seven on the
 * happy path.
 */
import { describe, expect, it } from "vitest";

import {
  canRequestRevision,
  canTransitionDeliverable,
  DELIVERABLE_STATES,
  IllegalDeliverableTransitionError,
  legalDeliverableTransitions,
  REVIEW_STATES,
  type DeliverableState,
} from "../src/domain/deliverable-state";

/** The whole machine, written out independently of the implementation. */
const LEGAL: Record<DeliverableState, DeliverableState[]> = {
  NOT_STARTED: ["DRAFT_SUBMITTED"],
  DRAFT_SUBMITTED: ["BTG_REVIEW"],
  BTG_REVIEW: ["SPONSOR_REVIEW", "APPROVED", "DRAFT_SUBMITTED"],
  SPONSOR_REVIEW: ["APPROVED", "DRAFT_SUBMITTED"],
  APPROVED: ["PUBLISHED"],
  PUBLISHED: ["VERIFIED"],
  VERIFIED: [],
};

describe("the deliverable lifecycle is enforced in both directions", () => {
  it("has exactly the seven §21 states", () => {
    expect([...DELIVERABLE_STATES]).toEqual([
      "NOT_STARTED", "DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW",
      "APPROVED", "PUBLISHED", "VERIFIED",
    ]);
  });

  /* All 49 pairs. A machine that permits the happy path and also permits
     NOT_STARTED → VERIFIED has passed a happy-path test and is still wrong. */
  it.each(
    DELIVERABLE_STATES.flatMap((from) =>
      DELIVERABLE_STATES.map((to) => ({ from, to, legal: LEGAL[from].includes(to) })),
    ),
  )("$from → $to is $legal", ({ from, to, legal }) => {
    expect(canTransitionDeliverable(from, to)).toBe(legal);
  });

  it("walks the full happy path end to end", () => {
    const path: DeliverableState[] = [
      "NOT_STARTED", "DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW",
      "APPROVED", "PUBLISHED", "VERIFIED",
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransitionDeliverable(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("lets BTG approve without the sponsor — the optional step (P5-BE-08)", () => {
    expect(canTransitionDeliverable("BTG_REVIEW", "APPROVED")).toBe(true);
  });

  it("VERIFIED is terminal: money hangs off it", () => {
    expect(legalDeliverableTransitions("VERIFIED")).toEqual([]);
  });
});

describe("a revision request returns the work to DRAFT_SUBMITTED", () => {
  it.each(REVIEW_STATES)("from %s", (from) => {
    expect(canTransitionDeliverable(from, "DRAFT_SUBMITTED")).toBe(true);
    expect(canRequestRevision(from)).toBe(true);
  });

  /* It must NOT go back to NOT_STARTED: assets already uploaded would then
     hang off a record claiming no work had been done. */
  it.each(REVIEW_STATES)("never back to NOT_STARTED from %s", (from) => {
    expect(canTransitionDeliverable(from, "NOT_STARTED")).toBe(false);
  });

  it.each(
    DELIVERABLE_STATES.filter((s) => !REVIEW_STATES.includes(s)),
  )("is not available from %s", (from) => {
    expect(canRequestRevision(from)).toBe(false);
  });
});

describe("the refusal explains itself", () => {
  it("names both states and the legal moves", () => {
    const err = new IllegalDeliverableTransitionError("NOT_STARTED", "VERIFIED");
    expect(err.status).toBe(409);
    expect(err.message).toContain("NOT_STARTED");
    expect(err.message).toContain("VERIFIED");
    expect(err.message).toContain("DRAFT_SUBMITTED");
  });

  it("says so when the state is terminal", () => {
    expect(new IllegalDeliverableTransitionError("VERIFIED", "APPROVED").message)
      .toContain("terminal");
  });
});

/**
 * P6-BE-02 — "Reward state DRAFT→ACTIVE→PAUSED→EXPIRED/ARCHIVED; four
 * distinct RewardEventType values."
 *
 * All 25 ordered pairs are asserted rather than just the happy path. A
 * machine that allows the right moves and also allows EXPIRED → ACTIVE has
 * passed a happy-path test and would let BTG honour an offer after the date
 * printed on the thing the fan is holding.
 */
import { describe, expect, it } from "vitest";

import {
  canTransitionReward,
  IllegalRewardTransitionError,
  isRewardLive,
  legalRewardTransitions,
  REWARD_STATES,
  REWARD_EVENT_TYPES,
  type RewardState,
} from "../src/domain/reward-state";

/** Written out independently of the implementation. */
const LEGAL: Record<RewardState, RewardState[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "EXPIRED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "EXPIRED", "ARCHIVED"],
  EXPIRED: ["ARCHIVED"],
  ARCHIVED: [],
};

describe("the reward lifecycle", () => {
  it("has exactly the five §21 states", () => {
    expect([...REWARD_STATES]).toEqual([
      "DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED",
    ]);
  });

  it.each(
    REWARD_STATES.flatMap((from) =>
      REWARD_STATES.map((to) => ({ from, to, legal: LEGAL[from].includes(to) })),
    ),
  )("$from → $to is $legal", ({ from, to, legal }) => {
    expect(canTransitionReward(from, to)).toBe(legal);
  });

  it("walks DRAFT → ACTIVE → PAUSED → EXPIRED → ARCHIVED", () => {
    const path: RewardState[] = ["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransitionReward(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  /* The merchant restocks and trading resumes — that is the whole reason
     PAUSED is not just a kind of ending. */
  it("lets a paused reward go back to ACTIVE", () => {
    expect(canTransitionReward("PAUSED", "ACTIVE")).toBe(true);
  });

  it("never revives an expired reward", () => {
    expect(canTransitionReward("EXPIRED", "ACTIVE")).toBe(false);
    expect(canTransitionReward("EXPIRED", "PAUSED")).toBe(false);
    expect(legalRewardTransitions("EXPIRED")).toEqual(["ARCHIVED"]);
  });

  /* Nothing was ever offered, so there is nothing to expire. */
  it("does not let a draft expire", () => {
    expect(canTransitionReward("DRAFT", "EXPIRED")).toBe(false);
  });

  it("ARCHIVED is terminal — the funnel still hangs off it", () => {
    expect(legalRewardTransitions("ARCHIVED")).toEqual([]);
  });
});

describe("only an ACTIVE reward is live to fans", () => {
  it.each(REWARD_STATES)("%s", (state) => {
    expect(isRewardLive(state)).toBe(state === "ACTIVE");
  });
});

describe("four distinct event types", () => {
  it("is exactly SCAN, LANDING, CLAIM, REDEEM", () => {
    expect([...REWARD_EVENT_TYPES]).toEqual(["SCAN", "LANDING", "CLAIM", "REDEEM"]);
  });

  it("has no duplicates — four moments, four values", () => {
    expect(new Set(REWARD_EVENT_TYPES).size).toBe(4);
  });
});

describe("the refusal explains itself", () => {
  it("names both states and the legal moves", () => {
    const err = new IllegalRewardTransitionError("EXPIRED", "ACTIVE");
    expect(err.status).toBe(409);
    expect(err.message).toContain("EXPIRED");
    expect(err.message).toContain("ARCHIVED");
  });
});

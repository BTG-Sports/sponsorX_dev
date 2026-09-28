import { describe, expect, it } from "vitest";

import { expiryFor, fanPath, redeemRate, rewardMoves } from "../src/lib/rewards-live";

/* --------------------------------------------------------------------------
   P6-FE-01 — the reward desk's rules. Moves are reward-state.ts's exactly;
   redemption rate is redeemed of CLAIMED (a scan is not a promise); expiry
   presets resolve to real instants; the fan link encodes the token safely.
   -------------------------------------------------------------------------- */

describe("rewardMoves — reward-state.ts", () => {
  it.each([
    ["DRAFT", ["ACTIVE", "ARCHIVED"]],
    ["ACTIVE", ["PAUSED", "EXPIRED"]],
    ["PAUSED", ["ACTIVE", "ARCHIVED"]],
    ["EXPIRED", []],
    ["ARCHIVED", []],
  ] as const)("%s → %j", (s, to) => {
    expect(rewardMoves(s).map((m) => m.to)).toEqual(to);
  });
});

describe("redeemRate", () => {
  it("is redeemed of claimed, null before any claim", () => {
    expect(redeemRate({ SCAN: 100, LANDING: 80, CLAIM: 40, REDEEM: 10 })).toBe(25);
    expect(redeemRate({ SCAN: 100, LANDING: 80, CLAIM: 0, REDEEM: 0 })).toBeNull();
    expect(redeemRate(undefined)).toBeNull();
  });
});

describe("expiryFor", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it("resolves presets to instants", () => {
    expect(expiryFor("30", now, "2026-12-01T00:00:00Z")).toBe("2026-10-31T12:00:00.000Z");
    expect(expiryFor("campaign", now, "2026-12-01T00:00:00Z")).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("fanPath", () => {
  it("encodes the token", () => {
    expect(fanPath("ab/cd")).toBe("/r/ab%2Fcd");
  });
});

import { describe, expect, it } from "vitest";

import {
  autoStaffingReasonProblem,
  launchLine,
  rangeWords,
  sponsorStaffing,
  staffingStop,
  staffingTiles,
  type CampaignStaffing,
} from "../src/lib/campaign-stage";

/* --------------------------------------------------------------------------
   P4-FE-09 — the staffing panel, the board's "Staffing stopped" badge, the
   sponsor's count and the launch day (P4-BE-12 / P4-BE-13).
   -------------------------------------------------------------------------- */

const staff: CampaignStaffing = {
  sent: 7, signed: 4, outstanding: 3, declined: 2, expired: 0, skipped: 0, needed: { min: 5, max: 9 }, stop: null,
};

describe("automatic staffing on BTG's screens", () => {
  it("reads sent, signed, waiting, declined — and the rest only when there are any", () => {
    expect(staffingTiles(staff)).toEqual([
      { label: "Sent", value: 7 }, { label: "Signed", value: 4 }, { label: "Waiting", value: 3 }, { label: "Declined", value: 2 },
    ]);
    expect(staffingTiles({ ...staff, expired: 1, skipped: 2 }).map((t) => t.label)).toEqual(["Sent", "Signed", "Waiting", "Declined", "Ran out", "Skipped"]);
  });

  it("badges a stopped campaign, and never a sponsor's read or a campaign without a package", () => {
    const stop = { reason: "The budget can't cover the next athlete.", at: "2026-10-03T10:00:00.000Z" };
    expect(staffingStop({ ...staff, stop })).toEqual(stop);
    expect(staffingStop(staff)).toBeNull();
    expect(staffingStop({ signed: 1, needed: { min: 1, max: 3 } })).toBeNull();
    expect(staffingStop(null)).toBeNull();
    expect(staffingStop(undefined)).toBeNull();
  });

  it("needs a reason of 1–500 characters before the switch moves", () => {
    expect(autoStaffingReasonProblem("  ")).toMatch(/Write a reason/);
    expect(autoStaffingReasonProblem("x".repeat(501))).toMatch(/500/);
    expect(autoStaffingReasonProblem("Sponsor asked to hand-pick")).toBeNull();
  });
});

describe("the sponsor's count and the launch day", () => {
  it("says how many signed against the package's range", () => {
    expect(sponsorStaffing({ signed: 4, needed: { min: 5, max: 9 } })).toEqual({ line: "We're staffing your campaign: 4 of 5–9 athletes signed", pct: 44 });
    expect(sponsorStaffing({ signed: 3, needed: { min: 3, max: 3 } })).toEqual({ line: "We're staffing your campaign: 3 of 3 athletes signed", pct: 100 });
    expect(sponsorStaffing(null)).toBeNull();
    expect(sponsorStaffing({ signed: 0, needed: { min: 0, max: 0 } })).toBeNull();
    expect(rangeWords({ min: 5, max: 9 })).toBe("5–9");
  });

  it("launches from 00:00 UTC on the start date", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(launchLine("2026-10-10T15:00:00.000Z", now)).toBe("Launches on Oct 10");
    expect(launchLine("2026-10-03T23:00:00.000Z", now)).toBe("Launches in the next few minutes");
    expect(launchLine("2026-09-30T00:00:00.000Z", now)).toBe("Launches in the next few minutes");
  });
});

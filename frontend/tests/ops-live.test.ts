import { describe, expect, it } from "vitest";

import { daysRemaining, reachPct, toRosterRow, verifiedPct, type ApiOpsRow } from "../src/lib/ops-live";

/* --------------------------------------------------------------------------
   P5-FE-05 — the operations board's row vocabulary, pinned to §21: which
   order/invite state reads as accepted, awaiting or lost, which flag each
   earns, and that real overdue work outranks every other flag.
   -------------------------------------------------------------------------- */

function row(over: Partial<ApiOpsRow> = {}): ApiOpsRow {
  return {
    athleteId: "a1", name: "JORDAN", slug: "jordan", order: null, invite: null,
    delivered: 0, planned: 0, overdue: 0, inReview: 0, nextDue: null, verifiedViews: 0,
    ...over,
  };
}
const order = (state: string) => ({ id: "o1", state, jobIds: ["SX-01"] });
const invite = (state: string) => ({ id: "i1", state, jobId: "SX-01", offered: 40_000 });

describe("toRosterRow", () => {
  it.each([
    ["ACCEPTED", "ACCEPTED", null],
    ["ACTIVE", "ACCEPTED", null],
    ["COMPLETED", "ACCEPTED", null],
    ["SENT", "SENT", "Awaiting acceptance"],
    ["REJECTED", "DECLINED", "Replacement needed"],
    ["CANCELLED", "DECLINED", "Replacement needed"],
  ])("order %s → %s / %s", (state, shown, flag) => {
    const r = toRosterRow(row({ order: order(state) }));
    expect(r.order).toBe(shown);
    expect(r.flag).toBe(flag);
  });

  it.each([
    ["INVITED", "SENT", "Awaiting acceptance"],
    ["VIEWED", "SENT", "Awaiting acceptance"],
    ["DECLINED", "DECLINED", "Replacement needed"],
    ["EXPIRED", "DECLINED", "Replacement needed"],
    ["ACCEPTED", "ACCEPTED", "Order not drafted"],
  ])("invite only %s → %s / %s", (state, shown, flag) => {
    const r = toRosterRow(row({ invite: invite(state) }));
    expect(r.order).toBe(shown);
    expect(r.flag).toBe(flag);
  });

  it("overdue work outranks every other flag", () => {
    expect(toRosterRow(row({ order: order("ACTIVE"), overdue: 2 })).flag).toBe("Under-delivering");
  });

  it("carries the invite's offer for the order draft, and verified views", () => {
    const r = toRosterRow(row({ invite: invite("ACCEPTED"), verifiedViews: 1200 }));
    expect(r.live.offered).toBe(40_000);
    expect(r.live.inviteJobId).toBe("SX-01");
    expect(r.views).toBe(1200);
  });
});

describe("hero numbers", () => {
  const h = {
    deliverablesTotal: 4, deliverablesVerified: 1, deliverablesOverdue: 1,
    projectedImpressions: 10_000, verifiedImpressions: 2500,
    underDeliveringWork: true, underDeliveringReach: true,
  };
  it("computes shares, null when there is nothing to divide by", () => {
    expect(verifiedPct(h)).toBe(25);
    expect(reachPct(h)).toBe(25);
    expect(verifiedPct({ ...h, deliverablesTotal: 0 })).toBeNull();
    expect(reachPct({ ...h, projectedImpressions: null })).toBeNull();
  });
  it("counts days left, never negative", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(daysRemaining("2026-10-11T00:00:00Z", now)).toBe(10);
    expect(daysRemaining("2026-09-01T00:00:00Z", now)).toBe(0);
  });
});

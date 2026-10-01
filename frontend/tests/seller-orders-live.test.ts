import { describe, expect, it } from "vitest";

import {
  closesOn, confirmBy, datesText, lineSummary, markControl, orderBadge, orderBanner, sampleOrder, sampleOrders, shareNote, shareUsd, trackSteps,
} from "@/lib/seller-orders-live";

/* 2S4-FE-03 — the seller's Orders page: what it derives (sample data until 2S4-BE-06). */

describe("the agreed rules", () => {
  it("the sponsor has 24 hours to confirm; a confirmed line closes 30 days on", () => {
    expect(confirmBy("2026-10-17T19:40:00.000Z")).toBe("2026-10-18T19:40:00.000Z");
    expect(closesOn("2026-09-20T09:30:00.000Z")).toBe("2026-10-20T09:30:00.000Z");
  });
  it("the waiting banner says no answer counts as confirmed", () => {
    const o = sampleOrders("athlete").find((x) => x.state === "MARKED_DELIVERED")!;
    const b = orderBanner(o)!;
    expect(b.tone).toBe("warn");
    expect(b.text).toMatch(/Oct 1, 7:40 pm UTC/);
    expect(b.text).toMatch(/counts as confirmed/);
  });
  it("sponsor contact appears only once paid", () => {
    for (const o of sampleOrders("team")) expect(o.sponsor.contact === null).toBe(o.paidAt === null);
  });
});

describe("each seller sees only their own share", () => {
  it("the design's order: Riley $604.24, the Hawks $151.05", () => {
    expect(shareUsd(sampleOrder("athlete", "ord-bay6nfy3")!.shareCents)).toBe("$604.24");
    expect(shareUsd(sampleOrder("team", "ord-bay6nfy3")!.shareCents)).toBe("$151.05");
  });
  it("says where the other share lives", () => {
    expect(shareNote("athlete", true)).toMatch(/team’s share is on their own Orders page/);
    expect(shareNote("team", true)).toMatch(/Each athlete’s share/);
  });
  it("an unknown id is no order", () => {
    expect(sampleOrder("athlete", "nope")).toBeNull();
  });
});

describe("words", () => {
  const o = sampleOrder("athlete", "ord-bay6nfy3")!;
  it("summarises the line and its days", () => {
    expect(lineSummary(o.line)).toBe("2 sessions × $500");
    expect(datesText(o.line.dates)).toBe("Oct 10 and Oct 17");
    expect(datesText(["2026-10-10", "2026-10-17", "2026-10-24"])).toBe("Oct 10, Oct 17 and Oct 24");
  });
  it("every state is in words, not colour alone", () => {
    expect(orderBadge(o).label).toBe("In delivery");
    expect(orderBadge({ ...o, state: "MARKED_DELIVERED" }).label).toBe("Waiting for Harbor Coffee");
    expect(orderBadge({ ...o, state: "UNPAID" }).mark).toBe("○");
  });
  it("Mark delivered applies only while in delivery, with a reason otherwise", () => {
    expect(markControl({ state: "IN_DELIVERY" }).applies).toBe(true);
    expect(markControl({ state: "UNPAID" })).toEqual({ applies: false, why: "You can mark it delivered once it’s paid" });
    expect(markControl({ state: "PROBLEM" }).why).toBe("BTG is reviewing this line");
  });
  it("the track marks the current step", () => {
    expect(trackSteps(o).map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    const problem = trackSteps(sampleOrder("athlete", "ord-h9vd3n6k")!);
    expect(problem[3]).toMatchObject({ state: "current", note: "Problem reported", tone: "danger" });
    expect(trackSteps(sampleOrder("athlete", "ord-m4t8rc2w")!).every((s) => s.state === "done")).toBe(true);
  });
});

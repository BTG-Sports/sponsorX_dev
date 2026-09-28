import { describe, expect, it } from "vitest";

import {
  byDay,
  dayKey,
  daysUntil,
  dueLabel,
  fixtureDeliverables,
  isOverdue,
  monthGrid,
  nextStep,
  shiftMonth,
  tabOf,
} from "../src/lib/deliverables-live";

/* --------------------------------------------------------------------------
   P5-FE-02 — the calendar's arithmetic. Days are UTC calendar days (a due
   date must not slide a day west of UTC); the month grid is Monday-first and
   whole-week; "overdue" only counts while it's still the athlete's move; a
   revision puts the deliverable back in the athlete's To do.
   -------------------------------------------------------------------------- */

const TODAY = new Date("2026-10-14T18:00:00Z");
const base = { revision: null, appearance: false };

describe("days", () => {
  it("keys an instant to its UTC day", () => {
    expect(dayKey("2026-10-14T23:30:00Z")).toBe("2026-10-14");
  });
  it("counts whole days, ignoring the time of day", () => {
    expect(daysUntil("2026-10-15T00:00:00Z", TODAY)).toBe(1);
    expect(daysUntil("2026-10-14T00:00:00Z", TODAY)).toBe(0);
    expect(daysUntil("2026-10-11T00:00:00Z", TODAY)).toBe(-3);
  });
  it("labels due and overdue in plain words", () => {
    expect(dueLabel("2026-10-14T00:00:00Z", TODAY)).toBe("due today");
    expect(dueLabel("2026-10-15T00:00:00Z", TODAY)).toBe("due tomorrow");
    expect(dueLabel("2026-10-20T00:00:00Z", TODAY)).toBe("due in 6 days");
    expect(dueLabel("2026-10-13T00:00:00Z", TODAY)).toBe("1 day overdue");
    expect(dueLabel("2026-10-10T00:00:00Z", TODAY)).toBe("4 days overdue");
  });
});

describe("month grid", () => {
  it("is Monday-first, whole weeks, and marks the month's own days", () => {
    const g = monthGrid("2026-10"); // Oct 1 2026 is a Thursday
    expect(g[0][0]).toEqual({ day: "2026-09-28", inMonth: false });
    expect(g[0][3]).toEqual({ day: "2026-10-01", inMonth: true });
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(31);
    expect(g.at(-1)!.some((c) => c.inMonth)).toBe(true);
  });
  it("shifts across a year boundary", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("whose move", () => {
  it("names the next step per §21 state", () => {
    expect(nextStep({ ...base, state: "NOT_STARTED" }).on).toBe("you");
    expect(nextStep({ ...base, state: "NOT_STARTED", appearance: true }).label).toMatch(/proof of appearance/);
    expect(nextStep({ ...base, state: "BTG_REVIEW" }).on).toBe("btg");
    expect(nextStep({ ...base, state: "SPONSOR_REVIEW" }).on).toBe("sponsor");
    expect(nextStep({ ...base, state: "APPROVED" }).on).toBe("you");
    expect(nextStep({ ...base, state: "VERIFIED" }).on).toBe("done");
  });
  it("an open revision is the athlete's move, whatever the state says", () => {
    const d = { ...base, state: "DRAFT_SUBMITTED" as const, revision: { reason: "x", at: "y" } };
    expect(nextStep(d).label).toBe("Revision requested");
    expect(tabOf(d)).toBe("todo");
  });
  it("tabs: todo / review / done", () => {
    expect(tabOf({ ...base, state: "DRAFT_SUBMITTED" })).toBe("review");
    expect(tabOf({ ...base, state: "PUBLISHED" })).toBe("done");
    expect(tabOf({ ...base, state: "VERIFIED" })).toBe("done");
  });
  it("overdue only while it's still yours", () => {
    const past = "2026-10-10T00:00:00Z";
    expect(isOverdue({ ...base, state: "NOT_STARTED", dueDate: past }, TODAY)).toBe(true);
    expect(isOverdue({ ...base, state: "BTG_REVIEW", dueDate: past }, TODAY)).toBe(false);
  });
});

describe("fixtures and grouping", () => {
  it("dates the demo around today and groups by day", () => {
    const rows = fixtureDeliverables(
      [
        { id: "a", campaign: "C", sponsor: "S", title: "T", state: "NOT_STARTED", revisionRequested: false },
        { id: "b", campaign: "C", sponsor: "S", title: "T", state: "BTG_REVIEW", revisionRequested: true },
      ],
      TODAY,
    );
    expect(dayKey(rows[0].dueDate)).toBe("2026-10-12");
    expect(rows[1].revision).not.toBeNull();
    expect(byDay(rows).size).toBe(2);
  });
});

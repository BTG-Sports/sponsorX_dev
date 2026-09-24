import { describe, expect, it } from "vitest";

import {
  STUDENT_ASSIGNMENT_COPY,
  student,
  studentAssignments,
  studentEdition,
  POINT_RULES,
  studentPoints,
  studentProspects,
  studentSales,
  studentSalesTrend,
} from "../src/lib/fixtures";

/* --------------------------------------------------------------------------
   P1-FE-19 — the student fixtures must agree with themselves, because the
   dashboard derives its numbers from several of them at once and a screen
   whose tiles disagree teaches the model wrong before Stage 9 ever wires it.
   These are the invariants the real models will enforce (NEXT spec §5).
   -------------------------------------------------------------------------- */

describe("student portal fixtures (P1-FE-19)", () => {
  it("points balance equals the sum of its accruals", () => {
    const sum = studentPoints.accruals.reduce((s, a) => s + a.points, 0);
    expect(studentPoints.balance).toBe(sum);
  });

  it("points are integers with spec §5.5 reasons — never cents", () => {
    const reasons = new Set(POINT_RULES.map((r) => r.reason));
    for (const a of studentPoints.accruals) {
      expect(Number.isInteger(a.points)).toBe(true);
      expect(a.points).toBeLessThan(1000); // a cents value would betray itself
      expect(reasons.has(a.reason)).toBe(true);
    }
  });

  it("fixed-value reasons accrue exactly their rule's value (P1-FE-30)", () => {
    const fixed = new Map(
      POINT_RULES.filter((r) => r.points !== null).map((r) => [r.reason, r.points]),
    );
    for (const a of studentPoints.accruals) {
      if (fixed.has(a.reason)) {
        expect(a.points, `${a.id} (${a.reason})`).toBe(fixed.get(a.reason));
      }
    }
  });

  it("SALES_500 accruals match the closed-sales total", () => {
    const closedCents = studentSales.reduce((s, r) => s + r.valueCents, 0);
    const milestones = studentPoints.accruals.filter(
      (a) => a.reason === "SALES_500",
    );
    expect(milestones.length).toBe(Math.floor(closedCents / 100 / 500));
  });

  it("the sales trend ends at the ledger total", () => {
    const closedCents = studentSales.reduce((s, r) => s + r.valueCents, 0);
    expect(studentSalesTrend[studentSalesTrend.length - 1]).toBe(closedCents);
  });

  it("every assignment state has student-facing copy", () => {
    for (const a of studentAssignments) {
      expect(STUDENT_ASSIGNMENT_COPY[a.state]).toBeTruthy();
    }
  });

  it("a rejected prospect carries a reason code and keeps credit (spec §5.6)", () => {
    const rejected = studentProspects.filter((p) => p.stage === "REJECTED");
    expect(rejected.length).toBeGreaterThan(0);
    for (const p of rejected) {
      expect(p.reasonCode).toBeTruthy();
      expect(p.reason).toMatch(/credit/i);
    }
  });

  it("edition slot counts add up", () => {
    expect(
      studentEdition.slotsSold + studentEdition.slotsReserved,
    ).toBeLessThanOrEqual(studentEdition.slotsTotal);
  });

  it("the sales code is speakable — short, upper, no ambiguous separators", () => {
    expect(student.salesCode).toMatch(/^[A-Z0-9-]{4,16}$/);
  });
});

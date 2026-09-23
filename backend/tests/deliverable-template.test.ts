/**
 * P5-BE-03 — "the deliverable set with due dates derived from the SX job".
 *
 * Two halves are tested here: that every job in the catalogue HAS a set (an
 * unmapped job would mean an athlete accepting a contract owing nothing), and
 * that the dates are derived from the order rather than invented.
 *
 * The transaction half of the acceptance is in `deliverable.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { NIL_JOBS } from "../src/domain/nil-jobs";
import {
  DELIVERABLE_TEMPLATES,
  deliverablesForOrder,
  NoDeliverableTemplateError,
  templateForJob,
} from "../src/domain/deliverable-template";

const DUE = new Date("2026-11-01T00:00:00.000Z");

describe("every catalogue job obliges the athlete to produce something", () => {
  /* The guard that matters. If SX-08 is ever added to nil-jobs.ts and not
     here, this fails in CI rather than in production at acceptance time. */
  it.each(NIL_JOBS.map((j) => j.id))("%s has a template", (id) => {
    expect(templateForJob(id).length).toBeGreaterThan(0);
  });

  it("has no template for a job that is not in the catalogue", () => {
    const known = new Set(NIL_JOBS.map((j) => j.id));
    for (const id of Object.keys(DELIVERABLE_TEMPLATES)) {
      expect(known.has(id)).toBe(true);
    }
  });

  it("refuses loudly rather than returning an empty set", () => {
    expect(() => templateForJob("SX-99")).toThrow(NoDeliverableTemplateError);
    expect(() => deliverablesForOrder({ jobId: "SX-99", dueDate: DUE })).toThrow(
      NoDeliverableTemplateError,
    );
  });
});

describe("due dates are derived from the order's due date", () => {
  it.each(NIL_JOBS.map((j) => j.id))("%s lands its last item on the due date", (id) => {
    const rows = deliverablesForOrder({ jobId: id, dueDate: DUE });
    const last = rows[rows.length - 1]!;
    expect(last.dueDate.toISOString()).toBe(DUE.toISOString());
  });

  it.each(NIL_JOBS.map((j) => j.id))("%s never schedules past the due date", (id) => {
    for (const row of deliverablesForOrder({ jobId: id, dueDate: DUE })) {
      expect(row.dueDate.getTime()).toBeLessThanOrEqual(DUE.getTime());
    }
  });

  it.each(NIL_JOBS.map((j) => j.id))("%s is ordered earliest first", (id) => {
    const rows = deliverablesForOrder({ jobId: id, dueDate: DUE });
    const times = rows.map((r) => r.dueDate.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("spaces a monthly ambassadorship across four weeks", () => {
    const rows = deliverablesForOrder({ jobId: "SX-07", dueDate: DUE });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01",
    ]);
  });

  it("moves with the order: a later due date moves every item with it", () => {
    const later = new Date("2026-12-01T00:00:00.000Z");
    const a = deliverablesForOrder({ jobId: "SX-06", dueDate: DUE });
    const b = deliverablesForOrder({ jobId: "SX-06", dueDate: later });
    const shift = later.getTime() - DUE.getTime();
    a.forEach((row, i) => {
      expect(b[i]!.dueDate.getTime() - row.dueDate.getTime()).toBe(shift);
    });
  });

  /* An order accepted late still gets its earlier items, dated in the past
     and visibly overdue, rather than quietly re-based to look achievable. */
  it("leaves an overdue item in the past rather than re-basing it", () => {
    const soon = new Date("2026-11-01T00:00:00.000Z");
    const rows = deliverablesForOrder({ jobId: "SX-07", dueDate: soon });
    const acceptedAt = new Date("2026-10-20T00:00:00.000Z");
    const overdue = rows.filter((r) => r.dueDate < acceptedAt);
    expect(overdue.length).toBeGreaterThan(0);
  });

  it("does not mutate the date it was given", () => {
    const due = new Date(DUE);
    deliverablesForOrder({ jobId: "SX-07", dueDate: due });
    expect(due.toISOString()).toBe(DUE.toISOString());
  });
});

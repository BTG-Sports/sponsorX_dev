import { describe, expect, it } from "vitest";

import { CHANGE_NOTE_MAX, changeNoteProblem, fmtWhen, latestChangeRequest } from "../src/lib/offer-live";

/* --------------------------------------------------------------------------
   2S2-FE-03 — "request a change", the pure half: what makes a note
   sendable (the API asks the same), which request the screen shows, and
   how its time reads.
   -------------------------------------------------------------------------- */

describe("changeNoteProblem", () => {
  it("needs words, after trimming", () => {
    expect(changeNoteProblem("")).toMatch(/what you'd like changed/);
    expect(changeNoteProblem("   \n ")).toMatch(/what you'd like changed/);
    expect(changeNoteProblem("Move the second post a week later.")).toBeNull();
  });

  it("allows exactly the API's limit and no more", () => {
    expect(changeNoteProblem("x".repeat(CHANGE_NOTE_MAX))).toBeNull();
    expect(changeNoteProblem(`  ${"x".repeat(CHANGE_NOTE_MAX)}  `)).toBeNull();
    expect(changeNoteProblem("x".repeat(CHANGE_NOTE_MAX + 1))).toMatch(/At most 2,000 characters — 2,001 now/);
  });
});

describe("latestChangeRequest", () => {
  const cr = (id: string, createdAt: string) => ({ id, note: id, requestedBy: "u1", createdAt });

  it("is null without any", () => {
    expect(latestChangeRequest({})).toBeNull();
    expect(latestChangeRequest({ changeRequests: [] })).toBeNull();
  });

  it("is the most recent, whatever order they come in", () => {
    const list = [cr("b", "2026-10-02T09:00:00.000Z"), cr("a", "2026-10-01T09:00:00.000Z"), cr("c", "2026-10-03T09:00:00.000Z")];
    expect(latestChangeRequest({ changeRequests: list })?.id).toBe("c");
    expect(list.map((c) => c.id)).toEqual(["b", "a", "c"]); // not sorted in place
  });
});

describe("fmtWhen", () => {
  it("reads as a date and time, in UTC", () => {
    expect(fmtWhen("2026-10-01T14:05:00.000Z")).toBe("Oct 1, 2026, 2:05 PM UTC");
  });
});

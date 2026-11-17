import { describe, expect, it } from "vitest";

import {
  STATE_COPY,
  STATE_NEXT,
  nextMove,
  trackSteps,
  waitShort,
  type LiveApplicationState,
} from "@/lib/applications-ui";

/* POL-FE-106 — the applications desk's plain words: the list's status pill,
   the drawer's tracker and its "Your next step" sentence. */

const ALL: LiveApplicationState[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
];

describe("waitShort", () => {
  it("says hours under a day and days after", () => {
    expect(waitShort(0)).toBe("Just in");
    expect(waitShort(1)).toBe("1 hour");
    expect(waitShort(5)).toBe("5 hours");
    expect(waitShort(24)).toBe("1 day");
    expect(waitShort(72)).toBe("3 days");
  });
});

describe("STATE_NEXT", () => {
  it("covers every state, and only the desk's own moves call for attention", () => {
    for (const s of ALL) expect(STATE_NEXT[s].next.length).toBeGreaterThan(0);
    const acting = ALL.filter((s) => STATE_NEXT[s].act);
    expect(acting).toEqual(["SUBMITTED", "UNDER_REVIEW", "APPROVED"]);
  });
  it("keeps the badge words the API's states already use", () => {
    expect(STATE_COPY.CHANGES_REQUESTED).toBe("Info requested");
  });
});

describe("trackSteps", () => {
  it("puts a new application on its review step", () => {
    expect(trackSteps("SUBMITTED").map((t) => t.status)).toEqual(["done", "now", "todo", "todo"]);
  });
  it("holds info requested on the second step", () => {
    const t = trackSteps("CHANGES_REQUESTED");
    expect(t[1]).toEqual({ label: "Info requested", status: "now" });
  });
  it("leaves activation as the approved athlete's step", () => {
    expect(trackSteps("APPROVED").map((t) => t.status)).toEqual(["done", "done", "done", "now"]);
    expect(trackSteps("ACTIVE").every((t) => t.status === "done")).toBe(true);
  });
  it("ends a rejection at its third step", () => {
    const t = trackSteps("REJECTED");
    expect(t).toHaveLength(3);
    expect(t[2]).toEqual({ label: "Rejected", status: "stop" });
  });
  it("has exactly one current or stopped step until the athlete is live", () => {
    for (const s of ALL.filter((x) => x !== "ACTIVE")) {
      expect(trackSteps(s).filter((t) => t.status === "now" || t.status === "stop")).toHaveLength(1);
    }
  });
});

describe("nextMove", () => {
  it("tells the live desk to claim a new application first", () => {
    expect(nextMove("SUBMITTED", true)).toMatch(/Start review/);
    /* the demo has no claim step */
    expect(nextMove("SUBMITTED", false)).not.toMatch(/Start review/);
  });
  it("names the button on the screen for each move", () => {
    expect(nextMove("UNDER_REVIEW", true)).toMatch(/Approve, Ask for more info or Reject/);
    expect(nextMove("APPROVED", true)).toMatch(/Activate athlete/);
  });
  it("says there is nothing to do when the ball isn't with the desk", () => {
    for (const s of ["CHANGES_REQUESTED", "ACTIVE", "REJECTED"] as const) {
      expect(nextMove(s, true)).toMatch(/^Nothing/);
    }
  });
});

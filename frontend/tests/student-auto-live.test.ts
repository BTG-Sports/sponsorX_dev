import { describe, expect, it } from "vitest";

import { studentStatusWords, waitingReasons, STUDENT_STATE_COPY, type ApiStudentState } from "../src/lib/students-live";
import { decidedBy, deskView, prospectDeskQuery, PROSPECT_DESK_VIEWS, REJECTION_REASONS } from "../src/lib/prospects-live";
import { accessFor, mayUse } from "../src/lib/admin-access";

/* --------------------------------------------------------------------------
   P9-FE-11 — the screens' pure helpers for P9-BE-20 (students approved from
   the roster) and P9-BE-21 (prospects decided automatically).
   -------------------------------------------------------------------------- */

const STATES = Object.keys(STUDENT_STATE_COPY) as ApiStudentState[];

describe("the student's status in plain words", () => {
  it("while waiting, says only that the school is reviewing", () => {
    for (const state of ["SUBMITTED", "UNDER_REVIEW"] as const) {
      expect(studentStatusWords({ state, reviewerNotes: null })).toEqual({
        title: "Your school is reviewing your application",
        body: "You'll hear as soon as there's a decision.",
      });
    }
  });

  it("never echoes anything but the advisor's own note, and only where one was written", () => {
    expect(studentStatusWords({ state: "CHANGES_REQUESTED", reviewerNotes: " Add your grade " }).body).toBe("Your advisor's note: Add your grade");
    expect(studentStatusWords({ state: "CHANGES_REQUESTED", reviewerNotes: "   " }).body).toBe("Update your application and send it again.");
    /* A note on a waiting application is not shown — waiting says only "reviewing". */
    expect(studentStatusWords({ state: "UNDER_REVIEW", reviewerNotes: "internal" }).body).not.toContain("internal");
  });

  it("has words for every state, with no codes in them", () => {
    for (const state of STATES) {
      const w = studentStatusWords({ state, reviewerNotes: null });
      expect(w.title.length, state).toBeGreaterThan(5);
      expect(`${w.title} ${w.body}`, state).not.toMatch(/[A-Z]{3,}_|UNDER_REVIEW|SUBMITTED/);
    }
  });

  it("an approved student hears they join once their guardian is confirmed", () => {
    expect(studentStatusWords({ state: "APPROVED", reviewerNotes: null }).body).toMatch(/guardian is confirmed/);
  });
});

describe("the advisor's waiting reasons", () => {
  it("are shown only while the application is under review", () => {
    expect(waitingReasons({ state: "UNDER_REVIEW", reviewReasons: ["Not on the school roster"] })).toEqual(["Not on the school roster"]);
    expect(waitingReasons({ state: "UNDER_REVIEW" })).toEqual([]);
    expect(waitingReasons({ state: "APPROVED", reviewReasons: ["stale"] })).toEqual([]);
  });
});

describe("the prospect desk", () => {
  it("opens on the held prospects; anything unknown is held", () => {
    expect(deskView(undefined)).toBe("held");
    expect(deskView("auto")).toBe("auto");
    expect(deskView(["all", "auto"])).toBe("all");
    expect(deskView("DROP TABLE")).toBe("held");
    expect(PROSPECT_DESK_VIEWS.map((v) => v.value)).toEqual(["held", "auto", "all"]);
  });

  it("asks the API for one page of one view", () => {
    expect(prospectDeskQuery({ page: "2", size: "24" }, "auto")).toBe("?page=2&size=24&view=auto");
    expect(prospectDeskQuery({ page: "-1", size: "9999" }, "held")).toMatch(/^\?page=1&size=\d+&view=held$/);
  });

  it("badges who decided", () => {
    expect(decidedBy({ state: "SUBMITTED", decidedAutomatically: false, reviewReasons: ["x"] })).toEqual({ label: "Waiting on you", tone: "warn" });
    expect(decidedBy({ state: "ACCEPTED", decidedAutomatically: true, reviewReasons: [] })).toEqual({ label: "Decided automatically", tone: "accent" });
    expect(decidedBy({ state: "REJECTED", decidedAutomatically: false, reviewReasons: ["x"] }).label).toBe("Decided by staff after a hold");
    expect(decidedBy({ state: "ACCEPTED", decidedAutomatically: false, reviewReasons: [] }).label).toBe("Decided by staff");
  });

  it("offers the API's rejection reasons, and only to BTG admins and Sales", () => {
    expect(REJECTION_REASONS.map(([c]) => c)).toEqual(["CATEGORY_EXCLUSIVE", "SCHOOL_RESTRICTION", "ATHLETE_CONFLICT", "BRAND_SAFETY", "OTHER"]);
    expect(accessFor("/admin/next/prospects")?.roles).toEqual(["SUPER_ADMIN", "BTG_ADMIN", "SALES"]);
    expect(mayUse("/admin/next/prospects", ["FINANCE"])).toBe(false);
    expect(mayUse("/admin/next/prospects", ["SALES"])).toBe(true);
  });
});

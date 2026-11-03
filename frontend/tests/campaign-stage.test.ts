import { describe, expect, it } from "vitest";

import {
  btgFindingDay,
  btgFindingLine,
  nextStepTone,
  nextStepWho,
  saysBtgFinding,
  showsStaffing,
  sponsorNextStep,
  sponsorStaffing,
  stageChangeLine,
} from "../src/lib/campaign-stage";

/* --------------------------------------------------------------------------
   P4-FE-08 — the next step and the "moved automatically" note (P4-BE-09).
   -------------------------------------------------------------------------- */

describe("the next step", () => {
  it("names who it waits on for BTG's desk", () => {
    expect(nextStepWho({ who: "BTG", text: "Ready for BTG to launch" })).toBe("BTG");
    expect(nextStepWho({ who: "SYSTEM", text: "Moves to completed when the final report is sent" })).toBe("Automatic");
    expect(nextStepWho({ who: "ATHLETES", text: "Waiting for 2 athletes to accept" })).toBe("Athletes");
    expect(nextStepTone("BTG")).toBe("warn");
    expect(nextStepTone("SYSTEM")).toBe("accent");
  });

  it("gives the sponsor the API's plain words, or nothing", () => {
    expect(sponsorNextStep({ who: "SYSTEM", text: "Your final report is being prepared" })).toBe("Your final report is being prepared");
    expect(sponsorNextStep({ who: "BTG", text: "  " })).toBeNull();
    expect(sponsorNextStep(null)).toBeNull();
    expect(sponsorNextStep(undefined)).toBeNull();
  });
});

describe("the stage history line", () => {
  it("says when the system moved it, and when BTG did", () => {
    expect(stageChangeLine({ state: "APPROVAL", at: "2026-10-03T10:00:00.000Z", movedAutomatically: true }))
      .toBe("Moved automatically to Approval · Oct 3");
    expect(stageChangeLine({ state: "ACTIVE", at: "2026-10-04T23:30:00.000Z", movedAutomatically: false }))
      .toBe("Moved by BTG to Active · Oct 4");
  });
});

/* --------------------------------------------------------------------------
   POL-FE-22 — the sponsor is told when staffing stalls (POL-BE-22).
   -------------------------------------------------------------------------- */

describe("BTG is finding more athletes", () => {
  const needed = { min: 2, max: 3 };

  it("says since when, from the sponsor's staffing read", () => {
    const s = { signed: 1, needed, btgFinding: { since: "2026-10-28T14:05:00.000Z" } };
    expect(btgFindingLine(s)).toBe("BTG is finding more athletes · since Oct 28");
    expect(btgFindingDay(s)).toBe("Oct 28");
    /* The day is read in the zone asked for — the sponsor pages use UTC. */
    const lateEvening = { signed: 1, needed, btgFinding: { since: "2026-10-29T02:30:00.000Z" } };
    expect(btgFindingDay(lateEvening)).toBe("Oct 29");
    expect(btgFindingLine(lateEvening, "America/New_York")).toBe("BTG is finding more athletes · since Oct 28");
  });

  it("says nothing when BTG isn't, or the date is unusable", () => {
    expect(btgFindingLine({ signed: 1, needed })).toBeNull();
    expect(btgFindingLine({ signed: 1, needed, btgFinding: null })).toBeNull();
    expect(btgFindingLine({ signed: 1, needed, btgFinding: { since: "not a date" } })).toBeNull();
    expect(btgFindingLine({ signed: 1, needed, btgFinding: { since: "" } })).toBeNull();
    expect(btgFindingLine(null)).toBeNull();
    expect(btgFindingLine(undefined)).toBeNull();
    expect(btgFindingDay({ signed: 1, needed, btgFinding: null })).toBeNull();
  });

  it("keeps the count beside it", () => {
    const s = sponsorStaffing({ signed: 1, needed, btgFinding: { since: "2026-10-28T14:05:00.000Z" } });
    expect(s?.count).toBe("1 of 2–3 athletes signed");
    expect(s?.line).toBe("We're staffing your campaign: 1 of 2–3 athletes signed");
    expect(s?.pct).toBe(33);
  });

  it("isn't printed twice when the API's next step already says it", () => {
    expect(saysBtgFinding("BTG is finding more athletes since Oct 28: 1 of 2–3 signed so far")).toBe(true);
    expect(saysBtgFinding("  BTG is finding more athletes")).toBe(true);
    expect(saysBtgFinding("Waiting for 2 athletes to accept")).toBe(false);
    expect(saysBtgFinding("BTG is findingly odd")).toBe(false);
    expect(saysBtgFinding(null)).toBe(false);
    expect(saysBtgFinding(undefined)).toBe(false);
  });

  it("shows the count while staffing, and for a draft only once BTG is finding", () => {
    const wait = { since: "2026-10-28T14:05:00.000Z" };
    expect(showsStaffing("STAFFING", { signed: 1, needed })).toBe(true);
    expect(showsStaffing("STAFFING", { signed: 1, needed, btgFinding: wait })).toBe(true);
    expect(showsStaffing("DRAFT", { signed: 0, needed, btgFinding: wait })).toBe(true);
    expect(showsStaffing("DRAFT", { signed: 0, needed, btgFinding: null })).toBe(false);
    expect(showsStaffing("DRAFT", { signed: 0, needed })).toBe(false);
    expect(showsStaffing("DRAFT", null)).toBe(false);
    expect(showsStaffing("APPROVAL", { signed: 3, needed, btgFinding: wait })).toBe(false);
    expect(showsStaffing("ACTIVE", { signed: 3, needed })).toBe(false);
  });
});

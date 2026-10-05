import { describe, expect, it } from "vitest";

import { nextStepTone, nextStepWho, sponsorNextStep, stageChangeLine } from "../src/lib/campaign-stage";

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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { prospectOutcome } from "../src/lib/students-live";

/* --------------------------------------------------------------------------
   POL-FE-49 — "Log a business" on My sales. POST /students/:id/prospects
   decides it at once (P9-BE-21) and answers `{ id, state }`; the form says
   where it landed in plain words.
   -------------------------------------------------------------------------- */

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("POL-FE-49 · the outcome a student sees", () => {
  it("accepted", () => {
    const o = prospectOutcome("ACCEPTED", "Joe's Pizza");
    expect(o.tone).toBe("success");
    expect(o.message).toContain("Joe's Pizza is accepted");
  });
  it("refused: says why and that the credit is kept", () => {
    const o = prospectOutcome("REJECTED", "Joe's Pizza");
    expect(o.tone).toBe("danger");
    expect(o.message).toContain("another sponsor already has that kind of business");
    expect(o.message).toContain("You keep the credit");
  });
  it("held, or no state in the answer: waiting, never the internal reasons", () => {
    for (const s of ["SUBMITTED", undefined]) {
      const o = prospectOutcome(s, "Joe's Pizza");
      expect(o.tone).toBe("warn");
      expect(o.message).toBe("Joe's Pizza is waiting for SponsorX to check it. You'll hear back either way.");
    }
  });
});

describe("POL-FE-49 · the form is live on both My sales screens", () => {
  it("the fixture screen uses the form, not the old disabled button", () => {
    const page = src("../src/app/(app)/next/sales/page.tsx");
    expect(page).toContain("<ProspectForm />");
    expect(page).not.toContain("Adding one yourself isn't available yet");
  });
  it("the button reads 'Log a business' and the action posts to the student's own id from /me", () => {
    expect(src("../src/components/student-prospect.tsx")).toContain("Log a business");
    const action = src("../src/app/(app)/next/actions.ts");
    expect(action).toContain("who.actor.studentId");
    expect(action).toContain("/prospects`");
  });
});

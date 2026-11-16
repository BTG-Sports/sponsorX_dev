import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decisionLine, loginLine } from "@/lib/students-live";

/* App review wave 7 — SponsorX NEXT (POL-FE-76, POL-FE-77). */
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-76 · NEXT applicants are told, and the advisor sees the login", () => {
  it("an approved student's card says whether they can sign in", () => {
    expect(loginLine({ login: "invited", email: "rae@school.org" })).toEqual({ text: expect.stringContaining("rae@school.org"), ok: true });
    expect(loginLine({ login: "signed-in", email: null })).toEqual({ text: "Has signed in.", ok: true });
    expect(loginLine({ login: "no-email", email: null })!.ok).toBe(false);
    expect(loginLine({ login: "address-in-use", email: "x@y.org" })!.text).toMatch(/already used by another SponsorX login/);
    expect(loginLine({ login: null, email: "a@b.org" })).toBeNull();
    expect(src("app/(app)/advisor/live-advisor.tsx")).toContain("loginLine(s) &&");
  });

  it("after a decision the advisor is told who was emailed, not just Saved.", () => {
    expect(decisionLine("APPROVED", { login: "invited", email: "rae@school.org", displayName: "Rae" })).toMatch(/^Approved\. Rae has been emailed\. Login ready/);
    expect(decisionLine("CHANGES_REQUESTED", { login: null, email: "ivy@school.org", displayName: "Ivy" })).toBe("Sent back with your note. Ivy has been emailed.");
    expect(decisionLine("REJECTED", { login: null, email: null, displayName: "Ola" })).toBe("Declined. They have no email address, so tell them yourself.");
    expect(decisionLine("UNDER_REVIEW", null)).toBe("Saved.");
    expect(src("app/(app)/advisor/actions.ts")).toContain("decisionLine(after?.state ?? to, after)");
  });
});

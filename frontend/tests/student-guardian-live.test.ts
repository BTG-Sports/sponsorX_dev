import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { guardianLine, mayVerifyGuardian } from "@/lib/students-live";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/advisor/actions", () => ({ reviewStudentAction: vi.fn(), verifyGuardianAction: vi.fn() }));

/* POL-FE-57 (app review B6) — nobody could verify a NEXT student's guardian,
   so an under-18 student never joined the masthead. Done when: BTG verifies
   the guardian from the desk; the advisor sees whether they are verified. */

const g = { id: "g1", legalName: "Pat Parent", email: "pat@parent.invalid", relationship: "LEGAL_GUARDIAN", verifiedAt: null };

describe("the guardian on a student's card", () => {
  it("names the guardian and says whether BTG has verified them", () => {
    expect(guardianLine({ guardianId: "g1", guardian: g })).toEqual({ text: "Guardian not verified yet: Pat Parent (legal guardian, pat@parent.invalid). BTG confirms them before the student can join the masthead.", verified: false });
    expect(guardianLine({ guardianId: "g1", guardian: { ...g, verifiedAt: "2026-11-15T00:00:00Z" } })!.verified).toBe(true);
    expect(guardianLine({ guardianId: null, guardian: null })).toBeNull();
  });

  it("only BTG verifies; the button calls POST /guardians/:id/verify", async () => {
    expect(mayVerifyGuardian(["BTG_ADMIN"])).toBe(true);
    expect(mayVerifyGuardian(["ADVISOR"])).toBe(false);
    const { VerifyGuardianButton } = await import("@/components/student-review");
    expect(renderToStaticMarkup(createElement(VerifyGuardianButton, { guardianId: "g1" }))).toContain("Verify guardian");
    const actions = readFileSync(new URL("../src/app/(app)/advisor/actions.ts", import.meta.url), "utf8");
    expect(actions).toMatch(/\/guardians\/\$\{encodeURIComponent\(guardianId\)\}\/verify/);
    const page = readFileSync(new URL("../src/app/(app)/advisor/page.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/canVerify=\{mayVerifyGuardian\(who\.actor\.roles\)\}/);
  });
});

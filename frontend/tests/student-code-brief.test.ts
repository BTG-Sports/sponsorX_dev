import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BriefRequestInvalid, studentCodeOf, toBriefBody, type BriefRequest } from "@/lib/brief-request";

/* POL-FE-58 (app review B7) — no sale was ever credited to a NEXT student:
   the API credits a sale only when the brief carries the student code, and
   no form sent it. Done when: a request filed with a student code credits
   the student's sale when its campaign is sold. (The crediting is the API's
   — backend/tests/next-students.test.ts, a brief with studentCode.) */

const req: BriefRequest = {
  sponsorId: "s1", objective: "Promote our new bakery to families at Westside games this spring", budget: "$500", start: "", durationWeeks: 4,
  sport: "", geo: "", tier: "", category: "", message: "", packageId: "pkg1",
};

describe("the request carries the code", () => {
  it("typed any case, sent upper-cased; blank sends none; a malformed one is refused in words", () => {
    expect(studentCodeOf(" nx-riley-42 ")).toBe("NX-RILEY-42");
    expect(studentCodeOf("")).toBe("");
    expect(() => studentCodeOf("no spaces please")).toThrow(BriefRequestInvalid);
    expect(toBriefBody({ ...req, studentCode: "nx-riley-42" }).studentCode).toBe("NX-RILEY-42");
    expect("studentCode" in toBriefBody(req)).toBe(false);
  });

  it("the drawer has the field and fills it from ?code= or this browser; the API's refusal of a bad code is shown", () => {
    const drawer = readFileSync(new URL("../src/components/brief-request-drawer.tsx", import.meta.url), "utf8");
    expect(drawer).toContain('label="Student code (optional)"');
    expect(drawer).toMatch(/searchParams\.get\("code"\)/);
    expect(drawer).toMatch(/excludedCategories, message, studentCode,/);
    const action = readFileSync(new URL("../src/app/(app)/sponsor/marketplace/actions.ts", import.meta.url), "utf8");
    expect(action).toMatch(/res\.status === 422/);
  });

  it("/s/<code> keeps the code and opens the request form with it", () => {
    const page = readFileSync(new URL("../src/app/(public)/s/[code]/page.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/href=\{`\/sponsor\/marketplace\?code=\$\{encodeURIComponent\(r\.code\)\}`\}/);
    expect(page).toContain("<KeepStudentCode code={r.code} />");
  });
});

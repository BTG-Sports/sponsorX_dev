import { randomBytes } from "node:crypto";
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
  it("sent exactly as typed (trimmed); blank sends none; a malformed one is refused in words", () => {
    /* POL-FE-89 — the API matches exactly, and real codes are mixed case. */
    expect(studentCodeOf(" aB3x_9QkT2mZ ")).toBe("aB3x_9QkT2mZ");
    expect(studentCodeOf("")).toBe("");
    expect(() => studentCodeOf("no spaces please")).toThrow(BriefRequestInvalid);
    expect(toBriefBody({ ...req, studentCode: "aB3x_9QkT2mZ" }).studentCode).toBe("aB3x_9QkT2mZ");
    expect("studentCode" in toBriefBody(req)).toBe(false);
  });

  it("POL-FE-89 · every code the API can issue gets through untouched, on the form and on /s/<code>", () => {
    /* As backend/src/domain/student-moves.ts makes them: randomBytes(9).toString("base64url"). */
    const codes = Array.from({ length: 200 }, () => randomBytes(9).toString("base64url"));
    codes.push("_-_-_-_-_-_-", "AAAAAAAAAAAA", "zzzzzzzzzzzz");
    for (const c of codes) expect(studentCodeOf(c)).toBe(c);
    const page = readFileSync(new URL("../src/app/(public)/s/[code]/page.tsx", import.meta.url), "utf8");
    const pattern = new RegExp(page.match(/if \(!\/(\^\[[^\]]+\]\{1,64\}\$)\/\.test\(code\)\) notFound\(\);/)![1]!);
    for (const c of codes) expect(pattern.test(c)).toBe(true);
    const drawer = readFileSync(new URL("../src/components/brief-request-drawer.tsx", import.meta.url), "utf8");
    expect(drawer).not.toMatch(/toUpperCase\(\)/);
    expect(drawer).toContain('autoCapitalize="off"');
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

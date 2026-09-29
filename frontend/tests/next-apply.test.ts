import { describe, expect, it } from "vitest";

import { EMPTY_DRAFT, birthDateOf, illustrate, isMinor, problems, stepsFor, toApplicationBody, type ApplyDraft } from "../src/lib/next-apply";

/* --------------------------------------------------------------------------
   P1-FE-25 / P9-FE-06 — the student application's rules, mirrored from the
   API: the guardian step appears exactly when the API will require a
   guardian (isMinorOn in guardian-rules.ts), and the body is what
   POST /public/students/applications accepts.
   -------------------------------------------------------------------------- */

const on = new Date("2026-09-29T12:00:00Z");
const draft = (over: Partial<ApplyDraft> = {}): ApplyDraft => ({
  ...EMPTY_DRAFT,
  legalName: "Jordan Reyes", displayName: "Jordan R.", email: "Jordan@Example.com", gradYear: "2027",
  dobMonth: "10", dobDay: "02", dobYear: "2009", schoolSlug: "northside-high", roles: ["WRITER", "SALES"],
  guardianName: "Carmen Reyes", guardianEmail: "carmen@example.com", guardianRelationship: "PARENT", guardianAware: true,
  codeAccepted: true,
  ...over,
});

describe("the minor rule matches the API's", () => {
  it("18th birthday still ahead is a minor; on or after it is not", () => {
    expect(isMinor("2008-09-30", on)).toBe(true);
    expect(isMinor("2008-09-29", on)).toBe(false);
    expect(isMinor(null, on)).toBe(false);
  });

  it("a minor walks the guardian step; an adult doesn't", () => {
    expect(stepsFor(draft(), on)).toEqual(["about", "school", "roles", "guardian", "review"]);
    expect(stepsFor(draft({ dobYear: "2007" }), on)).toEqual(["about", "school", "roles", "review"]);
  });
});

describe("each step says what's wrong before it lets you on", () => {
  it("about: names, year, a real date of birth", () => {
    const p = problems("about", draft({ displayName: " ", dobYear: "20", gradYear: "" }), on);
    expect(Object.keys(p).sort()).toEqual(["displayName", "dob", "gradYear"]);
    expect(p.dob).toBe("Date of birth is missing the year");
    expect(problems("about", draft({ dobMonth: "02", dobDay: "30" }), on).dob).toBe("Date of birth isn't a real date");
    expect(problems("about", draft({ email: "" }), on)).toEqual({});
  });

  it("school, roles, guardian and review each gate on their own fields", () => {
    expect(problems("school", draft({ schoolSlug: "" }), on)).toHaveProperty("schoolSlug");
    expect(problems("roles", draft({ roles: [] }), on)).toHaveProperty("roles");
    expect(Object.keys(problems("guardian", draft({ guardianEmail: "nope", guardianAware: false }), on)).sort()).toEqual(["guardianAware", "guardianEmail"]);
    expect(problems("review", draft({ codeAccepted: false }), on)).toHaveProperty("codeAccepted");
  });
});

describe("the body is exactly what the API accepts", () => {
  it("a minor's application carries the guardian, lower-cased emails, roles in catalogue order", () => {
    expect(toApplicationBody(draft({ roles: ["SALES", "WRITER"] }), on)).toEqual({
      schoolSlug: "northside-high", legalName: "Jordan Reyes", displayName: "Jordan R.", email: "jordan@example.com",
      gradYear: 2027, birthDate: "2009-10-02", masthead: ["WRITER", "SALES"],
      guardian: { legalName: "Carmen Reyes", email: "carmen@example.com", relationship: "PARENT" },
    });
  });

  it("an adult's carries no guardian, and an empty email is null", () => {
    const b = toApplicationBody(draft({ dobYear: "2007", email: "" }), on);
    expect(b.guardian).toBeNull();
    expect(b.email).toBeNull();
  });

  it("an unfinished application can't be sent", () => {
    expect(() => toApplicationBody(draft({ roles: [] }), on)).toThrow(/roles/);
  });

  it("dates are built from the three boxes", () => {
    expect(birthDateOf({ dobMonth: "3", dobDay: "4", dobYear: "2010" })).toBe("2010-03-04");
  });
});

describe("the schools page's split illustration", () => {
  it("$1,000 divides 40 / 30 / 20 / 10", () => {
    expect(illustrate(1000).map((s) => s.amount)).toEqual(["$400", "$300", "$200", "$100"]);
  });
});

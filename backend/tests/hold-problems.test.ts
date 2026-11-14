import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { holdReason, readFindings } from "../src/domain/document-check-rules";
import { PROBLEM_CODES, PROBLEM_TYPE_LABELS, PROBLEM_TYPES, problemOf, problemsOf, type ProblemCode } from "../src/domain/hold-problems";
import { approvalVerdict } from "../src/domain/onboarding-rules";
import { signupVerdict, type AthleteFacts } from "../src/domain/signup-rules";
import { sponsorApprovalVerdict } from "../src/domain/sponsor-request-rules";

/* --------------------------------------------------------------------------
   POL-BE-42 — "What's wrong" at a glance. Done when:

     a held record shows each problem as a tag on its list row and at the top
     of its page; a record with no problems shows none; the tags match the
     stored reasons exactly (tests on each type).

   This file: every sentence the rules write has a code, the codes have the
   right types, and the label is the reason word for word. The lists and
   pages are in whats-wrong.test.ts.
   -------------------------------------------------------------------------- */

const codeOf = (r: string) => problemOf(r).code;

/** Every document finding, as readFindings words it. */
function everyFinding(label: string) {
  const unread = readFindings("", { label, names: [], kind: null, expires: false, birthDate: null });
  const flagged = readFindings("EXPIRES 01/01/2001 SOME OTHER WORDS ON THIS PAPER THAT ARE LONG ENOUGH", {
    label, names: [{ who: "The athlete", name: "Serena Kay", kind: "person" }], kind: "GOVERNMENT_ID", expires: true, birthDate: new Date("2005-03-14T00:00:00Z"),
  }, new Date("2026-11-14T00:00:00Z"));
  return [...unread.findings, ...flagged.findings];
}

describe("POL-BE-42 · every hold reason is a typed, coded problem", () => {
  it("each document finding has its own code, the document named", () => {
    const findings = everyFinding("Government ID");
    expect(findings.map((f) => f.code).sort()).toEqual(["BIRTH_DATE_NOT_FOUND", "EXPIRED", "KIND_NOT_FOUND", "NAME_NOT_FOUND", "NO_TEXT"]);
    const want: Record<string, ProblemCode> = {
      NO_TEXT: "DOC_UNREADABLE", NAME_NOT_FOUND: "DOC_NAME_NOT_FOUND", KIND_NOT_FOUND: "DOC_WRONG_KIND", EXPIRED: "DOC_EXPIRED", BIRTH_DATE_NOT_FOUND: "DOC_BIRTH_DATE_NOT_FOUND",
    };
    for (const f of findings) {
      const reason = holdReason("Government ID", f);
      expect(problemOf(reason), f.code).toEqual({
        code: want[f.code], type: f.code === "NO_TEXT" ? "COULDNT_READ" : "UPLOAD_MISMATCH", label: reason, document: "Government ID", field: null,
      });
    }
  });

  it("an athlete held for everything at once: every reason coded", () => {
    const facts: AthleteFacts = {
      missingFields: [], hasBirthDate: true, emailConfirmed: true, minor: true, idUploaded: true,
      guardian: { name: "Gail Parent", rejected: true, emailConfirmed: true, idUploaded: true, proofUploaded: true, agreementAccepted: true } as AthleteFacts["guardian"],
      duplicates: ["same email as Riley Carter"], emailInUse: true, staffConfirmMinors: true,
      documentHolds: [holdReason("School ID", { says: "No words could be read on it — check it by eye" })],
    };
    const v = signupVerdict(facts);
    expect(v.outcome).toBe("review");
    const reasons = v.outcome === "review" ? v.reasons : [];
    expect(reasons.map(codeOf)).toEqual(["LIKELY_DUPLICATE", "EMAIL_HAS_LOGIN", "GUARDIAN_REJECTED", "STAFF_CONFIRM_MINORS", "DOC_UNREADABLE"]);
  });

  it("a sponsor request held for everything at once: every reason coded", () => {
    const base = { emailConfirmed: true, proofUploaded: true, restrictedWords: [{ word: "vape", kind: "ADULT" }], emailInUse: true, sameNameSponsors: ["Midwest Running Co"] };
    const typed = sponsorApprovalVerdict({ ...base, businessType: "TOBACCO_VAPE", businessTypeOther: null, documentHolds: [holdReason("Proof of business", { says: "Midwest Running Co (Midwest Running Co) isn't named on it" })] });
    const other = sponsorApprovalVerdict({ ...base, businessType: "OTHER", businessTypeOther: "a vape and tobacco shop" });
    const reasons = [typed, other].flatMap((v) => (v.outcome === "review" ? v.reasons : []));
    const codes = reasons.map(codeOf);
    expect(codes).not.toContain("UNCLASSIFIED");
    expect(new Set(codes)).toEqual(new Set(["RESTRICTED_BUSINESS_TYPE", "RESTRICTED_WORDS", "EMAIL_HAS_LOGIN", "SAME_NAME_SPONSOR", "DOC_NAME_NOT_FOUND"]));
    expect(reasons.filter((r) => codeOf(r) === "RESTRICTED_BUSINESS_TYPE")).toHaveLength(2);
  });

  it("an organisation held for everything at once: every reason coded", () => {
    const v = approvalVerdict({
      answersMissing: ["league"], missingDocuments: ["Business registration"], contactEmail: "dana@x.invalid", emailConfirmed: false,
      nameTakenBy: "Westfield Hawks", emailHasLogin: true, documentHolds: [holdReason("W-9", { says: "It looks expired: 01/01/2020" })],
    });
    expect(v.reasons.map((r) => problemOf(r))).toEqual([
      expect.objectContaining({ code: "MISSING_ANSWERS", type: "MISSING", field: "answers" }),
      expect.objectContaining({ code: "MISSING_DOCUMENT", type: "MISSING", document: "Business registration" }),
      expect.objectContaining({ code: "EMAIL_NOT_CONFIRMED", type: "EMAIL_NOT_CONFIRMED", field: "email" }),
      expect.objectContaining({ code: "NAME_TAKEN", type: "ALREADY_REGISTERED", field: "name" }),
      expect.objectContaining({ code: "EMAIL_HAS_LOGIN", type: "ALREADY_REGISTERED", field: "email" }),
      expect.objectContaining({ code: "DOC_EXPIRED", type: "UPLOAD_MISMATCH", document: "W-9" }),
    ]);
  });

  it("no new hold sentence slips in without a code: the rule files still write exactly the sentences above", () => {
    /* Adding a reasons.push to a rule file changes this count: give the new sentence a code in
       hold-problems.ts and a case above, then update the number. */
    const src = (f: string) => readFileSync(join(import.meta.dirname, "../src/domain", f), "utf8");
    const pushes = (f: string) => (src(f).match(/reasons\.push\(/g) ?? []).length;
    expect({ signup: pushes("signup-rules.ts"), sponsor: pushes("sponsor-request-rules.ts"), onboarding: pushes("onboarding-rules.ts") })
      .toEqual({ signup: 5, sponsor: 6, onboarding: 6 });
    expect((src("document-check-rules.ts").match(/findings\.push\(|code: "NO_TEXT"/g) ?? []).length).toBe(5);
  });

  it("six types with their tag words, Technical Decision among them; every code has a type", () => {
    expect(PROBLEM_TYPES).toHaveLength(6);
    expect(PROBLEM_TYPE_LABELS.TECHNICAL_DECISION).toBe("Technical Decision");
    for (const t of Object.values(PROBLEM_CODES)) expect(PROBLEM_TYPES).toContain(t);
  });

  it("the label is the stored reason word for word; no reasons, no problems; older wording reads as UNCLASSIFIED", () => {
    expect(problemsOf([])).toEqual([]);
    const odd = "Something an older version wrote";
    expect(problemOf(odd)).toEqual({ code: "UNCLASSIFIED", type: "TECHNICAL_DECISION", label: odd, document: null, field: null });
    const reasons = ["Missing document: W-9", "Some answers are still missing"];
    expect(problemsOf(reasons).map((p) => p.label)).toEqual(reasons);
  });
});

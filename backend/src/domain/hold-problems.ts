/**
 * "What's wrong" at a glance — POL-BE-42.
 *
 * One shared reading of a held record's stored reasons, for athlete sign-ups,
 * sponsor requests and organisations (and the support inbox's "This person on
 * SponsorX"). Each reason becomes a PROBLEM:
 *
 *   - `label`: the stored reason, word for word — the tag never says
 *     something the record doesn't;
 *   - `type`: one of six, which sets the tag's colour on the pages;
 *   - `code`: what exactly is wrong, stable for code and reports;
 *   - `document` / `field`: what it is about, so a tag can jump to it.
 *
 * READ, NOT STORED. The reasons stay the record of truth (written by the
 * rule files below); this only names them. Every sentence those files write
 * has a code here — tests/hold-problems.test.ts makes every rule produce
 * every reason and fails on one without a code. A reason with older wording
 * already in a database reads as UNCLASSIFIED (Technical Decision), never an
 * error.
 *
 * The sentences come from:
 *   - signup-rules.ts `signupVerdict` (athletes);
 *   - sponsor-request-rules.ts `sponsorApprovalVerdict` (sponsor requests);
 *   - onboarding-rules.ts `approvalVerdict` (organisations);
 *   - document-check-rules.ts `holdReason` / `readFindings` (any document).
 */
import { STAFF_CONFIRM_REASON } from "./signup-rules";

export const PROBLEM_TYPES = ["UPLOAD_MISMATCH", "COULDNT_READ", "MISSING", "EMAIL_NOT_CONFIRMED", "ALREADY_REGISTERED", "TECHNICAL_DECISION"] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

/** The words on each type's tag. */
export const PROBLEM_TYPE_LABELS: Record<ProblemType, string> = {
  UPLOAD_MISMATCH: "Upload doesn't match",
  COULDNT_READ: "Couldn't read",
  MISSING: "Missing",
  EMAIL_NOT_CONFIRMED: "Email not confirmed",
  ALREADY_REGISTERED: "Already registered",
  /* Named by the user 2026-11-14: a BTG rule a person decides on, not a fault. */
  TECHNICAL_DECISION: "Technical Decision",
};

/** Every code, with its type. */
export const PROBLEM_CODES = {
  DOC_NAME_NOT_FOUND: "UPLOAD_MISMATCH",
  DOC_WRONG_KIND: "UPLOAD_MISMATCH",
  DOC_EXPIRED: "UPLOAD_MISMATCH",
  DOC_BIRTH_DATE_NOT_FOUND: "UPLOAD_MISMATCH",
  DOC_UNREADABLE: "COULDNT_READ",
  MISSING_DOCUMENT: "MISSING",
  MISSING_ANSWERS: "MISSING",
  EMAIL_NOT_CONFIRMED: "EMAIL_NOT_CONFIRMED",
  EMAIL_HAS_LOGIN: "ALREADY_REGISTERED",
  NAME_TAKEN: "ALREADY_REGISTERED",
  LIKELY_DUPLICATE: "ALREADY_REGISTERED",
  SAME_NAME_SPONSOR: "ALREADY_REGISTERED",
  RESTRICTED_BUSINESS_TYPE: "TECHNICAL_DECISION",
  RESTRICTED_WORDS: "TECHNICAL_DECISION",
  STAFF_CONFIRM_MINORS: "TECHNICAL_DECISION",
  GUARDIAN_REJECTED: "TECHNICAL_DECISION",
  /* A reason this file doesn't know: older wording already stored. */
  UNCLASSIFIED: "TECHNICAL_DECISION",
} as const satisfies Record<string, ProblemType>;
export type ProblemCode = keyof typeof PROBLEM_CODES;

export type Problem = {
  code: ProblemCode;
  type: ProblemType;
  /** The stored reason, word for word. */
  label: string;
  /** The document it is about, as the reason names it ("Government ID"), or null. */
  document: string | null;
  /** The field it is about, or null. */
  field: "email" | "name" | "answers" | "businessType" | "description" | "guardian" | "age" | null;
};

type Match = { code: ProblemCode; document?: string | null; field?: Problem["field"] };

/** What a document check found, by the finding's own words (document-check-rules.ts `readFindings`). */
function documentFinding(says: string): ProblemCode {
  if (says.startsWith("No words could be read on it")) return "DOC_UNREADABLE";
  if (says.startsWith("It doesn't read like ")) return "DOC_WRONG_KIND";
  if (says.startsWith("It looks expired")) return "DOC_EXPIRED";
  if (/^The date of birth on the account .* isn't on it$/.test(says)) return "DOC_BIRTH_DATE_NOT_FOUND";
  if (/ isn't named on it$/.test(says)) return "DOC_NAME_NOT_FOUND";
  return "UNCLASSIFIED";
}

function match(reason: string): Match {
  const doc = /^Document check — (.+?): (.+)$/.exec(reason);
  if (doc) return { code: documentFinding(doc[2]!), document: doc[1]! };
  const missing = /^Missing document: (.+)$/.exec(reason);
  if (missing) return { code: "MISSING_DOCUMENT", document: missing[1]! };
  if (reason === "Some answers are still missing") return { code: "MISSING_ANSWERS", field: "answers" };
  if (reason.startsWith("The primary contact hasn't confirmed their email")) return { code: "EMAIL_NOT_CONFIRMED", field: "email" };
  if (reason === "Their email already has a SponsorX login" || / already has a SponsorX login — /.test(reason)) return { code: "EMAIL_HAS_LOGIN", field: "email" };
  if (reason.startsWith("This name is already registered on SponsorX")) return { code: "NAME_TAKEN", field: "name" };
  if (reason.startsWith("Likely duplicate athlete: ")) return { code: "LIKELY_DUPLICATE", field: "name" };
  if (reason.startsWith("A sponsor with the same name already exists: ")) return { code: "SAME_NAME_SPONSOR", field: "name" };
  if (reason.startsWith("Restricted business type: ") || reason.startsWith("Their description sounds like a restricted business type: ")) {
    return { code: "RESTRICTED_BUSINESS_TYPE", field: "businessType" };
  }
  if (reason.startsWith("Restricted words in their description: ")) return { code: "RESTRICTED_WORDS", field: "description" };
  if (reason === STAFF_CONFIRM_REASON) return { code: "STAFF_CONFIRM_MINORS", field: "age" };
  if (/^Their guardian, .*, was rejected by BTG$/.test(reason)) return { code: "GUARDIAN_REJECTED", field: "guardian" };
  return { code: "UNCLASSIFIED" };
}

/** One stored reason as a problem. */
export function problemOf(reason: string): Problem {
  const m = match(reason);
  return { code: m.code, type: PROBLEM_CODES[m.code], label: reason, document: m.document ?? null, field: m.field ?? null };
}

/** A held record's stored reasons as problems, in the same order. */
export function problemsOf(reasons: readonly string[]): Problem[] {
  return reasons.map(problemOf);
}

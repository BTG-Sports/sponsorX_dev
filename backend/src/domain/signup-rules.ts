/**
 * When an athlete (and a minor's guardian) is approved automatically —
 * 2S1-BE-09, 2S1-BE-10. Pure: no Prisma, no config.
 *
 * BTG has at most one reviewer, so the system approves and BTG checks
 * afterwards. Three outcomes, the sponsor rules' shape (sponsor-request-rules):
 *
 *   - WAITING — something is still the applicant's (or their guardian's) to
 *     do. `missing` is written to them: what to do next, in their words.
 *   - REVIEW — everything is in, but a person must look. `reasons` are
 *     written to BTG: a likely duplicate, an address that already has a
 *     login, the staff-confirmation setting, a guardian BTG rejected.
 *   - APPROVE — nothing stands in the way.
 *
 * ADULT: a complete application with a date of birth, a confirmed email, a
 * government ID, and no likely duplicate (the same email, or the same legal
 * name and date of birth as another athlete).
 *
 * MINOR (under their place's age of majority): the same, with a SCHOOL ID
 * (or similar — minors have no government ID) in place of the government
 * ID, plus their guardian: email confirmed by opening the set-up link,
 * government ID, proof of guardianship, guardian agreement accepted. With
 * "BTG staff confirm minors before approval" switched on, a complete minor
 * waits for a person instead.
 *
 * An unknown place is not a reason to hold anyone — it counts as 18 and is
 * FLAGGED for BTG (`signupFlags`), which the New sign-ups desk shows.
 */

export type GuardianFacts = {
  name: string;
  emailConfirmed: boolean;
  idUploaded: boolean;
  proofUploaded: boolean;
  agreementAccepted: boolean;
  rejected: boolean;
};

export type AthleteFacts = {
  /** missingApplicationFields() — the form's required fields not on record. */
  missingFields: readonly string[];
  hasBirthDate: boolean;
  emailConfirmed: boolean;
  minor: boolean;
  /** GOVERNMENT_ID for an adult; SCHOOL_ID or GOVERNMENT_ID for a minor. */
  idUploaded: boolean;
  guardian: GuardianFacts | null;
  /** "same email as Riley Carter", "same name and date of birth as Riley Carter". */
  duplicates: readonly string[];
  /** The address already has a SponsorX login somewhere — logins are claimed by email. */
  emailInUse: boolean;
  staffConfirmMinors: boolean;
};

export type SignupVerdict =
  | { outcome: "waiting"; missing: string[] }
  | { outcome: "review"; reasons: string[] }
  | { outcome: "approve" };

export const STAFF_CONFIRM_REASON = "BTG staff confirm minors before approval (the setting is on)";

/** What the athlete's own government-ID-or-school-ID step is called. */
export function idKindFor(minor: boolean): "GOVERNMENT_ID" | "SCHOOL_ID" {
  return minor ? "SCHOOL_ID" : "GOVERNMENT_ID";
}

/** What is still the applicant's (or their guardian's) to do, in their words. */
export function signupMissing(f: AthleteFacts): string[] {
  const missing: string[] = [];
  if (!f.hasBirthDate) missing.push("add your date of birth");
  if (f.missingFields.some((m) => m !== "birthDateOrAgeBand")) missing.push("finish your application");
  if (!f.emailConfirmed) missing.push("confirm your email");
  if (!f.idUploaded) missing.push(f.minor ? "upload your school ID" : "upload your government ID");
  if (f.minor) {
    const g = f.guardian;
    if (!g) {
      missing.push("name your guardian");
    } else if (!g.rejected) {
      if (!g.emailConfirmed) missing.push("your guardian opens the link we emailed them");
      if (!g.idUploaded) missing.push("your guardian uploads their government ID");
      if (!g.proofUploaded) missing.push("your guardian uploads proof they are your guardian");
      if (!g.agreementAccepted) missing.push("your guardian accepts the guardian agreement");
    }
  }
  return missing;
}

export function signupVerdict(f: AthleteFacts): SignupVerdict {
  const missing = signupMissing(f);
  if (missing.length) return { outcome: "waiting", missing };
  const reasons: string[] = [];
  for (const d of f.duplicates) reasons.push(`Likely duplicate athlete: ${d}`);
  if (f.emailInUse) reasons.push("Their email already has a SponsorX login");
  if (f.minor && f.guardian?.rejected) reasons.push(`Their guardian, ${f.guardian.name}, was rejected by BTG`);
  if (f.minor && f.staffConfirmMinors) reasons.push(STAFF_CONFIRM_REASON);
  return reasons.length ? { outcome: "review", reasons } : { outcome: "approve" };
}

/** Never a reason to hold anyone — shown to BTG beside the sign-up. */
export function signupFlags(a: { majorityKnown: boolean; countryCode: string; stateCode: string | null }): string[] {
  if (a.majorityKnown) return [];
  const place = [a.stateCode, a.countryCode].filter(Boolean).join(", ");
  return [`Place not in the age table: “${place}”, so they are counted as an adult at 18`];
}

/** The ticks the New sign-ups page shows for an approved athlete — what was true when the checks passed. */
export function checksPassed(a: {
  minor: boolean; majorityAge: number; place: string; majorityKnown: boolean; guardianName: string | null; idKind: "GOVERNMENT_ID" | "SCHOOL_ID";
}): string[] {
  return [
    "Application complete, with a date of birth",
    "Email confirmed",
    a.idKind === "GOVERNMENT_ID" ? "Government ID uploaded" : "School ID uploaded",
    a.majorityKnown
      ? `Age checked against the age table: ${a.place}, adult at ${a.majorityAge}${a.minor ? ", so a guardian is needed" : ""}`
      : `Place not in the age table (${a.place}), counted as adult at 18`,
    ...(a.minor && a.guardianName ? [`Guardian approved: ${a.guardianName}`] : []),
    "Not a likely duplicate of another athlete",
  ];
}

export const GUARDIAN_PROOF_KINDS = ["BIRTH_CERTIFICATE", "COURT_ORDER", "SCHOOL_RECORD"] as const;
export type GuardianProofKind = (typeof GUARDIAN_PROOF_KINDS)[number];
export const PROOF_WORDS: Record<GuardianProofKind, string> = {
  BIRTH_CERTIFICATE: "Birth certificate naming the guardian",
  COURT_ORDER: "Court order",
  SCHOOL_RECORD: "School record naming the guardian",
};

/** Kinds of identity document, and who may hold each. */
export const ATHLETE_DOCUMENT_KINDS = ["GOVERNMENT_ID", "SCHOOL_ID"] as const;
export const GUARDIAN_DOCUMENT_KINDS = ["GUARDIAN_ID", "GUARDIANSHIP_PROOF"] as const;
export type AccountDocumentKind = (typeof ATHLETE_DOCUMENT_KINDS)[number] | (typeof GUARDIAN_DOCUMENT_KINDS)[number];
export const DOCUMENT_WORDS: Record<AccountDocumentKind, string> = {
  GOVERNMENT_ID: "Government ID",
  SCHOOL_ID: "School ID",
  GUARDIAN_ID: "Government ID",
  GUARDIANSHIP_PROOF: "Proof of guardianship",
};

/** Agreed 2026-10-01: an ID upload is a PDF, JPEG or PNG of at most 10 MB. */
export const ID_DOCUMENT_TYPES: ReadonlySet<string> = new Set(["application/pdf", "image/jpeg", "image/png"]);
export const MAX_ID_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Enough for every kind several times over; stops a link being used as free storage. */
export const MAX_ACCOUNT_DOCUMENTS = 8;

/** Why this file can't be an ID upload, or null. */
export function idUploadProblem(input: { contentType: string; bytes: number }): string | null {
  if (!ID_DOCUMENT_TYPES.has(input.contentType)) return "An ID upload is a PDF, JPEG or PNG.";
  if (!Number.isInteger(input.bytes) || input.bytes < 1) return "That file is empty.";
  if (input.bytes > MAX_ID_DOCUMENT_BYTES) return "An ID upload is at most 10 MB.";
  return null;
}

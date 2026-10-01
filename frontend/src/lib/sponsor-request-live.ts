/* --------------------------------------------------------------------------
   2S1-FE-11 (form half) — the applicant's side of a sponsor request, against
   2S1-BE-17's public routes. Pure: types shaped like the API, the proof-file
   check the API repeats, and the words the screens use for where a request
   stands. No React, no fetch — the pages and the upload island share it and
   frontend/tests/sponsor-request-live.test.ts pins it.

     GET  /public/sponsor-requests/:token                          → ApiSponsorRequestStatus
     POST /public/sponsor-requests/:token/documents                → a private-bucket PUT URL
     POST /public/sponsor-requests/:token/documents/:id/confirm    → ApiSponsorRequestStatus
     POST /public/sponsor-requests/confirm-email {token}           → ApiEmailConfirmation

   The applicant is only ever told *that* BTG is looking (`underReview`),
   never why — BTG's review reasons stay on BTG's desk.
   -------------------------------------------------------------------------- */

export type SponsorRequestState = "NEW" | "APPROVED" | "DECLINED" | "REJECTED";

/** GET /public/sponsor-requests/:token, and what confirming an upload returns. */
export type ApiSponsorRequestStatus = {
  state: SponsorRequestState;
  businessName: string;
  /** The address on the request — the one that signs in. */
  email: string;
  emailConfirmed: boolean;
  proofUploaded: boolean;
  /** The API's own words, e.g. "confirm your email". Empty once decided. */
  missing: string[];
  underReview: boolean;
};

/** POST /public/sponsor-requests/confirm-email. */
export type ApiEmailConfirmation = {
  state: SponsorRequestState;
  businessName: string;
  email: string;
  emailConfirmed: true;
  waitingFor: string[];
  underReview: boolean;
  /** Opening the emailed link proves the mailbox, so it carries on from any device. */
  requestToken: string;
};

export type ApiSponsorDocument = { id: string; filename: string; contentType: string; bytes: number };

/* ── the proof of business ────────────────────────────────────────────── */

/** What the API accepts (SponsorDocumentInput; MAX_DOCUMENT_BYTES is 20 MB). */
export const PROOF_TYPES: ReadonlySet<string> = new Set(["application/pdf", "image/jpeg", "image/png"]);
export const MAX_PROOF_BYTES = 20 * 1024 * 1024;

/** Checked before asking for an upload URL, so a wrong file never leaves the device. */
export function checkProof(file: { name: string; type: string; size: number }): string | null {
  if (!PROOF_TYPES.has(file.type)) return "A proof of business is a PDF, JPEG or PNG.";
  if (file.size < 1) return "That file is empty.";
  if (file.size > MAX_PROOF_BYTES) return "A document is at most 20 MB.";
  if (!file.name.trim()) return "The file needs a name.";
  return null;
}

/* ── where the request stands ─────────────────────────────────────────── */

export type Standing =
  /** The applicant still has something to do. */
  | { kind: "waiting"; missing: string[] }
  /** Everything is in and the system is about to open the account. */
  | { kind: "opening" }
  /** Everything is in; a person at BTG is looking. */
  | { kind: "review" }
  | { kind: "approved" }
  | { kind: "declined" }
  | { kind: "rejected" };

/** One answer for the status page, the upload's result and the email link. */
export function standingOf(s: { state: SponsorRequestState; missing: string[]; underReview: boolean }): Standing {
  if (s.state === "APPROVED") return { kind: "approved" };
  if (s.state === "DECLINED") return { kind: "declined" };
  if (s.state === "REJECTED") return { kind: "rejected" };
  if (s.missing.length) return { kind: "waiting", missing: s.missing };
  return s.underReview ? { kind: "review" } : { kind: "opening" };
}

/** The confirm-email answer, as a status (its `waitingFor` is the same list as `missing`). */
export function confirmationStatus(c: ApiEmailConfirmation): { state: SponsorRequestState; missing: string[]; underReview: boolean } {
  return { state: c.state, missing: c.state === "NEW" ? c.waitingFor : [], underReview: c.underReview };
}

/** The API's step words as a to-do line: "upload your proof of business" → "Upload your proof of business". */
export function missingLabel(m: string): string {
  const s = m.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The headline and line for a standing. `email` only when this screen knows it. */
export function standingCopy(st: Standing, email?: string): { title: string; body: string } {
  switch (st.kind) {
    case "waiting":
      return { title: "A few things left", body: "Your sponsor account opens as soon as these are done." };
    case "opening":
      return { title: "We're opening your account", body: "Everything is in. We'll email you as soon as you can sign in." };
    case "review":
      return { title: "BTG is taking a look", body: "Everything is in. A person at BTG is checking your request — we'll email you." };
    case "approved":
      return {
        title: "Your account is open",
        body: email ? `Sign in with ${email}.` : "Sign in with the email address you gave on the form.",
      };
    case "declined":
      return { title: "BTG couldn't open an account for this request", body: "We've emailed you about it. You're welcome to send the form again." };
    case "rejected":
      return { title: "This sponsor account is closed", body: "BTG has emailed you about it. To ask BTG about the decision, get in touch through the contact page." };
  }
}

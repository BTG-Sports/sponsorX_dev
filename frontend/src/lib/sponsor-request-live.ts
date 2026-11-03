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
     POST /public/sponsor-requests/:token/resend-confirmation      → { sent: true, email }   (POL-BE-18)
     POST /public/sponsor-requests/:token/email {email}            → { sent: true, email }   (POL-BE-18)

   The applicant is only ever told *that* BTG is looking (`underReview`),
   never why — BTG's review reasons stay on BTG's desk.

   POL-FE-18 — while the request is NEW and the address unconfirmed, the
   status page offers "Resend email" and "Change email" (sponsor-email-fix.tsx);
   `canFixEmail`, `looksLikeEmail` and `emailFixRefusal` are its pure half.
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

/** POST …/:token/resend-confirmation (202) and POST …/:token/email (200): the address the link went to. */
export type ApiEmailSent = { sent: true; email: string };

/* ── fixing the email (POL-FE-18) ─────────────────────────────────────── */

/** The API's own rule for both routes (409 otherwise): still open, and nobody has proved the address yet. */
export function canFixEmail(s: { state: SponsorRequestState; emailConfirmed: boolean }): boolean {
  return s.state === "NEW" && !s.emailConfirmed;
}

/** The API's `z.email().max(100)`, cheaply: something@something.tld, no spaces. Checked before the call, and again by the action. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** The Next server, or the API behind it, didn't answer. The same words wherever the status page talks to the API. */
export const SPONSORX_UNREACHABLE = "We couldn't reach SponsorX. Nothing was lost — check your connection and try again.";

/**
 * What a refused resend or change says. `said` is the API's own message when it sent one
 * (refusalMessage); the 409 keeps it, because it names what changed — "Your email is already
 * confirmed." / "This request has already been decided." — and the island reloads the page after.
 */
export function emailFixRefusal(status: number, said?: string | null): string {
  if (status === 0) return SPONSORX_UNREACHABLE;
  if (status === 400) return "That doesn't look like an email address.";
  if (status === 409) return said ? `${said} This page will update.` : "Something changed on this request — the address may have just been confirmed. This page will update.";
  if (status === 422) return "That is already the address on your request.";
  if (status === 429) return "Too many tries. Try again in an hour.";
  if (status === 404 || status === 410) return "This link no longer works. Reload the page.";
  if (status >= 500) return "Something went wrong on our side. Try again in a minute.";
  return said ?? "That didn't go through. Try again.";
}

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

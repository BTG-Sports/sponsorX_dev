import { describe, expect, it } from "vitest";

import {
  canFixEmail,
  checkProof,
  confirmationStatus,
  emailFixRefusal,
  looksLikeEmail,
  missingLabel,
  SPONSORX_UNREACHABLE,
  standingCopy,
  standingOf,
} from "../src/lib/sponsor-request-live";

/* --------------------------------------------------------------------------
   2S1-FE-11 (form half) — the applicant's side of a sponsor request. What the
   status page, the upload and the email link say comes only from the API's
   state, missing[] and underReview — never from BTG's reasons.
   -------------------------------------------------------------------------- */

const NEW = { state: "NEW" as const, missing: [] as string[], underReview: false };

describe("where a request stands", () => {
  it("lists what is missing until everything is in", () => {
    expect(standingOf({ ...NEW, missing: ["confirm your email", "upload your proof of business"] })).toEqual({
      kind: "waiting", missing: ["confirm your email", "upload your proof of business"],
    });
    expect(missingLabel("upload your proof of business")).toBe("Upload your proof of business");
  });

  it("then: opening, or with BTG; and the decided states", () => {
    expect(standingOf(NEW).kind).toBe("opening");
    expect(standingOf({ ...NEW, underReview: true }).kind).toBe("review");
    expect(standingOf({ state: "APPROVED", missing: [], underReview: false }).kind).toBe("approved");
    expect(standingOf({ state: "DECLINED", missing: [], underReview: false }).kind).toBe("declined");
    expect(standingOf({ state: "REJECTED", missing: [], underReview: false }).kind).toBe("rejected");
  });

  it("says who to sign in as only when it knows", () => {
    expect(standingCopy({ kind: "approved" }, "jordan@cafemilo.com").body).toBe("Sign in with jordan@cafemilo.com.");
    expect(standingCopy({ kind: "approved" }).body).toMatch(/email address you gave/);
    expect(standingCopy({ kind: "opening" }).title).toBe("We're opening your account");
    expect(standingCopy({ kind: "review" }).title).toBe("BTG is taking a look");
  });

  it("reads the email-confirmation answer as a status", () => {
    expect(confirmationStatus({ state: "NEW", businessName: "Cafe Milo", email: "milo@example.com", requestToken: "t", emailConfirmed: true, waitingFor: ["upload your proof of business"], underReview: false }))
      .toEqual({ state: "NEW", missing: ["upload your proof of business"], underReview: false });
    expect(confirmationStatus({ state: "APPROVED", businessName: "Cafe Milo", email: "milo@example.com", requestToken: "t", emailConfirmed: true, waitingFor: ["stale"], underReview: false }).missing).toEqual([]);
  });
});

describe("the proof-of-business file", () => {
  it("is a PDF, JPEG or PNG of at most 20 MB", () => {
    expect(checkProof({ name: "license.pdf", type: "application/pdf", size: 81_920 })).toBeNull();
    expect(checkProof({ name: "permit.png", type: "image/png", size: 20 * 1024 * 1024 })).toBeNull();
    expect(checkProof({ name: "x.exe", type: "application/x-msdownload", size: 10 })).toMatch(/PDF, JPEG or PNG/);
    expect(checkProof({ name: "big.pdf", type: "application/pdf", size: 20 * 1024 * 1024 + 1 })).toMatch(/20 MB/);
    expect(checkProof({ name: "empty.pdf", type: "application/pdf", size: 0 })).toMatch(/empty/);
  });
});

/* POL-FE-18 — "Resend email" / "Change email" on the status page (POL-BE-18). */
describe("fixing the confirmation email", () => {
  it("is offered only while the request is NEW and the address unconfirmed — the API's 409 rule", () => {
    expect(canFixEmail({ state: "NEW", emailConfirmed: false })).toBe(true);
    expect(canFixEmail({ state: "NEW", emailConfirmed: true })).toBe(false);
    expect(canFixEmail({ state: "APPROVED", emailConfirmed: false })).toBe(false);
    expect(canFixEmail({ state: "DECLINED", emailConfirmed: false })).toBe(false);
    expect(canFixEmail({ state: "REJECTED", emailConfirmed: false })).toBe(false);
  });

  it("checks the address cheaply before the call, like the API's z.email().max(100)", () => {
    expect(looksLikeEmail("jordan@cafemilo.com")).toBe(true);
    expect(looksLikeEmail("  jordan@cafemilo.com ")).toBe(true);
    expect(looksLikeEmail("jordan@cafemilo")).toBe(false);
    expect(looksLikeEmail("jordan cafemilo.com")).toBe(false);
    expect(looksLikeEmail("@cafemilo.com")).toBe(false);
    expect(looksLikeEmail("jordan@")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
    expect(looksLikeEmail(`${"a".repeat(95)}@b.com`)).toBe(false);
  });

  it("says why a resend or change was refused", () => {
    expect(emailFixRefusal(422)).toBe("That is already the address on your request.");
    expect(emailFixRefusal(429)).toBe("Too many tries. Try again in an hour.");
    expect(emailFixRefusal(400)).toBe("That doesn't look like an email address.");
    expect(emailFixRefusal(400, "Invalid email")).toBe("That doesn't look like an email address.");
    expect(emailFixRefusal(0)).toBe(SPONSORX_UNREACHABLE);
    expect(emailFixRefusal(500)).toMatch(/our side/);
    expect(emailFixRefusal(503)).toMatch(/our side/);
    expect(emailFixRefusal(404)).toMatch(/no longer works/);
    expect(emailFixRefusal(410)).toMatch(/no longer works/);
  });

  it("keeps the API's own words for a 409 — what changed — and says the page will update", () => {
    expect(emailFixRefusal(409, "Your email is already confirmed.")).toBe("Your email is already confirmed. This page will update.");
    expect(emailFixRefusal(409, "This request has already been decided.")).toMatch(/already been decided.*page will update/);
    expect(emailFixRefusal(409)).toMatch(/Something changed.*page will update/);
    expect(emailFixRefusal(418, "Teapot")).toBe("Teapot");
    expect(emailFixRefusal(418)).toMatch(/didn't go through/);
  });
});

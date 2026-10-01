import { describe, expect, it } from "vitest";

import {
  checkProof,
  confirmationStatus,
  missingLabel,
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

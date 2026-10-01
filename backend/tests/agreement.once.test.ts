import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   acceptAgreementIn's once-per-signer rule — P5-FE-01 fix.

   One-time terms (collaboration, guardian authorisation) stay once per
   signer per version. A Campaign Order is the same template accepted once
   per ORDER, so acceptOrder opts out — and this pins both halves.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/db/client", () => ({ prisma: {} }));
vi.mock("../src/db/audit", () => ({
  audit: () => Promise.resolve(),
  AUDIT_ACTIONS: { agreement: { accept: "agreement.accept" } },
}));

const { acceptAgreementIn, AlreadyAcceptedError } = await import("../src/domain/agreement");

let existing: unknown = null;
let created = 0;
const tx = {
  agreement: {
    findFirst: () => Promise.resolve({ id: "agr_1", kind: "CAMPAIGN_ORDER", version: 1, bodyHash: "sha256:abc" }),
  },
  agreementAcceptance: {
    findFirst: () => Promise.resolve(existing),
    create: () => ((created += 1), Promise.resolve({ id: `acc_${created}`, acceptedAt: new Date() })),
  },
  user: { findFirst: () => Promise.resolve({ athlete: null }) },
  /* 2S1-BE-11's guard reads the signer's athlete: an adult with no guardian. */
  athlete: { findFirst: () => Promise.resolve({ id: "ath_1", legalName: "A", displayName: "A", state: "ACTIVE", birthDate: null, ageBand: "18_PLUS", majorityAge: 18, guardianId: null, guardian: null }) },
} as never;

const athlete = {
  userId: "u_1", tenantId: "t_1", roles: ["ATHLETE"], athleteId: "ath_1",
  sponsorId: null, guardianId: null, propertyId: null,
} as unknown as Actor;
const req = { agreementId: "agr_1", bodyHashShown: "sha256:abc", ip: "1.2.3.4", userAgent: "ua" };

beforeEach(() => {
  existing = null;
  created = 0;
});

describe("acceptAgreementIn — once per signer", () => {
  it("refuses a second acceptance of one-time terms by default", async () => {
    existing = { id: "acc_old" };
    await expect(acceptAgreementIn(tx, athlete, req)).rejects.toBeInstanceOf(AlreadyAcceptedError);
    expect(created).toBe(0);
  });

  it("records a second acceptance when the caller says it is per-order", async () => {
    existing = { id: "acc_old" };
    await expect(acceptAgreementIn(tx, athlete, req, { oncePerSigner: false }))
      .resolves.toMatchObject({ acceptanceId: "acc_1" });
    expect(created).toBe(1);
  });
});

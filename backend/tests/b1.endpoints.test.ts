import { beforeEach, describe, expect, it, vi } from "vitest";

import { isAllowed, ROLES, type Role } from "../src/auth/policy";
import { ForbiddenError } from "../src/auth/errors";
import { GuardianRelationship, GuardianInput } from "../src/contracts/guardian";
import { GUARDIAN_RELATIONSHIPS } from "../src/domain/guardian-rules";
import { GuardianRequiredError } from "../src/domain/athlete-state";

/* --------------------------------------------------------------------------
   The rest of B1, reachable — P3-BE-14, §4, §12, §37.

   Three tasks were Done whose domain functions no endpoint called. What is
   worth asserting is not that the functions work — P3-BE-03 and P3-BE-06
   proved that — but the two things that only appear once they are exposed:

     - the role boundary on activation, which is *narrower* than the one on
       approval and is easy to widen by accident
     - §37's gate surviving the trip through an endpoint, for a minor with no
       verified guardian

   Plus one contract property: the wire vocabulary and the domain's vocabulary
   must be the same list, or the published spec advertises an option the
   domain refuses.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({
  env: { APP_URL: "https://sponsorx.example", PUBLIC_INTAKE_TENANT_ID: "tenant_btg" },
}));

let athlete: Record<string, unknown> = {};
let updated: Record<string, unknown> | null = null;

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        athlete: {
          findFirst: () => Promise.resolve(athlete),
          update: ({ data }: { data: Record<string, unknown> }) => {
            updated = data;
            return Promise.resolve({ id: "ath_1", state: data.state });
          },
        },
        auditLog: { create: () => Promise.resolve({ id: "a" }) },
        outboxJob: { create: () => Promise.resolve({ id: "j" }) },
      };
      return fn(tx);
    },
  },
}));

const { transitionAthlete } = await import("../src/domain/athlete");

const adult = {
  id: "ath_1", state: "APPROVED", birthDate: new Date("1999-01-01"),
  ageBand: "18_PLUS", guardianId: null, guardian: null,
};
const minorUnverified = {
  id: "ath_1", state: "APPROVED", birthDate: new Date(Date.now() - 15 * 3.156e10),
  ageBand: "UNDER_16", guardianId: "grd_1", guardian: { verifiedAt: null },
};
const minorVerified = { ...minorUnverified, guardian: { verifiedAt: new Date() } };

const actor = (roles: Role[]) => ({ userId: "u", tenantId: "tenant_btg", roles });

beforeEach(() => { athlete = { ...adult }; updated = null; });

describe("activation is a narrower permission than approval", () => {
  /* The trap this guards: BTG_ADMIN may approve an application and must not
     activate an athlete. Both actions live on the same screen, so widening
     one to match the other is a one-character mistake. */
  /* NETWORK_MGR alone. The RBAC matrix's `athlete` table gives Approve to
     NETWORK_MGR as "own-tenant (status)" and a dash to everyone else,
     SUPER_ADMIN included — §8 gives them "athlete status" explicitly, and
     nobody else. */
  it("NETWORK_MGR may activate", async () => {
    await expect(transitionAthlete(actor(["NETWORK_MGR"]), "ath_1", "ACTIVE"))
      .resolves.toMatchObject({ state: "ACTIVE" });
  });

  it("not even SUPER_ADMIN, which reads and writes everything", async () => {
    expect(isAllowed(["SUPER_ADMIN"], "athlete", "read")).toBe(true);
    expect(isAllowed(["SUPER_ADMIN"], "athlete", "write")).toBe(true);
    expect(isAllowed(["SUPER_ADMIN"], "athlete", "approve")).toBe(false);
  });

  it("BTG_ADMIN may not activate, though it may approve the application", () => {
    expect(isAllowed(["BTG_ADMIN"], "athleteApplication", "approve")).toBe(true);
    expect(isAllowed(["BTG_ADMIN"], "athlete", "approve")).toBe(false);
  });

  it("exactly one role holds athlete.approve", () => {
    const holders = ROLES.filter((r) => isAllowed([r], "athlete", "approve"));
    expect(holders).toEqual(["NETWORK_MGR"]);
  });

  it.each(["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "ATHLETE", "GUARDIAN", "SERVICE"] as const)(
    "%s is refused at the endpoint's own gate", async (role) => {
      await expect(transitionAthlete(actor([role]), "ath_1", "ACTIVE"))
        .rejects.toBeInstanceOf(ForbiddenError);
      expect(updated).toBeNull();
    });
});

describe("§37's gate survives the trip through an endpoint", () => {
  it("refuses a minor whose guardian is not verified", async () => {
    athlete = { ...minorUnverified };
    await expect(transitionAthlete(actor(["NETWORK_MGR"]), "ath_1", "ACTIVE"))
      .rejects.toBeInstanceOf(GuardianRequiredError);
    expect(updated).toBeNull();
  });

  it("refuses a minor with no guardian at all", async () => {
    athlete = { ...minorUnverified, guardianId: null, guardian: null };
    await expect(transitionAthlete(actor(["NETWORK_MGR"]), "ath_1", "ACTIVE"))
      .rejects.toBeInstanceOf(GuardianRequiredError);
  });

  it("allows a minor once the guardian is verified", async () => {
    athlete = { ...minorVerified };
    await expect(transitionAthlete(actor(["NETWORK_MGR"]), "ath_1", "ACTIVE"))
      .resolves.toMatchObject({ state: "ACTIVE" });
  });

  it("does not stamp reviewerNotes or reviewedAt on an activation", async () => {
    await transitionAthlete(actor(["NETWORK_MGR"]), "ath_1", "ACTIVE");
    /* Activation is not a review decision — §11 §10's fields belong to the
       three that are, and stamping here would overwrite the reviewer's note
       with a null the next time anyone activated a reinstated athlete. */
    expect(updated).toEqual({ state: "ACTIVE" });
  });
});

describe("the wire vocabulary is the domain's vocabulary", () => {
  it("publishes exactly the relationships linkGuardian accepts", () => {
    expect(GuardianRelationship.options.slice().sort())
      .toEqual([...GUARDIAN_RELATIONSHIPS].sort());
  });

  it.each([...GUARDIAN_RELATIONSHIPS])("accepts %s", (relationship) => {
    expect(() => GuardianInput.parse({
      legalName: "Dana Reed", email: "dana@example.com", relationship,
    })).not.toThrow();
  });

  it("refuses a relationship the domain would reject anyway", () => {
    expect(() => GuardianInput.parse({
      legalName: "Dana Reed", email: "dana@example.com", relationship: "GRANDPARENT",
    })).toThrow();
  });
});

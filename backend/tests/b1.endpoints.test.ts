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
let updateWhere: Record<string, unknown> | null = null;
let raceLost = false;

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        athlete: {
          findFirst: () => Promise.resolve(athlete),
          update: ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            updateWhere = where;
            /* The guarded write (QA-05): when a parallel request moved the
               row first, Postgres matches nothing and Prisma says P2025. */
            if (raceLost) {
              athlete = { ...athlete, state: "ACTIVE" };
              return Promise.reject(Object.assign(new Error("Record to update not found."), { code: "P2025" }));
            }
            updated = data;
            return Promise.resolve({ id: "ath_1", state: data.state });
          },
        },
        auditLog: { create: () => Promise.resolve({ id: "a" }) },
        outboxJob: { create: () => Promise.resolve({ id: "j" }) },
        /* P9-BE-11 — activation now asks whether a minor claimed a featured
           profile (then their guardian's COMMERCIAL consent is also needed).
           These athletes applied normally: no claim. The claimed path runs
           against a real database in tests/next-rights.test.ts. */
        athleteClaim: { count: () => Promise.resolve(0) },
      };
      return fn(tx);
    },
  },
}));

const {
  transitionAthlete, activateAthlete, ProfileIncompleteError, ReinstatementRequiredError,
} = await import("../src/domain/athlete");
const { IllegalTransitionError } = await import("../src/domain/athlete-state");

const adult = {
  id: "ath_1", state: "APPROVED", birthDate: new Date("1999-01-01"),
  legalName: "Jordan Reed", displayName: "J. Reed", email: "jordan@example.com",
  stateCode: "MD", sport: "Basketball",
  ageBand: "18_PLUS", guardianId: null, guardian: null,
};
const minorUnverified = {
  id: "ath_1", state: "APPROVED", birthDate: new Date(Date.now() - 15 * 3.156e10),
  ageBand: "UNDER_16", guardianId: "grd_1", guardian: { verifiedAt: null },
};
const minorVerified = { ...minorUnverified, guardian: { verifiedAt: new Date() } };

const actor = (roles: Role[]) => ({ userId: "u", tenantId: "tenant_btg", roles });

beforeEach(() => { athlete = { ...adult }; updated = null; updateWhere = null; raceLost = false; });

describe("activation is a narrower permission than approval", () => {
  /* The trap this guards: BTG_ADMIN may approve an application and must not
     activate an athlete. Both actions live on the same screen, so widening
     one to match the other is a one-character mistake. */
  /* `athlete.approve` is "sets athlete status", which is what activation is.
     NETWORK_MGR does it day to day; BTG_ADMIN and SUPER_ADMIN hold it as
     superset roles, per §12 of the matrix document. The table there carried a
     dash for the latter two until 2026-09-22 — a transcription slip that
     surfaced as a 403 on the activate button. */
  it.each(["NETWORK_MGR", "BTG_ADMIN", "SUPER_ADMIN"] as const)(
    "%s may activate", async (role) => {
      await expect(transitionAthlete(actor([role]), "ath_1", "ACTIVE"))
        .resolves.toMatchObject({ state: "ACTIVE" });
    });

  it("holds athlete.approve for exactly the three BTG roles", () => {
    const holders = ROLES.filter((r) => isAllowed([r], "athlete", "approve"));
    expect(holders.sort()).toEqual(["BTG_ADMIN", "NETWORK_MGR", "SUPER_ADMIN"]);
  });

  it("still keeps approving an application separate from activating an athlete", () => {
    /* Two resources, and CAMPAIGN_MGR is the case that proves they are not
       the same permission. */
    expect(isAllowed(["CAMPAIGN_MGR"], "athlete", "approve")).toBe(false);
    expect(isAllowed(["NETWORK_MGR"], "athleteApplication", "approve")).toBe(true);
  });

  it.each(["CAMPAIGN_MGR", "SALES", "FINANCE", "ATHLETE", "GUARDIAN", "SERVICE", "SPONSOR_ADMIN"] as const)(
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

/* --------------------------------------------------------------------------
   Activation — the product decisions of 2026-09-28 (QA pass 5).
   -------------------------------------------------------------------------- */

describe("POST /activate is APPROVED → ACTIVE and nothing else", () => {
  it("activates a complete, approved adult", async () => {
    await expect(activateAthlete(actor(["NETWORK_MGR"]), "ath_1"))
      .resolves.toMatchObject({ state: "ACTIVE" });
  });

  /* Decision 2: reinstatement is its own step, with its own audit action. */
  it("refuses a SUSPENDED athlete, naming reinstatement as the separate step", async () => {
    athlete = { ...adult, state: "SUSPENDED" };
    const err = await activateAthlete(actor(["NETWORK_MGR"]), "ath_1").catch((e) => e);
    expect(err).toBeInstanceOf(ReinstatementRequiredError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("reinstatement_required");
    expect(err.message).toMatch(/reinstat/i);
    expect(updated).toBeNull();
  });

  it.each(["ACTIVE", "UNDER_REVIEW", "REJECTED"])("refuses from %s", async (state) => {
    athlete = { ...adult, state };
    await expect(activateAthlete(actor(["NETWORK_MGR"]), "ath_1"))
      .rejects.toBeInstanceOf(IllegalTransitionError);
    expect(updated).toBeNull();
  });

  it("checks the role before saying anything about the record", async () => {
    athlete = { ...adult, state: "SUSPENDED" };
    await expect(activateAthlete(actor(["FINANCE"]), "ath_1"))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("an athlete must be complete to activate (decision 3)", () => {
  it.each([
    ["legalName", { legalName: "" }],
    ["displayName", { displayName: "  " }],
    ["email", { email: null }],
    ["stateCode", { stateCode: null }],
    ["sport", { sport: "" }],
  ])("refuses when %s is missing", async (field, patch) => {
    athlete = { ...adult, ...patch };
    const err = await activateAthlete(actor(["NETWORK_MGR"]), "ath_1").catch((e) => e);
    expect(err).toBeInstanceOf(ProfileIncompleteError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("profile_incomplete");
    expect(err.details.missing).toEqual([field]);
    expect(updated).toBeNull();
  });

  /* The gap QA-10 found: no birthDate and no ageBand read as "adult" to the
     guardian rule, so the §37 gate never fired. */
  it("refuses an athlete with neither birthDate nor ageBand", async () => {
    athlete = { ...adult, birthDate: null, ageBand: null };
    const err = await activateAthlete(actor(["NETWORK_MGR"]), "ath_1").catch((e) => e);
    expect(err).toBeInstanceOf(ProfileIncompleteError);
    expect(err.details.missing).toEqual(["birthDateOrAgeBand"]);
    expect(updated).toBeNull();
  });

  it("accepts an age band alone", async () => {
    athlete = { ...adult, birthDate: null, ageBand: "18_PLUS" };
    await expect(activateAthlete(actor(["NETWORK_MGR"]), "ath_1"))
      .resolves.toMatchObject({ state: "ACTIVE" });
  });
});

describe("a transition is conditional on the state it was read in (QA-05)", () => {
  it("writes WHERE state = the state it read", async () => {
    await activateAthlete(actor(["NETWORK_MGR"]), "ath_1");
    /* 2S8-QA-07 — and in the tenant it was read in. */
    expect(updateWhere).toEqual({ id: "ath_1", tenantId: "tenant_btg", state: "APPROVED" });
  });

  it("the loser of a race gets a 409, not a second activation", async () => {
    raceLost = true;
    const err = await activateAthlete(actor(["NETWORK_MGR"]), "ath_1").catch((e) => e);
    expect(err).toBeInstanceOf(IllegalTransitionError);
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ from: "ACTIVE", to: "ACTIVE" });
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

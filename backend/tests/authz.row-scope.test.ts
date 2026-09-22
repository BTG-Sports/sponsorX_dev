import { describe, expect, it } from "vitest";

import { whereFor, MATCHES_NOTHING, assertTenantWide } from "../src/auth/scope";
import { ForbiddenError } from "../src/auth/errors";
import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   Row scoping, and the two ways it was being bypassed — found in review
   2026-09-22, §26, §8.

   Sixteen domain lookups read `{ id, tenantId }` instead of the scoped
   `where` that scope.ts exists to produce. The effect was that ANY role
   holding the action at ANY scope reached EVERY row in the tenant. The
   matrix was correct throughout; the queries simply did not consult it.

   Two distinct defects, and they need different fixes:

     1. **Wrong row.** An athlete holds `invitation.write` at `own`, so they
        could accept another athlete's invitation. Fixed by scoping the
        lookup — `whereFor` was always the mechanism, it just was not called.

     2. **Wrong act.** A guardian holds `guardian.write` at `own` to maintain
        their own details, which also let them VERIFY themselves — the §26
        attestation BTG is supposed to make. Scoping the row does not fix
        this, because the row genuinely is theirs. It needs a check on the
        *width* of the reach, which is `assertTenantWide`.
   -------------------------------------------------------------------------- */

const actor = (roles: Role[], ids: Partial<Actor> = {}): Actor => ({
  userId: "u", tenantId: "t1", roles,
  sponsorId: null, athleteId: null, guardianId: null, ...ids,
});

describe("1 · an actor reaches their own row and no one else's", () => {
  it("scopes an athlete to themselves", () => {
    expect(whereFor(actor(["ATHLETE"], { athleteId: "ath_me" }), "athlete", "write"))
      .toEqual({ tenantId: "t1", id: "ath_me" });
  });

  it("scopes an athlete's invitations to their own", () => {
    expect(whereFor(actor(["ATHLETE"], { athleteId: "ath_me" }), "invitation", "write"))
      .toEqual({ tenantId: "t1", athleteId: "ath_me" });
  });

  it("scopes an athlete's socials and score to their own athlete row", () => {
    const a = actor(["ATHLETE"], { athleteId: "ath_me" });
    expect(whereFor(a, "athleteSocialAccount", "write"))
      .toEqual({ tenantId: "t1", athleteId: "ath_me" });
    expect(whereFor(a, "athleteScore", "read"))
      .toEqual({ tenantId: "t1", athleteId: "ath_me" });
  });

  it("scopes a guardian to their wards, not to every minor in the tenant", () => {
    expect(whereFor(actor(["GUARDIAN"], { guardianId: "grd_me" }), "athlete", "read"))
      .toEqual({ tenantId: "t1", guardianId: "grd_me" });
  });

  it("scopes a guardian's own record to itself", () => {
    expect(whereFor(actor(["GUARDIAN"], { guardianId: "grd_me" }), "guardian", "write"))
      .toEqual({ tenantId: "t1", id: "grd_me" });
  });

  it("scopes a sponsor's briefs and campaigns to their organisation", () => {
    const a = actor(["SPONSOR_ADMIN"], { sponsorId: "sp_1" });
    expect(whereFor(a, "campaignBrief", "write")).toEqual({ tenantId: "t1", sponsorId: "sp_1" });
    expect(whereFor(a, "campaign", "read")).toEqual({ tenantId: "t1", sponsorId: "sp_1" });
  });

  it("gives BTG the whole tenant and SUPER_ADMIN everything", () => {
    expect(whereFor(actor(["NETWORK_MGR"]), "athlete", "write")).toEqual({ tenantId: "t1" });
    expect(whereFor(actor(["SUPER_ADMIN"]), "athlete", "write")).toEqual({});
  });

  it.each([
    ["athlete", "ATHLETE"],
    ["invitation", "ATHLETE"],
    ["athleteSocialAccount", "ATHLETE"],
    ["athleteScore", "ATHLETE"],
  ] as const)("matches nothing when %s's own id is missing", (resource, role) => {
    /* A row that should not exist. The dangerous answer is `{}`, which in
       Prisma means every row in the table — so a broken actor must reach
       nothing rather than everything. */
    expect(whereFor(actor([role]), resource, "read")).toEqual(MATCHES_NOTHING);
  });

  it("never returns an unrestricted filter for a self-scoped role", () => {
    for (const resource of ["athlete", "invitation", "campaignBrief", "campaign"] as const) {
      for (const role of ["ATHLETE", "GUARDIAN", "SPONSOR_ADMIN"] as const) {
        let where: Record<string, unknown>;
        try {
          where = whereFor(actor([role], { athleteId: "a", guardianId: "g", sponsorId: "s" }), resource, "read");
        } catch {
          continue; // denied outright is also fine
        }
        expect(Object.keys(where).length, `${role} on ${resource} got an open filter`)
          .toBeGreaterThan(0);
      }
    }
  });
});

describe("2 · a self-scoped role cannot perform a BTG act", () => {
  it("refuses a guardian verifying themselves", () => {
    /* The §26 attestation. The row IS theirs, so scoping cannot catch this —
       only the width of the reach can. */
    expect(() => assertTenantWide(actor(["GUARDIAN"], { guardianId: "grd_me" }), "guardian", "write"))
      .toThrow(ForbiddenError);
  });

  it("allows BTG to verify", () => {
    expect(assertTenantWide(actor(["NETWORK_MGR"]), "guardian", "write")).toBe("own-tenant");
    expect(assertTenantWide(actor(["SUPER_ADMIN"]), "guardian", "write")).toBe("any");
  });

  it("refuses an athlete inviting themselves", () => {
    expect(() => assertTenantWide(actor(["ATHLETE"], { athleteId: "ath_me" }), "invitation", "write"))
      .toThrow(ForbiddenError);
  });

  it("refuses an athlete scoring themselves", () => {
    expect(() => assertTenantWide(actor(["ATHLETE"], { athleteId: "ath_me" }), "athleteScore", "write"))
      .toThrow(ForbiddenError);
  });

  it("still refuses a role that holds nothing at all", () => {
    expect(() => assertTenantWide(actor(["SPONSOR_ANALYST"]), "guardian", "write"))
      .toThrow(ForbiddenError);
  });

  it("does not stop an athlete answering their own invitation", () => {
    /* The distinction the fix has to preserve: `own` is not a bug, it is the
       matrix working. Only the acts performed ABOUT someone are narrowed. */
    expect(() => whereFor(actor(["ATHLETE"], { athleteId: "ath_me" }), "invitation", "write"))
      .not.toThrow();
  });
});

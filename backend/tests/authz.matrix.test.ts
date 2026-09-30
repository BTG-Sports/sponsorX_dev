import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { whereFor } from "../src/auth/scope";
import type { Actor } from "../src/auth/actor";
import {
  ACTIONS,
  isAllowed,
  POLICY,
  RESOURCES,
  ROLES,
  scopeFor,
  scopeForRole,
  type Action,
  type Resource,
  type Role,
  type Scope,
} from "../src/auth/policy";

/* --------------------------------------------------------------------------
   The authorisation matrix, asserted — P2-SEC-01 (policy half), §30, Guide §09.

   Moved to the backend workspace on 2026-09-21 along with the policy it asserts.
   It imports nothing but that data, so the move cost nothing.

   The task's own purpose: "when someone widens a permission to fix a bug, this
   tells them what else they just widened." That is what the digest test at the
   bottom does. The named tests above it exist so that when the digest fails,
   the failure says *which rule* broke rather than only that something did.

   THIS IS HALF THE TASK. `P2-SEC-01` also asks for a seeded suite — two
   tenants, two sponsors, two athletes, a guardian and a property — that proves
   the scope *filters* return the right rows. That half needs a live Postgres,
   which neither a developer machine nor CI has yet (CI needs a service
   container; see `P2-OPS-07`). It is deliberately not faked here: asserting
   `where` fragments against a mock would test the mock.

   What this half does cover is the part that is pure policy, and it covers it
   exhaustively — every role against every resource, which is what §30 asks
   for. The matrix is data precisely so this could be done without a database.
   -------------------------------------------------------------------------- */

const cell = (role: Role, resource: Resource, action: Action): Scope =>
  scopeForRole(role, resource, action);

describe("coverage — the grid is total", () => {
  it("returns a verdict for every role × resource × action", () => {
    for (const resource of RESOURCES) {
      for (const role of ROLES) {
        for (const action of ACTIONS) {
          expect(typeof cell(role, resource, action)).toBe("string");
        }
      }
    }
  });

  it("denies anything the matrix does not mention", () => {
    /* A resource name that will never exist. Default-deny must be structural,
       not a list of everything anyone thought of. */
    const unknown = "somethingNobodyHasBuiltYet" as Resource;
    for (const role of ROLES) {
      for (const action of ACTIONS) {
        expect(scopeFor([role], unknown, action)).toBe("deny");
      }
    }
  });

  it("has a policy entry for every declared resource", () => {
    /* Guards against a resource being added to the union and then forgotten,
       which would silently deny it everywhere and look like a bug in a
       feature rather than a gap in the matrix. */
    for (const resource of RESOURCES) {
      expect(POLICY[resource], `no POLICY entry for ${resource}`).toBeDefined();
    }
  });
});

describe("tenancy sits above everything (matrix §2)", () => {
  it("gives cross-tenant reach to SUPER_ADMIN and nobody else", () => {
    for (const resource of RESOURCES) {
      for (const role of ROLES) {
        for (const action of ACTIONS) {
          if (role === "SUPER_ADMIN") continue;
          expect(
            cell(role, resource, action),
            `${role} must not hold 'any' on ${resource}.${action}`,
          ).not.toBe("any");
        }
      }
    }
  });

  it("limits the cross-tenant catalogue to published commercial lists", () => {
    /* `catalog` is the one other scope that crosses tenants. It is the shop
       window — if it ever appears on a record carrying customer data, the
       boundary has been breached by accident. */
    const catalogued = new Set<Resource>();
    for (const resource of RESOURCES) {
      for (const role of ROLES) {
        for (const action of ACTIONS) {
          if (cell(role, resource, action) === "catalog") catalogued.add(resource);
        }
      }
    }
    /* 2S3-BE-04 — a marketplace listing is the shop window by definition: the
       `catalog` builder admits only PUBLISHED, PUBLIC, live listings of
       approved properties, in the sponsor's own marketplace (scope.ts), and
       only sponsors hold it, and only to read. */
    expect([...catalogued].sort()).toEqual(["listing", "nilJob", "sponsorPackage"]);
    for (const role of ROLES) {
      for (const action of ACTIONS) {
        if (cell(role, "listing", action) === "catalog") expect([role, action]).toEqual([expect.stringMatching(/^SPONSOR_(ADMIN|ANALYST)$/), "read"]);
      }
    }
  });
});

describe("the money boundary, from both sides (matrix §7.1)", () => {
  it("keeps athlete pay away from sponsors", () => {
    for (const role of ["SPONSOR_ADMIN", "SPONSOR_ANALYST"] as const) {
      expect(isAllowed([role], "athleteRate", "read")).toBe(false);
      expect(isAllowed([role], "earning", "read")).toBe(false);
      expect(isAllowed([role], "payout", "read")).toBe(false);
    }
  });

  it("keeps sponsor spend away from athletes, guardians and properties", () => {
    for (const role of ["ATHLETE", "GUARDIAN", "PROPERTY_MGR"] as const) {
      expect(isAllowed([role], "campaignBrief", "read")).toBe(false);
      expect(isAllowed([role], "sponsorContact", "read")).toBe(false);
    }
  });

  it("does not let an athlete read a sponsor report about them", () => {
    expect(isAllowed(["ATHLETE"], "sponsorReport", "read")).toBe(false);
    expect(isAllowed(["GUARDIAN"], "sponsorReport", "read")).toBe(false);
  });
});

describe("the audit log is append-only from the application (matrix §11)", () => {
  it("lets nobody write it, not even SUPER_ADMIN", () => {
    for (const role of ROLES) {
      expect(
        isAllowed([role], "auditLog", "write"),
        `${role} must not write the audit log`,
      ).toBe(false);
    }
  });

  it("lets only BTG roles read it", () => {
    expect(isAllowed(["SUPER_ADMIN"], "auditLog", "read")).toBe(true);
    expect(isAllowed(["BTG_ADMIN"], "auditLog", "read")).toBe(true);
    for (const role of ["ATHLETE", "SPONSOR_ADMIN", "PROPERTY_MGR", "SERVICE"] as const) {
      expect(isAllowed([role], "auditLog", "read")).toBe(false);
    }
  });
});

describe("the SERVICE account (§8)", () => {
  it("may sync, but may not write athletes or touch money", () => {
    expect(isAllowed(["SERVICE"], "athlete", "read")).toBe(true);
    expect(isAllowed(["SERVICE"], "athlete", "write")).toBe(false);
    expect(isAllowed(["SERVICE"], "earning", "read")).toBe(false);
    expect(isAllowed(["SERVICE"], "payout", "read")).toBe(false);
  });

  it("approves nothing, anywhere", () => {
    /* A machine account that can approve is a machine account that can sign
       off its own work. */
    for (const resource of RESOURCES) {
      expect(
        cell("SERVICE", resource, "approve"),
        `SERVICE must not approve ${resource}`,
      ).toBe("deny");
    }
  });
});

describe("undecided cells refuse (matrix §12, decisions D1 and D3)", () => {
  it("reports them as deferred rather than as a flat denial", () => {
    expect(scopeFor(["GUARDIAN"], "invitation", "write")).toBe("deferred");
    expect(scopeFor(["GUARDIAN"], "campaignOrder", "write")).toBe("deferred");
    expect(scopeFor(["PROPERTY_MGR"], "earning", "read")).toBe("deferred");
  });

  it("still refuses access on every one of them", () => {
    expect(isAllowed(["GUARDIAN"], "invitation", "write")).toBe(false);
    expect(isAllowed(["GUARDIAN"], "campaignOrder", "write")).toBe(false);
    expect(isAllowed(["PROPERTY_MGR"], "earning", "read")).toBe(false);
  });

  it("never lets a deferred cell widen a multi-role actor", () => {
    /* The bug this catches is subtle: an actor holding a deferred cell and a
       genuine one must get the genuine scope, and an actor holding only
       deferred cells must get nothing. */
    expect(scopeFor(["GUARDIAN", "BTG_ADMIN"], "invitation", "write")).toBe("own-tenant");
    expect(scopeFor(["PROPERTY_MGR"], "earning", "write")).toBe("deny");
  });
});

describe("several roles combine to the widest reach", () => {
  it("never grants less than the strongest single role", () => {
    for (const resource of RESOURCES) {
      for (const a of ROLES) {
        for (const b of ROLES) {
          const combined = scopeFor([a, b], resource, "read");
          if (isAllowed([a], resource, "read") || isAllowed([b], resource, "read")) {
            expect(
              isAllowed([a, b], resource, "read"),
              `${a}+${b} lost access to ${resource} that one of them had`,
            ).toBe(true);
          }
          expect(typeof combined).toBe("string");
        }
      }
    }
  });

  it("widens an athlete who is also staff", () => {
    expect(scopeFor(["ATHLETE"], "athlete", "read")).toBe("own");
    expect(scopeFor(["ATHLETE", "BTG_ADMIN"], "athlete", "read")).toBe("own-tenant");
    expect(scopeFor(["ATHLETE", "SUPER_ADMIN"], "athlete", "read")).toBe("any");
  });
});

/* --------------------------------------------------------------------------
   The change detector.

   Everything above asserts a rule someone can name. This asserts the *whole*
   grid at once, so a change nobody named still fails the build. When it does,
   the diff in the failure message is the list of permissions that moved —
   which is exactly what this task exists to produce.

   To accept a deliberate change: read the failing pairs, confirm each against
   `documentation/SponsorX-RBAC-Matrix.md`, and update the constant. Updating
   it without reading them defeats the entire test.
   -------------------------------------------------------------------------- */
describe("the whole matrix is pinned", () => {
  const grid = (): string =>
    RESOURCES.flatMap((resource) =>
      ROLES.flatMap((role) =>
        ACTIONS.map((action) => `${resource}.${role}.${action}=${cell(role, resource, action)}`),
      ),
    ).join("\n");

  it("has not changed without someone saying so", () => {
    const digest = createHash("sha256").update(grid()).digest("hex").slice(0, 16);

    expect(
      digest,
      "The authorisation matrix changed. Diff the grid against " +
        "documentation/SponsorX-RBAC-Matrix.md, confirm every moved pair is " +
        "intended, then update this digest.",
      // Updated 2026-09-22: `athlete.approve` gained SUPER_ADMIN ("any") and
      // BTG_ADMIN ("own-tenant"). The matrix document's table carried a dash
      // for both, contradicting its own §12 — "BTG_ADMIN can too, as the
      // superset role" — and `athlete` was the only approve column in the
      // matrix without SUPER_ADMIN. The document was corrected first; this
      // digest follows it.
      // Updated 2026-09-24: new `invoice` resource — read only, for
      // SUPER_ADMIN ("any"), BTG_ADMIN ("own-tenant") and SPONSOR_ADMIN /
      // SPONSOR_ANALYST ("own"); every other cell deny. With the invoice rows
      // removed the grid still hashes to the previous bc4ddbf83a1e7538, so
      // nothing else moved. Document row added first (§11 `invoice`).
      // Updated 2026-09-24 (P8-SEC-01): two new resources, `inquiry` and
      // `syncTask`, BTG-side only (matrix §11). With both removed the grid
      // still hashes to the previous 441c358e69d81f98, so nothing else moved.
      // Updated 2026-09-25 (P9-BE-02/03/06/12): five SponsorX NEXT resources
      // — publication, edition, adSlot, revenueSplit, editionEvent — from
      // matrix §15.3, for the roles that exist today (ADVISOR / STUDENT rows
      // follow in P9-BE-05). With all five removed the grid still hashes to
      // the previous f6af9e4293912f8b, so nothing else moved.
      // Updated 2026-09-25 (P9-BE-05): roles STUDENT and ADVISOR, and five
      // student-domain resources — student, studentCode, saleAttribution,
      // studentPoints, studentProspect — from matrix §15.1–15.2, plus the
      // ADVISOR / STUDENT `own-property` rows on publication, edition, adSlot
      // and editionEvent (§15.3). With both roles and the five resources
      // removed the grid still hashes to the previous 6d06c354364aef24, so
      // no existing role's access moved.
      // Updated 2026-09-25 (P9-BE-10/11/14): six Batch C resources —
      // editionAsset, contentRight (§15.3), rosterEntry, athleteClaim,
      // contentContribution, schoolPoolAllocation (added to the matrix doc
      // with this change). With all six removed the grid still hashes to the
      // previous feb23b6d311d2be3, so nothing else moved.
      // Updated 2026-09-28 (2S1-BE-01/03): `propertyOnboarding` — SUPER_ADMIN
      // any and BTG_ADMIN own-tenant read/write/approve, every other cell deny
      // (matrix §16). With it removed the grid still hashes to the previous
      // 0e32b0f006ddf674, so nothing else moved.
      // Updated 2026-09-28 (2S6-BE-02): new `notificationPreference` resource
      // — every role "own" read/write, nobody reaches another person's, every
      // approve cell deny (matrix §17). With it removed the grid still hashes
      // to the previous d326a7de1daee5f0, so nothing else moved.
      // Updated 2026-09-28 (2S2-BE-01/-03/-04, 2S3-BE-01, 2S7-BE-01): five new
      // resources — inventoryItem, teamMember, listing, offer, tenantBranding —
      // and the new `operated` scope they use (matrix §18). With the five
      // removed the grid still hashes to the previous 9335a770498a2530, so
      // nothing else moved.
      // Updated 2026-09-28 (2S2-BE-02, 2S3-BE-04, 2S4-BE-01): two new
      // resources, `brandRestriction` and `cart`, and `listing.read` for
      // SPONSOR_ADMIN / SPONSOR_ANALYST moved deny → catalog (matrix §19).
      // With the two removed and those two cells back to deny, the grid still
      // hashes to the previous ae772ead96f9f479, so nothing else moved.
      // Updated 2026-09-28 (2S4-BE-02/-03/-05): two new resources,
      // `reservation` and `marketplaceOrder` (matrix §20). With both removed
      // the grid still hashes to the previous 4f835eba4e8465d1.
      // Updated 2026-09-28 (2S5-BE-01/-02, 2S4-BE-04): three new resources,
      // commissionRule, orderFinancials and ledgerEntry (matrix §21). With the
      // three removed the grid still hashes to the previous f970f155612606e9.
      // Updated 2026-09-28 (2S5-FE-01, "only admin"): commissionRule.write
      // for FINANCE moved own-tenant → deny; Finance keeps read. That one
      // cell back, the grid hashes to the previous 39e42fab590b7584.
      // Updated 2026-09-29 (P3-BE-16): new `athleteProfileChange` resource —
      // SUPER_ADMIN any/any/any, BTG_ADMIN and NETWORK_MGR own-tenant ×3,
      // ATHLETE own/own, GUARDIAN ward/ward; every other cell deny. With its
      // rows removed the grid still hashes to 49b852630719d073, so nothing
      // else moved. Document row added first (§5 `athleteProfileChange`).
      // Updated 2026-09-30 (2S5-BE-04/-05, 2S5-INT-03): `payout` moves from
      // Phase 1's status-only rows to the marketplace payout — ATHLETE own
      // write (request) added, PROPERTY_MGR own-property read/write added,
      // approve added for SUPER_ADMIN (any), BTG_ADMIN and FINANCE
      // (own-tenant); GUARDIAN stays ward read. New `payoutAccount` resource —
      // SUPER_ADMIN any/any, BTG_ADMIN and FINANCE own-tenant read,
      // PROPERTY_MGR own-property r/w, ATHLETE own r/w (matrix §22).
      // Sponsors stay denied both (the money boundary test above).
    ).toBe("c0d600d731398bb8");
  });

  it("covers every pair the §30 acceptance asks for", () => {
    expect(grid().split("\n")).toHaveLength(
      RESOURCES.length * ROLES.length * ACTIONS.length,
    );
  });
});

/* ==========================================================================
   THE SEEDED HALF — P2-SEC-01, §30.

   Everything above asserts the policy: 1,152 role × resource × action pairs
   read against the matrix document, with no database. It proves the
   transcription. It cannot prove the *filters*, because a scope token only
   becomes a `where` fragment when Prisma runs it — and the failure worth
   catching is a filter that returns rows from the wrong tenant while the
   policy above it reads perfectly.

   Two tenants, two sponsors inside one of them, two athletes, a guardian and
   a property. The second sponsor is in the SAME tenant on purpose:
   `own-sponsor` is a boundary tenant scoping does not draw, and a filter
   matching only on `tenantId` would pass a single-sponsor fixture and hand
   one sponsor another's contacts in production.

   Skipped without a database, with a reason. CI has one.
   ========================================================================== */

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("the scope filters, against real rows", () => {
  const { prismaForTests, seed, clean, disconnect, T } = seededDb;
  const db = prismaForTests();

  const actor = (roles: Role[], over: Partial<Actor> = {}): Actor => ({
    userId: "u_authz",
    tenantId: T.tenantA,
    roles,
    sponsorId: null,
    athleteId: null,
    guardianId: null,
    ...over,
  });

  beforeAll(async () => { await seed(); });
  afterAll(async () => { await clean(); await disconnect(); });

  async function athletesVisibleTo(a: Actor): Promise<string[]> {
    const rows = await db.athlete.findMany({
      where: whereFor(a, "athlete", "read"),
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => r.id);
  }

  describe("the tenant boundary", () => {
    it("shows BTG only its own tenant's athletes", async () => {
      expect(await athletesVisibleTo(actor(["BTG_ADMIN"]))).toEqual([T.athleteA]);
      expect(await athletesVisibleTo(actor(["NETWORK_MGR"]))).toEqual([T.athleteA]);
    });

    it("shows SUPER_ADMIN both tenants, and nobody else", async () => {
      /* SUPER_ADMIN is unscoped by design, so on a dev database the raw list
         also contains seed and E2E rows — assert over this suite's fixtures
         only, which still proves both tenants are visible. */
      const ours = (await athletesVisibleTo(actor(["SUPER_ADMIN"]))).filter(
        (id) => id.startsWith("a_authz_"),
      );
      expect(ours).toEqual([T.athleteA, T.athleteB].sort());
    });

    it("shows a BTG admin of tenant B only tenant B", async () => {
      /* The assertion that would have caught a filter dropping tenantId: it
         passes trivially while only one tenant exists. */
      const other = actor(["BTG_ADMIN"], { tenantId: T.tenantB });
      expect(await athletesVisibleTo(other)).toEqual([T.athleteB]);
    });
  });

  describe("own and ward reach one row, not a tenant", () => {
    it("shows an athlete themselves and no one else", async () => {
      const self = actor(["ATHLETE"], { athleteId: T.athleteA });
      expect(await athletesVisibleTo(self)).toEqual([T.athleteA]);
    });

    it("shows a guardian their ward and no one else", async () => {
      const guardian = actor(["GUARDIAN"], { guardianId: T.guardian });
      expect(await athletesVisibleTo(guardian)).toEqual([T.athleteA]);
    });

    it("shows an athlete with no athleteId nothing at all", async () => {
      /* MATCHES_NOTHING, never `{}` — which in Prisma means every row. */
      expect(await athletesVisibleTo(actor(["ATHLETE"]))).toEqual([]);
    });

    it("shows a guardian of no one nothing at all", async () => {
      expect(await athletesVisibleTo(actor(["GUARDIAN"]))).toEqual([]);
    });
  });

  describe("own-sponsor is a boundary inside a tenant", () => {
    it("shows a sponsor admin only their own organisation", async () => {
      const rows = await db.sponsor.findMany({
        where: whereFor(actor(["SPONSOR_ADMIN"], { sponsorId: T.sponsorA }), "sponsor", "read"),
        select: { id: true },
      });
      expect(rows.map((r) => r.id)).toEqual([T.sponsorA]);
    });

    it("shows them only their own organisation's contacts", async () => {
      /* Both contacts are in tenant A. A filter that only matched tenantId
         would return two and nothing above it would notice. */
      const rows = await db.sponsorContact.findMany({
        where: whereFor(
          actor(["SPONSOR_ADMIN"], { sponsorId: T.sponsorA }), "sponsorContact", "read"),
        select: { sponsorId: true },
      });
      expect(rows.map((r) => r.sponsorId)).toEqual([T.sponsorA]);
    });

    it("shows BTG every sponsor in the tenant", async () => {
      const rows = await db.sponsor.findMany({
        where: whereFor(actor(["BTG_ADMIN"]), "sponsor", "read"),
        select: { id: true },
        orderBy: { id: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([T.sponsorA, T.sponsorB]);
    });
  });

  describe("rows nested under an athlete inherit the athlete's reach", () => {
    it("shows an athlete only their own socials", async () => {
      const rows = await db.athleteSocial.findMany({
        where: whereFor(actor(["ATHLETE"], { athleteId: T.athleteA }),
          "athleteSocialAccount", "read"),
        select: { athleteId: true },
      });
      expect(rows.map((r) => r.athleteId)).toEqual([T.athleteA]);
    });

    it("shows BTG only its tenant's socials", async () => {
      const rows = await db.athleteSocial.findMany({
        where: whereFor(actor(["NETWORK_MGR"]), "athleteSocialAccount", "read"),
        select: { athleteId: true },
      });
      expect(rows.map((r) => r.athleteId)).toEqual([T.athleteA]);
    });
  });

  describe("every builder refuses to return an unrestricted filter", () => {
    /* The dangerous answer in Prisma is `{}`, which means every row in the
       table. This sweeps every role against every resource that has a
       builder and fails if a non-SUPER_ADMIN ever gets one. */
    it("gives an open filter to SUPER_ADMIN and to nobody else", () => {
      const scoped = [
        "athlete", "athleteApplication", "athleteSocialAccount", "athleteScore",
        "athleteRate", "guardian", "sponsor", "sponsorContact", "campaign",
        "campaignBrief", "campaignOrder", "invitation", "user", "tenant", "auditLog",
      ] as const;

      for (const resource of scoped) {
        for (const role of ROLES) {
          let where: Record<string, unknown>;
          try {
            where = whereFor(
              actor([role], { sponsorId: T.sponsorA, athleteId: T.athleteA, guardianId: T.guardian }),
              resource, "read");
          } catch {
            continue; // denied outright, which is also correct
          }
          if (role === "SUPER_ADMIN") continue;
          expect(
            Object.keys(where).length,
            `${role} got an unrestricted filter for ${resource}`,
          ).toBeGreaterThan(0);
        }
      }
    });
  });
});

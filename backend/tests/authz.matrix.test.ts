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
    expect([...catalogued].sort()).toEqual(["nilJob", "sponsorPackage"]);
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
    ).toBe("bc4ddbf83a1e7538");
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
      expect(await athletesVisibleTo(actor(["SUPER_ADMIN"]))).toEqual(
        [T.athleteA, T.athleteB].sort());
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

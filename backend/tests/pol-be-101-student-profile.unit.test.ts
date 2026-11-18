import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-101 — the student's own profile, without a database.

   The HTTP half (pol-be-101-student-profile.test.ts) runs where Postgres
   does. This half pins the same rules with Prisma stubbed, so they hold on
   any machine: whose row is asked for (the login's own, inside its tenant),
   who is refused before any query, what is written and audited, and what
   never leaves the function.
   -------------------------------------------------------------------------- */

process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const db = vi.hoisted(() => ({
  studentRow: null as Record<string, unknown> | null,
  advisors: [] as Array<{ email: string; fullName: string | null }>,
  reads: [] as unknown[],
  updates: [] as unknown[],
  audits: [] as unknown[][],
}));

vi.mock("../src/db/client", () => {
  const student = {
    findFirst: vi.fn(async (args: unknown) => {
      db.reads.push(args);
      return db.studentRow ? { ...db.studentRow } : null;
    }),
    update: vi.fn(async (args: { data: { displayName: string } }) => {
      db.updates.push(args);
      if (db.studentRow) db.studentRow.displayName = args.data.displayName;
      return { id: "s1" };
    }),
  };
  const user = { findMany: vi.fn(async () => db.advisors) };
  const prisma = { student, user, $transaction: async (fn: (tx: unknown) => unknown) => fn({ student, user }) };
  return { prisma };
});
vi.mock("../src/db/audit", () => ({ audit: vi.fn(async (...args: unknown[]) => { db.audits.push(args); }) }));

const { getOwnStudentProfile, updateOwnDisplayName, StudentProfileLockedError, tidyDisplayName } = await import("../src/domain/student-profile");
const { ForbiddenError } = await import("../src/auth/errors");
type Actor = import("../src/auth/actor").Actor;

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: "u1", tenantId: "t1", roles: ["STUDENT"], sponsorId: null, athleteId: null, guardianId: null,
  propertyId: "school1", studentId: "s1", ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: "s1", tenantId: "t1", propertyId: "school1", legalName: "Riley Legal", displayName: "Riley", gradYear: 2028,
  masthead: ["WRITER"], state: "ACTIVE", leftAt: null, birthDate: new Date("2011-02-03"), ageBand: null,
  property: { name: "Northside High" }, guardian: { verifiedAt: null, rejectedAt: null }, code: { code: "abcDEF_123" },
  ...over,
});

/** Every key, at any depth, of a where clause. */
const json = (v: unknown) => JSON.stringify(v);

beforeEach(() => {
  db.studentRow = row();
  db.advisors = [{ email: "advisor@school.invalid", fullName: null }];
  db.reads = [];
  db.updates = [];
  db.audits = [];
});

describe("POL-BE-101 · whose record", () => {
  it("asks for the login's own student, inside its tenant, under the matrix scope", async () => {
    await getOwnStudentProfile(actor());
    const where = (db.reads[0] as { where: Record<string, unknown> }).where;
    expect(where.id).toBe("s1");
    /* whereFor's own scope rides along: the tenant and the same id */
    expect(json(where)).toContain('"tenantId":"t1"');
  });

  it("refuses every non-student role before any query — even those who may read a student another way", async () => {
    for (const roles of [["ADVISOR"], ["GUARDIAN"], ["BTG_ADMIN"], ["SUPER_ADMIN"], ["SPONSOR_ADMIN"], ["ATHLETE"]] as const) {
      const a = actor({ roles: [...roles] as Actor["roles"], studentId: "s1" });
      await expect(getOwnStudentProfile(a), roles[0]).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateOwnDisplayName(a, "Renamed"), roles[0]).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(db.reads).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("refuses a STUDENT login with no linked record, before any query", async () => {
    await expect(getOwnStudentProfile(actor({ studentId: null }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateOwnDisplayName(actor({ studentId: undefined }), "X y")).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.reads).toHaveLength(0);
  });

  it("a row the scope does not reach (another tenant's) is a 403, and nothing is written", async () => {
    db.studentRow = null;
    await expect(getOwnStudentProfile(actor())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateOwnDisplayName(actor(), "Riley J")).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.updates).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });
});

describe("POL-BE-101 · what the student reads", () => {
  it("their details, a minor's guardian as status only, the advisor's email — no DOB, email or guardian detail", async () => {
    const p = await getOwnStudentProfile(actor());
    expect(p).toEqual({
      id: "s1", legalName: "Riley Legal", displayName: "Riley", gradYear: 2028, school: { name: "Northside High" },
      masthead: ["WRITER"], state: "ACTIVE", leftAt: null, code: "abcDEF_123", minor: true,
      guardian: { linked: true, verified: false }, advisors: [{ email: "advisor@school.invalid", name: null }], editable: ["displayName"],
    });
    expect(json(p)).not.toMatch(/birthDate|ageBand|2011|propertyId|tenantId/);
  });

  it("verified only while verified and not rejected; no guardian object for an adult", async () => {
    db.studentRow = row({ guardian: { verifiedAt: new Date(), rejectedAt: null } });
    expect((await getOwnStudentProfile(actor())).guardian).toEqual({ linked: true, verified: true });
    db.studentRow = row({ guardian: { verifiedAt: new Date(), rejectedAt: new Date() } });
    expect((await getOwnStudentProfile(actor())).guardian).toEqual({ linked: true, verified: false });
    db.studentRow = row({ guardian: null });
    expect((await getOwnStudentProfile(actor())).guardian).toEqual({ linked: false, verified: false });
    db.studentRow = row({ birthDate: null, ageBand: "18_PLUS", guardian: null });
    expect((await getOwnStudentProfile(actor())).guardian).toBeNull();
  });
});

describe("POL-BE-101 · the display name", () => {
  it("is tidied, written to the caller's own row and audited with before and after", async () => {
    const p = await updateOwnDisplayName(actor(), "Riley   J.");
    expect(p.displayName).toBe("Riley J.");
    expect(db.updates).toEqual([{ where: { id: "s1" }, data: { displayName: "Riley J." }, select: { id: true } }]);
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]!.slice(2)).toEqual(["student.displayNameUpdate", "Student", "s1", { before: { displayName: "Riley" }, after: { displayName: "Riley J." } }]);
    /* the write reads the row through the same scoped where */
    expect((db.reads[0] as { where: { id: string } }).where.id).toBe("s1");
  });

  it("the same name writes and audits nothing", async () => {
    await updateOwnDisplayName(actor(), "Riley");
    expect(db.updates).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });

  it("is locked once the student has left or was not accepted", async () => {
    for (const state of ["INACTIVE", "REJECTED"]) {
      db.studentRow = row({ state });
      await expect(updateOwnDisplayName(actor(), "New Name")).rejects.toBeInstanceOf(StudentProfileLockedError);
    }
    expect(db.updates).toHaveLength(0);
    expect(new StudentProfileLockedError().status).toBe(409);
  });

  it("tidyDisplayName collapses inner whitespace", () => {
    expect(tidyDisplayName("  A   B  ")).toBe("A B");
  });
});

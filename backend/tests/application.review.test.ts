import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import { ForbiddenError } from "../src/auth/errors";
import { IllegalTransitionError } from "../src/domain/athlete-state";

/* --------------------------------------------------------------------------
   Application review — P3-BE-07, §13, §23, §26.

   Acceptance: "Admin can approve, request changes or reject; every transition
   is audited and notifies the applicant."

   Three of those four clauses are only checkable against a running decision,
   not by reading the code — so this runs the real domain function against a
   fake transaction that records what was written and *discards it when the
   callback throws*. That last part is the point: a fake that commits on
   failure would let a rolled-back decision look like a delivered email, which
   is the exact bug the single-transaction design exists to prevent.

   No database and no vendor. Postgres's transaction semantics are Postgres's
   to prove, and Resend's sending is P3-INT-01's; what is unproven until it is
   asserted here is that *this* function writes all three things together and
   refuses the callers it should.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({
  env: { APP_URL: "https://sponsorx.example" },
}));

type AthleteRow = {
  id: string;
  tenantId: string;
  state: string;
  email: string;
  legalName: string;
  displayName: string;
  birthDate: Date | null;
  ageBand: string | null;
  guardianId: string | null;
  guardian: { verifiedAt: Date | null } | null;
  reviewerNotes: string | null;
  reviewedAt: Date | null;
};

let rows: AthleteRow[] = [];
let audits: Array<{ action: string; entityId: string; after: unknown }> = [];
let outbox: Array<{ name: string; payload: Record<string, unknown> }> = [];
/* P3-BE-15 — approval now provisions the athlete's login, so the fake holds users too. */
type UserRow = { id: string; tenantId: string; email: string; roles: string[]; athleteId?: string | null; guardianId?: string | null; clerkId: string };
let users: UserRow[] = [];
/* 2S1-BE-13 — a Reject records a closure; the fake keeps them. */
let closures: Array<{ subjectKind: string; subjectId: string; cause: string; reason: string | null }> = [];
let failOutbox = false;

function freshRow(over: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: "ath_1",
    tenantId: "tenant_1",
    state: "UNDER_REVIEW",
    email: "shammah@example.com",
    legalName: "Shammah Okeke",
    displayName: "SHAMMAH.27",
    birthDate: new Date("2000-04-02"),
    ageBand: "18_PLUS",
    guardianId: null,
    guardian: null,
    reviewerNotes: null,
    reviewedAt: null,
    ...over,
  };
}

/**
 * A transaction that buffers every write and applies it only on success.
 *
 * `$transaction` in the real client rolls back on a rejected callback; a stub
 * that kept the writes would make every rollback assertion below pass
 * vacuously.
 */
vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const stagedRows = rows.map((r) => ({ ...r }));
      const stagedAudits: typeof audits = [];
      const stagedOutbox: typeof outbox = [];
      const stagedUsers = users.map((u) => ({ ...u }));
      const stagedClosures: typeof closures = [];

      const tx = {
        athlete: {
          findFirst: ({ where }: { where: { id?: string; tenantId?: string } }) =>
            Promise.resolve(
              stagedRows.find(
                (r) =>
                  (where.id === undefined || r.id === where.id) &&
                  (where.tenantId === undefined || r.tenantId === where.tenantId),
              ) ?? null,
            ),
          update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = stagedRows.find((r) => r.id === where.id);
            if (!row) throw new Error(`no row ${where.id}`);
            Object.assign(row, data);
            return Promise.resolve(row);
          },
          updateMany: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = stagedRows.find((r) => r.id === where.id);
            if (row) Object.assign(row, data);
            return Promise.resolve({ count: row ? 1 : 0 });
          },
        },
        accountClosure: {
          findFirst: () => Promise.resolve(null),
          create: ({ data }: { data: (typeof closures)[number] }) => {
            stagedClosures.push({ subjectKind: data.subjectKind, subjectId: data.subjectId, cause: data.cause, reason: data.reason });
            return Promise.resolve({ id: `closure_${stagedClosures.length}` });
          },
        },
        user: {
          findMany: ({ where }: { where: { tenantId?: string; athleteId?: string } }) =>
            Promise.resolve(stagedUsers.filter((u) => (where.tenantId === undefined || u.tenantId === where.tenantId) && (where.athleteId === undefined || u.athleteId === where.athleteId)).map((u) => ({ id: u.id }))),
          updateMany: () => Promise.resolve({ count: 0 }),
          findFirst: ({ where }: { where: { tenantId?: string; athleteId?: string; guardianId?: string; email?: { equals: string } } }) =>
            Promise.resolve(
              stagedUsers.find(
                (u) =>
                  (where.tenantId === undefined || u.tenantId === where.tenantId) &&
                  (where.athleteId === undefined || u.athleteId === where.athleteId) &&
                  (where.guardianId === undefined || u.guardianId === where.guardianId) &&
                  (where.email === undefined || u.email.toLowerCase() === where.email.equals.toLowerCase()),
              ) ?? null,
            ),
          create: ({ data }: { data: Omit<UserRow, "id"> }) => {
            const row = { id: `user_${stagedUsers.length + 1}`, ...data };
            stagedUsers.push(row);
            return Promise.resolve({ id: row.id });
          },
        },
        guardian: {
          findFirst: () => Promise.resolve(null),
        },
        auditLog: {
          create: ({ data }: { data: { action: string; entityId: string; after: unknown } }) => {
            stagedAudits.push({ action: data.action, entityId: data.entityId, after: data.after });
            return Promise.resolve({ id: "audit_1" });
          },
        },
        outboxJob: {
          create: ({ data }: { data: { name: string; payload: Record<string, unknown> } }) => {
            stagedOutbox.push({ name: data.name, payload: data.payload });
            return Promise.resolve({ id: "job_1" });
          },
        },
      };

      if (failOutbox) tx.outboxJob.create = () => Promise.reject(new Error("outbox down"));
      const result = await fn(tx); // throws => nothing below runs => rollback
      rows = stagedRows;
      users = stagedUsers;
      closures = [...closures, ...stagedClosures];
      audits = [...audits, ...stagedAudits];
      outbox = [...outbox, ...stagedOutbox];
      return result;
    },
  },
}));

const {
  approveApplication,
  beginReview,
  rejectApplication,
  requestChanges,
  reviewApplication,
  ReviewNotesRequiredError,
} = await import("../src/domain/application-review");

const admin: Actor = { userId: "user_admin", tenantId: "tenant_1", roles: ["BTG_ADMIN"] };
const networkMgr: Actor = { userId: "user_nm", tenantId: "tenant_1", roles: ["NETWORK_MGR"] };

beforeEach(() => {
  users = [];
  closures = [];
  failOutbox = false;
  rows = [freshRow()];
  audits = [];
  outbox = [];
});

describe("who may decide an application", () => {
  /* §5 of the RBAC matrix: approve is SUPER_ADMIN, BTG_ADMIN, NETWORK_MGR. */
  it.each([
    ["BTG_ADMIN", ["BTG_ADMIN"]],
    ["NETWORK_MGR", ["NETWORK_MGR"]],
    ["SUPER_ADMIN", ["SUPER_ADMIN"]],
  ] as const)("%s may approve", async (_name, roles) => {
    const actor: Actor = { userId: "u", tenantId: "tenant_1", roles: [...roles] };
    await expect(approveApplication(actor, "ath_1")).resolves.toMatchObject({ state: "APPROVED" });
  });

  it.each([
    ["ATHLETE", ["ATHLETE"]],
    ["GUARDIAN", ["GUARDIAN"]],
    ["SPONSOR_ADMIN", ["SPONSOR_ADMIN"]],
    ["SALES", ["SALES"]],
    ["FINANCE", ["FINANCE"]],
    ["SERVICE", ["SERVICE"]],
    ["no roles at all", []],
  ] as const)("%s may not", async (_name, roles) => {
    const actor: Actor = { userId: "u", tenantId: "tenant_1", roles: [...roles] };
    await expect(approveApplication(actor, "ath_1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(outbox).toHaveLength(0);
    expect(rows[0]?.state).toBe("UNDER_REVIEW");
  });

  it("refuses an application belonging to another tenant, as a denial not a 404", async () => {
    const outsider: Actor = { userId: "u", tenantId: "tenant_2", roles: ["BTG_ADMIN"] };
    await expect(approveApplication(outsider, "ath_1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(rows[0]?.state).toBe("UNDER_REVIEW");
  });
});

describe("the three decisions", () => {
  it("approves: state, audit and one queued email", async () => {
    await approveApplication(admin, "ath_1");

    expect(rows[0]?.state).toBe("APPROVED");
    /* The decision, then the login it provisions (P3-BE-15). */
    expect(audits.map((a) => a.action)).toEqual(["athlete.approve", "user.provision"]);

    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.name).toBe("notify.email");
    expect(outbox[0]?.payload).toMatchObject({
      template: "athlete.approved",
      to: "shammah@example.com",
      tenantId: "tenant_1",
    });
  });

  it("greets the applicant by their legal first name, not their brand name", async () => {
    await approveApplication(admin, "ath_1");
    expect(outbox[0]?.payload.data).toMatchObject({ firstName: "Shammah" });
  });

  it("sends the portal link from configuration, not a hard-coded host", async () => {
    await approveApplication(admin, "ath_1");
    expect(outbox[0]?.payload.data).toMatchObject({
      portalUrl: "https://sponsorx.example/athlete",
    });
  });

  it("requests changes: the note is stored and reaches the applicant", async () => {
    await requestChanges(networkMgr, "ath_1", "Add a second social account.");

    expect(rows[0]?.state).toBe("CHANGES_REQUESTED");
    /* The gap P3-BE-07 closes: before it, the note was audited but never
       written to the column the applicant's own screen reads. */
    expect(rows[0]?.reviewerNotes).toBe("Add a second social account.");
    expect(rows[0]?.reviewedAt).toBeInstanceOf(Date);

    expect(outbox[0]?.payload).toMatchObject({ template: "athlete.changesRequested" });
    expect(outbox[0]?.payload.data).toMatchObject({
      reviewerNotes: "Add a second social account.",
    });
  });

  it("rejects: terminal, recorded, and the reason is sent", async () => {
    await rejectApplication(admin, "ath_1", "Outside the pilot sports for this cohort.");

    expect(rows[0]?.state).toBe("REJECTED");
    expect(rows[0]?.reviewerNotes).toBe("Outside the pilot sports for this cohort.");
    expect(outbox[0]?.payload).toMatchObject({ template: "athlete.rejected" });
    /* 2S1-BE-13 — the Reject is a closure: the ID files go on the 30-day purge. */
    expect(closures).toEqual([{ subjectKind: "ATHLETE", subjectId: "ath_1", cause: "REJECTED", reason: "Outside the pilot sports for this cohort." }]);
  });

  it("stamps reviewedAt on an approval even though it carries no note", async () => {
    await approveApplication(admin, "ath_1");
    expect(rows[0]?.reviewedAt).toBeInstanceOf(Date);
    expect(rows[0]?.reviewerNotes).toBeNull();
  });
});

describe("a decision the applicant reads needs something to say", () => {
  it.each(["CHANGES_REQUESTED", "REJECTED"] as const)("%s with no notes is refused", async (decision) => {
    await expect(reviewApplication(admin, "ath_1", decision)).rejects.toBeInstanceOf(
      ReviewNotesRequiredError,
    );
    expect(rows[0]?.state).toBe("UNDER_REVIEW");
    expect(outbox).toHaveLength(0);
  });

  it("treats whitespace as no notes at all", async () => {
    await expect(requestChanges(admin, "ath_1", "   \n  ")).rejects.toBeInstanceOf(
      ReviewNotesRequiredError,
    );
    expect(outbox).toHaveLength(0);
  });

  it("does not require notes to approve", async () => {
    await expect(approveApplication(admin, "ath_1")).resolves.toMatchObject({ state: "APPROVED" });
  });
});

describe("the state machine is the guard against a second decision", () => {
  it("refuses a decision on an application nobody has claimed", async () => {
    rows = [freshRow({ state: "SUBMITTED" })];
    await expect(approveApplication(admin, "ath_1")).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(outbox).toHaveLength(0);
  });

  it("cannot approve twice, so cannot notify twice", async () => {
    await approveApplication(admin, "ath_1");
    expect(outbox).toHaveLength(1);

    await expect(approveApplication(admin, "ath_1")).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(outbox).toHaveLength(1);
  });

  it("cannot reject an application already approved", async () => {
    await approveApplication(admin, "ath_1");
    await expect(rejectApplication(admin, "ath_1", "Changed our mind.")).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
    expect(rows[0]?.state).toBe("APPROVED");
  });

  it("a refused decision leaves no audit row and no email", async () => {
    rows = [freshRow({ state: "REJECTED" })];
    await expect(approveApplication(admin, "ath_1")).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(audits).toHaveLength(0);
    expect(outbox).toHaveLength(0);
    expect(rows[0]?.state).toBe("REJECTED");
  });
});

describe("beginReview", () => {
  it("claims a submitted application without emailing anyone", async () => {
    rows = [freshRow({ state: "SUBMITTED" })];
    await beginReview(admin, "ath_1");

    expect(rows[0]?.state).toBe("UNDER_REVIEW");
    expect(audits[0]?.action).toBe("athlete.beginReview");
    /* Deliberate: a message per queue movement teaches people to ignore our
       mail, and "someone started reading it" is not news. */
    expect(outbox).toHaveLength(0);
  });

  it("does not stamp reviewedAt — nothing has been decided yet", async () => {
    rows = [freshRow({ state: "SUBMITTED" })];
    await beginReview(admin, "ath_1");
    expect(rows[0]?.reviewedAt).toBeNull();
  });
});

describe("approval is not activation (§37)", () => {
  it("leaves a minor with no verified guardian at APPROVED, not ACTIVE", async () => {
    rows = [
      freshRow({
        birthDate: new Date(Date.now() - 15 * 365.25 * 24 * 60 * 60 * 1000),
        ageBand: "UNDER_16",
        guardianId: null,
        guardian: null,
      }),
    ];

    await expect(approveApplication(admin, "ath_1")).resolves.toMatchObject({ state: "APPROVED" });
    /* The guardian gate belongs to the APPROVED → ACTIVE move, which this
       task does not make. A minor passing review is correct; a minor taking
       paid work without a verified guardian is what §37 forbids. */
    expect(rows[0]?.state).toBe("APPROVED");
  });
});

describe("one decision, one transaction", () => {
  it("queues the email in the same transaction as the state change", async () => {
    await approveApplication(admin, "ath_1");
    /* If these had been separate transactions, the rollback assertions above
       could not hold — this is the positive half of the same property. */
    expect(rows[0]?.state).toBe("APPROVED");
    expect(outbox).toHaveLength(1);
    expect(audits).toHaveLength(2);
    expect(users).toHaveLength(1);
  });

  it("carries an idempotency key derived from the decision, not the clock", async () => {
    await approveApplication(admin, "ath_1");
    expect(outbox[0]?.payload).toMatchObject({
      idempotencyKey: "athlete.approved:ath_1:APPROVED",
    });
  });
});

/* --------------------------------------------------------------------------
   P3-BE-15 — "An approved applicant signs in with the email they applied
   with and lands in the athlete portal as that athlete; approving creates no
   duplicate and never takes over an address another account already uses; it
   commits in the same transaction as the decision."
   (The sign-in half runs against real Postgres in athlete-login.test.ts.)
   -------------------------------------------------------------------------- */
describe("approval provisions the athlete's login (P3-BE-15)", () => {
  it("creates an ATHLETE login for the applicant's own address, as an invitation to claim", async () => {
    const out = await approveApplication(admin, "ath_1");
    expect(out.login).toEqual({ athlete: "created", guardian: null });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ tenantId: "tenant_1", email: "shammah@example.com", roles: ["ATHLETE"], athleteId: "ath_1" });
    expect(users[0]?.clerkId).toMatch(/^invite:[0-9a-f]{24}$/);
  });

  it("never takes over an address any account already holds, in any tenant", async () => {
    users = [{ id: "u_other", tenantId: "tenant_2", email: "Shammah@Example.com", roles: ["SPONSOR_ADMIN"], clerkId: "clerk_x" }];
    const out = await approveApplication(admin, "ath_1");
    expect(out.login?.athlete).toBe("address-in-use");
    expect(users).toEqual([{ id: "u_other", tenantId: "tenant_2", email: "Shammah@Example.com", roles: ["SPONSOR_ADMIN"], clerkId: "clerk_x" }]);
    expect(rows[0]?.state).toBe("APPROVED");
  });

  it("creates no duplicate when the athlete already has their login", async () => {
    users = [{ id: "u_own", tenantId: "tenant_1", email: "shammah@example.com", roles: ["ATHLETE"], athleteId: "ath_1", clerkId: "clerk_own" }];
    const out = await approveApplication(admin, "ath_1");
    expect(out.login?.athlete).toBe("already-linked");
    expect(users).toHaveLength(1);
  });

  it("reports an applicant with no address instead of inventing one", async () => {
    rows = [freshRow({ email: "" })];
    const out = await approveApplication(admin, "ath_1");
    expect(out.login?.athlete).toBe("no-email");
    expect(users).toHaveLength(0);
  });

  it.each([
    ["request changes", () => requestChanges(admin, "ath_1", "Add a photo.")],
    ["reject", () => rejectApplication(admin, "ath_1", "Not eligible.")],
  ])("%s gives nobody a login", async (_name, decide) => {
    const out = await decide();
    expect(users).toHaveLength(0);
    expect((out as { login?: unknown }).login).toBeUndefined();
  });

  it("commits with the decision: a failed decision leaves no login behind", async () => {
    failOutbox = true;
    await expect(approveApplication(admin, "ath_1")).rejects.toThrow("outbox down");
    expect(users).toHaveLength(0);
    expect(rows[0]?.state).toBe("UNDER_REVIEW");
  });
});

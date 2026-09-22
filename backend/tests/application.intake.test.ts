import { beforeEach, describe, expect, it, vi } from "vitest";

import { IllegalTransitionError } from "../src/domain/athlete-state";

/* --------------------------------------------------------------------------
   Public application intake — P3-BE-13, §11, §21, §39.

   This is the only unauthenticated write path in the API, which changes what
   is worth asserting. On every other endpoint the role check is the thing
   under test; here there is no role, so the properties that matter are the
   three that replace it: the tenant cannot be chosen by the caller, an
   existing application is reachable only by a signed token that names it, and
   an applicant cannot edit past a decision already taken about them.

   Plus the one safety property the type system now carries: a path with no
   actor must never be able to activate an athlete (§37).
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({
  env: {
    APP_URL: "https://sponsorx.example",
    PUBLIC_INTAKE_TENANT_ID: "tenant_btg",
    INTAKE_TOKEN_SECRET: "test-secret",
  },
}));

type Row = Record<string, unknown> & { id: string; tenantId: string; state: string };

let athletes: Row[] = [];
let socials: Array<Record<string, unknown>> = [];
let audits: Array<{ action: string; actorId: unknown; entityId: string }> = [];
let outbox: Array<{ name: string; payload: Record<string, unknown> }> = [];
let nextId = 1;
/** Forces the last write in the transaction to fail, so the rollback
 *  assertion tests the real property instead of a validation error that never
 *  reached the database. */
let queueThrows = false;

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const sa = athletes.map((a) => ({ ...a }));
      const ss = [...socials];
      const au: typeof audits = [];
      const ob: typeof outbox = [];
      const match = (w: Record<string, unknown>) => (r: Row) =>
        (w.id === undefined || r.id === w.id) &&
        (w.tenantId === undefined || r.tenantId === w.tenantId);
      const tx = {
        athlete: {
          create: ({ data }: { data: Record<string, unknown> }) => {
            const row = { ...data, id: `ath_${nextId++}`, state: "DRAFT" } as Row;
            sa.push(row);
            return Promise.resolve({ id: row.id });
          },
          findFirst: ({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(sa.find(match(where)) ?? null),
          findMany: ({ where }: { where: { slug?: { startsWith?: string } } }) =>
            Promise.resolve(
              sa.filter((r) => !where?.slug?.startsWith
                || String(r.slug).startsWith(where.slug.startsWith)),
            ),
          update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = sa.find((r) => r.id === where.id)!;
            Object.assign(row, data);
            return Promise.resolve(row);
          },
        },
        athleteSocial: {
          createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
            ss.push(...data);
            return Promise.resolve({ count: data.length });
          },
          deleteMany: ({ where }: { where: { athleteId: string } }) => {
            for (let n = ss.length - 1; n >= 0; n--) {
              if (ss[n]!.athleteId === where.athleteId) ss.splice(n, 1);
            }
            return Promise.resolve({ count: 0 });
          },
        },
        auditLog: {
          create: ({ data }: { data: { action: string; actorId: unknown; entityId: string } }) => {
            au.push({ action: data.action, actorId: data.actorId, entityId: data.entityId });
            return Promise.resolve({ id: "a" });
          },
        },
        outboxJob: {
          create: ({ data }: { data: { name: string; payload: Record<string, unknown> } }) => {
            if (queueThrows) return Promise.reject(new Error("queue unavailable"));
            ob.push({ name: data.name, payload: data.payload });
            return Promise.resolve({ id: "j" });
          },
        },
      };
      const result = await fn(tx); // throws => no commit below
      athletes = sa; socials = ss;
      audits = [...audits, ...au]; outbox = [...outbox, ...ob];
      return result;
    },
    athlete: {
      findFirst: ({ where }: { where: Record<string, unknown> }) => {
        const row = athletes.find(
          (r) => (where.id === undefined || r.id === where.id)
            && (where.tenantId === undefined || r.tenantId === where.tenantId));
        return Promise.resolve(
          row ? { ...row, socials: socials.filter((s) => s.athleteId === row.id) } : null);
      },
    },
  },
}));

const {
  submitApplication, patchApplication, readOwnApplication,
  ApplicationNotFoundError, ApplicationClosedError,
} = await import("../src/domain/application-intake");
const { readIntakeToken } = await import("../src/lib/intake-token");
const { transitionAthleteIn } = await import("../src/domain/athlete");

const application = {
  legalName: "Jordan Reed", displayName: "Jordan Reed", email: "Jordan@Example.COM",
  stateCode: "MD", sport: "Basketball", ageBand: "18_PLUS" as const,
  socials: [{ platform: "INSTAGRAM" as const, handle: "jreed", followers: 4200, source: "SELF_REPORTED" as const }],
};

beforeEach(() => {
  athletes = []; socials = []; audits = []; outbox = []; nextId = 1;
  queueThrows = false;
});

describe("applying", () => {
  it("creates an application and leaves it SUBMITTED", async () => {
    const r = await submitApplication(application);
    expect(r.state).toBe("SUBMITTED");
    expect(athletes[0]?.state).toBe("SUBMITTED");
  });

  it("puts the applicant in the configured tenant, which they cannot choose", async () => {
    await submitApplication({ ...application, tenantId: "tenant_someone_else" } as never);
    expect(athletes[0]?.tenantId).toBe("tenant_btg");
  });

  it("records the creation and the submission, with no actor behind either", async () => {
    await submitApplication(application);
    expect(audits.map((a) => a.action)).toEqual(["athlete.apply", "athlete.submit"]);
    expect(audits.every((a) => a.actorId === null)).toBe(true);
  });

  it("sends exactly one receipt, keyed so a retry cannot double it", async () => {
    await submitApplication(application);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.payload).toMatchObject({ template: "athlete.applicationReceived" });
    expect(outbox[0]?.payload.idempotencyKey).toBe("athlete.applicationReceived:ath_1:SUBMITTED");
  });

  it("lowercases the email, because resolveActor links on it later", async () => {
    await submitApplication(application);
    expect(athletes[0]?.email).toBe("jordan@example.com");
  });

  it("stores socials with their provenance", async () => {
    await submitApplication(application);
    expect(socials).toHaveLength(1);
    expect(socials[0]).toMatchObject({ platform: "INSTAGRAM", source: "SELF_REPORTED" });
  });

  it("gives two people with the same name different public URLs", async () => {
    await submitApplication(application);
    await submitApplication(application);
    expect(athletes.map((a) => a.slug)).toEqual(["jordan-reed", "jordan-reed-2"]);
  });

  it("commits the athlete, the socials, the audit and the receipt together or not at all", async () => {
    /* The receipt is the last write. If it fails, an applicant who was told
       nothing must also not exist — the alternative is a row in the review
       queue belonging to someone who never heard from us. */
    queueThrows = true;
    await expect(submitApplication(application)).rejects.toThrow("queue unavailable");

    expect(athletes).toHaveLength(0);
    expect(socials).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(outbox).toHaveLength(0);
  });
});

describe("the continuation token", () => {
  it("names its own application, so it cannot be pointed at another", async () => {
    const r = await submitApplication(application);
    expect(readIntakeToken(r.continuationToken)).toBe(r.id);
  });

  it("refuses a token signed for a different application", async () => {
    const a = await submitApplication(application);
    const forged = `ath_999.${a.continuationToken.split(".")[1]}`;
    expect(readIntakeToken(forged)).toBeNull();
  });

  it.each(["", "nonsense", "ath_1.", ".sig", "ath_1"])("refuses %o", (bad) => {
    expect(readIntakeToken(bad)).toBeNull();
  });
});

describe("coming back to it", () => {
  it("shows the applicant their own application", async () => {
    const r = await submitApplication(application);
    const view = await readOwnApplication(r.id);
    expect(view).toMatchObject({ id: r.id, state: "SUBMITTED", displayName: "Jordan Reed" });
  });

  it("withholds reviewer notes unless we have asked for a change", async () => {
    const r = await submitApplication(application);
    athletes[0]!.reviewerNotes = "Internal: weak social proof.";
    expect((await readOwnApplication(r.id)).reviewerNotes).toBeNull();

    athletes[0]!.state = "CHANGES_REQUESTED";
    expect((await readOwnApplication(r.id)).reviewerNotes).toBe("Internal: weak social proof.");
  });

  it("refuses an id that does not exist", async () => {
    await expect(readOwnApplication("ath_nope")).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });
});

describe("editing", () => {
  it("answers a change request by editing, and resubmits in the same act", async () => {
    const r = await submitApplication(application);
    athletes[0]!.state = "CHANGES_REQUESTED";

    const out = await patchApplication(r.id, { school: "DeMatha Catholic" });
    expect(out.state).toBe("SUBMITTED");
    expect(athletes[0]?.school).toBe("DeMatha Catholic");
  });

  it("leaves a draft a draft", async () => {
    const r = await submitApplication(application);
    athletes[0]!.state = "DRAFT";
    expect((await patchApplication(r.id, { city: "Hyattsville" })).state).toBe("DRAFT");
  });

  it.each(["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ACTIVE"])(
    "refuses an edit once the application is %s", async (state) => {
      const r = await submitApplication(application);
      athletes[0]!.state = state;
      await expect(patchApplication(r.id, { city: "Bowie" }))
        .rejects.toBeInstanceOf(ApplicationClosedError);
      expect(athletes[0]?.city).toBeNull();
    });

  it("replaces socials wholesale, so a mistaken account can be removed", async () => {
    const r = await submitApplication(application);
    athletes[0]!.state = "DRAFT";
    await patchApplication(r.id, { socials: [] });
    expect(socials).toHaveLength(0);
  });

  it("leaves socials alone when the key is absent", async () => {
    const r = await submitApplication(application);
    athletes[0]!.state = "DRAFT";
    await patchApplication(r.id, { city: "Bowie" });
    expect(socials).toHaveLength(1);
  });

  it("does not repoint the public URL, which may already have been shared", async () => {
    const r = await submitApplication(application);
    athletes[0]!.state = "DRAFT";
    await patchApplication(r.id, { displayName: "J. Reed" });
    expect(athletes[0]?.slug).toBe("jordan-reed");
  });
});

describe("a path with no actor cannot activate anyone (§37)", () => {
  const system = { system: true as const, tenantId: "tenant_btg", userId: null };

  it("refuses to move an athlete to ACTIVE", async () => {
    athletes = [{ id: "ath_x", tenantId: "tenant_btg", state: "APPROVED",
                  birthDate: null, ageBand: "18_PLUS", guardianId: null, guardian: null }];
    const tx = {
      athlete: { findFirst: () => Promise.resolve(athletes[0]) },
    };
    await expect(transitionAthleteIn(tx as never, system, "ath_x", "ACTIVE"))
      .rejects.toThrow(/may not activate/);
  });

  it("still obeys the state table", async () => {
    athletes = [{ id: "ath_x", tenantId: "tenant_btg", state: "REJECTED",
                  birthDate: null, ageBand: "18_PLUS", guardianId: null, guardian: null }];
    const tx = { athlete: { findFirst: () => Promise.resolve(athletes[0]) } };
    await expect(transitionAthleteIn(tx as never, system, "ath_x", "SUBMITTED"))
      .rejects.toBeInstanceOf(IllegalTransitionError);
  });
});

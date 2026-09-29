import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import { ForbiddenError } from "../src/auth/errors";
import type { Role } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   Post-approval profile edits — P3-BE-16, §11, §24, §26.

   Acceptance: "an athlete can submit a change to each editable section;
   public-facing changes reach the public profile only after BTG approves;
   restrictions changes feed the conflict check; tenant + own-scope tests."

   Against a fake transaction that buffers writes and drops them when the
   callback throws — the Athlete row must not move on submission, must move
   on approval, and must not move on a decline or a rolled-back approval.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

type AthleteRow = Record<string, unknown> & { id: string; tenantId: string; state: string };
type ChangeRow = Record<string, unknown> & { id: string; tenantId: string; athleteId: string; state: string; fields: Record<string, unknown>; sections: string[] };

let athletes: AthleteRow[] = [];
let changes: ChangeRow[] = [];
let audits: Array<{ action: string; entityId: string; before: unknown; after: unknown }> = [];
let outbox: Array<{ name: string; payload: Record<string, unknown> }> = [];
let seq = 0;

const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === "AND") return (v as Record<string, unknown>[]).every((w) => matches(row, w));
    if (k === "athlete" && typeof v === "object" && v && "is" in v) return matches(athletes.find((a) => a.id === row.athleteId)!, (v as { is: Record<string, unknown> }).is);
    if (typeof v === "object" && v && "in" in v) return (v as { in: unknown[] }).in.includes(row[k]);
    return row[k] === v;
  });

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const stagedA = athletes.map((a) => ({ ...a }));
      const stagedC = changes.map((c) => ({ ...c }));
      const au: typeof audits = [];
      const ob: typeof outbox = [];
      const tx = {
        athlete: {
          findFirst: ({ where }: { where: Record<string, unknown> }) => Promise.resolve(stagedA.find((a) => matches(a, where)) ?? null),
          update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const a = stagedA.find((x) => x.id === where.id)!;
            Object.assign(a, data);
            return Promise.resolve(a);
          },
        },
        athleteProfileChange: {
          /* The domain selects the athlete alongside the change; the fake
             joins it the same way a Prisma `select: { athlete }` would. */
          findFirst: ({ where }: { where: Record<string, unknown> }) => {
            const c = stagedC.find((x) => matches(x, where));
            return Promise.resolve(c ? { ...c, athlete: stagedA.find((a) => a.id === c.athleteId) } : null);
          },
          findMany: ({ where }: { where: Record<string, unknown> }) => Promise.resolve(stagedC.filter((c) => matches(c, where))),
          updateMany: ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
            for (const c of stagedC) if (where.id.in.includes(c.id)) Object.assign(c, data);
            return Promise.resolve({ count: 1 });
          },
          update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const c = stagedC.find((x) => x.id === where.id)!;
            Object.assign(c, data);
            return Promise.resolve(c);
          },
          create: ({ data }: { data: Record<string, unknown> }) => {
            const c = { id: `pc_${++seq}`, state: "PENDING", createdAt: new Date(), ...data } as ChangeRow;
            stagedC.push(c);
            return Promise.resolve(c);
          },
        },
        auditLog: {
          create: ({ data }: { data: { action: string; entityId: string; before: unknown; after: unknown } }) => {
            au.push({ action: data.action, entityId: data.entityId, before: data.before, after: data.after });
            return Promise.resolve({ id: "a" });
          },
        },
        outboxJob: {
          create: ({ data }: { data: { name: string; payload: Record<string, unknown> } }) => {
            ob.push({ name: data.name, payload: data.payload });
            return Promise.resolve({ id: "o" });
          },
        },
      };
      const out = await fn(tx);
      athletes = stagedA; changes = stagedC; audits = [...audits, ...au]; outbox = [...outbox, ...ob];
      return out;
    },
    athleteProfileChange: {
      findMany: ({ where }: { where: Record<string, unknown> }) => Promise.resolve(changes.filter((c) => matches(c, where))),
    },
  },
}));

const {
  submitProfileChange, decideProfileChange, withdrawProfileChange, myProfileChanges, diffAgainst, flattenInput,
  NothingToChangeError, ProfileNotEditableError, ChangeNotPendingError, DeclineNotesRequiredError,
} = await import("../src/domain/athlete-profile-change");

const actor = (roles: Role[], over: Partial<Actor> = {}): Actor =>
  ({ userId: "u_1", tenantId: "t1", roles, sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...over }) as Actor;
const me = actor(["ATHLETE"], { athleteId: "ath_1", userId: "u_ath" });
const btg = actor(["NETWORK_MGR"], { userId: "u_btg" });

const freshAthlete = (over: Partial<AthleteRow> = {}): AthleteRow => ({
  id: "ath_1", tenantId: "t1", state: "ACTIVE", email: "a@x.invalid", legalName: "Ada Lovelace", displayName: "ADA.27",
  city: "Baltimore", stateCode: "MD", sport: "Soccer", position: "GK", school: null, level: "HIGH_SCHOOL", gradYear: 2027, achievements: null,
  contentCapabilities: ["PHOTO"], brandInterests: ["APPAREL"], restrictedCategories: ["ALCOHOL"], restrictionNotes: null, ...over,
});

beforeEach(() => { athletes = [freshAthlete()]; changes = []; audits = []; outbox = []; seq = 0; });

describe("the pure helpers", () => {
  it("flattens sections into columns and names the sections touched", () => {
    expect(flattenInput({ identity: { city: "Towson" }, restrictions: { restrictedCategories: ["ALCOHOL", "GAMBLING"] } })).toEqual({
      fields: { city: "Towson", restrictedCategories: ["ALCOHOL", "GAMBLING"] }, sections: ["identity", "restrictions"],
    });
  });
  it("drops what already matches — lists compare as sets", () => {
    const out = diffAgainst(
      { city: "Baltimore", position: "CB", brandInterests: ["APPAREL"], restrictedCategories: ["GAMBLING", "ALCOHOL"] },
      { city: "Baltimore", position: "GK", brandInterests: ["APPAREL"], restrictedCategories: ["ALCOHOL", "GAMBLING"] },
    );
    expect(out).toEqual({ fields: { position: "CB" }, sections: ["sport"] });
  });
});

describe("submitting", () => {
  it("records the change and leaves the profile untouched", async () => {
    const c = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" }, sport: { position: "CB" }, note: "New season" });
    expect(c.state).toBe("PENDING");
    expect(c.sections).toEqual(["identity", "sport"]);
    expect(c.fields).toEqual({ displayName: "ADA.28", position: "CB" });
    expect(athletes[0]!.displayName).toBe("ADA.27");
    expect(audits.map((a) => a.action)).toEqual(["athlete.profileChangeSubmit"]);
  });
  it("covers every editable section", async () => {
    const c = await submitProfileChange(me, "ath_1", {
      identity: { city: "Towson" }, sport: { school: "Towson High" }, capabilities: { contentCapabilities: ["PHOTO", "WRITTEN"] },
      interests: { brandInterests: [] }, restrictions: { restrictedCategories: [], restrictionNotes: "None now" },
    });
    expect(c.sections).toEqual(["identity", "sport", "capabilities", "interests", "restrictions"]);
  });
  it("refuses a request that changes nothing (422)", async () => {
    await expect(submitProfileChange(me, "ath_1", { identity: { city: "Baltimore" } })).rejects.toBeInstanceOf(NothingToChangeError);
    expect(changes).toEqual([]);
  });
  it("is for approved athletes only — an applicant edits the application (409)", async () => {
    athletes = [freshAthlete({ state: "UNDER_REVIEW" })];
    await expect(submitProfileChange(me, "ath_1", { identity: { city: "X" } })).rejects.toBeInstanceOf(ProfileNotEditableError);
  });
  it("cannot reach another athlete's row — own scope, same 403 as not-found", async () => {
    athletes = [freshAthlete(), freshAthlete({ id: "ath_2" })];
    await expect(submitProfileChange(me, "ath_2", { identity: { city: "X" } })).rejects.toBeInstanceOf(ForbiddenError);
    const other = actor(["ATHLETE"], { athleteId: "ath_9", tenantId: "t2" });
    await expect(submitProfileChange(other, "ath_1", { identity: { city: "X" } })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("a new request withdraws the open one, on the record", async () => {
    const first = await submitProfileChange(me, "ath_1", { identity: { city: "Towson" } });
    const second = await submitProfileChange(me, "ath_1", { identity: { city: "Columbia" } });
    expect(changes.find((c) => c.id === first.id)!.state).toBe("WITHDRAWN");
    expect(changes.find((c) => c.id === second.id)!.state).toBe("PENDING");
    expect(audits.map((a) => a.action)).toContain("athlete.profileChangeWithdraw");
  });
  it("a guardian proposes for the ward, not for anyone else", async () => {
    athletes = [freshAthlete({ guardianId: "g_1" })];
    const guardian = actor(["GUARDIAN"], { guardianId: "g_1" });
    await expect(submitProfileChange(guardian, "ath_1", { identity: { city: "X" } })).resolves.toMatchObject({ state: "PENDING" });
    const stranger = actor(["GUARDIAN"], { guardianId: "g_2" });
    await expect(submitProfileChange(stranger, "ath_1", { identity: { city: "Y" } })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("deciding", () => {
  it("approval writes the fields, audits restrictions separately, and emails", async () => {
    const c = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" }, restrictions: { restrictedCategories: ["ALCOHOL", "GAMBLING"] } });
    const out = await decideProfileChange(btg, c.id, "APPROVED");
    expect(out.state).toBe("APPROVED");
    expect(athletes[0]!.displayName).toBe("ADA.28");
    expect(athletes[0]!.restrictedCategories).toEqual(["ALCOHOL", "GAMBLING"]);
    const r = audits.find((a) => a.action === "athlete.restrictionsSet")!;
    expect(r.before).toEqual({ restrictedCategories: ["ALCOHOL"] });
    expect(r.after).toEqual({ restrictedCategories: ["ALCOHOL", "GAMBLING"] });
    expect(audits.find((a) => a.action === "athlete.profileChangeApprove")!.before).toEqual({ displayName: "ADA.27", restrictedCategories: ["ALCOHOL"] });
    expect(outbox[0]!.payload.template).toBe("athlete.profileChangeApproved");
  });
  it("a decline needs notes, leaves the profile alone, and sends them to the athlete", async () => {
    const c = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" } });
    await expect(decideProfileChange(btg, c.id, "DECLINED")).rejects.toBeInstanceOf(DeclineNotesRequiredError);
    const out = await decideProfileChange(btg, c.id, "DECLINED", "Keep the name on your registration.");
    expect(out.state).toBe("DECLINED");
    expect(athletes[0]!.displayName).toBe("ADA.27");
    expect(outbox[0]!.payload.template).toBe("athlete.profileChangeDeclined");
    expect((outbox[0]!.payload.data as Record<string, string>).reviewerNotes).toBe("Keep the name on your registration.");
  });
  it("cannot be decided twice (409), and the athlete cannot decide (403)", async () => {
    const c = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" } });
    await decideProfileChange(btg, c.id, "APPROVED");
    await expect(decideProfileChange(btg, c.id, "APPROVED")).rejects.toBeInstanceOf(ChangeNotPendingError);
    const d = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.29" } });
    await expect(decideProfileChange(me, d.id, "APPROVED")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("another tenant's reviewer sees nothing to decide", async () => {
    const c = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" } });
    await expect(decideProfileChange(actor(["BTG_ADMIN"], { tenantId: "t2" }), c.id, "APPROVED")).rejects.toBeInstanceOf(ForbiddenError);
    expect(athletes[0]!.displayName).toBe("ADA.27");
  });
  it("a suspended-then-approved change is refused rather than applied blind", async () => {
    const c = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" } });
    athletes = [freshAthlete({ state: "REJECTED" })];
    await expect(decideProfileChange(btg, c.id, "APPROVED")).rejects.toBeInstanceOf(ProfileNotEditableError);
    expect(changes[0]!.state).toBe("PENDING");
  });
});

describe("withdrawing and listing", () => {
  it("the athlete withdraws their own pending change, once", async () => {
    const c = await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" } });
    await expect(withdrawProfileChange(me, c.id)).resolves.toMatchObject({ state: "WITHDRAWN" });
    await expect(withdrawProfileChange(me, c.id)).rejects.toBeInstanceOf(ChangeNotPendingError);
  });
  it("lists only the caller's own", async () => {
    await submitProfileChange(me, "ath_1", { identity: { displayName: "ADA.28" } });
    changes.push({ id: "pc_other", tenantId: "t1", athleteId: "ath_2", state: "PENDING", fields: {}, sections: [] });
    expect((await myProfileChanges(me)).map((c) => c.athleteId)).toEqual(["ath_1"]);
    await expect(myProfileChanges(btg)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

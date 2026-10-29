import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-07 — anyone holding the fan's phone could use up their reward.

   Redeem needs the reward's six-digit staff code (the booth's PIN) once
   REWARD_STAFF_CODE_REQUIRED is on; a code that is sent is checked even
   while it is off. Five wrong codes lock that fan's code for 15 minutes. The
   booth can undo the latest redeem within 5 minutes, with the code. Only the
   reward's managers (BTG, the sponsor's admins) see or replace the code.

   Against real Postgres: the redemption counter and the single-use index are
   the database's.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sc-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-07 · the booth's staff code, and undo", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const reward = await import("../src/domain/reward");

  const T = "sc_tenant";
  const CODE = "246810";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const redeem = (token: string, staffCode?: string) => call("POST", `/public/rewards/${token}/redeem`, null, staffCode === undefined ? {} : { staffCode });
  const undo = (token: string, staffCode: string) => call("POST", `/public/rewards/${token}/redeem/undo`, null, { staffCode });
  const view = async (token: string) => (await call("GET", `/public/rewards/${token}`, null)).json;
  const redeems = (token: string) => prisma.rewardEvent.count({ where: { tenantId: T, type: "REDEEM", token: { is: { token } } } });
  const required = (on: boolean) => { (env as { REWARD_STAFF_CODE_REQUIRED: boolean }).REWARD_STAFF_CODE_REQUIRED = on; };

  async function seed(id: string, n: number, data: Record<string, unknown> = {}) {
    await prisma.reward.create({ data: {
      id, tenantId: T, campaignId: "sc_campaign", offerText: `Offer ${id}`, terms: "t", staffCode: CODE,
      expiresAt: new Date(Date.now() + 30 * 864e5), state: "ACTIVE", ...data,
    } });
    await prisma.rewardToken.createMany({ data: Array.from({ length: n }, (_, i) => (
      { id: `${id}_tok_${i}`, tenantId: T, rewardId: id, token: `${id}-token-${i}-xxxxxxxxxxxxxxxx` }
    )) });
    return Array.from({ length: n }, (_, i) => `${id}-token-${i}-xxxxxxxxxxxxxxxx`);
  }

  async function clean() {
    for (const t of ["OutboxJob", "AuditLog", "RewardEvent", "RewardToken", "Reward", "Campaign", "User", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Staff code test tenant" } });
    await prisma.sponsor.create({ data: { id: "sc_sponsor", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.campaign.create({ data: { id: "sc_campaign", tenantId: T, sponsorId: "sc_sponsor", name: "Fall tacos", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2099-12-31"), state: "ACTIVE" } });
    await prisma.user.createMany({ data: [
      { id: "sc_admin", tenantId: T, clerkId: "sc_admin", email: "sc_admin@sc-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "sc_buyer", tenantId: T, clerkId: "sc_buyer", email: "sc_buyer@sc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "sc_sponsor" },
      { id: "sc_analyst", tenantId: T, clerkId: "sc_analyst", email: "sc_analyst@sc-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "sc_sponsor" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    required(false);
    server?.close();
    await clean();
  });

  it("switch off (until the fan page asks for it): redeem works without a code, but a code that is sent is checked", async () => {
    required(false);
    const [a, b] = await seed("sc_off", 2);
    expect((await view(a!)).staffCodeRequired).toBe(false);
    const wrong = await redeem(a!, "000000");
    expect(wrong.status, wrong.text).toBe(403);
    expect(wrong.json.error.code).toBe("wrong_staff_code");
    expect(await redeems(a!)).toBe(0);
    expect((await redeem(a!)).status).toBe(201);
    expect((await redeem(b!, CODE)).status).toBe(201);
    expect(await redeems(a!)).toBe(1);
  });

  it("switch on: no code or a wrong code redeems nothing; five wrong lock the fan's code for 15 minutes, even against the right one", async () => {
    required(true);
    const [a, b] = await seed("sc_on", 2);
    expect((await view(a!)).staffCodeRequired).toBe(true);
    const none = await redeem(a!);
    expect(none.status, none.text).toBe(403);
    expect(none.json.error.code).toBe("staff_code_required");
    /* Not six digits: refused by the contract, and not counted. */
    expect((await redeem(a!, "12")).status).toBe(400);
    for (let i = 1; i <= 4; i++) {
      const r = await redeem(a!, "111111");
      expect(r.status).toBe(403);
      expect(r.json.error.message).toContain(`${5 - i} ${5 - i === 1 ? "try" : "tries"} left`);
    }
    const fifth = await redeem(a!, "111111");
    expect(fifth.status).toBe(429);
    expect(fifth.json.error.code).toBe("staff_code_locked");
    expect((await redeem(a!, CODE)).status).toBe(429);
    expect(await redeems(a!)).toBe(0);
    /* Another fan's code is not locked. */
    expect((await redeem(b!, CODE)).status).toBe(201);
    /* Fifteen minutes on, the right code works and the count starts again. */
    await prisma.rewardToken.updateMany({ where: { token: a! }, data: { staffCodeLockedUntil: new Date(Date.now() - 1000) } });
    expect((await redeem(a!, CODE)).status).toBe(201);
    expect(await prisma.rewardToken.findFirstOrThrow({ where: { token: a! }, select: { staffCodeFailures: true } })).toEqual({ staffCodeFailures: 0 });
  });

  it("undo within 5 minutes, with the code: the redeem is gone, counted on the code and audited, and the code redeems again", async () => {
    required(true);
    const [a] = await seed("sc_undo", 1);
    expect((await redeem(a!, CODE)).status).toBe(201);
    const v = await view(a!);
    expect(v.state).toBe("REDEEMED");
    expect(new Date(v.undoUntil).getTime() - new Date(v.lastRedeemedAt).getTime()).toBe(5 * 60_000);
    const wrong = await undo(a!, "999999");
    expect(wrong.status).toBe(403);
    expect(await redeems(a!)).toBe(1);
    const ok = await undo(a!, CODE);
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json).toEqual({ undone: true, timesRedeemed: 0 });
    expect(await redeems(a!)).toBe(0);
    expect((await view(a!))).toMatchObject({ state: "LIVE", undoUntil: null, timesRedeemed: 0 });
    expect(await prisma.rewardToken.findFirstOrThrow({ where: { token: a! }, select: { undoneRedeems: true, lastUndoneRedeemAt: true } }))
      .toMatchObject({ undoneRedeems: 1, lastUndoneRedeemAt: expect.any(Date) });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "reward.redeemUndo", entityId: "sc_undo_tok_0" } })).toBe(1);
    /* Nothing left to undo. */
    const again = await undo(a!, CODE);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("nothing_to_undo");
    /* The single-use code redeems again. */
    expect((await redeem(a!, CODE)).status).toBe(201);
  });

  it("after 5 minutes the redeem stands", async () => {
    required(true);
    const [a] = await seed("sc_late", 1);
    expect((await redeem(a!, CODE)).status).toBe(201);
    await expect(reward.undoRedeem(a!, CODE, new Date(Date.now() + 5 * 60_000 + 1000))).rejects.toMatchObject({ status: 409, code: "undo_window_closed" });
    expect(await redeems(a!)).toBe(1);
  });

  it("on a capped reward the undone unit goes back to the pool", async () => {
    required(true);
    const [a, b] = await seed("sc_cap", 2, { redemptionCap: 1 });
    expect((await redeem(a!, CODE)).status).toBe(201);
    expect((await redeem(b!, CODE)).status).toBe(410);
    expect((await undo(a!, CODE)).status).toBe(200);
    expect(await prisma.reward.findUniqueOrThrow({ where: { id: "sc_cap" }, select: { redemptionCount: true } })).toEqual({ redemptionCount: 0 });
    expect((await redeem(b!, CODE)).status).toBe(201);
  });

  it("the code: made at create, shown only to the reward's managers, replaced by them — the old one stops working", async () => {
    required(true);
    const made = await call("POST", "/campaigns/sc_campaign/rewards", "sc_admin", { offerText: "Free churro", terms: "One per fan", expiresAt: "2099-12-01T00:00:00.000Z" });
    expect(made.status, made.text).toBe(201);
    const first = (await call("GET", `/rewards/${made.json.id}`, "sc_admin")).json.staffCode as string;
    expect(first).toMatch(/^\d{6}$/);
    expect((await call("GET", `/rewards/${made.json.id}`, "sc_buyer")).json.staffCode).toBe(first);
    expect((await call("GET", `/rewards/${made.json.id}`, "sc_analyst")).json).not.toHaveProperty("staffCode");

    const [a] = await seed("sc_new", 1);
    expect((await call("POST", "/rewards/sc_new/staff-code", "sc_analyst")).status).toBe(403);
    const replaced = await call("POST", "/rewards/sc_new/staff-code", "sc_buyer");
    expect(replaced.status, replaced.text).toBe(200);
    expect(replaced.json.staffCode).toMatch(/^\d{6}$/);
    const byBtg = await call("POST", "/rewards/sc_new/staff-code", "sc_admin");
    expect(byBtg.status).toBe(200);
    const now = byBtg.json.staffCode as string;
    if (now !== CODE) expect((await redeem(a!, CODE)).status).toBe(403);
    expect((await redeem(a!, now)).status).toBe(201);
    /* Audited without the code itself. */
    const audits = await prisma.auditLog.findMany({ where: { tenantId: T, action: "reward.staffCodeReplace", entityId: "sc_new" }, select: { after: true } });
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain(now);
  });
});

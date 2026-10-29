import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-08 — only the first fan could claim a shared QR code.

   An athlete's code is shown to many fans. With REWARD_FAN_CODES on, a fan
   claiming through it gets a code of their own (parentTokenId = the shared
   code): the claim, the hold, the voucher email and the redeem are on it. The
   shared code's page is the offer, never another fan's hold, and it can't be
   redeemed itself. An address already used on the reward gets its code back.
   Off: one claim per code, as before.

   Against real Postgres: the holds and the cap are the database's.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@fc-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-08 · each fan who scans a shared code gets their own claim", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const { CURRENT_CONSENT_VERSION } = await import("../src/domain/fan-consent");

  const T = "fc_tenant";
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
  const claim = (token: string, fanEmail?: string) =>
    call("POST", `/public/rewards/${token}/claim`, null, fanEmail ? { fanEmail, consent: { version: CURRENT_CONSENT_VERSION, purpose: "reward-delivery" } } : {});
  const redeem = (token: string) => call("POST", `/public/rewards/${token}/redeem`, null, {});
  const view = async (token: string) => (await call("GET", `/public/rewards/${token}`, null)).json;
  const fanCodes = (rewardId: string) => prisma.rewardToken.count({ where: { tenantId: T, rewardId, parentTokenId: { not: null } } });
  const fanCodesOn = (on: boolean) => { (env as { REWARD_FAN_CODES: boolean }).REWARD_FAN_CODES = on; };

  async function seed(id: string, data: Record<string, unknown> = {}) {
    await prisma.reward.create({ data: {
      id, tenantId: T, campaignId: "fc_campaign", offerText: `Offer ${id}`, terms: "t",
      expiresAt: new Date(Date.now() + 30 * 864e5), state: "ACTIVE", ...data,
    } });
    const token = `${id}-shared-xxxxxxxxxxxxxxxxxx`;
    await prisma.rewardToken.create({ data: { id: `${id}_shared`, tenantId: T, rewardId: id, token } });
    return token;
  }

  async function clean() {
    await prisma.$executeRawUnsafe(`DELETE FROM "RewardEvent" WHERE "tenantId" = $1`, T);
    await prisma.$executeRawUnsafe(`DELETE FROM "RewardToken" WHERE "tenantId" = $1 AND "parentTokenId" IS NOT NULL`, T);
    for (const t of ["OutboxJob", "AuditLog", "RewardToken", "Reward", "Campaign", "User", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Fan codes test tenant" } });
    await prisma.sponsor.create({ data: { id: "fc_sponsor", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.campaign.create({ data: { id: "fc_campaign", tenantId: T, sponsorId: "fc_sponsor", name: "Fall tacos", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2099-12-31"), state: "ACTIVE" } });
    await prisma.user.create({ data: { id: "fc_admin", tenantId: T, clerkId: "fc_admin", email: "fc_admin@fc-test.invalid", roles: ["BTG_ADMIN"] } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    fanCodesOn(false);
    server?.close();
    await clean();
  });

  it("switch off: one claim per code, as before — the second fan gets the first fan's claim", async () => {
    fanCodesOn(false);
    const shared = await seed("fc_off");
    const a = await claim(shared);
    const b = await claim(shared);
    expect(a.status, a.text).toBe(201);
    expect(b.json.id).toBe(a.json.id);
    expect(a.json.code).toBeUndefined();
    expect((await view(shared)).kind).toBe("CODE");
    expect(await fanCodes("fc_off")).toBe(0);
  });

  it("two fans on one code each get their own code, claim and redeem; the shared code shows the offer and can't be redeemed itself", async () => {
    fanCodesOn(true);
    const shared = await seed("fc_two");
    const a = await claim(shared);
    const b = await claim(shared);
    expect(a.status, a.text).toBe(201);
    expect(b.status, b.text).toBe(201);
    expect(a.json.code).toEqual(expect.any(String));
    expect(b.json.code).toEqual(expect.any(String));
    expect(b.json.code).not.toBe(a.json.code);
    expect(b.json.id).not.toBe(a.json.id);
    expect(await prisma.rewardToken.findMany({ where: { token: { in: [a.json.code, b.json.code] } }, select: { parentTokenId: true, athleteId: true } }))
      .toEqual([{ parentTokenId: "fc_two_shared", athleteId: null }, { parentTokenId: "fc_two_shared", athleteId: null }]);

    /* The shared code's page: the offer, never a fan's claim. */
    expect(await view(shared)).toMatchObject({ kind: "SHARED", state: "LIVE", claimed: false, hold: null, timesRedeemed: 0 });
    expect(await view(a.json.code)).toMatchObject({ kind: "FAN", state: "LIVE", claimed: true });
    const own = await redeem(shared);
    expect(own.status, own.text).toBe(409);
    expect(own.json.error.code).toBe("claim_first");

    /* Each fan's code redeems once; the other is untouched. */
    expect((await redeem(a.json.code)).status).toBe(201);
    expect((await view(a.json.code)).state).toBe("REDEEMED");
    expect((await view(b.json.code)).state).toBe("LIVE");
    expect((await redeem(b.json.code)).status).toBe(201);
    expect((await redeem(a.json.code)).status).toBe(409);
    /* A fan's code claimed again is their own claim, not a new code. */
    expect((await claim(b.json.code)).status).toBe(409);

    /* The desk: one printed code, with its fans' claims and redeems counted. */
    const desk = await call("GET", "/rewards/fc_two", "fc_admin");
    expect(desk.status, desk.text).toBe(200);
    expect(desk.json.tokenCount).toBe(1);
    expect(desk.json.tokens.map((t: { id: string }) => t.id)).toEqual(["fc_two_shared"]);
    expect(desk.json.funnel).toMatchObject({ CLAIM: 2, REDEEM: 2 });
    expect((await call("GET", "/rewards/fc_two/funnel", "fc_admin")).json).toMatchObject({ CLAIM: 2, REDEEM: 2 });
  });

  it("an address already used on the reward gets its own code back, and one voucher email", async () => {
    fanCodesOn(true);
    const shared = await seed("fc_email");
    const first = await claim(shared, "fan@fc-test.invalid");
    const again = await claim(shared, "FAN@fc-test.invalid");
    expect(first.status, first.text).toBe(201);
    expect(again.status, again.text).toBe(201);
    expect(again.json.code).toBe(first.json.code);
    expect(again.json.id).toBe(first.json.id);
    expect(await fanCodes("fc_email")).toBe(1);
    const mails = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } });
    const vouchers = mails.map((m) => m.payload as { template: string; data: { code: string } }).filter((m) => m.template === "reward.claimed" && m.data.code === first.json.code);
    expect(vouchers).toHaveLength(1);
    /* Another address is another fan. */
    const other = await claim(shared, "friend@fc-test.invalid");
    expect(other.json.code).not.toBe(first.json.code);
  });

  it("up to the reward's limit: each claim holds a unit; once none is left the next fan is told, and no code is left behind", async () => {
    fanCodesOn(true);
    const shared = await seed("fc_cap", { redemptionCap: 1 });
    const a = await claim(shared);
    expect(a.status, a.text).toBe(201);
    expect(a.json.heldUntil).toEqual(expect.any(String));
    expect((await view(shared)).state).toBe("EXHAUSTED");
    const b = await claim(shared);
    expect(b.status, b.text).toBe(410);
    expect(await fanCodes("fc_cap")).toBe(1);
    /* The fan who holds the unit still redeems. */
    expect((await redeem(a.json.code)).status).toBe(201);
  });
});

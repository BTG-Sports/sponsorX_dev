import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { RewardInput } from "../src/contracts/reward";
import { REWARD_ELIGIBILITIES, redemptionsLeft } from "../src/domain/reward-state";

/* --------------------------------------------------------------------------
   P6-BE-08 — reward eligibility, redemption cap and landing copy fields.

   "Eligibility, a redemption cap and landing headline/subhead persist on
   Reward; the cap is enforced race-safely at redeem; the fan page renders the
   landing copy; tenant-isolation sweep still green."

   The pure half pins the contract and the arithmetic. The seeded half goes
   through the real routes into Postgres — the race can only be proven
   against a real database, because the lock is the database's.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@limits-test.invalid` } : null;
  },
}));

const BASE = { offerText: "Free taco", terms: "One per fan", expiresAt: "2026-12-01T00:00:00.000Z" };

describe("P6-BE-08 · the contract (pure)", () => {
  it("defaults to anyone, unlimited, default page copy", () => {
    const parsed = RewardInput.parse(BASE);
    expect(parsed.eligibility).toBe("ANYONE");
    expect(parsed.redemptionCap ?? null).toBeNull();
    expect(parsed.landingHeadline ?? null).toBeNull();
  });

  it("takes a closed eligibility list — stated rules a merchant reads the same way", () => {
    expect(REWARD_ELIGIBILITIES).toEqual(["ANYONE", "AGE_18_PLUS", "AGE_21_PLUS", "TICKET_HOLDERS"]);
    expect(RewardInput.parse({ ...BASE, eligibility: "AGE_21_PLUS" }).eligibility).toBe("AGE_21_PLUS");
    expect(() => RewardInput.parse({ ...BASE, eligibility: "VIPS" })).toThrow();
  });

  it("refuses a cap nobody could redeem, or a fraction", () => {
    expect(() => RewardInput.parse({ ...BASE, redemptionCap: 0 })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, redemptionCap: -5 })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, redemptionCap: 2.5 })).toThrow();
    expect(RewardInput.parse({ ...BASE, redemptionCap: 50 }).redemptionCap).toBe(50);
    expect(RewardInput.parse({ ...BASE, redemptionCap: null }).redemptionCap).toBeNull();
  });

  it("bounds the landing copy", () => {
    expect(() => RewardInput.parse({ ...BASE, landingHeadline: "x".repeat(121) })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, landingSubhead: "x".repeat(281) })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, eligibilityNote: "x".repeat(281) })).toThrow();
  });

  it("carries no consent field — consent is versioned centrally (P6-SEC-01)", () => {
    expect(Object.keys(RewardInput.shape)).not.toContain("consentText");
    expect(Object.keys(RewardInput.shape).some((k) => /consent/i.test(k))).toBe(false);
  });

  it("redemptionsLeft: null = unlimited, never negative", () => {
    expect(redemptionsLeft(null, 999)).toBeNull();
    expect(redemptionsLeft(5, 2)).toBe(3);
    expect(redemptionsLeft(5, 5)).toBe(0);
    expect(redemptionsLeft(5, 9)).toBe(0);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P6-BE-08 · on the path a request takes", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "rl_tenant";
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
  const redeem = (token: string) => call("POST", `/public/rewards/${token}/redeem`, null);
  const view = (token: string) => call("GET", `/public/rewards/${token}`, null);

  /** A live reward with `n` tokens, each on its own fan. */
  async function reward(id: string, n: number, data: Record<string, unknown> = {}) {
    await prisma.reward.create({ data: {
      id, tenantId: T, campaignId: "rl_campaign", offerText: `Offer ${id}`, terms: "t",
      expiresAt: new Date(Date.now() + 30 * 864e5), state: "ACTIVE", ...data,
    } });
    await prisma.rewardToken.createMany({ data: Array.from({ length: n }, (_, i) => (
      { id: `${id}_tok_${i}`, tenantId: T, rewardId: id, token: `${id}-token-${i}`, athleteId: "rl_ath" }
    )) });
    return Array.from({ length: n }, (_, i) => `${id}-token-${i}`);
  }
  const redeemRows = (rewardId: string) =>
    prisma.rewardEvent.count({ where: { tenantId: T, type: "REDEEM", token: { is: { rewardId } } } });

  async function clean() {
    for (const t of ["OutboxJob", "AuditLog", "RewardEvent", "RewardToken", "Reward", "Campaign", "Athlete", "User", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Reward limits test tenant" } });
    await prisma.sponsor.create({ data: { id: "rl_sponsor", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.campaign.create({ data: { id: "rl_campaign", tenantId: T, sponsorId: "rl_sponsor", name: "Fall tacos", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"), state: "ACTIVE" } });
    await prisma.athlete.create({ data: { id: "rl_ath", tenantId: T, slug: "rl-ath", legalName: "A", displayName: "A", email: "a@rl.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.user.create({ data: { id: "rl_admin", tenantId: T, clerkId: "rl_admin", email: "admin@rl.invalid", roles: ["BTG_ADMIN"] } });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("persists eligibility, the cap and the landing copy — and reads them back", async () => {
    const created = await call("POST", "/campaigns/rl_campaign/rewards", "rl_admin", {
      ...BASE, expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      eligibility: "AGE_21_PLUS", eligibilityNote: "  Show ID at the booth ",
      redemptionCap: 50, landingHeadline: "Rosa's is buying", landingSubhead: "   ",
    });
    expect(created.status).toBe(201);
    const row = await prisma.reward.findUniqueOrThrow({
      where: { id: created.json.id },
      select: { eligibility: true, eligibilityNote: true, redemptionCap: true, landingHeadline: true, landingSubhead: true },
    });
    expect(row).toMatchObject({
      eligibility: "AGE_21_PLUS", eligibilityNote: "Show ID at the booth", redemptionCap: 50,
      landingHeadline: "Rosa's is buying",
      /* Blank is "not set", so the page falls back to its default. */
      landingSubhead: null,
    });

    const read = await call("GET", `/rewards/${created.json.id}`, "rl_admin");
    expect(read.status).toBe(200);
    expect(read.json).toMatchObject({
      eligibility: "AGE_21_PLUS", eligibilityNote: "Show ID at the booth", redemptionCap: 50,
      landing: { headline: "Rosa's is buying", subhead: null },
    });
    const list = await call("GET", "/rewards?campaignId=rl_campaign", "rl_admin");
    expect(list.json.rewards.find((r: { id: string }) => r.id === created.json.id)).toMatchObject({ redemptionCap: 50 });
  });

  it("refuses a zero cap at the route, and at the database", async () => {
    const bad = await call("POST", "/campaigns/rl_campaign/rewards", "rl_admin", { ...BASE, redemptionCap: 0 });
    expect(bad.status).toBe(400);
    await expect(prisma.reward.create({ data: {
      id: "rl_zero", tenantId: T, campaignId: "rl_campaign", offerText: "x", terms: "t", expiresAt: new Date(), redemptionCap: 0,
    } })).rejects.toThrow();
  });

  it("the fan page is given the landing copy and the eligibility line", async () => {
    const [tok] = await reward("rl_copy", 1, {
      landingHeadline: "Rosa's is buying", landingSubhead: "Your first taco is on us",
      eligibility: "TICKET_HOLDERS", eligibilityNote: "Show your wristband",
    });
    const v = await view(tok!);
    expect(v.status).toBe(200);
    expect(v.json).toMatchObject({
      state: "LIVE",
      landing: { headline: "Rosa's is buying", subhead: "Your first taco is on us" },
      eligibility: "TICKET_HOLDERS", eligibilityNote: "Show your wristband",
    });

    /* A reward written before P6-BE-08 reads as anyone, default copy. */
    const [old] = await reward("rl_plain", 1);
    expect((await view(old!)).json).toMatchObject({ eligibility: "ANYONE", eligibilityNote: null, landing: { headline: null, subhead: null } });
  });

  /* THE CLAUSE. Cap 2, one already redeemed — two booths tap the last one in
     the same instant, on two different fans' tokens (so the per-token unique
     index cannot be what decides). Exactly one wins. */
  it("two concurrent redeems at cap-1: exactly one succeeds, the other is told it ran out", async () => {
    const toks = await reward("rl_race", 3, { redemptionCap: 2 });
    expect((await redeem(toks[0]!)).status).toBe(201);

    const [a, b] = await Promise.all([redeem(toks[1]!), redeem(toks[2]!)]);
    expect([a.status, b.status].sort()).toEqual([201, 410]);
    expect(await redeemRows("rl_race")).toBe(2);
  });

  it("ten booths at once against a cap of three: exactly three REDEEM rows", async () => {
    const toks = await reward("rl_crowd", 10, { redemptionCap: 3 });
    const results = await Promise.all(toks.map(redeem));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 410)).toHaveLength(7);
    expect(await redeemRows("rl_crowd")).toBe(3);
  });

  it("once run out: the page says so, claims are refused, and a fan who redeemed still sees their ✓", async () => {
    const [winner, late] = await reward("rl_out", 2, { redemptionCap: 1 });
    expect((await view(late!)).json.state).toBe("LIVE");
    expect((await redeem(winner!)).status).toBe(201);

    expect((await view(late!)).json.state).toBe("EXHAUSTED");
    expect((await view(winner!)).json.state).toBe("REDEEMED");
    const claim = await call("POST", `/public/rewards/${late}/claim`, null, {});
    expect(claim.status).toBe(410);
    expect(claim.json.error.message).toMatch(/run out/);
  });

  it("an uncapped reward is untouched by all of this", async () => {
    const toks = await reward("rl_free", 5, { singleUse: true });
    const results = await Promise.all(toks.map(redeem));
    expect(results.every((r) => r.status === 201)).toBe(true);
    /* And single use per token still holds: the index, not the cap. */
    expect((await redeem(toks[0]!)).status).toBe(409);
  });
});

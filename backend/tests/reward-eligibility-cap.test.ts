import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P6-BE-08 — "Eligibility, a redemption cap and landing headline/subhead
   persist on Reward; the cap is enforced race-safely at redeem; the fan page
   renders the landing copy; tenant-isolation sweep still green."

   The backend half, proven here: staff create the reward through the real
   API; the fan's view (what the page renders from) and the booth's
   redemption go through the real public routes. The race is real:
   redemptions fired at the same instant against one database. The sweep is
   tests/tenant-isolation.test.ts, green. Rendering the copy on the fan page
   is frontend work, tracked separately.

   MERGED DESIGN (2026-09-28): this file came with rcfworks' P6-BE-08; the
   same task was built in parallel (with claim holds, QA pass 5). The merge
   keeps both proofs. Eligibility is now the RewardEligibility enum with the
   free text beside it as `eligibilityNote`; a spent cap is 410 (distinct
   from 409 "already used") and still carries kind REDEMPTION_CAP.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@cap-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P6-BE-08 · reward eligibility, cap and landing copy", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const T = "cap_tenant";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    await prisma.$executeRawUnsafe(`DELETE FROM "RewardEvent" WHERE "tenantId" = $1`, T);
    for (const t of ["RewardToken", "Reward", "AuditLog", "OutboxJob", "Campaign", "User", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  /** A reward made through the API, activated, with `n` tokens. */
  async function reward(body: Record<string, unknown>, n: number) {
    const made = await call("POST", "/campaigns/cap_campaign/rewards", "cap_admin", {
      offerText: "Free taco", terms: "While stocks last", expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(), ...body,
    });
    expect(made.status, made.text).toBe(201);
    await call("POST", `/rewards/${made.json.id}/transition`, "cap_admin", { to: "ACTIVE" });
    const tokens: string[] = [];
    for (let i = 0; i < n; i++) tokens.push((await call("POST", `/rewards/${made.json.id}/tokens`, "cap_admin", {})).json.token);
    return { id: made.json.id as string, tokens };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Cap tenant" } });
    await prisma.sponsor.create({ data: { id: "cap_sponsor", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.user.create({ data: { id: "cap_admin", tenantId: T, clerkId: "cap_admin", email: "cap_admin@cap-test.invalid", roles: ["BTG_ADMIN"] } });
    await prisma.campaign.create({ data: { id: "cap_campaign", tenantId: T, sponsorId: "cap_sponsor", name: "Tacos", budget: 100_000, startDate: new Date(), endDate: new Date(Date.now() + 60 * 864e5), state: "ACTIVE" } });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("eligibility, a cap and the landing copy persist on the reward, and reach the fan's view", async () => {
    const { id, tokens } = await reward({
      eligibility: "AGE_18_PLUS", eligibilityNote: "one per fan · stand 12 only", redemptionCap: 50,
      landingHeadline: "Taco Tuesday at the Dome", landingSubhead: "Show this screen at stand 12 before halftime",
    }, 1);
    expect(await prisma.reward.findUniqueOrThrow({ where: { id }, select: { eligibility: true, eligibilityNote: true, redemptionCap: true, redemptionCount: true, landingHeadline: true, landingSubhead: true } }))
      .toEqual({ eligibility: "AGE_18_PLUS", eligibilityNote: "one per fan · stand 12 only", redemptionCap: 50, redemptionCount: 0, landingHeadline: "Taco Tuesday at the Dome", landingSubhead: "Show this screen at stand 12 before halftime" });
    const view = (await call("GET", `/public/rewards/${tokens[0]}`)).json;
    expect(view).toMatchObject({
      state: "LIVE", eligibility: "AGE_18_PLUS", eligibilityNote: "one per fan · stand 12 only", capReached: false,
      landing: { headline: "Taco Tuesday at the Dome", subhead: "Show this screen at stand 12 before halftime" },
    });
    /* Consent wording is central and versioned, never per reward. */
    expect(view.consent.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await call("POST", "/campaigns/cap_campaign/rewards", "cap_admin", { offerText: "x", terms: "y", expiresAt: new Date(Date.now() + 864e5).toISOString(), redemptionCap: 0 })).status).toBe(400);
  });

  it("the cap holds under a race — eight booths at once for three redemptions", async () => {
    const { id, tokens } = await reward({ singleUse: false, redemptionCap: 3 }, 8);
    const results = await Promise.all(tokens.map((t) => call("POST", `/public/rewards/${t}/redeem`)));
    const ok = results.filter((r) => r.status < 300);
    const capped = results.filter((r) => r.status === 410);
    expect(ok).toHaveLength(3);
    expect(capped).toHaveLength(5);
    for (const r of capped) expect(r.json.error.kind).toBe("REDEMPTION_CAP");
    expect((await prisma.reward.findUniqueOrThrow({ where: { id }, select: { redemptionCount: true } })).redemptionCount).toBe(3);
    /* Every refusal rolled back its event: three REDEEM rows, not eight. */
    expect(await prisma.rewardEvent.count({ where: { tenantId: T, type: "REDEEM", token: { rewardId: id } } })).toBe(3);
    expect((await call("GET", `/public/rewards/${tokens[0]}`)).json.capReached).toBe(true);
    /* And the database will not hold a count past the cap, whoever writes it. */
    await expect(prisma.$executeRawUnsafe(`UPDATE "Reward" SET "redemptionCount" = 4 WHERE id = $1`, id)).rejects.toThrow(/Reward_redemption_cap/);
  });

  it("a used code is still 'already used', not 'capped'; an uncapped reward is unlimited", async () => {
    const single = await reward({ redemptionCap: 10 }, 1);
    expect((await call("POST", `/public/rewards/${single.tokens[0]}/redeem`)).status).toBeLessThan(300);
    const again = await call("POST", `/public/rewards/${single.tokens[0]}/redeem`);
    expect(again.status).toBe(409);
    expect(again.json.error.kind).toBeUndefined();
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: single.id }, select: { redemptionCount: true } })).redemptionCount).toBe(1);

    const open = await reward({ singleUse: false }, 4);
    const all = await Promise.all(open.tokens.map((t) => call("POST", `/public/rewards/${t}/redeem`)));
    expect(all.every((r) => r.status < 300)).toBe(true);
    expect((await call("GET", `/public/rewards/${open.tokens[0]}`)).json).toMatchObject({ capReached: false, eligibility: "ANYONE", eligibilityNote: null, landing: { headline: null, subhead: null } });
  });
});

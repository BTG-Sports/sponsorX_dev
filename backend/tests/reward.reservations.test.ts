import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { RewardInput } from "../src/contracts/reward";

/* --------------------------------------------------------------------------
   QA pass 5 fixes on the reward redeem / claim path (2026-09-28).

   - QA-01  a capped-redeem burst must not exhaust the pool: the cap is decided
            by ONE database call (`reward_redeem`), so no pooled connection
            waits on a row lock across client round trips.
   - QA-02  state and expiry are re-read AFTER the lock — a reward paused or
            expired while a redeem waited is refused.
   - QA-04  multi-use rewards redeem more than once per token, up to the cap.
   - QA-06  an already-redeemed single-use code says "already used" (409)
            even once the cap is spent.
   - QA-09  a claim on a capped reward RESERVES a unit until
            claimedAt + reserveMinutes (user decision, 2026-09-28).
   - QA-07  invisible-only copy is "not set" / refused.
   - F-09   an already-past expiry is refused at create, and an expired
            reward cannot go live.

   Everything here runs against real Postgres: the race and the lock are the
   database's, and a mock would only prove the mock.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@resv-test.invalid` } : null;
  },
}));

const BASE = { offerText: "Free taco", terms: "One per fan", expiresAt: "2099-12-01T00:00:00.000Z" };

describe("reserveMinutes and invisible copy · the contract (pure)", () => {
  it("defaults the hold window to an hour and bounds it 5 min – 7 days", () => {
    expect(RewardInput.parse(BASE).reserveMinutes).toBe(60);
    expect(RewardInput.parse({ ...BASE, reserveMinutes: 15 }).reserveMinutes).toBe(15);
    expect(RewardInput.parse({ ...BASE, reserveMinutes: 10080 }).reserveMinutes).toBe(10080);
    expect(() => RewardInput.parse({ ...BASE, reserveMinutes: 4 })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, reserveMinutes: 10081 })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, reserveMinutes: 7.5 })).toThrow();
  });

  it("refuses an offer or terms that are only whitespace or invisible characters (QA-07)", () => {
    expect(() => RewardInput.parse({ ...BASE, offerText: "​​" })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, offerText: " ⁠﻿ " })).toThrow();
    expect(() => RewardInput.parse({ ...BASE, terms: "‌‍" })).toThrow();
    /* An emoji ZWJ sequence is real text and must survive. */
    expect(RewardInput.parse({ ...BASE, offerText: "Family pass 👨‍👩‍👧" }).offerText).toContain("‍");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("reward redeem and claim · against real Postgres", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const reward = await import("../src/domain/reward");
  const pg = (await import("pg")).default;

  const T = "rv_tenant";
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

  /** Status of one domain call, as the route would answer it. */
  const statusOf = (p: Promise<unknown>) =>
    p.then(() => 201, (e: { status?: number }) => e?.status ?? 500);

  async function seed(id: string, n: number, data: Record<string, unknown> = {}) {
    await prisma.reward.create({ data: {
      id, tenantId: T, campaignId: "rv_campaign", offerText: `Offer ${id}`, terms: "t",
      expiresAt: new Date(Date.now() + 30 * 864e5), state: "ACTIVE", ...data,
    } });
    await prisma.rewardToken.createMany({ data: Array.from({ length: n }, (_, i) => (
      { id: `${id}_tok_${i}`, tenantId: T, rewardId: id, token: `${id}-token-${i}` }
    )) });
    return Array.from({ length: n }, (_, i) => `${id}-token-${i}`);
  }
  const redeemRows = (rewardId: string) =>
    prisma.rewardEvent.count({ where: { tenantId: T, type: "REDEEM", token: { is: { rewardId } } } });

  async function clean() {
    for (const t of ["OutboxJob", "AuditLog", "RewardEvent", "RewardToken", "Reward", "Campaign", "User", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Reward reservations test tenant" } });
    await prisma.sponsor.create({ data: { id: "rv_sponsor", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.campaign.create({ data: { id: "rv_campaign", tenantId: T, sponsorId: "rv_sponsor", name: "Fall tacos", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2099-12-31"), state: "ACTIVE" } });
    await prisma.user.create({ data: { id: "rv_admin", tenantId: T, clerkId: "rv_admin", email: "admin@rv.invalid", roles: ["BTG_ADMIN"] } });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── QA-01 ─────────────────────────────────────────────────────────────── */

  it("QA-01: 600 parallel redeems at cap 100 — exactly 100, no 500s, and an unrelated reward is untouched", async () => {
    const capped = await seed("rv_storm", 600, { redemptionCap: 100 });
    const other = await seed("rv_bystander", 30);
    const [a, b] = await Promise.all([
      Promise.all(capped.map((t) => statusOf(reward.redeemToken(t)))),
      Promise.all(other.map((t) => statusOf(reward.redeemToken(t)))),
    ]);
    const tally = (xs: number[]) => xs.reduce<Record<number, number>>((m, s) => ((m[s] = (m[s] ?? 0) + 1), m), {});
    expect(tally(a)).toEqual({ 201: 100, 410: 500 });
    expect(tally(b)).toEqual({ 201: 30 });
    expect(await redeemRows("rv_storm")).toBe(100);
    /* The counter the cap reads agrees with the rows. */
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: "rv_storm" }, select: { redemptionCount: true } })).redemptionCount).toBe(100);
  }, 60_000);

  /* ── QA-02 ─────────────────────────────────────────────────────────────── */

  /* "expiresAt" is TIMESTAMP(3) WITHOUT TIME ZONE holding UTC wall-clock time
     (Prisma's convention, and the `p_now` the function compares it with is
     UTC too). Bare `now()` written into it lands as the SESSION's local wall
     clock: on a box whose Postgres runs Asia/Manila (+08) that put the expiry
     ~8 h in the future, so the redeem rightly went through (201) and this test
     failed every run while passing on a UTC server. `now() AT TIME ZONE 'UTC'`
     is the expiry the test means on any server (QA-02, 2026-10-02). */
  for (const [label, change] of [
    ["paused", `UPDATE "Reward" SET state = 'PAUSED' WHERE id = $1`],
    ["expired", `UPDATE "Reward" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = $1`],
  ] as const) {
    it(`QA-02: a redeem waiting on the lock while the reward is ${label} is refused, and writes nothing`, async () => {
      const id = `rv_wait_${label}`;
      const [tok] = await seed(id, 1, { redemptionCap: 5 });
      const c = new pg.Client({ connectionString: seededDb.TEST_DATABASE_URL });
      await c.connect();
      try {
        await c.query("BEGIN");
        await c.query(`SELECT 1 FROM "Reward" WHERE id = $1 FOR UPDATE`, [id]);
        const pending = statusOf(reward.redeemToken(tok!));
        await new Promise((r) => setTimeout(r, 300)); // the redeem is now queued on the lock
        await c.query(change, [id]);
        await c.query("COMMIT");
        expect(await pending).toBe(409);
      } finally {
        await c.end();
      }
      expect(await redeemRows(id)).toBe(0);
    });
  }

  it("QA-01: a row lock held too long fails fast — 503, not a hang, and nothing written", async () => {
    const [tok] = await seed("rv_stuck", 1, { redemptionCap: 5 });
    const c = new pg.Client({ connectionString: seededDb.TEST_DATABASE_URL });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT 1 FROM "Reward" WHERE id = $1 FOR UPDATE`, ["rv_stuck"]);
      const t0 = Date.now();
      await expect(reward.redeemToken(tok!)).rejects.toMatchObject({ status: 503, retryAfter: 2 });
      expect(Date.now() - t0).toBeLessThan(6000);
      await c.query("ROLLBACK");
    } finally {
      await c.end();
    }
    expect(await redeemRows("rv_stuck")).toBe(0);
  }, 15_000);

  /* ── QA-04 / QA-06 ─────────────────────────────────────────────────────── */

  it("QA-04: a multi-use token redeems up to the cap — 201, 201, 201, then 410", async () => {
    const [tok] = await seed("rv_multi", 1, { singleUse: false, redemptionCap: 3 });
    const out: number[] = [];
    for (let i = 0; i < 4; i++) out.push(await statusOf(reward.redeemToken(tok!)));
    expect(out).toEqual([201, 201, 201, 410]);
    expect(await redeemRows("rv_multi")).toBe(3);
    const v = await reward.viewToken(tok!);
    expect(v).toMatchObject({ state: "EXHAUSTED", timesRedeemed: 3, singleUse: false });
  });

  it("QA-04: an uncapped multi-use token keeps redeeming, and the page stays redeemable", async () => {
    const [tok] = await seed("rv_multi_free", 1, { singleUse: false });
    const out = await Promise.all(Array.from({ length: 5 }, () => statusOf(reward.redeemToken(tok!))));
    expect(out).toEqual([201, 201, 201, 201, 201]);
    expect(await reward.viewToken(tok!)).toMatchObject({ state: "LIVE", timesRedeemed: 5 });
  });

  it("QA-04: single use still holds per token — concurrently, and at the database", async () => {
    const [tok] = await seed("rv_single", 1);
    const out = await Promise.all(Array.from({ length: 10 }, () => statusOf(reward.redeemToken(tok!))));
    expect(out.filter((s) => s === 201)).toHaveLength(1);
    expect(out.filter((s) => s === 409)).toHaveLength(9);
    /* The index is the backstop: a second REDEEM row for a single-use token
       is refused by Postgres even from a path that skips the function. */
    await expect(prisma.rewardEvent.create({ data: { tenantId: T, tokenId: "rv_single_tok_0", type: "REDEEM", singleUse: true } })).rejects.toThrow();
  });

  it("QA-06: an already-used code says 'already used' (409) even when the cap is spent", async () => {
    const [a, b] = await seed("rv_used", 2, { redemptionCap: 1 });
    expect(await statusOf(reward.redeemToken(a!))).toBe(201);
    expect(await statusOf(reward.redeemToken(a!))).toBe(409);
    expect(await statusOf(reward.redeemToken(b!))).toBe(410);
  });

  /* ── QA-09 · a claim reserves a unit ───────────────────────────────────── */

  it("QA-09: a claim holds a unit — others are refused while it's held, the holder always redeems", async () => {
    const [a, b, c] = await seed("rv_hold", 3, { redemptionCap: 2, reserveMinutes: 15 });
    const now = new Date();
    const held = await reward.recordClaim(a!, null, now);
    expect(held.heldUntil).toBe(new Date(now.getTime() + 15 * 60_000).toISOString());
    await reward.recordClaim(b!);
    /* Two units, two holds: a third claim and an unheld redeem are refused. */
    await expect(reward.recordClaim(c!)).rejects.toMatchObject({ status: 410 });
    expect(await statusOf(reward.redeemToken(c!))).toBe(410);
    /* The holders redeem, whatever else happened. */
    expect(await statusOf(reward.redeemToken(a!))).toBe(201);
    expect(await statusOf(reward.redeemToken(b!))).toBe(201);
    expect(await redeemRows("rv_hold")).toBe(2);

    const v = await reward.viewToken(c!);
    expect(v.state).toBe("EXHAUSTED");
  });

  it("QA-09: re-claiming keeps the original hold rather than extending it", async () => {
    const [a] = await seed("rv_reclaim", 1, { redemptionCap: 5, reserveMinutes: 30 });
    const first = await reward.recordClaim(a!, null, new Date());
    const again = await reward.recordClaim(a!, null, new Date(Date.now() + 60_000));
    expect(again.heldUntil).toBe(first.heldUntil);
  });

  it("QA-09: an expired hold frees the unit — the lapsed fan still redeems if units remain", async () => {
    const [a, b] = await seed("rv_lapse", 2, { redemptionCap: 1, reserveMinutes: 5 });
    await reward.recordClaim(a!);
    expect(await statusOf(reward.redeemToken(b!))).toBe(410);
    await prisma.rewardToken.update({ where: { id: "rv_lapse_tok_0" }, data: { reservedUntil: new Date(Date.now() - 1000) } });

    const lapsed = await reward.viewToken(a!);
    expect(lapsed).toMatchObject({ state: "LIVE", claimed: true, hold: { active: false } });
    /* Unit free again: whoever redeems first gets it. */
    expect(await statusOf(reward.redeemToken(b!))).toBe(201);
    expect(await statusOf(reward.redeemToken(a!))).toBe(410);
    expect((await reward.viewToken(a!)).state).toBe("EXHAUSTED");
  });

  it("QA-09: 50 concurrent claims at cap 10 — exactly 10 holds", async () => {
    const toks = await seed("rv_claimrace", 50, { redemptionCap: 10 });
    const out = await Promise.all(toks.map((t) => statusOf(reward.recordClaim(t))));
    expect(out.filter((s) => s === 201)).toHaveLength(10);
    expect(out.filter((s) => s === 410)).toHaveLength(40);
    expect(await prisma.rewardToken.count({ where: { rewardId: "rv_claimrace", reservedUntil: { gt: new Date() } } })).toBe(10);
  });

  it("QA-09: a hold never outlives the reward, and an uncapped claim holds nothing", async () => {
    const soon = new Date(Date.now() + 10 * 60_000);
    const [a] = await seed("rv_short", 1, { redemptionCap: 3, reserveMinutes: 60, expiresAt: soon });
    expect((await reward.recordClaim(a!)).heldUntil).toBe(soon.toISOString());
    const [u] = await seed("rv_nocap", 1);
    expect((await reward.recordClaim(u!)).heldUntil).toBeNull();
    expect((await reward.viewToken(u!))).toMatchObject({ state: "LIVE", hold: null });
  });

  it("the view says when this token was last redeemed (for the fan page's flash check)", async () => {
    const [a] = await seed("rv_when", 1);
    expect((await reward.viewToken(a!))).toMatchObject({ lastRedeemedAt: null });
    await reward.redeemToken(a!);
    const v = await reward.viewToken(a!);
    expect(v.state).toBe("REDEEMED");
    if (v.state === "UNKNOWN") throw new Error("unreachable");
    expect(Date.now() - new Date(v.lastRedeemedAt!).getTime()).toBeLessThan(10_000);
  });

  /* ── create-time rules: F-09, QA-07, reserveMinutes ────────────────────── */

  it("F-09: an expiry already past is refused at create", async () => {
    const r = await call("POST", "/campaigns/rv_campaign/rewards", "rv_admin", { ...BASE, expiresAt: new Date(Date.now() - 60_000).toISOString() });
    expect(r.status).toBe(400);
    expect(r.json.error.message).toMatch(/past/i);
  });

  it("F-09: an expired draft cannot go live", async () => {
    await seed("rv_stale", 0, { state: "DRAFT", expiresAt: new Date(Date.now() - 60_000) });
    const r = await call("POST", "/rewards/rv_stale/transition", "rv_admin", { to: "ACTIVE" });
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/expiry has passed/i);
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: "rv_stale" }, select: { state: true } })).state).toBe("DRAFT");
  });

  it("QA-07 + reserveMinutes: invisible-only copy is stored as not set; the hold window persists", async () => {
    const created = await call("POST", "/campaigns/rv_campaign/rewards", "rv_admin", {
      ...BASE, landingHeadline: "​​", landingSubhead: " ﻿ ", eligibilityNote: "⁠", reserveMinutes: 1440,
    });
    expect(created.status).toBe(201);
    const row = await prisma.reward.findUniqueOrThrow({
      where: { id: created.json.id },
      select: { landingHeadline: true, landingSubhead: true, eligibilityNote: true, reserveMinutes: true },
    });
    expect(row).toMatchObject({ landingHeadline: null, landingSubhead: null, eligibilityNote: null, reserveMinutes: 1440 });
    const read = await call("GET", `/rewards/${created.json.id}`, "rv_admin");
    /* Uncapped: no counter to show (it is kept for capped rewards only). */
    expect(read.json).toMatchObject({ reserveMinutes: 1440, redeemed: null, held: 0 });
  });

  it("the desk's read carries redeemed and held counts", async () => {
    const [a, b, c] = await seed("rv_desk", 3, { redemptionCap: 50 });
    await reward.recordClaim(a!);
    await reward.recordClaim(b!);
    await reward.redeemToken(c!);
    const list = await call("GET", "/rewards?campaignId=rv_campaign", "rv_admin");
    expect(list.json.rewards.find((r: { id: string }) => r.id === "rv_desk")).toMatchObject({ redemptionCap: 50, redeemed: 1, held: 2 });
  });
});

import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   QA pass 6 fixes (2026-09-28).

   - P6-BE-01  an ATHLETE reads only the rewards they hold a token on, only
               their own token's events, and no reward-wide counts.
   - P6-BE-02  a token is issued only for an athlete signed onto the reward's
               campaign, in the reward's tenant — one 422 for foreign,
               unsigned and non-existent alike (no oracle), never a 500.
   - P6-BE-03  a public token / code that cannot be one (NUL, non-base64url,
               overlong) is 404 before Postgres is asked.
   - P6-BE-04  a Prisma FK violation is 422, a unique violation 409 — generic,
               no constraint name.
   - P6-BE-05  public and auth refusals carry stable codes.
   - P6-BE-06  the busy 503 keeps its allowlisted `busy` code.
   - P6-BE-07  zero-width-only required fields are missing / refused.
   - P6-BE-08  a birthDate in the future is refused at intake.
   - Info      a claim on a used single-use code is refused and writes
               nothing; repeated claims on one token write one CLAIM.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";

vi.mock("../src/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../src/lib/rate-limit")>()),
  limit: async () => {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@q6-test.invalid` } : null;
  },
}));

const { errorBody } = await import("../src/lib/error-body");
const { whereFor, MATCHES_NOTHING } = await import("../src/auth/scope");
const errors = await import("../src/auth/errors");
const rewardErrors = await import("../src/domain/reward");
const { isOpaqueToken } = await import("../src/lib/opaque-token");
const { AthleteApplicationInput, missingApplicationFields } = await import("../src/contracts/athlete");

const actor = (roles: Role[], ids: Partial<Actor> = {}): Actor => ({
  userId: "u", tenantId: "t1", roles,
  sponsorId: null, athleteId: null, guardianId: null, ...ids,
} as Actor);

/* ── pure ────────────────────────────────────────────────────────────────── */

describe("P6-BE-01 · reward and rewardEvent scope (pure)", () => {
  it("an athlete reaches only rewards they hold a token on", () => {
    expect(whereFor(actor(["ATHLETE"], { athleteId: "ath_me" }), "reward", "read"))
      .toEqual({ AND: [{ tenantId: "t1", tokens: { some: { athleteId: "ath_me" } } }] });
  });
  it("an athlete reaches only their own token's events", () => {
    expect(whereFor(actor(["ATHLETE"], { athleteId: "ath_me" }), "rewardEvent", "read"))
      .toEqual({ AND: [{ tenantId: "t1", token: { is: { athleteId: "ath_me" } } }] });
  });
  it("an athlete with no athlete row reaches nothing", () => {
    expect(whereFor(actor(["ATHLETE"]), "reward", "read")).toEqual({ AND: [MATCHES_NOTHING] });
    expect(whereFor(actor(["ATHLETE"]), "rewardEvent", "read")).toEqual({ AND: [MATCHES_NOTHING] });
  });
  it("a guardian reaches only their wards' rewards", () => {
    expect(whereFor(actor(["GUARDIAN"], { guardianId: "g1" }), "reward", "read"))
      .toEqual({ AND: [{ tenantId: "t1", tokens: { some: { athlete: { is: { guardianId: "g1" } } } } }] });
  });
  it("BTG and the sponsor keep their reach", () => {
    expect(whereFor(actor(["BTG_ADMIN"]), "reward", "read")).toEqual({ AND: [{ tenantId: "t1" }] });
    expect(whereFor(actor(["SPONSOR_ADMIN"], { sponsorId: "s1" }), "reward", "read"))
      .toEqual({ AND: [{ tenantId: "t1", campaign: { is: { sponsorId: "s1" } } }] });
    expect(whereFor(actor(["SPONSOR_ADMIN"], { sponsorId: "s1" }), "rewardEvent", "read"))
      .toEqual({ AND: [{ token: { is: { reward: { is: { tenantId: "t1", campaign: { is: { sponsorId: "s1" } } } } } } }] });
  });
});

describe("P6-BE-03 · the shape of a public token (pure)", () => {
  it("accepts base64url of a sane length, refuses the rest", () => {
    expect(isOpaqueToken("AbC-_09xyz")).toBe(true);
    for (const bad of ["", "\0abc", "a\0", "' OR 1=1--", "..%2F", "ünï", "a".repeat(129), "a b"]) {
      expect(isOpaqueToken(bad)).toBe(false);
    }
  });
});

describe("P6-BE-04 / P6-BE-06 · error-body mapping (pure)", () => {
  const prismaErr = (code: string, meta: Record<string, unknown> = {}) =>
    Object.assign(new Error(`Foreign key constraint violated on the constraint: \`RewardToken_athleteId_fkey\` ${code}`), { code, meta, clientVersion: "7" });

  it("a Prisma FK violation (P2003) is a generic 422, naming no constraint", () => {
    const { status, body, reference } = errorBody(prismaErr("P2003", { field_name: "RewardToken_athleteId_fkey" }));
    expect(status).toBe(422);
    expect(reference).toBeNull();
    expect(body.error.code).toBe("invalid_reference");
    expect(JSON.stringify(body)).not.toMatch(/constraint|fkey|P20\d\d|athleteId/i);
  });
  it("a raw-query FK violation (23503 through P2010) is the same 422", () => {
    const e = prismaErr("P2010", { driverAdapterError: { cause: { originalCode: "23503" } } });
    expect(errorBody(e).status).toBe(422);
  });
  it("a unique violation (P2002) is a generic 409", () => {
    const { status, body } = errorBody(prismaErr("P2002", { target: ["token"] }));
    expect(status).toBe(409);
    expect(body.error.code).toBe("conflict");
    expect(JSON.stringify(body)).not.toMatch(/constraint|token|P20\d\d/i);
  });
  it("a 503 keeps an allowlisted code, never its message", () => {
    const { status, body, headers } = errorBody(new rewardErrors.RewardServiceBusyError());
    expect(status).toBe(503);
    expect(body.error.code).toBe("busy");
    expect(body.error.message).not.toMatch(/reward service/i);
    expect(headers["Retry-After"]).toBe("2");
  });
  it("a 5xx with a code off the allowlist is still internal_error", () => {
    expect(errorBody(Object.assign(new Error("x"), { status: 500, code: "ECONNREFUSED" })).body.error.code).toBe("internal_error");
  });
});

describe("P6-BE-05 · stable codes (pure)", () => {
  it.each([
    [new errors.UnauthenticatedError(), 401, "unauthenticated"],
    [new errors.UnprovisionedError(null), 403, "unprovisioned"],
    [new errors.ForbiddenError("reward", "read"), 403, "forbidden"],
    [new rewardErrors.UnknownTokenError(), 404, "unknown_token"],
    [new rewardErrors.RewardNotLiveError("PAUSED"), 409, "reward_not_live"],
    [new rewardErrors.RewardExpiredError(), 409, "reward_expired"],
    [new rewardErrors.AlreadyRedeemedError(), 409, "already_redeemed"],
    [new rewardErrors.RewardExhaustedError(), 410, "reward_exhausted"],
  ] as const)("%s → %i %s", (err, status, code) => {
    const out = errorBody(err);
    expect(out.status).toBe(status);
    expect(out.body.error.code).toBe(code);
  });
  it("the cap refusal keeps its kind", () => {
    expect(errorBody(new rewardErrors.RewardExhaustedError()).body.error.kind).toBe("REDEMPTION_CAP");
  });
});

describe("P6-BE-07 / P6-BE-08 · intake and activation completeness (pure)", () => {
  const ok = {
    legalName: "Maya Okonkwo", displayName: "Maya", email: "maya@example.com",
    stateCode: "MD", sport: "Basketball", birthDate: "2004-05-01",
  };
  it("counts a zero-width-only field as missing for activation", () => {
    expect(missingApplicationFields({ ...ok, legalName: "​​" })).toEqual(["legalName"]);
    expect(missingApplicationFields({ ...ok, sport: " ⁠﻿ " })).toEqual(["sport"]);
    expect(missingApplicationFields(ok)).toEqual([]);
  });
  it("intake refuses a required field that is only invisible characters", () => {
    for (const k of ["legalName", "displayName", "sport", "stateCode"] as const) {
      const r = AthleteApplicationInput.safeParse({ ...ok, [k]: "​‌" });
      expect(r.success, k).toBe(false);
    }
    /* A real name with a joiner inside stays valid. */
    expect(AthleteApplicationInput.safeParse({ ...ok, displayName: "Maya 👩‍🦱" }).success).toBe(true);
  });
  it("intake refuses a birthDate after today, and accepts today", () => {
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    expect(AthleteApplicationInput.safeParse({ ...ok, birthDate: tomorrow }).success).toBe(false);
    expect(AthleteApplicationInput.safeParse({ ...ok, birthDate: "2999-01-01" }).success).toBe(false);
    expect(AthleteApplicationInput.safeParse({ ...ok, birthDate: today }).success).toBe(true);
  });
});

/* ── against real Postgres ───────────────────────────────────────────────── */

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("QA pass 6 · against real Postgres", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const reward = await import("../src/domain/reward");

  const TA = "q6_tenant_a";
  const TB = "q6_tenant_b";
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
  const statusOf = (p: Promise<unknown>) => p.then(() => 201, (e: { status?: number }) => e?.status ?? 500);

  async function clean() {
    for (const t of [TA, TB]) {
      for (const m of ["OutboxJob", "AuditLog", "RewardEvent", "RewardToken", "Reward", "CampaignOrder", "Campaign", "User", "Athlete", "NilJob", "Sponsor"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${m}" WHERE "tenantId" = $1`, t);
      }
      await prisma.tenant.deleteMany({ where: { id: t } });
    }
  }

  const athleteRow = (id: string, tenantId: string) => ({
    id, tenantId, slug: id, legalName: `Legal ${id}`, displayName: `Name ${id}`, sport: "Soccer", state: "ACTIVE" as const,
  });
  const orderRow = (id: string, athleteId: string, state: "ACCEPTED" | "SENT") => ({
    id, tenantId: TA, campaignId: "q6_cmp", athleteId, jobId: "q6_job", compensation: 10_000, sellPrice: 20_000,
    usageRights: "organic", dueDate: new Date("2099-01-01"), state,
  });
  async function seedReward(id: string, tokens: { id: string; athleteId: string | null }[], data: Record<string, unknown> = {}) {
    await prisma.reward.create({ data: {
      id, tenantId: TA, campaignId: "q6_cmp", offerText: `Offer ${id}`, terms: "t",
      expiresAt: new Date(Date.now() + 30 * 864e5), state: "ACTIVE", ...data,
    } });
    for (const t of tokens) {
      await prisma.rewardToken.create({ data: { id: t.id, tenantId: TA, rewardId: id, athleteId: t.athleteId, token: `${t.id}-tok` } });
    }
  }
  const events = (tokenId: string, type: "SCAN" | "CLAIM" | "REDEEM", n: number) =>
    prisma.rewardEvent.createMany({ data: Array.from({ length: n }, () => ({ tenantId: TA, tokenId, type, ...(type === "REDEEM" ? { singleUse: false } : {}) })) });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: TA, name: "QA6 tenant A" } });
    await prisma.tenant.create({ data: { id: TB, name: "QA6 tenant B" } });
    await prisma.sponsor.create({ data: { id: "q6_sponsor", tenantId: TA, name: "Rosa's" } });
    await prisma.campaign.create({ data: { id: "q6_cmp", tenantId: TA, sponsorId: "q6_sponsor", name: "Fall", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2099-12-31"), state: "ACTIVE" } });
    await prisma.nilJob.create({ data: { id: "q6_job", tenantId: TA, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.athlete.createMany({ data: [athleteRow("q6_ath_me", TA), athleteRow("q6_ath_other", TA), athleteRow("q6_ath_unsigned", TA), athleteRow("q6_ath_b", TB)] });
    await prisma.campaignOrder.createMany({ data: [orderRow("q6_ord_me", "q6_ath_me", "ACCEPTED"), orderRow("q6_ord_other", "q6_ath_other", "ACCEPTED"), orderRow("q6_ord_unsigned", "q6_ath_unsigned", "SENT")] });
    await prisma.user.createMany({ data: [
      { id: "q6_admin", tenantId: TA, clerkId: "q6_admin", email: "admin@q6.invalid", roles: ["BTG_ADMIN"] },
      { id: "q6_athlete", tenantId: TA, clerkId: "q6_athlete", email: "ath@q6.invalid", roles: ["ATHLETE"], athleteId: "q6_ath_me" },
      { id: "q6_loner", tenantId: TA, clerkId: "q6_loner", email: "loner@q6.invalid", roles: ["ATHLETE"], athleteId: "q6_ath_unsigned" },
      { id: "q6_spn", tenantId: TA, clerkId: "q6_spn", email: "spn@q6.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "q6_sponsor" },
    ] });

    /* q6_rw_shared: my token and another athlete's. q6_rw_theirs: not mine. */
    await seedReward("q6_rw_shared", [{ id: "q6_tk_me", athleteId: "q6_ath_me" }, { id: "q6_tk_other", athleteId: "q6_ath_other" }], { redemptionCap: 100, singleUse: false });
    await seedReward("q6_rw_theirs", [{ id: "q6_tk_theirs", athleteId: "q6_ath_other" }]);
    await events("q6_tk_me", "SCAN", 2);
    await events("q6_tk_other", "SCAN", 7);
    await events("q6_tk_other", "REDEEM", 3);

    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── P6-BE-01 ─────────────────────────────────────────────────────────── */

  it("P6-BE-01: an athlete lists only rewards they hold a token on, with only their own events and no reward-wide counts", async () => {
    const r = await call("GET", "/rewards?campaignId=q6_cmp", "q6_athlete");
    expect(r.status).toBe(200);
    const ids = r.json.rewards.map((x: { id: string }) => x.id);
    expect(ids).toEqual(["q6_rw_shared"]);
    const [shared] = r.json.rewards;
    expect(shared.funnel).toEqual({ SCAN: 2, LANDING: 0, CLAIM: 0, REDEEM: 0 });
    expect(shared.redeemed).toBeNull();
    expect(shared.held).toBeNull();
    expect(shared).toMatchObject({ athletes: 1, tokenCount: 1 });
  });

  it("P6-BE-01: an athlete's single read shows only their own token; another's reward is refused", async () => {
    const one = await call("GET", "/rewards/q6_rw_shared", "q6_athlete");
    expect(one.status).toBe(200);
    expect(one.json.tokens.map((t: { id: string }) => t.id)).toEqual(["q6_tk_me"]);
    expect(one.text).not.toContain("q6_ath_other");
    expect(one.json.funnel).toEqual({ SCAN: 2, LANDING: 0, CLAIM: 0, REDEEM: 0 });
    expect(one.json.redeemed).toBeNull();
    expect((await call("GET", "/rewards/q6_rw_theirs", "q6_athlete")).status).toBe(403);
    const f = await call("GET", "/rewards/q6_rw_shared/funnel", "q6_athlete");
    expect(f.json).toEqual({ SCAN: 2, LANDING: 0, CLAIM: 0, REDEEM: 0 });
    expect((await call("GET", "/rewards/q6_rw_theirs/funnel", "q6_athlete")).status).toBe(403);
  });

  it("P6-BE-01: an athlete with no token sees no rewards at all", async () => {
    const r = await call("GET", "/rewards", "q6_loner");
    expect(r.json.rewards).toEqual([]);
  });

  it("P6-BE-01: BTG and the sponsor keep the whole reward", async () => {
    const admin = await call("GET", "/rewards?campaignId=q6_cmp", "q6_admin");
    const shared = admin.json.rewards.find((x: { id: string }) => x.id === "q6_rw_shared");
    expect(shared.funnel).toEqual({ SCAN: 9, LANDING: 0, CLAIM: 0, REDEEM: 3 });
    expect(shared).toMatchObject({ redeemed: 3, held: 0, tokenCount: 2 });
    const spn = await call("GET", "/rewards/q6_rw_shared", "q6_spn");
    expect(spn.json).toMatchObject({ redeemed: 3, tokenCount: 2 });
    expect((await call("GET", "/rewards/q6_rw_shared/funnel", "q6_admin")).json.SCAN).toBe(9);
  });

  /* ── P6-BE-02 ─────────────────────────────────────────────────────────── */

  it("P6-BE-02: a token for an athlete not signed onto the campaign is one 422 — foreign, unsigned or non-existent alike", async () => {
    const answers = [];
    for (const athleteId of ["q6_ath_b", "q6_ath_unsigned", "q6_nobody_at_all"]) {
      const r = await call("POST", "/rewards/q6_rw_theirs/tokens", "q6_admin", { athleteId });
      answers.push({ status: r.status, body: r.json });
    }
    for (const a of answers) {
      expect(a.status).toBe(422);
      expect(a.body.error.code).toBe("athlete_not_on_campaign");
    }
    /* No oracle: the three bodies are identical. */
    expect(new Set(answers.map((a) => JSON.stringify(a.body.error))).size).toBe(1);
    expect(await prisma.rewardToken.count({ where: { rewardId: "q6_rw_theirs" } })).toBe(1);
  });

  it("P6-BE-02: a signed athlete, and an unattributed token, are still issued", async () => {
    expect((await call("POST", "/rewards/q6_rw_theirs/tokens", "q6_admin", { athleteId: "q6_ath_me" })).status).toBe(201);
    expect((await call("POST", "/rewards/q6_rw_theirs/tokens", "q6_admin", {})).status).toBe(201);
  });

  /* ── P6-BE-03 / P6-BE-05 ──────────────────────────────────────────────── */

  it("P6-BE-03: a NUL byte or non-base64url token is 404 unknown_token on every public route", async () => {
    for (const t of ["%00", "abc%00def", "%27%20OR%201%3D1--", "a".repeat(300)]) {
      expect((await call("GET", `/public/rewards/${t}`, null)).status).toBe(404);
      for (const p of ["scan", "landing", "claim", "redeem"]) {
        const r = await call("POST", `/public/rewards/${t}/${p}`, null, {});
        expect(r.status, `${p} ${t}`).toBe(404);
        expect(r.json.error.code).toBe("unknown_token");
      }
      expect((await call("GET", `/public/tracking/${t}`, null)).status).toBe(404);
      expect((await call("POST", `/public/tracking/${t}/click`, null)).status).toBe(404);
    }
  });

  it("P6-BE-05: redeem refusals say which — not live, expired, already used, run out", async () => {
    await seedReward("q6_rw_paused", [{ id: "q6_tk_paused", athleteId: null }], { state: "PAUSED" });
    await seedReward("q6_rw_expired", [{ id: "q6_tk_expired", athleteId: null }], { expiresAt: new Date(Date.now() - 60_000) });
    await seedReward("q6_rw_cap", [{ id: "q6_tk_cap_a", athleteId: null }, { id: "q6_tk_cap_b", athleteId: null }], { redemptionCap: 1 });
    const code = async (tok: string) => {
      const r = await call("POST", `/public/rewards/${tok}/redeem`, null);
      return [r.status, r.json.error?.code ?? null, r.json.error?.kind ?? null];
    };
    expect(await code("q6_tk_paused-tok")).toEqual([409, "reward_not_live", null]);
    expect(await code("q6_tk_expired-tok")).toEqual([409, "reward_expired", null]);
    expect((await call("POST", "/public/rewards/q6_tk_cap_a-tok/redeem", null)).status).toBe(201);
    expect(await code("q6_tk_cap_a-tok")).toEqual([409, "already_redeemed", null]);
    expect(await code("q6_tk_cap_b-tok")).toEqual([410, "reward_exhausted", "REDEMPTION_CAP"]);
    expect(await code("q6_never_issued_token")).toEqual([404, "unknown_token", null]);
  });

  it("P6-BE-05: auth refusals carry unauthenticated / forbidden", async () => {
    const anon = await call("GET", "/rewards", null);
    expect([anon.status, anon.json.error.code]).toEqual([401, "unauthenticated"]);
    const spn = await call("POST", "/rewards/q6_rw_shared/tokens", "q6_spn", {});
    expect([spn.status, spn.json.error.code]).toEqual([403, "forbidden"]);
  });

  /* ── claims: refused on a used code, idempotent per token ─────────────── */

  it("a claim on an already-redeemed single-use code is 409 already_redeemed and writes no CLAIM", async () => {
    for (const cap of [null, 5]) {
      const id = `q6_rw_usedclaim_${cap ?? "free"}`;
      await seedReward(id, [{ id: `${id}_tk`, athleteId: null }], { redemptionCap: cap });
      await reward.redeemToken(`${id}_tk-tok`);
      const r = await call("POST", `/public/rewards/${id}_tk-tok/claim`, null, {});
      expect([r.status, r.json.error.code]).toEqual([409, "already_redeemed"]);
      expect(await prisma.rewardEvent.count({ where: { tokenId: `${id}_tk`, type: "CLAIM" } })).toBe(0);
    }
  });

  it("20 parallel claims on one token write exactly one CLAIM, and every caller gets it", async () => {
    for (const cap of [null, 3]) {
      const id = `q6_rw_storm_${cap ?? "free"}`;
      await seedReward(id, [{ id: `${id}_tk`, athleteId: null }], { redemptionCap: cap });
      const out = await Promise.all(Array.from({ length: 20 }, () => reward.recordClaim(`${id}_tk-tok`).then((e) => e, (e) => e)));
      expect(out.every((e) => !(e instanceof Error)), JSON.stringify(out.find((e) => e instanceof Error))).toBe(true);
      expect(new Set(out.map((e) => (e as { id: string }).id)).size).toBe(1);
      expect(await prisma.rewardEvent.count({ where: { tokenId: `${id}_tk`, type: "CLAIM" } })).toBe(1);
      if (cap) expect(await prisma.rewardToken.count({ where: { rewardId: id, reservedUntil: { gt: new Date() } } })).toBe(1);
    }
  });

  it("a repeat claim returns the first one and enqueues no second email", async () => {
    await seedReward("q6_rw_again", [{ id: "q6_rw_again_tk", athleteId: null }]);
    const consent = { version: (await import("../src/domain/fan-consent")).CURRENT_CONSENT_VERSION, purpose: "reward-delivery" };
    const a = await reward.recordClaim("q6_rw_again_tk-tok", "fan@q6.invalid", new Date(), consent);
    const b = await reward.recordClaim("q6_rw_again_tk-tok", "fan@q6.invalid", new Date(), consent);
    expect(b.id).toBe(a.id);
    expect(await prisma.outboxJob.count({ where: { tenantId: TA, name: "notify.email" } })).toBe(1);
  });

  it("a redeem after a claim still works (the claim lock does not get in the way)", async () => {
    await seedReward("q6_rw_flow", [{ id: "q6_rw_flow_tk", athleteId: null }], { redemptionCap: 2 });
    await reward.recordClaim("q6_rw_flow_tk-tok");
    expect(await statusOf(reward.redeemToken("q6_rw_flow_tk-tok"))).toBe(201);
    expect(await statusOf(reward.recordClaim("q6_rw_flow_tk-tok"))).toBe(409);
  });
});

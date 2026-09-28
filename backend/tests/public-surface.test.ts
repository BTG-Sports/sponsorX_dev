import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The public surface's backend half — P6-FE-02 and P8-SEC-03.

   - GET /public/rewards/:token names every state the fan page must render,
     writes nothing, and never carries a fan's address.
   - Rate limits count the FAN, not the web server, but only when the web
     server vouches for the forwarded address with the shared edge key.
   - A tracking destination is http(s) or it is refused, on input and again
     on the way out to a public redirect.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.SPONSORX_EDGE_KEY = "edge-key-for-tests-0123456789abcdef";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

describe("P8-SEC-03 · the rate limit counts the fan, and only on the web server's word", async () => {
  const { clientIp } = await import("../src/lib/client-ip");
  const req = (headers: Record<string, string>, ip = "10.0.0.9") => ({
    ip,
    get: (h: string) => headers[h.toLowerCase()],
  });

  it("uses the forwarded address when the edge key matches", () => {
    expect(clientIp(req({ "x-sponsorx-client-ip": "203.0.113.7", "x-sponsorx-edge-key": process.env.SPONSORX_EDGE_KEY! }) as never))
      .toBe("203.0.113.7");
  });

  it("ignores a forwarded address from anyone without the key — they cannot pick their own bucket", () => {
    expect(clientIp(req({ "x-sponsorx-client-ip": "203.0.113.7" }) as never)).toBe("10.0.0.9");
    expect(clientIp(req({ "x-sponsorx-client-ip": "203.0.113.7", "x-sponsorx-edge-key": "wrong" }) as never)).toBe("10.0.0.9");
  });

  it("P5-FE-01 · an acceptance records the SIGNER's browser, on the same key", async () => {
    const { clientUserAgent } = await import("../src/lib/client-ip");
    const key = process.env.SPONSORX_EDGE_KEY!;
    expect(clientUserAgent(req({ "user-agent": "node", "x-sponsorx-client-ua": "Mozilla/5.0 (iPhone)", "x-sponsorx-edge-key": key }) as never))
      .toBe("Mozilla/5.0 (iPhone)");
    expect(clientUserAgent(req({ "user-agent": "node", "x-sponsorx-client-ua": "forged" }) as never)).toBe("node");
  });

  it("both acceptance routes take their evidence through the forward, not the socket", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["campaigns", "guardians"]) {
      const s = readFileSync(new URL(`../src/routes/v1/${f}.ts`, import.meta.url), "utf8");
      expect(s, f).not.toMatch(/ip: req\.ip/);
      expect(s, f).toMatch(/userAgent: clientUserAgent\(req\)/);
    }
  });

  it("every public limit is keyed through clientIp, not the raw socket", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["rewards", "applications", "inquiries"]) {
      const s = readFileSync(new URL(`../src/routes/v1/${f}.ts`, import.meta.url), "utf8");
      expect(s, f).not.toMatch(/limit\("[^"]+", req\.ip/);
    }
  });
});

describe("P8-SEC-03 · a tracking destination is http(s) or nothing", async () => {
  const { TrackingLinkInput } = await import("../src/contracts/reward");
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "ftp://x.test/"])(
    "refuses %s", (url) => {
      expect(TrackingLinkInput.safeParse({ destinationUrl: url }).success).toBe(false);
    });
  it("accepts http and https", () => {
    expect(TrackingLinkInput.safeParse({ destinationUrl: "https://rosas.test/fall" }).success).toBe(true);
    expect(TrackingLinkInput.safeParse({ destinationUrl: "http://rosas.test/" }).success).toBe(true);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P6-FE-02 · GET /public/rewards/:token names every state", async () => {
  const { prisma } = await import("../src/db/client");
  const { viewToken, redeemToken, recordClaim } = await import("../src/domain/reward");
  const T = "pv_tenant";

  async function token(id: string, reward: { state?: string; expiresAt?: Date; singleUse?: boolean }) {
    await prisma.reward.create({ data: {
      id: `pv_r_${id}`, tenantId: T, campaignId: "pv_campaign", offerText: `Offer ${id}`, terms: "One per fan",
      expiresAt: reward.expiresAt ?? new Date(Date.now() + 864e5), state: (reward.state ?? "ACTIVE") as never,
      singleUse: reward.singleUse ?? true,
    } });
    await prisma.rewardToken.create({ data: { id: `pv_t_${id}`, tenantId: T, rewardId: `pv_r_${id}`, token: `pv-token-${id}`, athleteId: "pv_athlete" } });
    return `pv-token-${id}`;
  }

  async function wipe() {
    await prisma.rewardEvent.deleteMany({ where: { tenantId: T } });
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    await prisma.rewardToken.deleteMany({ where: { tenantId: T } });
    await prisma.reward.deleteMany({ where: { tenantId: T } });
    await prisma.campaign.deleteMany({ where: { tenantId: T } });
    await prisma.athlete.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "Public view tenant" } });
    await prisma.sponsor.create({ data: { id: "pv_sponsor", tenantId: T, name: "PV" } });
    await prisma.athlete.create({ data: { id: "pv_athlete", tenantId: T, slug: "pv-athlete", legalName: "PV", displayName: "PV", email: "pv@x.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.campaign.create({ data: { id: "pv_campaign", tenantId: T, sponsorId: "pv_sponsor", name: "PV", budget: 1, startDate: new Date(), endDate: new Date(Date.now() + 864e5), state: "ACTIVE" } });
  });
  afterAll(wipe);

  it("UNKNOWN for a token that does not exist", async () => {
    expect(await viewToken("pv-no-such-token")).toEqual({ state: "UNKNOWN" });
  });

  it("LIVE with the offer and the exact consent wording for its version", async () => {
    const v = await viewToken(await token("live", {}));
    expect(v).toMatchObject({ state: "LIVE", offerText: "Offer live", claimed: false, consent: { version: "2026-09-01", purpose: "reward-delivery" } });
    if (v.state !== "UNKNOWN") expect(v.consent.text).toMatch(/only to send this reward/);
  });

  it("EXPIRED, NOT_LIVE and REDEEMED each render as themselves", async () => {
    expect((await viewToken(await token("exp", { expiresAt: new Date(Date.now() - 1000) }))).state).toBe("EXPIRED");
    expect((await viewToken(await token("paused", { state: "PAUSED" }))).state).toBe("NOT_LIVE");
    const used = await token("used", {});
    await redeemToken(used);
    expect((await viewToken(used)).state).toBe("REDEEMED");
  });

  it("reports a claim, writes no event itself, and never carries an address", async () => {
    const t = await token("claimed", {});
    await recordClaim(t, "fan@x.invalid", new Date(), { version: "2026-09-01", purpose: "reward-delivery" });
    const before = await prisma.rewardEvent.count({ where: { tenantId: T } });
    const v = await viewToken(t);
    expect(v).toMatchObject({ state: "LIVE", claimed: true });
    expect(JSON.stringify(v)).not.toContain("fan@x.invalid");
    expect(await prisma.rewardEvent.count({ where: { tenantId: T } })).toBe(before);
  });
});

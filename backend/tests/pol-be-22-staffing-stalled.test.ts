import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-22 — a sponsor is told when staffing stalls.

   "The sponsor keeps seeing '1 of 3 athletes signed', with no sign BTG is
   stepping in. Fix: the API marks a stalled campaign, and the sponsor sees
   'BTG is finding more athletes' with a date."

   Stalled: before launch, short of the package's minimum, and either
   automatic staffing handed it to BTG (its stop is the date), or BTG staffs
   it by hand and nobody is being asked (the ten-minute sweep's mark).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@be22-test.invalid` } : null;
  },
}));

describe("POL-BE-22 · stalledSince, the rule itself", async () => {
  const { stalledSince, stuckByHand } = await import("../src/domain/auto-staffing-rules");
  const at = new Date("2026-10-28T12:00:00Z");
  const base = { state: "STAFFING", autoStaffing: false, staffingStoppedAt: null, staffingStalledAt: null };
  const short = { signed: 1, outstanding: 0 };

  it("automatic staffing's stop is the date, while short and before launch", () => {
    expect(stalledSince({ ...base, autoStaffing: true, staffingStoppedAt: at }, short, 2)).toEqual(at);
    expect(stalledSince({ ...base, staffingStoppedAt: at }, { signed: 2, outstanding: 0 }, 2)).toBeNull();
    expect(stalledSince({ ...base, state: "ACTIVE", staffingStoppedAt: at }, short, 2)).toBeNull();
  });

  it("by hand: the sweep's mark counts only while nobody is being asked", () => {
    expect(stalledSince({ ...base, staffingStalledAt: at }, short, 2)).toEqual(at);
    expect(stalledSince({ ...base, staffingStalledAt: at }, { signed: 1, outstanding: 1 }, 2)).toBeNull();
    expect(stalledSince({ ...base, autoStaffing: true, staffingStalledAt: at }, short, 2)).toBeNull();
    expect(stalledSince(base, short, 2)).toBeNull();
    expect(stuckByHand(short, 2)).toBe(true);
    expect(stuckByHand({ signed: 2, outstanding: 0 }, 2)).toBe(false);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-22 · the sponsor sees BTG finding more athletes", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { sweepStalledStaffing } = await import("../src/domain/auto-staffing");

  const T = "be22_tenant";
  const p = (s: string) => `${T}_${s}`;
  const DAY = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (path: string, who: string) => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": p(who) } });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const staffingFor = async (c: string, who = "sp") => (await call(`/campaigns/${p(c)}`, who)).json?.campaign?.staffing;

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  /** A campaign over a 2–3 athlete package, with `signed` athletes on accepted orders. */
  async function campaign(key: string, over: { state?: string; auto?: boolean; stoppedAt?: Date; signed: number }) {
    await prisma.campaignBrief.create({ data: {
      id: p(`brief_${key}`), tenantId: T, sponsorId: p("sponsor"), packageId: p("pkg"), objective: `BE22 ${key}`, budget: 1_000_000,
      startDate: inDays(10), endDate: inDays(40), sports: [], stateCodes: [], categories: [], state: "CAMPAIGN_CREATED",
    } });
    await prisma.campaign.create({ data: {
      id: p(key), tenantId: T, sponsorId: p("sponsor"), briefId: p(`brief_${key}`), name: `BE22 ${key}`, budget: 1_000_000,
      startDate: inDays(10), endDate: inDays(40), state: (over.state ?? "STAFFING") as never, autoStaffing: over.auto ?? false,
      ...(over.stoppedAt ? { staffingStoppedAt: over.stoppedAt, staffingStopReason: "BE22 secret: no eligible athlete is left to offer." } : {}),
    } });
    for (let i = 0; i < over.signed; i++) {
      await prisma.campaignOrder.create({ data: {
        id: p(`${key}_o${i}`), tenantId: T, campaignId: p(key), athleteId: p(`ath${i}`), jobId: p("post"),
        compensation: 10_000, sellPrice: 20_000, usageRights: "90 days", dueDate: inDays(30), state: "ACCEPTED",
      } });
    }
  }
  const offer = (id: string, c: string, athlete: string, expiresAt: Date) => prisma.offer.create({ data: {
    id: p(id), tenantId: T, campaignId: p(c), athleteId: p(athlete), jobId: p("post"), brief: "Post once",
    compensation: 10_000, sellPrice: 20_000, deliverables: [], usageRights: "90 days", expiresAt, state: "SENT", sentAt: new Date(),
  } });

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "BE22" } });
    await prisma.sponsor.createMany({ data: [
      { id: p("sponsor"), tenantId: T, name: "BE22 Sponsor" }, { id: p("other"), tenantId: T, name: "Other Co" },
    ] });
    await prisma.nilJob.create({ data: { id: p("post"), tenantId: T, name: "BE22 post", baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210 } });
    await prisma.sponsorPackage.create({ data: {
      id: p("pkg"), tenantId: T, code: "BE22_PKG", name: "BE22 2–3", priceLow: 1_000, priceHigh: 9_000,
      athleteCountMin: 2, athleteCountMax: 3, lineItems: [{ jobCode: p("post"), quantityPerAthlete: 1 }],
    } });
    for (const i of [0, 1, 2, 3]) {
      await prisma.athlete.create({ data: {
        id: p(`ath${i}`), tenantId: T, slug: p(`ath${i}`), legalName: `Be22 Secret Athlete ${i}`, displayName: `Be22 Secret Athlete ${i}`,
        email: `${p(`ath${i}`)}@x.invalid`, sport: "Basketball", ageBand: "18_PLUS", state: "ACTIVE",
      } });
    }
    await prisma.user.createMany({ data: [
      { id: p("sp"), tenantId: T, clerkId: p("sp"), email: `${p("sp")}@x.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: p("sponsor") },
      { id: p("outsider"), tenantId: T, clerkId: p("outsider"), email: `${p("outsider")}@x.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: p("other") },
      { id: p("mgr"), tenantId: T, clerkId: p("mgr"), email: `${p("mgr")}@x.invalid`, roles: ["CAMPAIGN_MGR"] },
    ] });

    /* hand: staffed by hand, 1 of 2 signed, one offer out. */
    await campaign("hand", { signed: 1 });
    await offer("hand_offer1", "hand", "ath1", inDays(3));
    /* stopped: automatic staffing handed it to BTG three days ago, 1 of 2 signed. */
    await campaign("stopped", { auto: true, stoppedAt: new Date(Date.now() - 3 * DAY), signed: 1 });
    /* full: stopped too, but the minimum is met. */
    await campaign("full", { auto: true, stoppedAt: new Date(Date.now() - 3 * DAY), signed: 2 });
    /* live: already launched, short — not "being staffed" any more. */
    await campaign("live", { state: "ACTIVE", auto: true, stoppedAt: new Date(Date.now() - 3 * DAY), signed: 1 });

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("automatic staffing handed it to BTG: the sponsor sees BTG finding athletes since the stop — never why", async () => {
    const r = await call(`/campaigns/${p("stopped")}`, "sp");
    expect(r.status, r.text).toBe(200);
    const stoppedAt = (await prisma.campaign.findUniqueOrThrow({ where: { id: p("stopped") }, select: { staffingStoppedAt: true } })).staffingStoppedAt!;
    expect(r.json.campaign.staffing).toEqual({ signed: 1, needed: { min: 2, max: 3 }, btgFinding: { since: stoppedAt.toISOString() } });
    expect(r.json.campaign.nextStep).toMatchObject({ who: "BTG", text: expect.stringMatching(/^BTG is finding more athletes since \w{3} \d{1,2}: 1 of 2–3 signed so far$/) });
    expect(r.text).not.toContain("BE22 secret");
    expect(r.text).not.toContain("Secret Athlete");
    /* BTG's own read carries the same mark beside the stop's reason. */
    expect(await staffingFor("stopped", "mgr")).toMatchObject({ stalled: { since: stoppedAt.toISOString() }, stop: { reason: expect.stringContaining("BE22 secret") } });
  });

  it("the minimum met, or the campaign already launched: not stalled", async () => {
    expect((await staffingFor("full")).btgFinding).toBeNull();
    expect((await staffingFor("live"))?.btgFinding ?? null).toBeNull();
  });

  it("by hand: not stalled while someone is being asked", async () => {
    expect(await sweepStalledStaffing(new Date(), { tenantIds: [T] })).toMatchObject({ marked: 0 });
    expect((await staffingFor("hand")).btgFinding).toBeNull();
  });

  it("by hand: once the last offer is declined, the sweep marks it and the sponsor sees the date", async () => {
    await prisma.offer.update({ where: { id: p("hand_offer1") }, data: { state: "DECLINED" } });
    const at = new Date();
    expect(await sweepStalledStaffing(at, { tenantIds: [T] })).toMatchObject({ marked: 1 });
    expect((await staffingFor("hand")).btgFinding).toEqual({ since: at.toISOString() });
    /* A second sweep keeps the first date. */
    await sweepStalledStaffing(new Date(Date.now() + 600_000), { tenantIds: [T] });
    expect((await staffingFor("hand")).btgFinding).toEqual({ since: at.toISOString() });
  });

  it("by hand: asking someone again clears it at once on reads, and the sweep clears the mark", async () => {
    await offer("hand_offer2", "hand", "ath2", inDays(3));
    expect((await staffingFor("hand")).btgFinding).toBeNull();
    expect(await sweepStalledStaffing(new Date(), { tenantIds: [T] })).toMatchObject({ cleared: 1 });
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: p("hand") }, select: { staffingStalledAt: true } })).staffingStalledAt).toBeNull();
  });

  it("another sponsor reads none of it", async () => {
    expect((await call(`/campaigns/${p("stopped")}`, "outsider")).status).toBe(403);
  });
});

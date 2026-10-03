import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P4-BE-12 — campaigns staff themselves; P4-BE-13 — they launch on their
   start date (BTG admin review, items 19 and 20).

   On a real database, through the real domain functions and the API:
   creating a campaign from a packaged brief sends offers to the top-ranked
   athletes up to the package's maximum (3-day window, as the system); a
   decline is replaced in its own transaction, an expiry by the sweep, and a
   sweep racing a decline sends one replacement; nobody is offered twice,
   and no conflicted, inactive or unready athlete at all; the budget holds; a
   refusal skips the athlete with the reason; running out of athletes or
   budget stops it and emails BTG once; with automatic staffing off nothing
   happens; the maximum signed moves the campaign to APPROVAL; APPROVAL
   launches on the start date (not before), at once once it has passed,
   through the launch's own checks, once, and never a cancelled campaign or
   another tenant's. Only Clerk is stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@asl-test.invalid` } : null;
  },
}));

const rules = await import("../src/domain/auto-staffing-rules");
const { nextStep } = await import("../src/domain/campaign-stage-rules");

describe("P4-BE-12 / P4-BE-13 · the rules (pure)", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const later = new Date("2026-10-09T12:00:00Z");
  const past = new Date("2026-09-30T12:00:00Z");

  it("counts by athlete: signed, waiting, declined, expired; spend from live orders and offers", () => {
    const t = rules.tallyStaffing({
      orders: [
        { athleteId: "a", jobId: "j", state: "ACCEPTED", sellPrice: 100 },
        { athleteId: "b", jobId: "j", state: "SENT", sellPrice: 50 },
        { athleteId: "z", jobId: "j", state: "CANCELLED", sellPrice: 999 },
      ],
      offers: [
        { athleteId: "a", state: "ACCEPTED", expiresAt: later, sellPrice: 100, sentAt: past },
        { athleteId: "c", state: "SENT", expiresAt: later, sellPrice: 70, sentAt: now },
        { athleteId: "d", state: "DECLINED", expiresAt: later, sellPrice: 70, sentAt: past },
        { athleteId: "e", state: "SENT", expiresAt: past, sellPrice: 70, sentAt: past },
      ],
      invites: [{ athleteId: "f", jobId: "j", state: "INVITED", expiresAt: later }],
      skips: [{ athleteId: "g" }],
    }, now);
    expect(t).toMatchObject({ sent: 4, signed: 1, outstanding: 3, declined: 1, expired: 1, skipped: 1, committed: 100 + 50 + 70 });
    expect([...t.approached].sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "z"]);
  });

  it("asks up to the maximum, stops below the minimum, never past the budget", () => {
    expect(rules.athletesToAsk({ signed: 2, outstanding: 3, max: 9 })).toBe(4);
    expect(rules.athletesToAsk({ signed: 5, outstanding: 5, max: 9 })).toBe(0);
    expect(rules.exhaustedBelowMinimum({ signed: 2, outstanding: 2, min: 5 })).toBe(true);
    expect(rules.exhaustedBelowMinimum({ signed: 3, outstanding: 2, min: 5 })).toBe(false);
    expect(rules.fitsBudget(20_000, 10_000, 30_000)).toBe(true);
    expect(rules.fitsBudget(20_001, 10_000, 30_000)).toBe(false);
    expect(rules.staffsAthletes({ athleteCountMax: 3, lineItems: [{ jobCode: "SX-02", quantityPerAthlete: 1 }] })).toBe(true);
    expect(rules.staffsAthletes({ athleteCountMax: 0, lineItems: [] })).toBe(false);
    expect(rules.staffsAthletes(null)).toBe(false);
    expect(rules.AUTO_OFFER_WINDOW_DAYS).toBe(3);
    expect(rules.autoOfferExpiry(now).toISOString()).toBe("2026-10-06T12:00:00.000Z");
  });

  it("launch day is 00:00 UTC on the start date", () => {
    const start = new Date("2026-10-10T15:30:00Z");
    expect(rules.launchDue(start, new Date("2026-10-09T23:59:59Z"))).toBe(false);
    expect(rules.launchDue(start, new Date("2026-10-10T00:00:00Z"))).toBe(true);
    expect(rules.launchLine(start, now)).toBe("Launches on Oct 10");
    expect(rules.launchLine(start, new Date("2026-10-11T00:00:00Z"))).toBe("Launches in the next few minutes");
    expect(rules.dueBefore(now).toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("says the next step — the system's progress, the stop, the sponsor's count, the launch day", () => {
    const base = {
      state: "STAFFING" as const, ordersAll: 4, ordersSigned: 4, athletesSigned: 4, athleteRange: { min: 5, max: 9 },
      ordersSent: 0, ordersDraft: 0, offersWaiting: 3, invitesWaiting: 0, invitesWithoutOrder: 0, adSlots: 0,
      deliverables: { total: 0, published: 0, verified: 0 }, reportingSince: null, finalReportAt: null,
    };
    const staffing = { auto: true, sent: 7, signed: 4, outstanding: 3, declined: 0, expired: 0, skipped: 0, needed: { min: 5, max: 9 }, stop: null };
    expect(nextStep({ ...base, staffing }, "staff")).toEqual({ who: "ATHLETES", text: "Offers out to 7 athletes — 4 signed, 3 waiting" });
    expect(nextStep({ ...base, staffing }, "sponsor")).toEqual({ who: "ATHLETES", text: "We're staffing your campaign: 4 of 5–9 athletes signed" });
    const stopped = { ...staffing, stop: { reason: "No eligible athlete is left to offer.", at: now.toISOString() } };
    expect(nextStep({ ...base, staffing: stopped }, "staff")).toEqual({ who: "BTG", text: "Automatic staffing stopped — No eligible athlete is left to offer." });
    /* Off: BTG's own wording, as before. */
    expect(nextStep({ ...base, staffing: { ...staffing, auto: false } }, "staff")).toEqual({ who: "ATHLETES", text: "Waiting for 3 athletes to accept" });
    const approval = { ...base, state: "APPROVAL" as const, startDate: new Date("2026-10-10T00:00:00Z"), now };
    expect(nextStep(approval, "staff")).toEqual({ who: "SYSTEM", text: "Launches on Oct 10" });
    expect(nextStep(approval, "sponsor")).toEqual({ who: "SYSTEM", text: "Launches on Oct 10" });
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P4-BE-12 / P4-BE-13 · on a real database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createCampaignFromBrief, launchCampaign } = await import("../src/domain/campaign");
  const { respondToOffer } = await import("../src/domain/offer");
  const { sweepAutoStaffing } = await import("../src/domain/auto-staffing");
  const { sweepCampaignLaunches } = await import("../src/domain/campaign-launch");
  const { stageViews } = await import("../src/domain/campaign-stages");
  const { createApp } = await import("../src/app");
  type Actor = import("../src/auth/actor").Actor;

  const TENANTS = ["asl_t1", "asl_t2", "asl_t3", "asl_t4", "asl_t5", "asl_t6", "asl_t7"];
  const DAY = 864e5;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);
  const HASH = "asl-order-terms-hash";

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, clerk: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "x-test-clerk": clerk, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  const person = (userId: string, tenantId: string, roles: string[], extra: Partial<Actor> = {}) =>
    ({ userId, tenantId, roles, sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const mgr = (t: string) => person(`${t}_mgr`, t, ["CAMPAIGN_MGR"]);
  const athleteActor = (t: string, a: string) => person(`${a}_user`, t, ["ATHLETE"], { athleteId: a });

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, TENANTS).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  }

  type Ath = { key: string; name: string; extra?: Record<string, unknown> };
  /** A tenant with a sponsor, one NIL job, a package over it, BTG's staff, a sponsor admin and athletes with logins. */
  async function world(t: string, opts: { min: number; max: number; athletes: Ath[]; categories?: string[] }) {
    await prisma.sponsor.create({ data: { id: `${t}_sponsor`, tenantId: t, name: `ASL Sponsor ${t}` } });
    /* Whole dollars (nil-jobs.ts): $50–$100 pay, so $75 midpoint; untiered sells at the $140 Emerging floor. */
    await prisma.nilJob.create({ data: { id: `${t}_post`, tenantId: t, name: `ASL post ${t}`, baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210 } });
    await prisma.sponsorPackage.create({ data: {
      id: `${t}_pkg`, tenantId: t, code: `ASL_${t.toUpperCase()}`, name: `ASL ${opts.min}–${opts.max}`, priceLow: 1_000, priceHigh: 9_000,
      athleteCountMin: opts.min, athleteCountMax: opts.max, lineItems: [{ jobCode: `${t}_post`, quantityPerAthlete: 1 }],
    } });
    await prisma.user.createMany({ data: [
      { id: `${t}_mgr`, tenantId: t, clerkId: `${t}_mgr`, email: `${t}_mgr@asl-test.invalid`, roles: ["CAMPAIGN_MGR"] },
      { id: `${t}_admin`, tenantId: t, clerkId: `${t}_admin`, email: `${t}_admin@asl-test.invalid`, roles: ["BTG_ADMIN"] },
      { id: `${t}_sp`, tenantId: t, clerkId: `${t}_sp`, email: `${t}_sp@asl-test.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: `${t}_sponsor` },
    ] });
    for (const a of opts.athletes) {
      await prisma.athlete.create({ data: {
        id: a.key, tenantId: t, slug: a.key.replace(/_/g, "-"), legalName: a.name, displayName: a.name, email: `${a.key}@asl-test.invalid`,
        sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", restrictedCategories: [], ...a.extra,
      } });
      await prisma.user.create({ data: { id: `${a.key}_user`, tenantId: t, clerkId: `${a.key}_user`, email: `${a.key}_login@asl-test.invalid`, roles: ["ATHLETE"], athleteId: a.key } });
    }
    await prisma.agreement.create({ data: { id: `${t}_agr`, tenantId: t, kind: "ASL_CAMPAIGN_ORDER", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") } });
  }

  async function brief(t: string, over: { budget?: number; start?: Date; categories?: string[] } = {}) {
    await prisma.campaignBrief.create({ data: {
      id: `${t}_brief`, tenantId: t, sponsorId: `${t}_sponsor`, objective: `ASL ${t} weekday traffic`, budget: over.budget ?? 1_000_000,
      packageId: `${t}_pkg`, startDate: over.start ?? inDays(10), endDate: inDays(40), sports: [], stateCodes: [], categories: over.categories ?? [],
      state: "APPROVED",
    } });
  }

  const campaignOf = (id: string) =>
    prisma.campaign.findUniqueOrThrow({ where: { id }, select: { state: true, staffingStopReason: true, staffingStoppedAt: true } });
  const offersOf = (campaignId: string) =>
    prisma.offer.findMany({ where: { campaignId }, select: { id: true, athleteId: true, state: true, expiresAt: true, sellPrice: true, createdBy: true, termsHash: true }, orderBy: { createdAt: "asc" } });
  const emails = async (t: string, template: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: t, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string; data: Record<string, string> })
      .filter((p) => p.template === template);
  const decline = (t: string, athleteId: string, offerId: string) => respondToOffer(athleteActor(t, athleteId), offerId, { decision: "DECLINE" });
  const accept = (t: string, athleteId: string, offer: { id: string; termsHash: string | null }) =>
    respondToOffer(athleteActor(t, athleteId), offer.id, {
      decision: "ACCEPT", termsHashShown: offer.termsHash!, agreementId: `${t}_agr`, bodyHashShown: HASH, ip: "127.0.0.1", userAgent: "vitest",
    });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: TENANTS.map((id) => ({ id, name: `Auto staffing test ${id}` })) });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("staffing a packaged campaign", () => {
    const T = "asl_t1";
    let campaignId = "";
    const ids = { a: "asl1_a", b: "asl1_b", c: "asl1_c", d: "asl1_d", e: "asl1_e", conflicted: "asl1_conflict", inactive: "asl1_inactive" };

    beforeAll(async () => {
      /* Equal match scores, so the rank is by name: Avery, Blake, Casey, Drew, Ellis. The two that would come
         first by name must never be offered: one refuses alcohol (the brief's category), one isn't active. */
      await world(T, { min: 2, max: 3, athletes: [
        { key: ids.conflicted, name: "Asl1 0 Conflicted", extra: { restrictedCategories: ["ALCOHOL"] } },
        { key: ids.inactive, name: "Asl1 0 Inactive", extra: { state: "SUBMITTED" } },
        { key: ids.a, name: "Asl1 Avery" }, { key: ids.b, name: "Asl1 Blake" }, { key: ids.c, name: "Asl1 Casey" },
        { key: ids.d, name: "Asl1 Drew" }, { key: ids.e, name: "Asl1 Ellis" },
      ] });
      await brief(T, { categories: ["ALCOHOL"] });
    });

    it("creating it sends offers to the top-ranked athletes, up to the max, as the system, answering in 3 days", async () => {
      const before = Date.now();
      const created = await createCampaignFromBrief(mgr(T), `${T}_brief`, "ASL1 Campaign");
      campaignId = created.id;
      expect(created.state).toBe("STAFFING");
      const row = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { autoStaffing: true, state: true } });
      expect(row).toEqual({ autoStaffing: true, state: "STAFFING" });

      const offers = await offersOf(campaignId);
      expect(offers.map((o) => o.athleteId)).toEqual([ids.a, ids.b, ids.c]);
      for (const o of offers) {
        expect(o.state).toBe("SENT");
        expect(o.createdBy).toBeNull();
        const window = o.expiresAt.getTime() - before;
        expect(window).toBeGreaterThan(3 * DAY - 60_000);
        expect(window).toBeLessThan(3 * DAY + 60_000);
      }
      /* Audited as the system; the move to STAFFING too. */
      const audits = await prisma.auditLog.findMany({ where: { tenantId: T, action: { in: ["offer.create", "offer.send", "campaign.staff"] } }, select: { actorId: true, after: true } });
      expect(audits).toHaveLength(7);
      for (const a of audits) expect(a).toMatchObject({ actorId: null, after: { automatic: true } });
      expect((await emails(T, "offer.sent")).map((e) => e.to).sort()).toEqual([ids.a, ids.b, ids.c].map((a) => `${a}_login@asl-test.invalid`));
    });

    it("a sweep with nothing to do sends nothing — nobody is offered twice", async () => {
      await sweepAutoStaffing(new Date(), { tenantIds: [T] });
      expect(await offersOf(campaignId)).toHaveLength(3);
    });

    it("a decline is replaced by the next-ranked athlete, in the decline's own transaction", async () => {
      const offers = await offersOf(campaignId);
      await decline(T, ids.b, offers.find((o) => o.athleteId === ids.b)!.id);
      const after = await offersOf(campaignId);
      expect(after.map((o) => [o.athleteId, o.state])).toEqual([[ids.a, "SENT"], [ids.b, "DECLINED"], [ids.c, "SENT"], [ids.d, "SENT"]]);
    });

    it("a sweep racing a decline sends one replacement", async () => {
      const offerC = (await offersOf(campaignId)).find((o) => o.athleteId === ids.c)!;
      await Promise.all([decline(T, ids.c, offerC.id), sweepAutoStaffing(new Date(), { tenantIds: [T] })]);
      const after = await offersOf(campaignId);
      expect(after).toHaveLength(5);
      expect(after.filter((o) => o.state === "SENT").map((o) => o.athleteId).sort()).toEqual([ids.a, ids.d, ids.e]);
      const perAthlete = new Map<string, number>();
      for (const o of after) perAthlete.set(o.athleteId, (perAthlete.get(o.athleteId) ?? 0) + 1);
      expect([...perAthlete.values()].every((n) => n === 1)).toBe(true);
      expect(perAthlete.has(ids.conflicted) || perAthlete.has(ids.inactive)).toBe(false);
    });

    it("the list running out above the minimum is not a stop; below it, it stops and emails BTG once", async () => {
      const offerE = (await offersOf(campaignId)).find((o) => o.athleteId === ids.e)!;
      await decline(T, ids.e, offerE.id);
      /* Avery and Drew still out: the minimum (2) can still be reached. */
      expect((await campaignOf(campaignId)).staffingStoppedAt).toBeNull();

      const offerD = (await offersOf(campaignId)).find((o) => o.athleteId === ids.d)!;
      await decline(T, ids.d, offerD.id);
      const c = await campaignOf(campaignId);
      expect(c.staffingStopReason).toMatch(/No eligible athlete is left to offer: 0 signed and 1 waiting, below the package's minimum of 2/);
      expect(c.staffingStoppedAt).not.toBeNull();
      await sweepAutoStaffing(new Date(), { tenantIds: [T] });
      const stopped = await emails(T, "campaign.staffingStopped");
      expect(stopped.map((e) => e.to)).toEqual([`${T}_mgr@asl-test.invalid`]);
      expect(stopped[0]!.data.reason).toBe(c.staffingStopReason);
      expect(await offersOf(campaignId)).toHaveLength(5);
    });

    it("BTG's read shows the staffing and the stop; the sponsor's only the count", async () => {
      const staff = (await call("GET", `/campaigns/${campaignId}`, `${T}_mgr`)).json.campaign;
      expect(staff.autoStaffing).toBe(true);
      expect(staff.staffing).toMatchObject({ sent: 5, signed: 0, outstanding: 1, declined: 4, expired: 0, skipped: 0, needed: { min: 2, max: 3 } });
      expect(staff.staffing.stop.reason).toMatch(/No eligible athlete/);
      expect(staff.nextStep).toEqual({ who: "BTG", text: `Automatic staffing stopped — ${staff.staffing.stop.reason}` });
      const list = (await call("GET", "/campaigns?page=1", `${T}_mgr`)).json.campaigns as Array<{ id: string; staffing: { stop: unknown } }>;
      expect(list.find((r) => r.id === campaignId)!.staffing.stop).not.toBeNull();

      const sponsor = (await call("GET", `/campaigns/${campaignId}`, `${T}_sp`)).json.campaign;
      expect(sponsor.staffing).toEqual({ signed: 0, needed: { min: 2, max: 3 } });
      expect("autoStaffing" in sponsor).toBe(false);
      expect(sponsor.nextStep).toEqual({ who: "ATHLETES", text: "We're staffing your campaign: 0 of 2–3 athletes signed" });
    });
  });

  describe("reaching the maximum, then launching on the start date", () => {
    const T = "asl_t2";
    let campaignId = "";
    const startDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 3));

    beforeAll(async () => {
      await world(T, { min: 1, max: 2, athletes: [{ key: "asl2_a", name: "Asl2 Avery" }, { key: "asl2_b", name: "Asl2 Blake" }] });
      await brief(T, { start: new Date(startDay.getTime() + 15 * 3600_000) });
    });

    it("the package's maximum signed moves the campaign to APPROVAL on its own (P4-BE-09)", async () => {
      campaignId = (await createCampaignFromBrief(mgr(T), `${T}_brief`, "ASL2 Campaign")).id;
      const offers = await offersOf(campaignId);
      expect(offers).toHaveLength(2);
      await accept(T, "asl2_a", offers[0]!);
      expect((await campaignOf(campaignId)).state).toBe("STAFFING");
      await accept(T, "asl2_b", offers[1]!);
      expect((await campaignOf(campaignId)).state).toBe("APPROVAL");
      /* APPROVAL waits for nothing but the date: no sponsor step exists. */
      const view = (await stageViews([campaignId], "sponsor")).get(campaignId)!;
      expect(view.nextStep.text).toBe(`Launches on ${startDay.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`);
    });

    it("does not launch before the start date; launches on it, through the launch's own steps, once", async () => {
      await sweepCampaignLaunches(new Date(), { tenantIds: [T] });
      await sweepCampaignLaunches(new Date(startDay.getTime() - 1), { tenantIds: [T] });
      expect((await campaignOf(campaignId)).state).toBe("APPROVAL");

      const r = await sweepCampaignLaunches(startDay, { tenantIds: [T] });
      expect(r.launched).toBe(1);
      expect((await campaignOf(campaignId)).state).toBe("ACTIVE");
      expect((await prisma.campaignOrder.findMany({ where: { campaignId }, select: { state: true } })).map((o) => o.state)).toEqual(["ACTIVE", "ACTIVE"]);
      const jobs = (await prisma.outboxJob.findMany({ where: { tenantId: T, name: { in: ["notify.campaignLive", "zoho.pushDeal"] } }, select: { name: true, payload: true } }))
        .filter((j) => (j.payload as { campaignId?: string }).campaignId === campaignId).map((j) => j.name);
      expect(jobs.filter((n) => n === "notify.campaignLive")).toHaveLength(1);

      await sweepCampaignLaunches(inDays(5), { tenantIds: [T] });
      const launches = await prisma.auditLog.findMany({ where: { tenantId: T, entity: "Campaign", entityId: campaignId, action: "campaign.launch" }, select: { actorId: true, after: true } });
      expect(launches).toHaveLength(1);
      expect(launches[0]).toMatchObject({ actorId: null, after: { state: "ACTIVE", ordersActivated: 2, automatic: true } });
    });
  });

  describe("a minor through the guardian, a refusal skipped, and the budget", () => {
    const T = "asl_t3";
    let campaignId = "";

    beforeAll(async () => {
      await prisma.guardian.createMany({ data: [
        { id: "asl3_g_ok", tenantId: T, legalName: "Gale Asl3", email: "asl3_guardian@asl-test.invalid", relationship: "PARENT", verifiedAt: new Date() },
        { id: "asl3_g_no", tenantId: T, legalName: "Nell Asl3", email: "asl3_unverified@asl-test.invalid", relationship: "PARENT" },
      ] });
      const minor = (guardianId: string) => ({ ageBand: "UNDER_16", birthDate: new Date(Date.now() - 15 * 365 * DAY), guardianId });
      /* $140 each; a budget for two and a bit. */
      await world(T, { min: 1, max: 3, athletes: [
        { key: "asl3_a", name: "Asl3 Avery", extra: minor("asl3_g_ok") },
        { key: "asl3_b", name: "Asl3 Blake", extra: minor("asl3_g_no") },
        { key: "asl3_c", name: "Asl3 Casey" },
        { key: "asl3_d", name: "Asl3 Drew" },
      ] });
      await brief(T, { budget: 29_000 });
    });

    it("a minor's offer goes to the guardian too; an athlete the offer path refuses is skipped with the reason", async () => {
      campaignId = (await createCampaignFromBrief(mgr(T), `${T}_brief`, "ASL3 Campaign")).id;
      const offers = await offersOf(campaignId);
      expect(offers.map((o) => o.athleteId)).toEqual(["asl3_a", "asl3_c"]);
      const sent = await emails(T, "offer.sent");
      expect(sent.find((e) => e.to === "asl3_guardian@asl-test.invalid")?.data.seat).toBe("guardian");
      const skip = await prisma.campaignStaffingSkip.findMany({ where: { campaignId }, select: { athleteId: true, reason: true } });
      expect(skip).toEqual([{ athleteId: "asl3_b", reason: expect.stringMatching(/guardian is not verified/) }]);
      const detail = (await call("GET", `/campaigns/${campaignId}`, `${T}_admin`)).json.campaign;
      expect(detail.staffing.skips).toEqual([expect.objectContaining({ athleteId: "asl3_b", displayName: "Asl3 Blake" })]);
    });

    it("the budget holds: the next athlete would pass it, so it stops and emails BTG once", async () => {
      const offers = await offersOf(campaignId);
      expect(offers.reduce((n, o) => n + o.sellPrice, 0)).toBeLessThanOrEqual(29_000);
      const c = await campaignOf(campaignId);
      expect(c.staffingStopReason).toMatch(/budget can't cover the next athlete: Asl3 Drew/);
      await sweepAutoStaffing(new Date(), { tenantIds: [T] });
      expect(await offersOf(campaignId)).toHaveLength(2);
      expect((await emails(T, "campaign.staffingStopped")).map((e) => e.to)).toEqual([`${T}_mgr@asl-test.invalid`]);
    });
  });

  describe("off means off; BTG turns it on and off with a reason", () => {
    const T = "asl_t4";
    const campaignId = "asl4_campaign";

    beforeAll(async () => {
      await world(T, { min: 1, max: 2, athletes: [
        { key: "asl4_a", name: "Asl4 Avery" }, { key: "asl4_b", name: "Asl4 Blake" }, { key: "asl4_c", name: "Asl4 Casey" }, { key: "asl4_d", name: "Asl4 Drew" },
      ] });
      await brief(T);
      await prisma.campaignBrief.update({ where: { id: `${T}_brief` }, data: { state: "CAMPAIGN_CREATED" } });
      await prisma.campaign.create({ data: {
        id: campaignId, tenantId: T, sponsorId: `${T}_sponsor`, briefId: `${T}_brief`, name: "ASL4 Campaign", budget: 1_000_000,
        startDate: inDays(10), endDate: inDays(40), state: "STAFFING", autoStaffing: false,
      } });
    });

    it("with automatic staffing off, the sweep does nothing", async () => {
      await sweepAutoStaffing(new Date(), { tenantIds: [T] });
      expect(await offersOf(campaignId)).toHaveLength(0);
    });

    it("only BTG's campaign writers turn it on, with a reason; on, it staffs at once", async () => {
      expect((await call("POST", `/campaigns/${campaignId}/auto-staffing`, `${T}_sp`, { on: true, reason: "Me" })).status).toBe(403);
      expect((await call("POST", `/campaigns/${campaignId}/auto-staffing`, `${T}_mgr`, { on: true, reason: " " })).status).toBeGreaterThanOrEqual(400);
      /* Another tenant's campaign manager: not theirs to touch. */
      expect((await call("POST", `/campaigns/${campaignId}/auto-staffing`, "asl_t1_mgr", { on: true, reason: "Not mine" })).status).toBe(403);
      expect(await offersOf(campaignId)).toHaveLength(0);

      const on = await call("POST", `/campaigns/${campaignId}/auto-staffing`, `${T}_mgr`, { on: true, reason: "Let the system staff it" });
      expect(on.status).toBe(200);
      expect(on.json).toMatchObject({ id: campaignId, autoStaffing: true, state: "STAFFING", sent: 2, stop: null });
      expect((await offersOf(campaignId)).map((o) => o.athleteId)).toEqual(["asl4_a", "asl4_b"]);
      const audit = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "campaign.autoStaffing" }, select: { actorId: true, before: true, after: true } });
      expect(audit).toEqual({ actorId: `${T}_mgr`, before: { autoStaffing: false, staffingStopReason: null }, after: { autoStaffing: true, reason: "Let the system staff it" } });
    });

    it("turned off, a decline is not replaced", async () => {
      expect((await call("POST", `/campaigns/${campaignId}/auto-staffing`, `${T}_admin`, { on: false, reason: "BTG takes over" })).json.autoStaffing).toBe(false);
      const offerA = (await offersOf(campaignId)).find((o) => o.athleteId === "asl4_a")!;
      await decline(T, "asl4_a", offerA.id);
      await sweepAutoStaffing(new Date(), { tenantIds: [T] });
      expect(await offersOf(campaignId)).toHaveLength(2);
    });

    it("an offer that expires is replaced by the sweep", async () => {
      /* On again: Avery's declined place goes to Casey. */
      await call("POST", `/campaigns/${campaignId}/auto-staffing`, `${T}_mgr`, { on: true, reason: "Back on" });
      const before = await offersOf(campaignId);
      expect(before.map((o) => [o.athleteId, o.state])).toEqual([["asl4_a", "DECLINED"], ["asl4_b", "SENT"], ["asl4_c", "SENT"]]);
      /* The clock moves past Blake's three days (Casey's, sent later, still runs). */
      const blake = before.find((o) => o.athleteId === "asl4_b")!;
      const casey = before.find((o) => o.athleteId === "asl4_c")!;
      expect(casey.expiresAt.getTime()).toBeGreaterThan(blake.expiresAt.getTime());
      const at = new Date(blake.expiresAt.getTime() + 1);
      expect((await sweepAutoStaffing(at, { tenantIds: [T] })).sent).toBe(1);
      const after = await offersOf(campaignId);
      expect(after.map((o) => o.athleteId)).toEqual(["asl4_a", "asl4_b", "asl4_c", "asl4_d"]);
      expect(after[3]!.expiresAt.getTime()).toBe(at.getTime() + 3 * DAY);
      /* And only once. */
      expect((await sweepAutoStaffing(at, { tenantIds: [T] })).sent).toBe(0);
    });
  });

  describe("the launch sweep", () => {
    const T = "asl_t5";
    const OTHER = "asl_t6";

    beforeAll(async () => {
      await world(T, { min: 1, max: 3, athletes: [{ key: "asl5_a", name: "Asl5 Avery" }, { key: "asl5_b", name: "Asl5 Blake" }, { key: "asl5_c", name: "Asl5 Casey" }] });
      await prisma.sponsor.create({ data: { id: `${OTHER}_sponsor`, tenantId: OTHER, name: "ASL Sponsor other" } });
      const campaign = (id: string, tenantId: string, state: string, start: Date) => ({
        id, tenantId, sponsorId: `${tenantId}_sponsor`, name: `ASL5 ${id}`, budget: 500_000, startDate: start, endDate: inDays(30), state: state as never,
      });
      await prisma.campaign.createMany({ data: [
        campaign("asl5_past", T, "APPROVAL", inDays(-5)),
        campaign("asl5_cancelled", T, "CANCELLED", inDays(-5)),
        campaign("asl5_future", T, "APPROVAL", inDays(9)),
        campaign("asl5_live", T, "ACTIVE", inDays(-9)),
        campaign("asl6_past", OTHER, "APPROVAL", inDays(-5)),
      ] });
      const order = (id: string, athleteId: string, state: string) => ({
        id, tenantId: T, campaignId: "asl5_past", athleteId, jobId: `${T}_post`, compensation: 7_500, sellPrice: 14_000,
        usageRights: "90 days", dueDate: inDays(20), state: state as never, ...(state === "ACCEPTED" ? { acceptedAt: new Date() } : {}),
      });
      await prisma.campaignOrder.createMany({ data: [order("asl5_o1", "asl5_a", "ACCEPTED"), order("asl5_o2", "asl5_b", "SENT"), order("asl5_o3", "asl5_c", "CANCELLED")] });
      await prisma.reward.create({ data: { id: "asl5_reward", tenantId: T, campaignId: "asl5_past", offerText: "ASL free taco", terms: "One per fan", expiresAt: inDays(60) } });
    });

    it("launches at once when the start date has passed — the existing checks and steps unchanged — and only its own tenant's", async () => {
      const r = await sweepCampaignLaunches(new Date(), { tenantIds: [T] });
      expect(r.launched).toBe(1);
      const states = Object.fromEntries((await prisma.campaign.findMany({ where: { tenantId: { in: [T, OTHER] } }, select: { id: true, state: true } })).map((c) => [c.id, c.state]));
      expect(states).toEqual({ asl5_past: "ACTIVE", asl5_cancelled: "CANCELLED", asl5_future: "APPROVAL", asl5_live: "ACTIVE", asl6_past: "APPROVAL" });
      /* ACCEPTED orders only; the draft reward goes live with it. */
      const orders = Object.fromEntries((await prisma.campaignOrder.findMany({ where: { campaignId: "asl5_past" }, select: { id: true, state: true } })).map((o) => [o.id, o.state]));
      expect(orders).toEqual({ asl5_o1: "ACTIVE", asl5_o2: "SENT", asl5_o3: "CANCELLED" });
      expect((await prisma.reward.findUniqueOrThrow({ where: { id: "asl5_reward" }, select: { state: true } })).state).toBe("ACTIVE");
      const audit = await prisma.auditLog.findFirst({ where: { tenantId: T, entityId: "asl5_past", action: "campaign.launch" }, select: { actorId: true, after: true } });
      expect(audit).toMatchObject({ actorId: null, after: { automatic: true, reason: expect.stringMatching(/already passed/) } });
    });

    it("is idempotent, and the other tenant's campaign launches only in its own sweep", async () => {
      expect((await sweepCampaignLaunches(new Date(), { tenantIds: [T] })).launched).toBe(0);
      expect(await prisma.auditLog.count({ where: { tenantId: T, action: "campaign.launch" } })).toBe(1);
      expect((await sweepCampaignLaunches(new Date(), { tenantIds: [OTHER] })).launched).toBe(1);
      expect((await campaignOf("asl6_past")).state).toBe("ACTIVE");
    });

    it("only BTG launches by hand: a sponsor admin's launch is refused and the campaign stays in APPROVAL", async () => {
      await prisma.campaign.create({ data: {
        id: "asl5_sponsor_try", tenantId: T, sponsorId: `${T}_sponsor`, name: "ASL5 sponsor try", budget: 500_000,
        startDate: inDays(12), endDate: inDays(30), state: "APPROVAL",
      } });
      /* The sponsor admin holds campaign.approve on their own campaign (the matrix row); the launch asks for it tenant-wide. */
      expect((await call("POST", "/campaigns/asl5_sponsor_try/launch", `${T}_sp`)).status).toBe(403);
      await expect(launchCampaign(person(`${T}_sp`, T, ["SPONSOR_ADMIN"], { sponsorId: `${T}_sponsor` }), "asl5_sponsor_try")).rejects.toMatchObject({ status: 403 });
      expect((await campaignOf("asl5_sponsor_try")).state).toBe("APPROVAL");
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: "asl5_sponsor_try", action: "campaign.launch" } })).toBe(0);

      const btg = await call("POST", "/campaigns/asl5_sponsor_try/launch", `${T}_mgr`);
      expect(btg.status).toBe(200);
      expect(btg.json.state).toBe("ACTIVE");
      expect((await campaignOf("asl5_sponsor_try")).state).toBe("ACTIVE");
    });

    it("BTG can still launch by hand before the start date", async () => {
      const r = await launchCampaign(person(`${T}_admin`, T, ["BTG_ADMIN"]), "asl5_future");
      expect(r.state).toBe("ACTIVE");
      const audit = await prisma.auditLog.findFirst({ where: { tenantId: T, entityId: "asl5_future", action: "campaign.launch" }, select: { actorId: true } });
      expect(audit?.actorId).toBe(`${T}_admin`);
    });
  });

  /* P4-BE-11 + P4-BE-12 together: the sponsor files a brief, it is approved
     automatically, and the campaign it becomes starts staffing itself with no
     person anywhere in the chain. */
  describe("a brief approved automatically staffs itself", () => {
    const T = "asl_t7";
    const ids = ["asl7_a", "asl7_b", "asl7_c"];

    beforeAll(async () => {
      await world(T, { min: 2, max: 2, athletes: [
        { key: ids[0]!, name: "Asl7 Avery" }, { key: ids[1]!, name: "Asl7 Blake" }, { key: ids[2]!, name: "Asl7 Casey" },
      ] });
    });

    it("the sponsor's brief becomes a STAFFING campaign with offers out to the package's maximum", async () => {
      const day = (n: number) => inDays(n).toISOString().slice(0, 10);
      const r = await call("POST", "/briefs", `${T}_sp`, {
        sponsorId: `${T}_sponsor`, objective: "Weekday lunch traffic from local college basketball fans this autumn",
        budget: 1_000_000, packageId: `${T}_pkg`, startDate: day(10), endDate: day(40), sports: [], stateCodes: [], categories: [],
      });
      expect(r.status, JSON.stringify(r.json)).toBe(201);
      expect(r.json).toMatchObject({ autoApproved: true, state: "CAMPAIGN_CREATED" });
      const campaignId = r.json.campaignId as string;

      const row = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { autoStaffing: true, state: true } });
      expect(row).toEqual({ autoStaffing: true, state: "STAFFING" });
      const offers = await offersOf(campaignId);
      expect(offers.map((o) => [o.athleteId, o.state])).toEqual([[ids[0], "SENT"], [ids[1], "SENT"]]);
      for (const o of offers) expect(o.createdBy).toBeNull();
    });
  });
});

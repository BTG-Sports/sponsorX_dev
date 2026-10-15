import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   3S7-INT-01 — intelligence into Zoho (documentation/SponsorX-Zoho-Field-Mapping.md §12.3).
   Done when: Zoho shows renewal score and recommended next action on the
   sponsor record. Here against the fake Zoho the sync's own tests use; the
   real fields are created by `npm run zoho:intel-fields`.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S7-INT-01 · renewal score and next action onto the sponsor's Zoho Account", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { queueZohoIntelligence, zohoIntelligenceFor, pushIntelligence } = await import("../src/domain/zoho-intelligence");
  const { FakeZoho } = await import("./support/fake-zoho");
  const jobs = await import("../worker/jobs/zoho-sync.mts");

  const T = "zin_t";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const zoho = new FakeZoho();
  /* The job, on the night's clock (the worker's is the real one). */
  let clock = NOW;
  const push = (sponsorId: string) => pushIntelligence({ db: prisma, zoho: zoho as never, now: () => clock }, T, sponsorId);
  const queued = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "zoho.pushIntelligence" }, select: { payload: true } })).map((j) => (j.payload as { sponsorId: string }).sponsorId).sort();
  const forecast = (campaignId: string, day: string, mid: number) => prisma.campaignForecast.create({ data: {
    tenantId: T, campaignId, day: D(day), modelVersion: "forecast-rules@1.0.0", metric: "impressions", guarantee: 30000, delivered: mid, deliveredSource: "VERIFIED_API",
    elapsed: 0.3333, low: mid, mid, high: mid, probability: 0.9, risk: "on_track", riskFactors: [], actions: [], projection: [], forecastAt: new Date(`${day}T19:30:00Z`),
  }, select: { id: true } });

  async function clean() {
    for (const t of ["OutboxJob", "CampaignForecast", "Campaign", "Sponsor"]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
  }

  let acct1 = "";
  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Zoho intelligence" } });
    acct1 = zoho.seed("Accounts", { Account_Name: "Fit Co", SponsorX_ID: "zin_s1" });
    const acct3 = zoho.seed("Accounts", { Account_Name: "Quiet Co", SponsorX_ID: "zin_s3" });
    await prisma.sponsor.createMany({ data: [
      { id: "zin_s1", tenantId: T, name: "Fit Co", zohoAccountId: acct1 },
      /* Not in Zoho yet: nothing to write to. */
      { id: "zin_s2", tenantId: T, name: "New Co" },
      /* In Zoho, no campaign ending soon. */
      { id: "zin_s3", tenantId: T, name: "Quiet Co", zohoAccountId: acct3 },
    ] });
    await prisma.campaign.create({ data: { id: "zin_c1", tenantId: T, sponsorId: "zin_s1", name: "Fall push", budget: 1, startDate: D("2026-11-01"), endDate: D("2026-11-30"), state: "ACTIVE" }, select: { id: true } });
    await forecast("zin_c1", "2026-11-10", 27000);
  });

  afterAll(clean);

  it("what the Account should say: the soonest campaign's advice, as a 0–100 score and a sentence", async () => {
    expect(await zohoIntelligenceFor(prisma, T, "zin_s1", NOW)).toEqual({
      SponsorX_Renewal_Score: 90,
      SponsorX_Next_Action: "Renew: Fall push — On course to deliver 27,000 of the 30,000 impressions promised (90%).",
    });
    expect(await zohoIntelligenceFor(prisma, T, "zin_s3", NOW)).toEqual({ SponsorX_Renewal_Score: null, SponsorX_Next_Action: "No campaign ending soon." });
  });

  it("nightly: queued automatically for sponsors in Zoho; the job writes the two fields; nothing again while unchanged", async () => {
    expect(await queueZohoIntelligence(prisma, NOW, { tenantId: T })).toEqual({ tenants: 1, sponsors: 2, queued: 2, skipped: [] });
    expect(await queued()).toEqual(["zin_s1", "zin_s3"]);
    expect(await push("zin_s1")).toMatchObject({ status: "pushed", zohoId: acct1 });
    expect(zoho.all("Accounts").find((a) => a.id === acct1)).toMatchObject({ Account_Name: "Fit Co", SponsorX_Renewal_Score: 90, SponsorX_Next_Action: expect.stringContaining("Renew: Fall push") });
    await push("zin_s3");
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    expect(await queueZohoIntelligence(prisma, NOW, { tenantId: T })).toMatchObject({ queued: 0 });
    /* A retried job finds nothing new to send. */
    expect(await push("zin_s1")).toMatchObject({ status: "unchanged" });
  });

  it("when the forecast moves, the next night sends the new advice", async () => {
    await forecast("zin_c1", "2026-11-11", 12000);
    const next = new Date("2026-11-11T20:00:00Z");
    clock = next;
    expect(await queueZohoIntelligence(prisma, next, { tenantId: T })).toMatchObject({ queued: 1 });
    expect(await push("zin_s1")).toMatchObject({ status: "pushed" });
    expect(zoho.all("Accounts").find((a) => a.id === acct1)).toMatchObject({
      SponsorX_Renewal_Score: 40, SponsorX_Next_Action: "Let it end: Fall push — On course to deliver 12,000 of the 30,000 impressions promised (40%).",
    });
    /* Through the worker's own handler: a sponsor not in Zoho yet is skipped, not failed. */
    expect(await jobs.handlePushIntelligence({ db: prisma, zoho: () => zoho as never }, { tenantId: T, sponsorId: "zin_s2" } as never)).toEqual({ status: "skipped", reason: "sponsor not in Zoho yet" });
  });
});

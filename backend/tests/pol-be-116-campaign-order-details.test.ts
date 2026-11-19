/* --------------------------------------------------------------------------
   POL-BE-116 — creating a campaign builds every athlete's order, as the
   Athlete Campaign Order template lays it out. Real API and database; only
   Clerk is stubbed.

     - the builder's catalogue and a code for a name;
     - a sponsor's brief carries the order details (checked; inside its dates);
     - the campaign made from it keeps them and gets its code; BTG changes
       them until the first offer, then they're fixed;
     - the offer draft fills every term from them; an offer carries them,
       hashed; the order an accepted offer becomes is numbered and carries
       them; so does an order BTG sends from an invitation;
     - the order read shows them — paid media's extra pay only to those who
       may see the athlete's pay;
     - the earning's pay-by follows the payment timing;
     - "sponsor approval: yes" stops BTG approving alone;
     - paid media with no extra pay stops automatic staffing, with the reason.
   -------------------------------------------------------------------------- */
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {}, rateLimit: async () => ({ allowed: true, retryAfter: 0 }), RateLimitedError: class extends Error {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@cod-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const { hashAgreementBody } = await import("../src/domain/agreement-hash");

describe.skipIf(!hasDatabase)("POL-BE-116 · the campaign builder and every athlete's order", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { createOrder } = await import("../src/domain/campaign-order");
  const { maybeMakeEligible } = await import("../src/domain/earning");
  const { autoStaffCampaign } = await import("../src/domain/auto-staffing");
  const T = "cod_btg";
  const HASH = hashAgreementBody(readFileSync(new URL("../agreements/CAMPAIGN_ORDER.v3.txt", import.meta.url), "utf8"));
  const YEAR = new Date().getUTCFullYear();
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
  const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const btgActor = { userId: "cod_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };

  /** The template's own: a 15–30 second vertical video, with paid media and exclusivity this time. */
  const details = (over: Record<string, unknown> = {}) => ({
    version: 1,
    prompt: "Before a game, I gotta have _____. / What's yours?",
    publishWindow: { start: day(10), end: day(40) },
    jobs: [{ jobId: "SX-03", media: { videos: 2, minSeconds: 15, maxSeconds: 30, orientation: "VERTICAL", platform: "INSTAGRAM" } }],
    usage: { channels: ["INSTAGRAM", "TIKTOK"], periodDays: 90, territory: "United States", restrictions: null },
    paidMedia: { included: true, kinds: ["BOOSTED_POSTS"], platforms: ["INSTAGRAM"], durationDays: 30, territory: "Maryland", extraCompensationCents: 15_000 },
    exclusivity: { included: true, category: "Sports drinks", days: 60, scope: "Maryland" },
    disclosures: ["#ad", "Paid partnership"],
    sponsorApproval: true,
    paymentTiming: { daysAfterVerified: 15 },
    nonCash: "A case of the sponsor's drink",
    ...over,
  });

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  let briefId = "";
  let campaignId = "";
  let orderCode = "";

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "COD BTG" } });
    await prisma.sponsor.create({ data: { id: "cod_sponsor", tenantId: T, name: "Bolt Drinks", categories: ["ENERGY_DRINK"] } });
    await prisma.nilJob.create({ data: { id: "SX-03", tenantId: T, name: "Athlete Reel", baseLow: 75, baseHigh: 150, sellLow: 200, sellHigh: 400, sellFloorEmerging: 150, sellFloorCreator: 200, sellFloorPremium: 300 } });
    await prisma.agreement.create({ data: { id: "cod_terms", tenantId: T, kind: "CAMPAIGN_ORDER", version: 3, bodyHash: HASH, effectiveAt: new Date("2026-01-01") } });
    await prisma.athlete.createMany({ data: [
      { id: "cod_ath", tenantId: T, slug: "cod-ath", legalName: "Jordan Reed", displayName: "JORDAN", email: "cod_ath@cod-test.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "cod_ath2", tenantId: T, slug: "cod-ath2", legalName: "Sam Lee", displayName: "SAM", email: "cod_ath2@cod-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "cod_admin", tenantId: T, clerkId: "cod_admin", email: "cod_admin@cod-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "cod_cm", tenantId: T, clerkId: "cod_cm", email: "cod_cm@cod-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "cod_sp", tenantId: T, clerkId: "cod_sp", email: "cod_sp@cod-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "cod_sponsor" },
      { id: "cod_athlete", tenantId: T, clerkId: "cod_athlete", email: "cod_athlete@cod-test.invalid", roles: ["ATHLETE"], athleteId: "cod_ath" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await clean(); });

  it("the builder's catalogue lists every job's medium with its fields and defaults; a name gets three letters", async () => {
    const cat = await call("GET", "/campaign-builder/catalogue", "cod_sp");
    expect(cat.status, cat.text).toBe(200);
    expect(cat.json.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06", "SX-07"]);
    expect(cat.json.jobs[2]).toMatchObject({ jobId: "SX-03", name: "Athlete Reel", defaults: { minSeconds: 15, maxSeconds: 30, orientation: "VERTICAL" } });
    expect(cat.json.defaults).toMatchObject({ paymentDaysAfterVerified: 30, usagePeriodDays: 90, disclosures: ["#ad"] });
    expect((await call("GET", "/campaign-builder/order-code?name=What%27s%20on%20your%20pregame%20playlist%3F", "cod_sp")).json).toMatchObject({ orderCode: "PPL" });
    expect((await call("GET", "/campaign-builder/catalogue", "cod_athlete")).status).toBe(403);
  });

  it("a sponsor's brief carries the order details — complete, and published inside its dates", async () => {
    const brief = { sponsorId: "cod_sponsor", objective: "Pregame playlists", budget: 500_000, startDate: day(5), endDate: day(60), categories: ["ENERGY_DRINK"] };
    expect((await call("POST", "/briefs", "cod_sp", { ...brief, orderDetails: details({ jobs: [] }) })).status).toBe(400);
    expect((await call("POST", "/briefs", "cod_sp", { ...brief, orderCode: "pp1" })).status).toBe(400);
    const outside = await call("POST", "/briefs", "cod_sp", { ...brief, orderDetails: details({ publishWindow: { start: day(1), end: day(40) } }) });
    expect(outside.status, outside.text).toBe(422);
    expect(outside.json.error.message).toMatch(/publish window .* inside the campaign's dates/);
    const ok = await call("POST", "/briefs", "cod_sp", { ...brief, orderDetails: details(), orderCode: "PPL" });
    expect(ok.status, ok.text).toBe(201);
    briefId = ok.json.id;
    const row = await prisma.campaignBrief.findUniqueOrThrow({ where: { id: briefId }, select: { orderDetails: true, orderCode: true } });
    expect(row).toMatchObject({ orderCode: "PPL", orderDetails: expect.objectContaining({ prompt: expect.stringMatching(/^Before a game/) }) });
  });

  it("the campaign made from it keeps the details and its code; BTG changes them until the first offer", async () => {
    await prisma.campaignBrief.update({ where: { id: briefId }, data: { state: "APPROVED" } });
    const made = await call("POST", `/briefs/${briefId}/campaign`, "cod_admin", { name: "What's on your pregame playlist?" });
    expect(made.status, made.text).toBe(201);
    campaignId = made.json.id;
    const read = await call("GET", `/campaigns/${campaignId}/order-details`, "cod_sp");
    expect(read.status, read.text).toBe(200);
    expect(read.json).toMatchObject({ orderCode: "PPL", orderCodeYear: YEAR, standardTerms: false, locked: false, orderDetails: { sponsorApproval: true, paymentTiming: { daysAfterVerified: 15 } } });
    orderCode = read.json.orderCode;

    /* The sponsor reads; BTG writes. */
    expect((await call("PUT", `/campaigns/${campaignId}/order-details`, "cod_sp", { orderDetails: details() })).status).toBe(403);
    const changed = await call("PUT", `/campaigns/${campaignId}/order-details`, "cod_cm", { orderDetails: details({ paymentTiming: { daysAfterVerified: 10 } }) });
    expect(changed.status, changed.text).toBe(200);
    expect(changed.json.orderDetails.paymentTiming).toEqual({ daysAfterVerified: 10 });
    /* Another campaign's code this year is refused, with the next free one. */
    await prisma.campaign.create({ data: { id: "cod_other", tenantId: T, sponsorId: "cod_sponsor", name: "Other", budget: 1, startDate: new Date(), endDate: new Date(Date.now() + 864e5), orderCode: "ABC", orderCodeYear: YEAR } });
    const taken = await call("PUT", `/campaigns/${campaignId}/order-details`, "cod_cm", { orderDetails: details(), orderCode: "ABC" });
    expect(taken.status).toBe(409);
    expect(taken.json.error.message).toMatch(/already uses ABC this year — try AB/);
  });

  it("the offer draft fills every term from the details: prompt, deliverables per video, usage, exclusivity, disclosures", async () => {
    const d = await call("GET", `/campaigns/${campaignId}/offer-draft?athleteId=cod_ath&jobId=SX-03`, "cod_cm");
    expect(d.status, d.text).toBe(200);
    const o = d.json.offer;
    expect(o.brief).toBe("Before a game, I gotta have _____. / What's yours?");
    expect(o.deliverables.map((x: { title: string }) => x.title)).toEqual([
      "Athlete reel 1 of 2 — 2 × 15–30 second vertical videos for Instagram",
      "Athlete reel 2 of 2 — 2 × 15–30 second vertical videos for Instagram",
    ]);
    expect(o.deliverables[0].dueDate.slice(0, 10)).toBe(day(40));
    expect(o.usageRights).toMatch(/^Organic use on Instagram, TikTok, .* Paid media included: boosted posts on Instagram, for 30 days, in Maryland, for \$150 more\.$/);
    expect(o.exclusivityDays).toBe(60);
    expect(o.disclosures).toEqual(["#ad", "Paid partnership"]);
    expect(o.orderDetails).toMatchObject({ jobs: [{ jobId: "SX-03" }], paymentTiming: { daysAfterVerified: 10 } });
    expect(d.json.sources.orderDetails).toBe("The campaign's order details, for this job");
  });

  let orderId = "";
  it("an offer carries them, hashed; accepted, it becomes order SX-<code>-<year>-0001 with the details; then they're fixed", async () => {
    const draft = (await call("GET", `/campaigns/${campaignId}/offer-draft?athleteId=cod_ath&jobId=SX-03`, "cod_cm")).json.offer;
    const { orderDetails: _left, ...noDetails } = draft;
    const made = await call("POST", "/offers", "cod_cm", noDetails);
    expect(made.status, made.text).toBe(201);
    expect(made.json.orderDetails).toMatchObject({ prompt: draft.brief }); // attached from the campaign
    const sent = await call("POST", `/offers/${made.json.id}/send`, "cod_cm");
    expect(sent.status, sent.text).toBe(200);
    const accepted = await call("POST", `/offers/${made.json.id}/respond`, "cod_athlete", {
      decision: "ACCEPT", termsHashShown: sent.json.termsHash, agreementId: "cod_terms", bodyHashShown: HASH,
    });
    expect(accepted.status, accepted.text).toBe(200);
    orderId = accepted.json.orderId;
    const order = await prisma.campaignOrder.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true, orderDetails: true, exclusivity: true } });
    expect(order.orderNumber).toBe(`SX-${orderCode}-${YEAR}-0001`);
    expect(order.exclusivity).toBe("Sports drinks, for 60 days from acceptance, in Maryland");
    expect(order.orderDetails).toMatchObject({ nonCash: "A case of the sponsor's drink" });
    expect((await call("PUT", `/campaigns/${campaignId}/order-details`, "cod_cm", { orderDetails: details() })).status).toBe(409);
  });

  it("an order BTG sends from an invitation is numbered next and carries the details too", async () => {
    const o = await createOrder(btgActor, { campaignId, athleteId: "cod_ath2", jobId: "SX-03", compensation: 15_000, sellPrice: 40_000, usageRights: "As the details say", dueDate: new Date(Date.now() + 40 * 864e5) });
    const row = await prisma.campaignOrder.findUniqueOrThrow({ where: { id: o.id }, select: { orderNumber: true, orderDetails: true } });
    expect(row.orderNumber).toBe(`SX-${orderCode}-${YEAR}-0002`);
    expect(row.orderDetails).toMatchObject({ jobs: [{ jobId: "SX-03" }] });
  });

  it("the order read shows the number and every detail; paid media's extra pay only to those who see the athlete's pay", async () => {
    const mine = await call("GET", `/orders/${orderId}`, "cod_athlete");
    expect(mine.status, mine.text).toBe(200);
    expect(mine.json).toMatchObject({ orderNumber: `SX-${orderCode}-${YEAR}-0001`, orderDetails: { paidMedia: { included: true, extraCompensationCents: 15_000 } } });
    const sponsor = await call("GET", `/orders/${orderId}`, "cod_sp");
    expect(sponsor.status, sponsor.text).toBe(200);
    expect(sponsor.json.orderDetails.paidMedia).toMatchObject({ included: true, kinds: ["BOOSTED_POSTS"] });
    expect(sponsor.json.orderDetails.paidMedia).not.toHaveProperty("extraCompensationCents");
  });

  it("'sponsor approval: yes' stops BTG approving alone; the earning's pay-by follows the payment timing", async () => {
    const [first] = await prisma.deliverable.findMany({ where: { orderId }, select: { id: true }, orderBy: { title: "asc" } });
    await prisma.deliverable.update({ where: { id: first!.id }, data: { state: "BTG_REVIEW" } });
    const approve = await call("POST", `/deliverables/${first!.id}/approve`, "cod_admin");
    expect(approve.status).toBe(409);
    expect(approve.json.error.message).toMatch(/needs the sponsor's approval/);

    await prisma.deliverable.updateMany({ where: { orderId }, data: { state: "VERIFIED" } });
    const before = Date.now();
    await prisma.$transaction((tx) => maybeMakeEligible(tx, { tenantId: T, userId: null }, orderId));
    const e = await prisma.earning.findUniqueOrThrow({ where: { orderId }, select: { payBy: true } });
    const days = (e.payBy!.getTime() - before) / 864e5;
    expect(days).toBeGreaterThan(9.99);
    expect(days).toBeLessThan(10.01);
  });

  it("paid media with no extra pay stops automatic staffing, with the reason in words", async () => {
    await prisma.sponsorPackage.create({ data: { id: "cod_pkg", tenantId: T, code: "COD_PKG", name: "COD pack", priceLow: 1, priceHigh: 9, athleteCountMin: 1, athleteCountMax: 2, lineItems: [{ jobCode: "SX-03", quantityPerAthlete: 1 }] } });
    await prisma.campaignBrief.create({ data: { id: "cod_brief2", tenantId: T, sponsorId: "cod_sponsor", objective: "Beer night", budget: 100_000, packageId: "cod_pkg", startDate: new Date(), endDate: new Date(Date.now() + 30 * 864e5), categories: ["ENERGY_DRINK"], state: "CAMPAIGN_CREATED" } });
    await prisma.campaign.create({ data: {
      id: "cod_c2", tenantId: T, sponsorId: "cod_sponsor", briefId: "cod_brief2", name: "Beer night", budget: 100_000, startDate: new Date(), endDate: new Date(Date.now() + 30 * 864e5),
      autoStaffing: true, orderDetails: details({ paidMedia: { included: true, kinds: ["DIGITAL_ADS"], platforms: [], durationDays: 30, territory: "US", extraCompensationCents: 0 }, exclusivity: { included: false } }) as object,
    } });
    const r = await autoStaffCampaign(T, "cod_c2");
    expect(r.sent).toEqual([]);
    expect(r.stopped).toMatch(/Held for BTG by the order rules: Paid media is included with no extra pay/);
    expect(await prisma.offer.count({ where: { tenantId: T, campaignId: "cod_c2" } })).toBe(0);
  });
});

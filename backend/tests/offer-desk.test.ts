import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S2-FE-03 — BTG's Offers desk, the two reads its new-offer form needs,
   against the real API and database:

   GET /campaigns/:id/offer-checks — the draft so far, checked without refusing:
     - the athlete's floor is their rate for the job, or the item's price
       when the offer buys one; the pay clears it or not;
     - the margin floor is sell price ≥ pay × 1.4, asked through the same
       function drafting calls (its message in `problems`);
     - the remaining budget counts live orders at their floor, as drafting does;
     - BTG's writers only, and only on a campaign of their own tenant.
   GET /offers/athletes — the tenant's active athletes by name, with whether
     a guardian answers for them; the age only for a role that may read a
     date of birth.
   GET /offers/:id names the athlete and whether their guardian answers.
   The API enforces the floor the form shows (found in review): drafting,
   editing and sending refuse pay below the athlete's rate for the job, with
   the floor in the message; no rate on file, no rate floor.
   Only Clerk is stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@odk-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S2-FE-03 · the Offers desk's form reads", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "odk_btg";
  const X = "odk_other";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const get = async (path: string, clerk: string) => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": clerk } });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const call = async (method: string, path: string, clerk: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "x-test-clerk": clerk, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const inDays = (n: number) => new Date(Date.now() + n * 864e5);
  const yearsAgo = (n: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCDate(d.getUTCDate() - 3); return d; };

  async function clean() {
    const ids = [T, X];
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "ODK BTG" }, { id: X, name: "ODK other" }] });
    for (const t of [T, X]) {
      await prisma.sponsor.create({ data: { id: `${t}_sponsor`, tenantId: t, name: "Harbor Coffee", categories: ["FAST_FOOD"] } });
      await prisma.nilJob.create({ data: { id: `${t}_job`, tenantId: t, name: "Instagram post + story", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
      /* $3,000 budget. */
      await prisma.campaign.create({ data: { id: `${t}_campaign`, tenantId: t, sponsorId: `${t}_sponsor`, name: "Weekday foot traffic", budget: 300_000, startDate: new Date(), endDate: inDays(90), state: "STAFFING" } });
    }
    await prisma.guardian.create({ data: { id: "odk_guardian", tenantId: T, legalName: "Carmen Reyes", email: "odk_guardian@odk-test.invalid", relationship: "PARENT" } });
    await prisma.athlete.createMany({ data: [
      { id: "odk_riley", tenantId: T, slug: "odk-riley", legalName: "Riley Carter", displayName: "Riley Carter", email: "riley@odk-test.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", birthDate: yearsAgo(20), state: "ACTIVE", tier: "CREATOR" },
      { id: "odk_jordan", tenantId: T, slug: "odk-jordan", legalName: "Jordan Reyes", displayName: "Jordan Reyes", email: "jordan@odk-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "16_17", birthDate: yearsAgo(16), state: "ACTIVE", guardianId: "odk_guardian" },
      { id: "odk_pending", tenantId: T, slug: "odk-pending", legalName: "Riley Pending", displayName: "Riley Pending", email: "pending@odk-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "SUBMITTED" },
      { id: "odk_x_ath", tenantId: X, slug: "odk-x-ath", legalName: "Riley Elsewhere", displayName: "Riley Elsewhere", email: "x@odk-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    /* Riley's rate for the job: $300 (an older $250 version stays below it). */
    await prisma.athleteRate.createMany({ data: [
      { tenantId: T, athleteId: "odk_riley", jobId: `${T}_job`, amount: 25_000, version: 1 },
      { tenantId: T, athleteId: "odk_riley", jobId: `${T}_job`, amount: 30_000, version: 2 },
    ] });
    await prisma.inventoryItem.create({ data: { id: "odk_clinic", tenantId: T, athleteId: "odk_riley", title: "Basketball clinic", kind: "OTHER", priceCents: 50_000 } });
    /* A live order of $500 pay (floor $700) and a cancelled one that doesn't count. */
    await prisma.campaignOrder.createMany({ data: [
      { tenantId: T, campaignId: `${T}_campaign`, athleteId: "odk_jordan", jobId: `${T}_job`, compensation: 50_000, sellPrice: 80_000, usageRights: "90 days", dueDate: inDays(30) },
      { tenantId: T, campaignId: `${T}_campaign`, athleteId: "odk_riley", jobId: `${T}_job`, compensation: 90_000, sellPrice: 130_000, usageRights: "90 days", dueDate: inDays(30), state: "CANCELLED" },
    ] });
    await prisma.offer.create({ data: {
      id: "odk_offer_minor", tenantId: T, campaignId: `${T}_campaign`, athleteId: "odk_jordan", jobId: `${T}_job`, brief: "Visit on a weekday morning.",
      compensation: 40_000, sellPrice: 65_000, deliverables: [{ title: "Post", dueDate: inDays(14).toISOString() }], usageRights: "90 days",
      disclosures: ["#ad"], expiresAt: inDays(7), state: "SENT", sentAt: new Date(), termsHash: "a".repeat(64),
    } });
    await prisma.user.createMany({ data: [
      { id: "odk_admin", tenantId: T, clerkId: "odk_admin", email: "odk_admin@odk-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "odk_cm", tenantId: T, clerkId: "odk_cm", email: "odk_cm@odk-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "odk_sales", tenantId: T, clerkId: "odk_sales", email: "odk_sales@odk-test.invalid", roles: ["SALES"] },
      { id: "odk_athlete", tenantId: T, clerkId: "odk_athlete", email: "riley@odk-test.invalid", roles: ["ATHLETE"], athleteId: "odk_riley" },
      { id: "odk_x_admin", tenantId: X, clerkId: "odk_x_admin", email: "odk_x_admin@odk-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  const checks = (q: Record<string, string | number>) =>
    `/campaigns/${T}_campaign/offer-checks?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`;

  it("names the athlete's floor — their current rate for the job — and whether the pay clears it", async () => {
    const above = await get(checks({ athleteId: "odk_riley", jobId: `${T}_job`, compensation: 40_000, sellPrice: 65_000 }), "odk_admin");
    expect(above.status).toBe(200);
    expect(above.json).toMatchObject({ floorCents: 30_000, floorSource: "RATE", clearsFloor: true, clearsMarginFloor: true, marginCents: 25_000, problems: [] });
    const below = await get(checks({ athleteId: "odk_riley", jobId: `${T}_job`, compensation: 25_000, sellPrice: 65_000 }), "odk_cm");
    expect(below.json).toMatchObject({ floorCents: 30_000, clearsFloor: false, marginCents: 40_000 });
    expect(below.json.problems).toEqual([{ code: "RATE_FLOOR", message: "Pay is below the athlete's rate for this job of $300.00." }]);
  });

  it("takes the item's price as the floor when the offer buys one, and says saving would refuse below it", async () => {
    const r = await get(checks({ athleteId: "odk_riley", jobId: `${T}_job`, inventoryItemId: "odk_clinic", compensation: 40_000, sellPrice: 80_000 }), "odk_admin");
    expect(r.json).toMatchObject({ floorCents: 50_000, floorSource: "ITEM", clearsFloor: false });
    expect(r.json.problems).toEqual([{ code: "ITEM_FLOOR", message: "Pay is below the item's price of $500.00." }]);
    /* Another athlete's item is not this athlete's. */
    const other = await get(checks({ athleteId: "odk_jordan", jobId: `${T}_job`, inventoryItemId: "odk_clinic", compensation: 40_000 }), "odk_admin");
    expect(other.json.problems).toContainEqual({ code: "NOT_THEIR_ITEM", message: "That inventory item is not this athlete's." });
  });

  it("asks the margin floor the way drafting does: sell price ≥ pay × 1.4", async () => {
    const r = await get(checks({ athleteId: "odk_riley", jobId: `${T}_job`, compensation: 40_000, sellPrice: 55_000 }), "odk_admin");
    expect(r.json).toMatchObject({ minSellPriceCents: 56_000, clearsMarginFloor: false });
    expect(r.json.problems).toHaveLength(1);
    expect(r.json.problems[0]).toMatchObject({ code: "MARGIN_FLOOR", message: expect.stringMatching(/may not be below 56000/) });
  });

  it("counts the remaining budget as drafting does — live orders at their floor, cancelled ones not at all", async () => {
    /* $3,000 − $500 × 1.4 = $2,300 left. */
    const fits = await get(checks({ compensation: 100_000 }), "odk_admin");
    expect(fits.json).toMatchObject({ budgetCents: 300_000, committedCents: 70_000, remainingBudgetCents: 230_000, neededCents: 140_000, fitsBudget: true });
    const over = await get(checks({ compensation: 170_000 }), "odk_admin");
    expect(over.json).toMatchObject({ remainingBudgetCents: 230_000, fitsBudget: false });
    expect(over.json.problems).toEqual([{ code: "BUDGET", message: expect.stringMatching(/budget/) }]);
  });

  it("answers nothing it has no inputs for", async () => {
    const r = await get(checks({}), "odk_admin");
    expect(r.json).toMatchObject({ floorCents: null, clearsFloor: null, clearsMarginFloor: null, fitsBudget: null, marginCents: null, problems: [] });
  });

  it("is BTG's writers' alone, on their own tenant's campaign", async () => {
    expect((await get(checks({ compensation: 1 }), "odk_sales")).status).toBe(403); // reads offers, drafts none
    expect((await get(checks({ compensation: 1 }), "odk_athlete")).status).toBe(403);
    expect((await get(checks({ compensation: 1 }), "odk_x_admin")).status).toBe(403); // another tenant's campaign
    expect((await get(`/campaigns/${X}_campaign/offer-checks?athleteId=odk_riley`, "odk_x_admin")).status).toBe(403); // another tenant's athlete
    expect((await get(checks({ bogus: 1 }), "odk_admin")).status).toBe(400);
  });

  it("lists the tenant's active athletes by name, with whether a guardian answers", async () => {
    const r = await get("/offers/athletes?q=r", "odk_admin");
    expect(r.status).toBe(200);
    const names = r.json.athletes.map((a: { name: string }) => a.name);
    expect(names).toEqual(["Jordan Reyes", "Riley Carter"]); // not the pending one, not another tenant's
    expect(r.json.athletes[0]).toMatchObject({ id: "odk_jordan", minor: true, guardianAnswers: true, guardianName: "Carmen Reyes", age: 16 });
    expect(r.json.athletes[1]).toMatchObject({ id: "odk_riley", minor: false, guardianAnswers: false, guardianName: null, age: 20, tier: "CREATOR" });
    expect((await get("/offers/athletes?q=riley", "odk_admin")).json.athletes.map((a: { id: string }) => a.id)).toEqual(["odk_riley"]);
    /* A campaign manager may not read a date of birth, so gets no age. */
    const cm = await get("/offers/athletes?q=jordan", "odk_cm");
    expect(cm.json.athletes[0]).toMatchObject({ guardianAnswers: true, age: null });
    expect((await get("/offers/athletes", "odk_sales")).status).toBe(403);
    expect((await get("/offers/athletes", "odk_athlete")).status).toBe(403);
    expect((await get("/offers/athletes", "odk_x_admin")).json.athletes.map((a: { id: string }) => a.id)).toEqual(["odk_x_ath"]);
  });

  it("an offer read names its athlete, its job, and who answers it", async () => {
    const r = await get("/offers/odk_offer_minor", "odk_admin");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      jobName: "Instagram post + story", sellPrice: 65_000,
      athlete: { name: "Jordan Reyes", guardianAnswers: true, guardianName: "Carmen Reyes", age: 16 },
    });
    const list = await get("/offers", "odk_sales");
    expect(list.json.offers[0].athlete).toMatchObject({ name: "Jordan Reyes", guardianAnswers: true, age: null });
  });

  /* The form and the API ask one floor (athleteFloor / floorProblem). */
  const draft = (over: Record<string, unknown> = {}) => ({
    campaignId: `${T}_campaign`, athleteId: "odk_riley", jobId: `${T}_job`, brief: "Visit on a weekday morning.",
    compensation: 30_000, sellPrice: 65_000, deliverables: [{ title: "Post", dueDate: inDays(14).toISOString() }],
    usageRights: "90 days", disclosures: ["#ad"], expiresAt: inDays(7).toISOString(), ...over,
  });

  it("refuses to draft an offer below the athlete's rate for the job, naming the floor", async () => {
    const below = await call("POST", "/offers", "odk_admin", draft({ compensation: 25_000 }));
    expect(below.status).toBe(422);
    expect(below.text).toContain("below the athlete's rate for this job of $300.00");
    expect(await prisma.offer.count({ where: { tenantId: T, athleteId: "odk_riley", compensation: 25_000 } })).toBe(0);
    /* At the rate is not below it. */
    const at = await call("POST", "/offers", "odk_admin", draft());
    expect(at.status).toBe(201);
    expect(at.json).toMatchObject({ state: "DRAFT", compensation: 30_000 });
  });

  it("applies no rate floor when the athlete has no rate for the job", async () => {
    const r = await call("POST", "/offers", "odk_cm", draft({ athleteId: "odk_jordan", compensation: 5_000, sellPrice: 20_000 }));
    expect(r.status).toBe(201);
    expect((await get(checks({ athleteId: "odk_jordan", jobId: `${T}_job`, compensation: 5_000 }), "odk_cm")).json)
      .toMatchObject({ floorCents: null, floorSource: null, clearsFloor: null });
  });

  it("refuses an edit that carries a draft below the athlete's rate", async () => {
    const made = await call("POST", "/offers", "odk_admin", draft());
    expect(made.status).toBe(201);
    const edit = await call("PATCH", `/offers/${made.json.id}`, "odk_admin", { compensation: 29_999 });
    expect(edit.status).toBe(422);
    expect(edit.text).toContain("$300.00");
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: made.json.id }, select: { compensation: true } })).compensation).toBe(30_000);
  });

  it("refuses to send a draft saved below the athlete's rate — the rate rose, or it was saved before the check", async () => {
    /* A draft below the rate, as one saved before this check existed would be. */
    await prisma.offer.create({ data: {
      id: "odk_offer_low", tenantId: T, campaignId: `${T}_campaign`, athleteId: "odk_riley", jobId: `${T}_job`, brief: "Visit on a weekday morning.",
      compensation: 25_000, sellPrice: 65_000, deliverables: [{ title: "Post", dueDate: inDays(14).toISOString() }], usageRights: "90 days",
      disclosures: ["#ad"], expiresAt: inDays(7), createdBy: "odk_admin",
    } });
    const r = await call("POST", "/offers/odk_offer_low/send", "odk_admin");
    expect(r.status).toBe(422);
    expect(r.text).toContain("below the athlete's rate for this job of $300.00");
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: "odk_offer_low" }, select: { state: true } })).state).toBe("DRAFT");
    /* The form says the same of it. */
    expect((await get(checks({ athleteId: "odk_riley", jobId: `${T}_job`, compensation: 25_000 }), "odk_admin")).json.clearsFloor).toBe(false);
    /* Raised to the rate, it sends. */
    expect((await call("PATCH", "/offers/odk_offer_low", "odk_admin", { compensation: 30_000 })).status).toBe(200);
    const sent = await call("POST", "/offers/odk_offer_low/send", "odk_admin");
    expect(sent.status).toBe(200);
    expect(sent.json.state).toBe("SENT");
  });
});

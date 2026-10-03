import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P4-BE-08 — the ranked shortlist and the pre-filled offer, against the real
   API and database:

   GET /briefs/:id/eligible-athletes — best match first, every row with its
     `matchScore` and `reasons`; the conflicted athlete never appears however
     well they would score; the paged order is the same order cut into pages
     (no athlete on two pages or none); verified work on the brief's own
     campaign is not "past" work; a caller who may not read rates or other
     campaigns' orders is ranked without them.
   GET /campaigns/:id/offer-draft — each field from its source, with words
     saying so; never below the tier's sell floor or the 1.4× margin floor;
     POST /offers takes it unchanged; it creates nothing; 403 for a role
     without offer write; 404 for another tenant's campaign, athlete or job;
     409 for an athlete a restriction bars.
   Only Clerk is stubbed — and the deliverable template table, to give this
   file's own job (job ids are global) a template.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@mrk-test.invalid` } : null;
  },
}));
vi.mock("../src/domain/deliverable-template", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/domain/deliverable-template")>();
  const DELIVERABLE_TEMPLATES = {
    ...real.DELIVERABLE_TEMPLATES,
    mrk_btg_post: [{ title: "Mrk unboxing story", daysBeforeDue: 7 }, { title: "Mrk feed post", daysBeforeDue: 0 }],
  } as Record<string, readonly { title: string; daysBeforeDue: number }[]>;
  return {
    ...real,
    DELIVERABLE_TEMPLATES,
    deliverablesForOrder: (i: { jobId: string; dueDate: Date }) =>
      DELIVERABLE_TEMPLATES[i.jobId]!.map((t) => ({ title: t.title, dueDate: new Date(i.dueDate.getTime() - t.daysBeforeDue * 864e5) })),
  };
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P4-BE-08 · ranked shortlist and pre-filled offer", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "mrk_btg";
  const X = "mrk_other";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "x-test-clerk": clerk, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const get = (path: string, clerk: string) => call("GET", path, clerk);
  const inDays = (n: number) => new Date(Date.now() + n * 864e5);

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

  /* Expected rank, Maryland basketball, $600 over up to four athletes ($150 each):
       Avery  30+20 + 5 verified (20) + $80 rate fits (20) + accepted 10 days ago (10) = 100
       Blake  30+20 + 2 verified (8)  + $140 rate, 31% over (14) + 100 days ago (5)   =  77
       Casey  30+20 + verified work only on THIS campaign (0) + no rate (0) + 300 days (0) = 50
       Drew   30+20 + nothing                                                           =  50
     Ellis would top them all — and restricts ALCOHOL, the brief's category. */
  const ORDER = ["mrk_avery", "mrk_blake", "mrk_casey", "mrk_drew"];

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "MRK BTG" }, { id: X, name: "MRK other" }] });
    for (const t of [T, X]) {
      await prisma.sponsor.create({ data: { id: `${t}_sponsor`, tenantId: t, name: `Mrk Harbor Spirits ${t}`, categories: ["ALCOHOL"] } });
      /* The catalogue is whole dollars: SX-02's band. */
      await prisma.nilJob.create({ data: { id: `${t}_post`, tenantId: t, name: "Mrk Sponsored Post", baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210 } });
      await prisma.sponsorPackage.create({ data: { id: `${t}_pkg`, tenantId: t, code: "MRK_BLITZ", name: "Mrk Blitz", priceLow: 50_000, priceHigh: 80_000, athleteCountMin: 2, athleteCountMax: 4, lineItems: [{ jobCode: `${t}_post`, quantityPerAthlete: 1 }], exclusivity: true, durationWeeks: 6 } });
      await prisma.campaignBrief.create({ data: { id: `${t}_brief`, tenantId: t, sponsorId: `${t}_sponsor`, objective: "Mrk: weekday foot traffic in Maryland", budget: 60_000, packageId: `${t}_pkg`, startDate: new Date(), endDate: inDays(60), sports: ["Basketball"], stateCodes: ["MD"], categories: ["ALCOHOL"], state: "CAMPAIGN_CREATED" } });
      await prisma.campaign.create({ data: { id: `${t}_campaign`, tenantId: t, sponsorId: `${t}_sponsor`, briefId: `${t}_brief`, name: "Mrk weekday traffic", budget: 60_000, startDate: new Date(), endDate: inDays(60), state: "STAFFING" } });
      await prisma.campaign.create({ data: { id: `${t}_past`, tenantId: t, sponsorId: `${t}_sponsor`, name: "Mrk spring", budget: 100_000, startDate: inDays(-200), endDate: inDays(-120), state: "COMPLETED" } });
    }
    const ath = (id: string, displayName: string, extra: Record<string, unknown> = {}) => ({
      id, tenantId: T, slug: id.replace(/_/g, "-"), legalName: displayName, displayName, email: `${id}@mrk-test.invalid`,
      sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS" as const, state: "ACTIVE" as const,
      /* Set, as sign-up sets it: a NULL array fails the conflict filter's NOT. */
      restrictedCategories: [] as string[], ...extra,
    });
    await prisma.athlete.createMany({ data: [
      ath("mrk_avery", "Avery Mrkwood", { tier: "PREMIUM" }),
      ath("mrk_blake", "Blake Mrkson", { tier: "EMERGING" }),
      ath("mrk_casey", "Casey Mrkley"),
      ath("mrk_drew", "Drew Mrkham"),
      ath("mrk_ellis", "Ellis Mrkgrant", { tier: "PREMIUM", restrictedCategories: ["ALCOHOL"] }),
      ath("mrk_finley", "Finley Mrksoccer", { sport: "Soccer" }),
      ath("mrk_gray", "Gray Mrkpending", { state: "SUBMITTED" }),
      { ...ath("mrk_x_ath", "Elsewhere Mrkother"), tenantId: X },
    ] });
    await prisma.athleteRate.createMany({ data: [
      { tenantId: T, athleteId: "mrk_avery", jobId: `${T}_post`, amount: 7_000, version: 1 },
      { tenantId: T, athleteId: "mrk_avery", jobId: `${T}_post`, amount: 8_000, version: 2 },
      { tenantId: T, athleteId: "mrk_blake", jobId: `${T}_post`, amount: 14_000, version: 1 },
      { tenantId: T, athleteId: "mrk_ellis", jobId: `${T}_post`, amount: 1_000, version: 1 },
    ] });
    /* History. Orders on the past campaign (and one on this brief's own). */
    const order = async (id: string, campaign: string, athleteId: string, acceptedDaysAgo: number | null, verified: number) => {
      await prisma.campaignOrder.create({ data: {
        id, tenantId: T, campaignId: campaign, athleteId, jobId: `${T}_post`, compensation: 5_000, sellPrice: 14_000,
        usageRights: "Organic, 90 days", dueDate: inDays(-130), state: "COMPLETED",
        acceptedAt: acceptedDaysAgo === null ? null : inDays(-acceptedDaysAgo),
      } });
      for (let i = 0; i < verified; i++) {
        await prisma.deliverable.create({ data: { tenantId: T, orderId: id, title: `Mrk post ${i + 1}`, dueDate: inDays(-130), state: "VERIFIED" } });
      }
      /* An unverified deliverable never counts. */
      await prisma.deliverable.create({ data: { tenantId: T, orderId: id, title: "Mrk draft", dueDate: inDays(-130), state: "PUBLISHED" } });
    };
    await order("mrk_o_avery", `${T}_past`, "mrk_avery", 10, 5);
    await order("mrk_o_blake", `${T}_past`, "mrk_blake", 100, 2);
    await order("mrk_o_casey", `${T}_campaign`, "mrk_casey", 300, 3);
    await order("mrk_o_ellis", `${T}_past`, "mrk_ellis", 2, 12);
    await prisma.user.createMany({ data: [
      { id: "mrk_admin", tenantId: T, clerkId: "mrk_admin", email: "mrk_admin@mrk-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "mrk_cm", tenantId: T, clerkId: "mrk_cm", email: "mrk_cm@mrk-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "mrk_sales", tenantId: T, clerkId: "mrk_sales", email: "mrk_sales@mrk-test.invalid", roles: ["SALES"] },
      { id: "mrk_netmgr", tenantId: T, clerkId: "mrk_netmgr", email: "mrk_netmgr@mrk-test.invalid", roles: ["NETWORK_MGR"] },
      { id: "mrk_finance", tenantId: T, clerkId: "mrk_finance", email: "mrk_finance@mrk-test.invalid", roles: ["FINANCE"] },
      { id: "mrk_athlete", tenantId: T, clerkId: "mrk_athlete", email: "mrk_avery@mrk-test.invalid", roles: ["ATHLETE"], athleteId: "mrk_avery" },
      { id: "mrk_x_admin", tenantId: X, clerkId: "mrk_x_admin", email: "mrk_x_admin@mrk-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  const SHORTLIST = `/briefs/${T}_brief/eligible-athletes`;
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  describe("the ranked shortlist", () => {
    it("ranks best match first, each row with its score and every reason", async () => {
      const r = await get(SHORTLIST, "mrk_admin");
      expect(r.status, r.text).toBe(200);
      expect(ids(r.json.athletes)).toEqual(ORDER);
      const [avery, blake, casey, drew] = r.json.athletes;
      expect(avery).toMatchObject({ matchScore: 100, score: null });
      expect(avery.reasons).toEqual([
        { key: "sport", text: "Plays basketball", points: 30 },
        { key: "state", text: "Based in Maryland", points: 20 },
        { key: "work", text: "5 deliverables verified on past campaigns", points: 20 },
        { key: "rate", text: "Rate for this job fits the budget", points: 20 },
        { key: "recent", text: "Accepted an offer in the last 60 days", points: 10 },
      ]);
      expect(blake.matchScore).toBe(77);
      expect(blake.reasons).toContainEqual({ key: "rate", text: "Rate is 31% over this athlete's share of the budget", points: 14 });
      expect(blake.reasons).toContainEqual({ key: "work", text: "2 deliverables verified on past campaigns", points: 8 });
      /* Verified work on this brief's own campaign is not past work. */
      expect(casey.matchScore).toBe(50);
      expect(casey.reasons).toContainEqual({ key: "work", text: "No verified deliverables on past campaigns yet", points: 0 });
      expect(casey.reasons).toContainEqual({ key: "rate", text: `No rate on file for ${T}_post`, points: 0 });
      /* An equal score falls back to the name. */
      expect(drew.matchScore).toBe(50);
    });

    it("never brings back a conflicted athlete, however well they would score — nor the off-target or inactive", async () => {
      const all = await get(`${SHORTLIST}?limit=200`, "mrk_admin");
      expect(ids(all.json.athletes)).not.toContain("mrk_ellis");
      for (const sort of ["match", "score", "name"]) {
        const page = await get(`${SHORTLIST}?page=1&size=100&sort=${sort}`, "mrk_admin");
        expect(ids(page.json.athletes), sort).not.toContain("mrk_ellis");
        expect(page.json.page.total).toBe(4);
      }
      expect(ids(all.json.athletes)).not.toContain("mrk_finley");
      expect(ids(all.json.athletes)).not.toContain("mrk_gray");
      /* And searching for Ellis by name finds nothing. */
      expect((await get(`${SHORTLIST}?page=1&q=Ellis`, "mrk_admin")).json.athletes).toEqual([]);
    });

    it("keeps the ranking across pages: the same order, cut into pages, nobody twice or never", async () => {
      const seen: string[] = [];
      for (let p = 1; p <= 4; p++) {
        const r = await get(`${SHORTLIST}?page=${p}&size=1`, "mrk_cm");
        expect(r.json.page).toMatchObject({ page: p, size: 1, total: 4, pages: 4 });
        seen.push(...ids(r.json.athletes));
      }
      expect(seen).toEqual(ORDER);
      const two = [...ids((await get(`${SHORTLIST}?page=1&size=3`, "mrk_cm")).json.athletes), ...ids((await get(`${SHORTLIST}?page=2&size=3`, "mrk_cm")).json.athletes)];
      expect(two).toEqual(ORDER);
      /* The unpaged limit takes the best N, not the first N by name. */
      expect(ids((await get(`${SHORTLIST}?limit=2`, "mrk_admin")).json.athletes)).toEqual(["mrk_avery", "mrk_blake"]);
    });

    it("carries the rank on the name sort too, and keeps the name order there", async () => {
      const r = await get(`${SHORTLIST}?page=1&size=12&sort=name`, "mrk_admin");
      expect(ids(r.json.athletes)).toEqual(["mrk_avery", "mrk_blake", "mrk_casey", "mrk_drew"]);
      expect(r.json.athletes.map((a: { matchScore: number }) => a.matchScore)).toEqual([100, 77, 50, 50]);
    });

    it("ranks a caller who may not read rates or other campaigns' orders by what they may read", async () => {
      const r = await get(`${SHORTLIST}?page=1&size=12`, "mrk_sales");
      expect(r.status, r.text).toBe(200);
      for (const a of r.json.athletes) {
        expect(a.matchScore).toBe(50);
        expect(a.reasons.map((x: { key: string }) => x.key)).toEqual(["sport", "state"]);
        expect(a.rates).toBeUndefined();
      }
      /* Equal scores: the name order. */
      expect(ids(r.json.athletes)).toEqual(["mrk_avery", "mrk_blake", "mrk_casey", "mrk_drew"]);
    });

    it("is still another tenant's brief to nobody else", async () => {
      expect((await get(SHORTLIST, "mrk_x_admin")).status).toBe(403);
      expect((await get(`${SHORTLIST}?page=1`, "mrk_x_admin")).status).toBe(403);
    });
  });

  describe("the pre-filled offer", () => {
    const DRAFT = (athleteId: string, jobId = `${T}_post`) => `/campaigns/${T}_campaign/offer-draft?athleteId=${athleteId}&jobId=${jobId}`;

    it("creates nothing", async () => {
      const count = async () => {
        const [offers, invites, orders, audits] = await Promise.all([
          prisma.offer.count({ where: { tenantId: T } }),
          prisma.campaignInvite.count({ where: { tenantId: T } }),
          prisma.campaignOrder.count({ where: { tenantId: T } }),
          prisma.auditLog.count({ where: { tenantId: T } }),
        ]);
        return { offers, invites, orders, audits };
      };
      const before = await count();
      for (const who of ["mrk_avery", "mrk_blake", "mrk_drew"]) expect((await get(DRAFT(who), "mrk_admin")).status).toBe(200);
      expect(await count()).toEqual(before);
    });

    it("fills each field from its source, and says where it came from", async () => {
      const r = await get(DRAFT("mrk_avery"), "mrk_cm");
      expect(r.status, r.text).toBe(200);
      const { offer, sources, athlete, job } = r.json;
      expect(athlete).toMatchObject({ id: "mrk_avery", name: "Avery Mrkwood", minor: false, guardianAnswers: false });
      expect(job).toEqual({ id: `${T}_post`, name: "Mrk Sponsored Post" });
      /* Pay: the current rate (version 2), not the old one. */
      expect(offer.compensation).toBe(8_000);
      expect(sources.compensation).toBe("From Avery's rate card for Mrk Sponsored Post");
      /* Sell: the Premium floor, $210 — above 1.4 × $80. */
      expect(offer.sellPrice).toBe(21_000);
      expect(sources.sellPrice).toBe("The Premium sell floor for Mrk Sponsored Post ($210)");
      /* Deliverables: the job's template, the last due on the campaign's end. */
      const end = (await prisma.campaign.findUniqueOrThrow({ where: { id: `${T}_campaign` }, select: { endDate: true } })).endDate;
      expect(offer.deliverables.map((d: { title: string }) => d.title)).toEqual(["Mrk unboxing story", "Mrk feed post"]);
      expect(offer.deliverables[1].dueDate.slice(0, 10)).toBe(end.toISOString().slice(0, 10));
      expect(sources.deliverables).toBe("From the Mrk Sponsored Post template, the last due on the campaign's end date");
      /* #ad, and the age gate the alcohol category adds. */
      expect(offer.disclosures).toEqual(["#ad", "21+"]);
      expect(sources.disclosures).toMatch(/alcohol/);
      /* The package's terms: exclusive for its six weeks. */
      expect(offer.exclusivityDays).toBe(42);
      expect(sources.exclusivityDays).toBe("The Mrk Blitz package is exclusive for its 6 weeks");
      expect(offer.usageRights).toMatch(/6 weeks/);
      /* Seven days out, the end of that day. */
      const days = (new Date(offer.expiresAt).getTime() - Date.now()) / 864e5;
      expect(days).toBeGreaterThan(7);
      expect(days).toBeLessThanOrEqual(8);
      expect(offer.expiresAt.endsWith("T23:59:59.000Z")).toBe(true);
      expect(offer.brief).toBe("Mrk: weekday foot traffic in Maryland");
      expect(sources.brief).toBe("From the sponsor's brief");
      expect(offer).toMatchObject({ campaignId: `${T}_campaign`, athleteId: "mrk_avery", jobId: `${T}_post`, inventoryItemId: null });
      expect(Object.keys(sources).sort()).toEqual(["brief", "compensation", "deliverables", "disclosures", "exclusivityDays", "expiresAt", "sellPrice", "usageRights"]);
    });

    it("never prices below the margin floor: a rate above the tier's band raises the sell price to 1.4 × pay", async () => {
      const r = await get(DRAFT("mrk_blake"), "mrk_admin");
      expect(r.json.offer.compensation).toBe(14_000);
      /* The Emerging floor is $140 — 1.4 × $140 is $196. */
      expect(r.json.offer.sellPrice).toBe(19_600);
      expect(r.json.sources.sellPrice).toBe("Raised to 1.4 × the pay ($196), the margin floor — the Emerging sell floor for Mrk Sponsored Post ($140) is below it");
    });

    it("with no rate on file, pays the base range's midpoint and prices an untiered athlete at the bottom floor", async () => {
      const r = await get(DRAFT("mrk_drew"), "mrk_admin");
      expect(r.json.offer.compensation).toBe(7_500);
      expect(r.json.sources.compensation).toBe("No rate on file for Drew — the middle of Mrk Sponsored Post's base range ($50–$100)");
      expect(r.json.offer.sellPrice).toBe(14_000);
    });

    it("passes the offer checks, and POST /offers takes it unchanged", async () => {
      for (const who of ["mrk_avery", "mrk_blake", "mrk_drew"]) {
        const { offer } = (await get(DRAFT(who), "mrk_cm")).json;
        const checks = await get(`/campaigns/${T}_campaign/offer-checks?athleteId=${who}&jobId=${T}_post&compensation=${offer.compensation}&sellPrice=${offer.sellPrice}`, "mrk_cm");
        expect(checks.json.problems, who).toEqual([]);
        const made = await call("POST", "/offers", "mrk_cm", offer);
        expect(made.status, `${who}: ${made.text}`).toBe(201);
        expect(made.json).toMatchObject({ state: "DRAFT", compensation: offer.compensation, sellPrice: offer.sellPrice, exclusivityDays: offer.exclusivityDays });
        /* …and sends. */
        expect((await call("POST", `/offers/${made.json.id}/send`, "mrk_cm")).status).toBe(200);
      }
    });

    it("refuses an athlete a restriction bars from the campaign's categories", async () => {
      const r = await get(DRAFT("mrk_ellis"), "mrk_admin");
      expect(r.status).toBe(409);
      expect(r.text).toMatch(/ALCOHOL/);
    });

    it("refuses an athlete who cannot take paid work", async () => {
      expect((await get(DRAFT("mrk_gray"), "mrk_admin")).status).toBe(409);
    });

    it("is BTG's offer writers' alone: 403 for every role without offer write", async () => {
      for (const who of ["mrk_sales", "mrk_netmgr", "mrk_finance", "mrk_athlete"]) {
        const r = await get(DRAFT("mrk_avery"), who);
        expect(r.status, who).toBe(403);
        expect(r.text).not.toMatch(/sellPrice|compensation/);
      }
    });

    it("answers 404 for another tenant's campaign, athlete or job", async () => {
      expect((await get(DRAFT("mrk_avery"), "mrk_x_admin")).status).toBe(404);
      expect((await get(DRAFT("mrk_x_ath"), "mrk_admin")).status).toBe(404);
      expect((await get(DRAFT("mrk_avery", `${X}_post`), "mrk_admin")).status).toBe(404);
      expect((await get(`/campaigns/nope/offer-draft?athleteId=mrk_avery&jobId=${T}_post`, "mrk_admin")).status).toBe(404);
    });

    it("needs both the athlete and the job", async () => {
      expect((await get(`/campaigns/${T}_campaign/offer-draft?athleteId=mrk_avery`, "mrk_admin")).status).toBe(422);
      expect((await get(`/campaigns/${T}_campaign/offer-draft?athleteId=mrk_avery&jobId=${T}_post&bogus=1`, "mrk_admin")).status).toBe(400);
    });
  });
});

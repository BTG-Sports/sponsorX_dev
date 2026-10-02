import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertEditionTransition, canTransitionEdition, EDITION_STATES } from "../src/domain/edition-state";
import { allocateSplit } from "../src/domain/revenue-split";
import { canTransitionCampaign } from "../src/domain/campaign-state";

/* --------------------------------------------------------------------------
   SponsorX NEXT, Stage 9 Batch A — P9-BE-02, -03, -06, -09, -12.

   Each acceptance clause is asserted on the path a real request takes: the
   domain functions the routes call, over a real database, with the
   Postgres-level rules attacked directly as well — "enforced by the database
   and not by a query" is only proven by a write that skips the query.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@next-test.invalid` } : null;
  },
}));

/* Dynamic: domain/edition loads the database client, which reads env at import. */
const { positionsFor, spreadPrice } = await import("../src/domain/edition");

describe("P9-BE-02 · the edition state machine (pure)", () => {
  const conditions = { contentReady: true, rightsCleared: true, revenueMet: true };

  it("walks PLANNING → … → DISTRIBUTED, with the free digital edition a stop on the way", () => {
    const path = ["PLANNING", "SELLING", "CLOSED", "IN_PRODUCTION", "PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED"] as const;
    for (let i = 0; i + 1 < path.length; i++) expect(canTransitionEdition(path[i]!, path[i + 1]!)).toBe(true);
  });

  it("refuses skipping a step and leaving a terminal state", () => {
    expect(canTransitionEdition("PLANNING", "CLOSED")).toBe(false);
    expect(canTransitionEdition("SELLING", "IN_PRODUCTION")).toBe(false);
    for (const to of EDITION_STATES) {
      expect(canTransitionEdition("DISTRIBUTED", to)).toBe(false);
      expect(canTransitionEdition("CANCELLED", to)).toBe(false);
    }
    expect(canTransitionEdition("IN_PRODUCTION", "CANCELLED")).toBe(false);
  });

  it("goes to production only with content, rights and revenue all in place", () => {
    expect(() => assertEditionTransition("CLOSED", "IN_PRODUCTION", conditions)).not.toThrow();
    for (const key of ["contentReady", "rightsCleared", "revenueMet"] as const) {
      expect(() => assertEditionTransition("CLOSED", "IN_PRODUCTION", { ...conditions, [key]: false }))
        .toThrow(new RegExp(key));
    }
  });
});

describe("P9-BE-06 · the four-way split (pure)", () => {
  it("is 40/30/20/10 and always sums to the revenue exactly", () => {
    expect(allocateSplit(1_300_000).map((l) => [l.payeeKind, l.amountCents])).toEqual([
      ["SPONSORX", 520_000], ["SCHOOL", 390_000], ["STUDENT_POOL", 260_000], ["EDITORIAL_FUND", 130_000],
    ]);
    for (const revenue of [0, 1, 7, 99, 101, 12_345, 999_999]) {
      const lines = allocateSplit(revenue);
      expect(lines).toHaveLength(4);
      expect(lines.reduce((s, l) => s + l.amountCents, 0), `revenue ${revenue}`).toBe(revenue);
      expect(lines.reduce((s, l) => s + l.bps, 0)).toBe(10_000);
    }
  });
});

describe("P9-BE-03 · a package's includes become positions (pure)", () => {
  it("reads the P9-BE-01 includes into slot kinds, and prices them to the package total", () => {
    expect(positionsFor([
      { kind: "AD_SLOT", code: "FULL", quantity: 1 }, { kind: "FEATURE", code: "NEXT_SPONSORED_FEATURE" },
      { kind: "STUDENT_CONTENT", code: "STUDENT_SOCIAL_POST", quantity: 4 }, { kind: "REPORT", code: "BASIC_REPORT" },
    ])).toEqual(["FULL"]);
    expect(positionsFor([{ kind: "PRESENTING", code: "NEXT_PRESENTING_SPONSOR", quantity: 1 }])).toEqual(["PRESENTING"]);
    expect(positionsFor([{ kind: "REPORT", code: "BASIC_REPORT" }])).toEqual([]);
    expect(spreadPrice(150_000, [80_000])).toEqual([150_000]);
    const split = spreadPrice(100_001, [25_000, 50_000, 25_000]);
    expect(split.reduce((s, v) => s + v, 0)).toBe(100_001);
  });
});

describe("P9-BE-09 · an ad-only campaign skips STAFFING (pure)", () => {
  it("DRAFT → APPROVAL only with zero orders and at least one sold slot", () => {
    expect(canTransitionCampaign("DRAFT", "APPROVAL", { orders: 0, adSlots: 1 })).toBe(true);
    expect(canTransitionCampaign("DRAFT", "APPROVAL", { orders: 0, adSlots: 0 })).toBe(false);
    expect(canTransitionCampaign("DRAFT", "APPROVAL", { orders: 2, adSlots: 1 })).toBe(false);
    expect(canTransitionCampaign("DRAFT", "APPROVAL")).toBe(false);
    expect(canTransitionCampaign("DRAFT", "STAFFING", { orders: 0, adSlots: 1 })).toBe(true);
  });
});

describe("P9-BE-12 · RewardEventType is untouched", () => {
  it("still has exactly the four fan-journey events", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const body = schema.match(/enum RewardEventType \{([^}]*)\}/)![1]!;
    expect(body.split(/\s+/).filter(Boolean)).toEqual(["SCAN", "LANDING", "CLAIM", "REDEEM"]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("SponsorX NEXT editions, on the path a request takes", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { seedPackages } = await import("../worker/jobs/seed-catalogue.mts");
  const { createBrief, transitionBrief } = await import("../src/domain/brief");
  const { createCampaignFromBrief, transitionCampaign, launchCampaign } = await import("../src/domain/campaign");
  const { createEarningForOrder } = await import("../src/domain/earning");
  const { assembleSponsorReport } = await import("../src/domain/sponsor-report");
  const ed = await import("../src/domain/edition");
  const { createApp } = await import("../src/app");

  const T = "nx2_tenant";
  const staff = {
    userId: "nx2_staff", tenantId: T, roles: ["BTG_ADMIN" as const],
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
  };
  const DAY = 864e5;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let n = 0;

  async function clean() {
    const tables = ["EditionEvent", "RevenueSplit", "AdSlot", "Earning", "Deliverable", "CampaignOrder", "OutboxJob",
      "SyncTask", "AuditLog", "Campaign", "CampaignBrief", "Edition", "Publication", "SponsorPackage",
      "SponsorContact", "Sponsor", "NilJob", "Athlete", "Property", "User"];
    for (const t of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  /** A NEXT campaign, the way one is really made: a brief on a NEXT package,
   *  qualified and approved by BTG, turned into a campaign. */
  async function nextCampaign(packageCode: string): Promise<string> {
    const pkg = await prisma.sponsorPackage.findFirstOrThrow({ where: { tenantId: T, code: packageCode }, select: { id: true, priceLow: true } });
    const brief = await createBrief(staff, {
      sponsorId: "nx2_sponsor", objective: `NEXT ${packageCode}`, budget: pkg.priceLow * 100, packageId: pkg.id,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), sports: [], stateCodes: ["MD"], categories: [],
    });
    await transitionBrief(staff, brief.id, "QUALIFIED");
    await transitionBrief(staff, brief.id, "APPROVED");
    return (await createCampaignFromBrief(staff, brief.id, `Campaign ${packageCode} ${++n}`)).id;
  }

  async function sellingEdition(label: string, thresholdCents = 100_000): Promise<string> {
    const pub = await ed.createPublication(staff, { name: `Masthead ${label}`, propertyId: "nx2_school" });
    const edition = await ed.createEdition(staff, pub.id, {
      label, closeDate: new Date(Date.now() + 30 * DAY), publishTarget: new Date(Date.now() + 60 * DAY),
      thresholdCents,
    });
    await ed.transitionEdition(staff, edition.id, "SELLING");
    return edition.id;
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "NEXT editions test tenant" } });
    await prisma.user.create({ data: { id: "nx2_staff", tenantId: T, clerkId: "nx2_staff", email: "ops@nx2.invalid", roles: ["BTG_ADMIN"] } });
    await prisma.property.create({ data: { id: "nx2_school", tenantId: T, slug: "nx2-northside", name: "Northside High", kind: "SCHOOL" } });
    await prisma.sponsor.create({ data: { id: "nx2_sponsor", tenantId: T, name: "Rosa's Bakery" } });
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await seedPackages(client, T);
    } finally {
      client.release();
      await pool.end();
    }
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("P9-BE-02 · publications and editions", () => {
    it("a publication belongs to a school's Property, or to none for the regional edition", async () => {
      const school = await ed.createPublication(staff, { name: "The Northside Record", propertyId: "nx2_school" });
      const dmv = await ed.createPublication(staff, { name: "DMV NEXT", propertyId: null });
      const rows = await prisma.publication.findMany({ where: { id: { in: [school.id, dmv.id] } }, select: { id: true, propertyId: true } });
      expect(rows.find((r) => r.id === school.id)!.propertyId).toBe("nx2_school");
      expect(rows.find((r) => r.id === dmv.id)!.propertyId).toBeNull();
      await expect(ed.createPublication(staff, { name: "x", propertyId: "not_a_property" })).rejects.toMatchObject({ status: 403 });
    });

    it("the state machine runs in the domain layer: illegal moves and an unready production are refused", async () => {
      const id = await sellingEdition("Fall 2026");
      await expect(ed.transitionEdition(staff, id, "IN_PRODUCTION")).rejects.toMatchObject({ status: 409 });
      await ed.transitionEdition(staff, id, "CLOSED");
      await expect(ed.transitionEdition(staff, id, "IN_PRODUCTION")).rejects.toThrow(/contentReady/);
      expect((await ed.getEdition(staff, id)).state).toBe("CLOSED");
    });

    it("refuses a sale after closeDate — in the domain, and in Postgres for a write that skips it", async () => {
      const id = await sellingEdition("Closed early");
      const slot = await ed.addSlot(staff, id, { slotCode: "P03-HALF", kind: "HALF", priceCents: 50_000 });
      await prisma.edition.update({ where: { id }, data: { closeDate: new Date(Date.now() - DAY) } });
      const campaign = await nextCampaign("NEXT-AD-HALF");
      /* The domain's own refusal (its message names the close date), not the
         trigger's — the acceptance puts this rule in the domain layer. */
      await expect(ed.sellCampaignSlots(staff, id, campaign)).rejects.toThrow(/closed for ads on/);
      await expect(prisma.adSlot.update({ where: { id: slot.id }, data: { campaignId: campaign, soldCents: 50_000 } }))
        .rejects.toThrow(/adslot_edition_closed/);
    });
  });

  describe("P9-BE-03 · the inventory ledger", () => {
    it("the back cover sells exactly once — enforced by Postgres, not by a query", async () => {
      const id = await sellingEdition("Winter 2026");
      const back = await ed.addSlot(staff, id, { slotCode: "BACK", kind: "BACK_COVER", priceCents: 100_000 });
      /* A second back cover row cannot exist. */
      await expect(prisma.adSlot.create({ data: { tenantId: T, editionId: id, slotCode: "BACK2", kind: "BACK_COVER", priceCents: 1 } }))
        .rejects.toThrow();
      await expect(ed.addSlot(staff, id, { slotCode: "BACK3", kind: "BACK_COVER", priceCents: 1 })).rejects.toMatchObject({ status: 409 });

      /* Two sales racing for it: exactly one wins. */
      const [c1, c2] = [await nextCampaign("NEXT-AD-BACK-COVER"), await nextCampaign("NEXT-AD-BACK-COVER")];
      const results = await Promise.allSettled([ed.sellCampaignSlots(staff, id, c1), ed.sellCampaignSlots(staff, id, c2)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

      /* And a write that skips the domain cannot move it to another buyer. */
      const sold = await prisma.adSlot.findUniqueOrThrow({ where: { id: back.id }, select: { campaignId: true } });
      const loser = sold.campaignId === c1 ? c2 : c1;
      await expect(prisma.adSlot.update({ where: { id: back.id }, data: { campaignId: loser } })).rejects.toThrow(/adslot_already_sold/);
    });

    it("the package's includes is enforced: the $1,500 package takes its full page, all or nothing", async () => {
      const id = await sellingEdition("Spring 2027");
      await ed.addSlot(staff, id, { slotCode: "P02-FULL", kind: "FULL", priceCents: 80_000 });
      await ed.addSlot(staff, id, { slotCode: "P05-HALF", kind: "HALF", priceCents: 50_000 });

      const first = await nextCampaign("NEXT-LOCAL-1500");
      const out = await ed.sellCampaignSlots(staff, id, first);
      expect(out.slots).toEqual([expect.objectContaining({ slotCode: "P02-FULL", kind: "FULL", soldCents: 150_000 })]);

      /* No full page left: the next Local Business Package is refused, and it
         does not take the half page instead. */
      const second = await nextCampaign("NEXT-LOCAL-1500");
      await expect(ed.sellCampaignSlots(staff, id, second)).rejects.toThrow(/No full/);
      expect(await prisma.adSlot.count({ where: { campaignId: second } })).toBe(0);

      /* An athlete package includes no placement at all. */
      const athletePkg = await nextCampaign("TEST_DRIVE");
      await expect(ed.sellCampaignSlots(staff, id, athletePkg)).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("P9-BE-06 · the revenue split", () => {
    it("closing resolves four payees from what sold, with not one write to Earning", async () => {
      const id = await sellingEdition("Year-End 2027");
      await ed.addSlot(staff, id, { slotCode: "P02-FULL", kind: "FULL", priceCents: 80_000 });
      await ed.addSlot(staff, id, { slotCode: "P04-QTR", kind: "QUARTER", priceCents: 25_000 });
      await ed.sellCampaignSlots(staff, id, await nextCampaign("NEXT-LOCAL-1500"));
      await ed.sellCampaignSlots(staff, id, await nextCampaign("NEXT-AD-QUARTER"));

      const earningsBefore = await prisma.earning.count({ where: { tenantId: T } });
      await ed.transitionEdition(staff, id, "CLOSED");
      expect(await prisma.earning.count({ where: { tenantId: T } })).toBe(earningsBefore);

      const splits = await ed.editionSplits(staff, id);
      expect(splits.map((s) => [s.payeeKind, s.amountCents])).toEqual([
        ["SPONSORX", 70_000], ["SCHOOL", 52_500], ["STUDENT_POOL", 35_000], ["EDITORIAL_FUND", 17_500],
      ]);
      /* $1,750 sold against a $1,000 threshold. */
      expect((await ed.getEdition(staff, id)).revenueMet).toBe(true);
    });

    it("athlete NIL work inside a NEXT campaign is still an ordinary Earning", async () => {
      const campaign = await nextCampaign("NEXT-LOCAL-1500");
      await prisma.nilJob.create({ data: { id: "nx2_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
      await prisma.athlete.create({ data: { id: "nx2_ath", tenantId: T, slug: "nx2-ath", legalName: "A", displayName: "A", email: "a@nx2.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
      const order = await prisma.campaignOrder.create({
        data: { tenantId: T, campaignId: campaign, athleteId: "nx2_ath", jobId: "nx2_job", compensation: 20_000, sellPrice: 40_000, usageRights: "90 days", dueDate: new Date("2026-11-15") },
        select: { id: true, tenantId: true, athleteId: true, compensation: true, dueDate: true },
      });
      await prisma.$transaction((tx) => createEarningForOrder(tx, staff, order));
      const earning = await prisma.earning.findFirstOrThrow({ where: { orderId: order.id }, select: { athleteId: true, gross: true } });
      expect(earning).toEqual({ athleteId: "nx2_ath", gross: 20_000 });
    });
  });

  describe("P9-BE-09 · the ad-only sale", () => {
    it("reaches a terminal state with no CampaignOrder, no athlete and no job anywhere in the record", async () => {
      const id = await sellingEdition("Ad-only");
      await ed.addSlot(staff, id, { slotCode: "P06-HALF", kind: "HALF", priceCents: 50_000 });
      const campaign = await nextCampaign("NEXT-AD-HALF");

      /* Unsold, it has nothing to skip STAFFING for. */
      await expect(transitionCampaign(staff, campaign, "APPROVAL")).rejects.toMatchObject({ status: 409 });
      await ed.sellCampaignSlots(staff, id, campaign);

      await transitionCampaign(staff, campaign, "APPROVAL");
      await launchCampaign(staff, campaign);
      await transitionCampaign(staff, campaign, "REPORTING");
      await transitionCampaign(staff, campaign, "COMPLETED");

      const record = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign },
        select: { state: true, _count: { select: { orders: true, invites: true, adSlots: true } } },
      });
      expect(record).toEqual({ state: "COMPLETED", _count: { orders: 0, invites: 0, adSlots: 1 } });
      expect(await prisma.earning.count({ where: { order: { campaignId: campaign } } })).toBe(0);
    });

    it("a campaign with athlete work still has to be staffed", async () => {
      const campaign = await nextCampaign("NEXT-LOCAL-1500");
      await prisma.campaignOrder.create({
        data: { tenantId: T, campaignId: campaign, athleteId: "nx2_ath", jobId: "nx2_job", compensation: 20_000, sellPrice: 40_000, usageRights: "90 days", dueDate: new Date("2026-11-15") },
      });
      await expect(transitionCampaign(staff, campaign, "APPROVAL")).rejects.toMatchObject({ status: 409 });
    });
  });

  describe("P9-BE-12 · edition engagement, print and digital kept apart", () => {
    it("records all five types as separate rows, only on a published edition, and the sponsor report splits print from digital", async () => {
      const id = await sellingEdition("Engagement", 50_000);
      const slot = await ed.addSlot(staff, id, { slotCode: "P08-HALF", kind: "HALF", priceCents: 50_000 });
      const campaign = await nextCampaign("NEXT-AD-HALF");
      await ed.sellCampaignSlots(staff, id, campaign);

      const post = (body: object) => fetch(`${base}/api/v1/public/editions/${id}/events`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      /* Not published yet: nothing to engage with. */
      expect((await post({ type: "QR_SCAN", targetKind: "AD_SLOT", targetRef: slot.id })).status).toBe(404);

      await ed.transitionEdition(staff, id, "CLOSED");
      await ed.setEditionConditions(staff, id, { contentReady: true }); /* no assets → nothing to clear (P9-BE-10) */
      await ed.transitionEdition(staff, id, "IN_PRODUCTION");
      await ed.transitionEdition(staff, id, "PUBLISHED_DIGITAL");

      for (const type of ["QR_SCAN", "QR_SCAN", "LINK_CLICK", "PROFILE_VIEW", "CAMPAIGN_VIEW", "CTA_CLICK"]) {
        expect((await post({ type, targetKind: "AD_SLOT", targetRef: slot.id })).status, type).toBe(201);
      }
      /* A slot that is not in this edition is not a target. */
      expect((await post({ type: "QR_SCAN", targetKind: "AD_SLOT", targetRef: "nope" })).status).toBe(404);

      const rows = await prisma.editionEvent.groupBy({ where: { editionId: id }, by: ["type"], _count: true });
      expect(Object.fromEntries(rows.map((r) => [r.type, r._count]))).toEqual({
        QR_SCAN: 2, LINK_CLICK: 1, PROFILE_VIEW: 1, CAMPAIGN_VIEW: 1, CTA_CLICK: 1,
      });

      const report = await assembleSponsorReport(staff, campaign);
      expect(report.editionEngagement).toEqual({
        print: { QR_SCAN: 2 },
        digital: { LINK_CLICK: 1, PROFILE_VIEW: 1, CAMPAIGN_VIEW: 1, CTA_CLICK: 1 },
      });
      expect(report.adPlacements).toEqual([{ slotCode: "P08-HALF", kind: "HALF", editionId: id, soldCents: 50_000 }]);
      /* The reward funnel is its own stream, untouched by any of this. */
      expect(report.funnel).toEqual({ SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 });
    });
  });
});

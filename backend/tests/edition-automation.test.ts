import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  automaticEditionMove,
  editionNextStep,
  productionProblems,
  type EditionFacts,
} from "../src/domain/edition-automation-rules";

/* --------------------------------------------------------------------------
   P9-BE-17, P9-BE-18, P9-BE-19 — editions that run themselves (programme
   owner, 2026-10-03, item 23).

   "A step is automatic when every safety check passes, and held for the
   right person, with the reason, when one fails."

   - 17: each stage moves on its date or gate and not before; a failing gate
     leaves the edition with its reason; idempotent; tenant-scoped; a move
     by hand racing the sweep makes one move.
   - 18: rate-card pricing; a sale is automatic when clean and held for each
     category reason (NOT_FOR_STUDENTS, sensitive, unknown, a clash); the
     gate refuses a sale by hand too; the sweep retries "no slot yet" only.
   - 19: the split lock blocks a recompute (and Postgres the write); unlock
     works; cancelling releases slots, cancels ad-only campaigns and makes
     one refund row per paid sale, on a retry too.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

const DAY = 864e5;

describe("P9-BE-17 · the automatic moves (pure)", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const base: EditionFacts = {
    state: "PLANNING", salesOpenAt: null, closeDate: new Date("2026-11-01T00:00:00Z"), publishTarget: new Date("2026-12-01T00:00:00Z"),
    contentReady: false, revenueMet: false, thresholdCents: 100_000, soldCents: 0, pricedSlots: 0, artworkPending: 0, rightsPending: 0,
  };

  it("opens sales on the date, with a priced slot — not before, and never without a date", () => {
    expect(automaticEditionMove({ ...base, pricedSlots: 2 }, now)).toBeNull();
    expect(automaticEditionMove({ ...base, pricedSlots: 2, salesOpenAt: new Date(now.getTime() + DAY) }, now)).toBeNull();
    expect(automaticEditionMove({ ...base, salesOpenAt: now }, now)).toBeNull();
    expect(automaticEditionMove({ ...base, pricedSlots: 1, salesOpenAt: now }, now)).toMatchObject({ to: "SELLING" });
    expect(editionNextStep({ ...base, pricedSlots: 1 }, now)).toEqual({ who: "BTG", text: "No sales-open date: BTG opens sales by hand" });
    expect(editionNextStep({ ...base }, now).text).toBe("Waiting for BTG to add priced ad slots");
  });

  it("closes at the close date and goes to production only when all four gates pass", () => {
    expect(automaticEditionMove({ ...base, state: "SELLING" }, now)).toBeNull();
    expect(automaticEditionMove({ ...base, state: "SELLING", closeDate: now }, now)).toMatchObject({ to: "CLOSED" });
    const closed = { ...base, state: "CLOSED" as const, contentReady: true, revenueMet: true };
    expect(automaticEditionMove(closed, now)).toMatchObject({ to: "IN_PRODUCTION" });
    expect(productionProblems({ ...closed, contentReady: false, artworkPending: 2, rightsPending: 3 })).toEqual([
      "Waiting for content ready", "2 sold ads have no approved artwork", "3 assets have no digital right",
    ]);
    expect(productionProblems({ ...closed, revenueMet: false, soldCents: 25_000 })).toEqual(["Revenue not met: $250 sold of the $1,000 needed"]);
    for (const k of ["contentReady", "revenueMet"] as const) expect(automaticEditionMove({ ...closed, [k]: false }, now)).toBeNull();
    expect(automaticEditionMove({ ...closed, artworkPending: 1 }, now)).toBeNull();
    expect(automaticEditionMove({ ...closed, rightsPending: 1 }, now)).toBeNull();
  });

  it("publishes on the publish date if the gates still pass; print, distribution and cancelling stay BTG's", () => {
    const prod = { ...base, state: "IN_PRODUCTION" as const, contentReady: true, revenueMet: true };
    expect(automaticEditionMove(prod, now)).toBeNull();
    expect(automaticEditionMove({ ...prod, publishTarget: now }, now)).toMatchObject({ to: "PUBLISHED_DIGITAL" });
    expect(automaticEditionMove({ ...prod, publishTarget: now, rightsPending: 1 }, now)).toBeNull();
    for (const state of ["PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED", "CANCELLED"] as const) {
      expect(automaticEditionMove({ ...prod, state, publishTarget: now, closeDate: now }, now)).toBeNull();
    }
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-17/18/19 · editions that run themselves, on the path a request takes", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { seedPackages } = await import("../worker/jobs/seed-catalogue.mts");
  const { createBrief, transitionBrief } = await import("../src/domain/brief");
  const { createCampaignFromBrief } = await import("../src/domain/campaign");
  const ed = await import("../src/domain/edition");
  const artwork = await import("../src/domain/edition-artwork");
  const { addEditionAsset, grantRight } = await import("../src/domain/content-rights");
  const automation = await import("../src/domain/edition-automation");
  const sales = await import("../src/domain/ad-sale-auto");
  const splitLock = await import("../src/domain/edition-split-lock");
  const rateCard = await import("../src/domain/edition-rate-card");
  const refunds = await import("../src/domain/refunds");
  const { listEditions } = await import("../src/routes/v1/editions");
  const { ingestZohoInvoice } = await import("../src/domain/invoice");

  const T = "nxa_tenant";
  const T_RACE = "nxa_tenant_race";
  const actor = (userId: string, roles: string[], extra: Record<string, unknown> = {}) => ({
    userId, tenantId: T, roles: roles as never, sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra,
  });
  const staff = actor("nxa_staff", ["BTG_ADMIN"]);
  const salesRep = actor("nxa_sales", ["SALES"]);
  const finance = actor("nxa_fin", ["FINANCE"]);
  const raceStaff = { ...staff, userId: "nxa_race_staff", tenantId: T_RACE };
  let n = 0;

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    /* A locked split refuses its own deletion (P9-BE-19): unlock first. */
    await prisma.$executeRawUnsafe(
      `UPDATE "Edition" SET "splitLockedAt" = NULL, "splitLockedBy" = NULL, "splitLockNote" = NULL WHERE "tenantId" = ANY($1::text[])`, [T, T_RACE],
    );
    /* Attribution is append-only; teardown is the named, deliberate way past it. */
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL sponsorx.attribution_purge = 'on'`),
      prisma.$executeRawUnsafe(`DELETE FROM "SalesAttribution" WHERE "tenantId" = ANY($1::text[])`, [T, T_RACE]),
    ]);
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, [T, T_RACE]).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, T_RACE] } } });
  }

  async function school(key: string) {
    const id = `nxa_school_${key}`;
    await prisma.property.create({ data: { id, tenantId: T, slug: `nxa-school-${key}`, name: `NXA School ${key}`, kind: "SCHOOL" } });
    return id;
  }

  async function sponsor(key: string, categories: string[], schoolId: string | null, tenantId = T) {
    const id = `nxa_sponsor_${key}`;
    await prisma.sponsor.create({ data: { id, tenantId, name: `NXA Sponsor ${key}`, categories, schoolPropertyId: schoolId } });
    return id;
  }

  async function edition(schoolId: string | null, label: string, opts: { sell?: boolean; slots?: Array<[string, "QUARTER" | "HALF" | "FULL" | "BACK_COVER" | "PRESENTING", number]>; thresholdCents?: number; who?: typeof staff } = {}) {
    const who = opts.who ?? staff;
    const pub = await ed.createPublication(who, { name: `NXA Masthead ${label}`, propertyId: schoolId });
    const e = await ed.createEdition(who, pub.id, {
      label, closeDate: new Date(Date.now() + 30 * DAY), publishTarget: new Date(Date.now() + 60 * DAY), thresholdCents: opts.thresholdCents ?? 10_000,
    });
    for (const [code, kind, price] of opts.slots ?? []) await ed.addSlot(who, e.id, { slotCode: code, kind, priceCents: price });
    if (opts.sell ?? true) await ed.transitionEdition(who, e.id, "SELLING");
    return { id: e.id, publicationId: pub.id };
  }

  /** A campaign the way one is really made — a brief on a NEXT package, approved by BTG — so the automatic sale runs. */
  async function campaign(sponsorId: string, packageCode: string, briefCategories: string[] = [], who = staff, studentCode: string | null = null): Promise<string> {
    const pkg = await prisma.sponsorPackage.findFirstOrThrow({ where: { tenantId: who.tenantId, code: packageCode }, select: { id: true, priceLow: true } });
    const brief = await createBrief(who, {
      sponsorId, objective: `NXA ${packageCode}`, budget: pkg.priceLow * 100, packageId: pkg.id, studentCode,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), sports: [], stateCodes: ["MD"], categories: briefCategories as never,
    });
    await transitionBrief(who, brief.id, "QUALIFIED");
    await transitionBrief(who, brief.id, "APPROVED");
    return (await createCampaignFromBrief(who, brief.id, `NXA campaign ${packageCode} ${++n}`)).id;
  }

  const holdOf = (campaignId: string) => prisma.adSaleHold.findUnique({ where: { campaignId }, select: { heldKeys: true, heldReasons: true, editionId: true, resolvedAt: true, resolution: true } });
  const heldMails = (campaignId: string) =>
    prisma.outboxJob.count({ where: { tenantId: T, name: "notify.email", payload: { path: ["idempotencyKey"], string_starts_with: `adSale.heldForSales:${campaignId}:` } } });
  const soldTo = (campaignId: string) => prisma.adSlot.findMany({ where: { tenantId: T, campaignId }, select: { slotCode: true, editionId: true, soldCents: true } });

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.createMany({ data: [{ id: T, name: "NXA editions automation" }, { id: T_RACE, name: "NXA race" }] });
    await prisma.user.createMany({ data: [
      { id: "nxa_staff", tenantId: T, clerkId: "nxa_staff", email: "ops@nxa.invalid", roles: ["BTG_ADMIN"] },
      { id: "nxa_sales", tenantId: T, clerkId: "nxa_sales", email: "sales@nxa.invalid", roles: ["SALES"] },
      { id: "nxa_fin", tenantId: T, clerkId: "nxa_fin", email: "fin@nxa.invalid", roles: ["FINANCE"] },
      { id: "nxa_race_staff", tenantId: T_RACE, clerkId: "nxa_race_staff", email: "ops@nxa-race.invalid", roles: ["BTG_ADMIN"] },
    ] });
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await seedPackages(client, T);
      await seedPackages(client, T_RACE);
    } finally {
      client.release();
      await pool.end();
    }
  });

  afterAll(async () => {
    await wipe();
  });

  /* ── P9-BE-17 ────────────────────────────────────────────────────────── */

  describe("P9-BE-17 · edition stages move by themselves", () => {
    it("each stage moves on its date or gate and not before; a failing gate leaves the reason; idempotent", async () => {
      const s = await school("flow");
      const rosaId = await sponsor("flow", ["RESTAURANT"], s);
      await prisma.user.create({ data: { id: "nxa_rosa", tenantId: T, clerkId: "nxa_rosa", email: "rosa@nxa.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: rosaId } });
      const rosa = actor("nxa_rosa", ["SPONSOR_ADMIN"], { sponsorId: rosaId });
      const e = await edition(s, "NXA Flow", { sell: false });
      const now = new Date();
      const view = () => automation.editionAutomationView(staff, e.id, now);
      const state = async () => (await ed.getEdition(staff, e.id)).state;
      const sweep = (at: Date) => automation.sweepEditionStages(at, { tenantIds: [T] });

      /* PLANNING, no priced slot and no date: BTG's. */
      expect((await view()).nextStep).toEqual({ who: "BTG", text: "Waiting for BTG to add priced ad slots" });
      await ed.addSlot(staff, e.id, { slotCode: "P03-HALF", kind: "HALF", priceCents: 50_000 });
      expect((await view()).nextStep.text).toBe("No sales-open date: BTG opens sales by hand");
      await sweep(new Date(now.getTime() + 3 * DAY));
      expect(await state()).toBe("PLANNING");

      /* A date two days out: not before it. */
      await automation.setSalesOpen(staff, e.id, new Date(now.getTime() + 2 * DAY));
      expect((await view()).nextStep).toMatchObject({ who: "SYSTEM", text: expect.stringMatching(/^Sales open on \d{4}-\d{2}-\d{2}$/) });
      await sweep(now);
      expect(await state()).toBe("PLANNING");
      /* On it: SELLING, as the system, with the reason. And again: nothing more. */
      await sweep(new Date(now.getTime() + 3 * DAY));
      expect(await state()).toBe("SELLING");
      await sweep(new Date(now.getTime() + 3 * DAY));
      const history = (await view()).stageHistory;
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ from: "PLANNING", to: "SELLING", movedAutomatically: true, reason: expect.stringMatching(/^Sales opened on their date/) });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, entity: "Edition", entityId: e.id, action: "edition.transition" }, select: { actorId: true } });
      expect(audit.actorId).toBeNull();

      /* The sponsor buys; the sale makes itself (one edition sells at this school, nothing clashes). */
      const c = await campaign(rosaId, "NEXT-AD-HALF");
      expect(await soldTo(c)).toEqual([{ slotCode: "P03-HALF", editionId: e.id, soldCents: 50_000 }]);

      /* Close date: CLOSED (split resolved as always), then production waits with its reasons. */
      const afterClose = new Date(now.getTime() + 31 * DAY);
      await sweep(new Date(now.getTime() + 29 * DAY));
      expect(await state()).toBe("SELLING");
      await sweep(afterClose);
      expect(await state()).toBe("CLOSED");
      expect((await ed.getEdition(staff, e.id)).revenueMet).toBe(true);
      expect(await prisma.revenueSplit.count({ where: { tenantId: T, editionId: e.id } })).toBe(4);
      expect((await view()).nextStep).toEqual({ who: "BTG", text: "Waiting for content ready · 1 sold ad has no approved artwork" });

      await ed.setEditionConditions(staff, e.id, { contentReady: true });
      await sweep(afterClose);
      expect(await state()).toBe("CLOSED");
      expect((await view()).nextStep.text).toBe("1 sold ad has no approved artwork");

      /* Artwork approved (its licence recorded with it), but an article has no right yet: the rights gate holds it. */
      const article = await addEditionAsset(staff as never, e.id, { kind: "ARTICLE", title: "NXA cover story", sourceKind: "BTG" });
      const slot = await prisma.adSlot.findFirstOrThrow({ where: { tenantId: T, editionId: e.id, slotCode: "P03-HALF" }, select: { id: true } });
      const { key } = await artwork.presignArtworkUpload(rosa as never, slot.id, "image/png", 48_213);
      const a = await artwork.registerArtwork(rosa as never, slot.id, { r2Key: key });
      /* P9-BE-22 — the system picks a file that passes its checks up for review on upload. */
      await artwork.sendArtworkToSponsor(staff as never, a.id);
      await artwork.approveArtwork(rosa as never, a.id);
      await sweep(afterClose);
      expect(await state()).toBe("CLOSED");
      expect((await view()).nextStep.text).toBe("1 asset has no digital right");

      await grantRight(staff as never, article.id, { grantorKind: "BTG", grantorRef: "SponsorX", mayPublishDigital: true, startsAt: new Date(now.getTime() - DAY), licenseRef: "nxa-IO-1" });
      await sweep(afterClose);
      expect(await state()).toBe("IN_PRODUCTION");
      expect((await view()).nextStep).toMatchObject({ who: "SYSTEM", text: expect.stringMatching(/^Publishes digitally on/) });

      /* Publish date: published digitally — and print stays BTG's. */
      const afterPublish = new Date(now.getTime() + 61 * DAY);
      await sweep(afterPublish);
      expect(await state()).toBe("PUBLISHED_DIGITAL");
      await sweep(new Date(now.getTime() + 400 * DAY));
      expect(await state()).toBe("PUBLISHED_DIGITAL");
      expect((await view()).stageHistory.map((h) => [h.to, h.movedAutomatically])).toEqual([
        ["PUBLISHED_DIGITAL", true], ["IN_PRODUCTION", true], ["CLOSED", true], ["SELLING", true],
      ]);
    });

    it("is tenant-scoped: a sweep for one tenant never moves another's edition", async () => {
      const e = await edition(null, "NXA Race scope", { who: raceStaff, slots: [["P02-QTR", "QUARTER", 25_000]] });
      await automation.sweepEditionStages(new Date(Date.now() + 31 * DAY), { tenantIds: [T] });
      expect((await ed.getEdition(raceStaff, e.id)).state).toBe("SELLING");
      await automation.sweepEditionStages(new Date(Date.now() + 31 * DAY), { tenantIds: [T_RACE] });
      expect((await ed.getEdition(raceStaff, e.id)).state).toBe("CLOSED");
    });

    it("a move by hand racing the sweep makes one move", async () => {
      const e = await edition(null, "NXA Race", { who: raceStaff, slots: [["P04-HALF", "HALF", 50_000]] });
      const past = new Date(Date.now() + 31 * DAY);
      const results = await Promise.allSettled([
        ed.transitionEdition(raceStaff, e.id, "CLOSED"),
        automation.sweepEditionStages(past, { tenantIds: [T_RACE] }),
      ]);
      expect(results[1]!.status).toBe("fulfilled");
      const closes = await prisma.auditLog.findMany({
        where: { tenantId: T_RACE, entity: "Edition", entityId: e.id, action: "edition.transition" }, select: { after: true },
      });
      expect(closes.filter((r) => (r.after as { state?: string }).state === "CLOSED")).toHaveLength(1);
      expect((await ed.getEdition(raceStaff, e.id)).state).toBe("CLOSED");
      /* The loser, if it was the hand, was told plainly. */
      if (results[0]!.status === "rejected") expect((results[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    });
  });

  /* ── P9-BE-18 ────────────────────────────────────────────────────────── */

  describe("P9-BE-18 · ad slots priced from the rate card", () => {
    it("a slot without a price takes the card's; a different typed price is refused; no card, a price is typed", async () => {
      const e = await edition(null, "NXA Rate card", { sell: false });
      await expect(rateCard.setEditionRateCard(salesRep as never, e.publicationId, { HALF: 50_000 })).rejects.toMatchObject({ status: 403 });
      const card = await rateCard.setEditionRateCard(staff as never, e.publicationId, { HALF: 50_000, BACK_COVER: 100_000 });
      expect(card.prices.map((p) => [p.kind, p.priceCents])).toEqual([["HALF", 50_000], ["BACK_COVER", 100_000]]);
      expect(await prisma.auditLog.count({ where: { tenantId: T, action: "rateCard.set", entityId: e.publicationId } })).toBe(1);

      expect(await ed.addSlot(staff, e.id, { slotCode: "P05-HALF", kind: "HALF" })).toMatchObject({ priceCents: 50_000 });
      expect(await ed.addSlot(staff, e.id, { slotCode: "P06-HALF", kind: "HALF", priceCents: 50_000 })).toMatchObject({ priceCents: 50_000 });
      await expect(ed.addSlot(staff, e.id, { slotCode: "P07-HALF", kind: "HALF", priceCents: 40_000 })).rejects.toMatchObject({ status: 422, code: "rate_card_price" });
      await expect(ed.addSlot(staff, e.id, { slotCode: "P08-FULL", kind: "FULL" })).rejects.toMatchObject({ status: 422 });
      expect(await ed.addSlot(staff, e.id, { slotCode: "P08-FULL", kind: "FULL", priceCents: 80_000 })).toMatchObject({ priceCents: 80_000 });

      /* Cleared: the price is typed again. */
      await rateCard.setEditionRateCard(staff as never, e.publicationId, { HALF: null });
      expect((await rateCard.readEditionRateCard(salesRep as never, e.publicationId)).prices.map((p) => p.kind)).toEqual(["BACK_COVER"]);
      expect(await ed.addSlot(staff, e.id, { slotCode: "P09-HALF", kind: "HALF", priceCents: 45_000 })).toMatchObject({ priceCents: 45_000 });
    });
  });

  describe("P9-BE-18 · selling is automatic behind a student-audience gate", () => {
    it("sells by itself when every check passes", async () => {
      const s = await school("clean");
      const e = await edition(s, "NXA Clean", { slots: [["P02-QTR", "QUARTER", 25_000]] });
      const c = await campaign(await sponsor("clean", ["LOCAL_RETAIL"], s), "NEXT-AD-QUARTER");
      expect(await soldTo(c)).toEqual([{ slotCode: "P02-QTR", editionId: e.id, soldCents: 25_000 }]);
      expect(await holdOf(c)).toBeNull();
      const sale = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "adSlot.sell", entityId: c }, select: { actorId: true, after: true } });
      expect(sale.actorId).toBeNull();
      expect(sale.after).toMatchObject({ automatic: true, reason: expect.stringMatching(/student audience/) });
    });

    const cases: Array<[string, string[], string[], string[]]> = [
      /* label, sponsor categories, brief categories, the hold keys expected */
      ["not for students", ["ENERGY_DRINK"], [], ["NOT_FOR_STUDENTS"]],
      ["sensitive", ["RESTAURANT"], ["ALCOHOL"], ["NOT_FOR_STUDENTS", "SENSITIVE"]],
      ["unknown", ["MOONSHINE"], [], ["UNKNOWN_CATEGORY"]],
    ];
    for (const [label, sponsorCats, briefCats, keys] of cases) {
      it(`holds a ${label} sale for SALES with the reason, emails once, and refuses it by hand`, async () => {
        const key = label.replaceAll(" ", "_");
        const s = await school(key);
        const e = await edition(s, `NXA ${label}`, { slots: [["P02-HALF", "HALF", 50_000]] });
        const c = await campaign(await sponsor(key, sponsorCats, s), "NEXT-AD-HALF", briefCats);
        expect(await soldTo(c)).toEqual([]);
        const hold = await holdOf(c);
        expect(hold).toMatchObject({ heldKeys: keys, editionId: e.id, resolvedAt: null });
        expect(hold!.heldReasons).toHaveLength(keys.length);
        /* SALES and BTG's admin, once each. */
        expect(await heldMails(c)).toBe(2);
        await sales.sweepHeldSales(new Date(), { tenantIds: [T] });
        expect(await heldMails(c)).toBe(2);
        /* The same gate refuses a sale by hand — SALES's and BTG's. */
        for (const who of [salesRep, staff]) {
          await expect(ed.sellCampaignSlots(who as never, e.id, c)).rejects.toMatchObject({ status: 409, code: "ad_sale_refused" });
        }
        expect(await soldTo(c)).toEqual([]);
        const listed = await sales.listSaleHolds(salesRep as never, { editionId: e.id });
        expect(listed).toEqual([expect.objectContaining({ campaignId: c, retriesItself: false, reasons: keys.map((k) => expect.objectContaining({ key: k })) })]);
      });
    }

    it("holds a clash with the school's presenting sponsor, and refuses it by hand", async () => {
      const s = await school("clash");
      const e = await edition(s, "NXA Clash", { slots: [["PRES", "PRESENTING", 300_000], ["P02-HALF", "HALF", 50_000]] });
      const presenting = await campaign(await sponsor("clash_presenting", ["RESTAURANT"], s), "NEXT-PRESENTING", ["RESTAURANT"]);
      expect(await soldTo(presenting)).toEqual([expect.objectContaining({ slotCode: "PRES" })]);
      const diner = await campaign(await sponsor("clash_diner", ["RESTAURANT"], s), "NEXT-AD-HALF");
      expect(await holdOf(diner)).toMatchObject({ heldKeys: ["CLASH"] });
      expect((await holdOf(diner))!.heldReasons[0]).toMatch(/restaurant is already held exclusively/);
      await expect(ed.sellCampaignSlots(salesRep as never, e.id, diner)).rejects.toMatchObject({ code: "ad_sale_refused" });
      /* A sponsor in another category sells beside the presenting sponsor. */
      const shoes = await campaign(await sponsor("clash_shoes", ["FOOTWEAR"], s), "NEXT-AD-HALF");
      expect(await soldTo(shoes)).toEqual([expect.objectContaining({ slotCode: "P02-HALF" })]);
    });

    it("holds a sponsor with no category; a person may sell it by hand, which settles the hold", async () => {
      const s = await school("nocat");
      const e = await edition(s, "NXA No category", { slots: [["P02-HALF", "HALF", 50_000]] });
      const c = await campaign(await sponsor("nocat", [], s), "NEXT-AD-HALF");
      expect(await holdOf(c)).toMatchObject({ heldKeys: ["NO_CATEGORIES"] });
      await ed.sellCampaignSlots(salesRep as never, e.id, c);
      expect(await holdOf(c)).toMatchObject({ resolution: "SOLD", resolvedAt: expect.any(Date) });
      expect(await sales.listSaleHolds(salesRep as never, { editionId: e.id })).toEqual([]);
    });

    it("retries a sale held only for want of a slot — and nothing else — until it sells", async () => {
      const s = await school("noslot");
      const e = await edition(s, "NXA No slot", { slots: [["P02-FULL", "FULL", 80_000]] });
      const c = await campaign(await sponsor("noslot", ["FITNESS"], s), "NEXT-AD-HALF");
      expect(await holdOf(c)).toMatchObject({ heldKeys: ["NO_SLOT"] });
      expect(await heldMails(c)).toBe(2);
      await sales.sweepHeldSales(new Date(), { tenantIds: [T] });
      expect(await holdOf(c)).toMatchObject({ resolvedAt: null });
      expect(await heldMails(c)).toBe(2);
      await ed.addSlot(staff, e.id, { slotCode: "P03-HALF", kind: "HALF", priceCents: 50_000 });
      await sales.sweepHeldSales(new Date(), { tenantIds: [T] });
      expect(await soldTo(c)).toEqual([{ slotCode: "P03-HALF", editionId: e.id, soldCents: 50_000 }]);
      expect(await holdOf(c)).toMatchObject({ resolution: "SOLD" });
      expect(await heldMails(c)).toBe(2);

      /* Two editions selling at one school: which is SALES's call, and the sweep leaves it. */
      await edition(s, "NXA No slot two", { slots: [["P02-HALF", "HALF", 50_000]] });
      const two = await campaign(await sponsor("noslot_two", ["FITNESS"], s), "NEXT-AD-HALF");
      expect(await holdOf(two)).toMatchObject({ heldKeys: ["EDITION_CHOICE"] });
      await sales.sweepHeldSales(new Date(), { tenantIds: [T] });
      expect(await soldTo(two)).toEqual([]);
    });
  });

  /* ── P9-BE-19 ────────────────────────────────────────────────────────── */

  describe("P9-BE-19 · Finance locks the split", () => {
    it("locks after close, blocks a recompute (and the write), and only BTG admin unlocks", async () => {
      const s = await school("lock");
      const e = await edition(s, "NXA Lock", { slots: [["P02-HALF", "HALF", 50_000]] });
      await campaign(await sponsor("lock", ["APPAREL"], s), "NEXT-AD-HALF");
      await expect(splitLock.lockSplit(finance as never, e.id, { note: "Checked" })).rejects.toMatchObject({ status: 409 });
      await ed.transitionEdition(staff, e.id, "CLOSED");

      await expect(splitLock.lockSplit(staff as never, e.id, { note: "BTG cannot" })).rejects.toMatchObject({ status: 403 });
      await expect(splitLock.lockSplit(finance as never, e.id, { note: "  " })).rejects.toMatchObject({ status: 422 });
      const locked = await splitLock.lockSplit(finance as never, e.id, { note: "Checked against Zoho" });
      expect(locked.splitLocked).toMatchObject({ by: { userId: "nxa_fin", email: "fin@nxa.invalid" }, note: "Checked against Zoho" });
      expect(await splitLock.splitLockOf(finance as never, e.id)).toMatchObject({ note: "Checked against Zoho" });
      await expect(splitLock.lockSplit(finance as never, e.id, { note: "Again" })).rejects.toMatchObject({ status: 409 });
      /* A locked split is never left describing money given back: the edition cancels only once unlocked. */
      await expect(ed.transitionEdition(staff, e.id, "CANCELLED")).rejects.toMatchObject({ status: 409 });
      expect((await ed.getEdition(staff, e.id)).state).toBe("CLOSED");
      expect((await automation.editionAutomationView(staff, e.id)).splitLocked).toMatchObject({ by: { userId: "nxa_fin" } });
      /* Finance holds no edition read, but lists the editions in its books (the row only) to find the split. */
      let listed: { editions: Array<{ id: string; splitLocked: boolean; inventory: { total: number }; rightsPending: unknown }> } | undefined;
      await (listEditions as unknown as (...a: unknown[]) => Promise<void>)(
        { actor: finance, params: {}, query: {} }, { json: (b: typeof listed) => void (listed = b) }, () => {},
      );
      expect(listed!.editions.find((x) => x.id === e.id)).toMatchObject({ splitLocked: true, inventory: { total: 0 }, rightsPending: null });

      const before = await prisma.revenueSplit.findMany({ where: { tenantId: T, editionId: e.id }, orderBy: { payeeKind: "asc" }, select: { payeeKind: true, amountCents: true, computedAt: true } });
      /* A recompute: refused, audited, and the locked revenue answered. */
      await prisma.adSlot.updateMany({ where: { tenantId: T, editionId: e.id }, data: { soldCents: 1 } });
      const kept = await prisma.$transaction((tx) => ed.resolveSplit(tx, { userId: null, tenantId: T }, T, e.id));
      expect(kept).toBe(50_000);
      expect(await prisma.revenueSplit.findMany({ where: { tenantId: T, editionId: e.id }, orderBy: { payeeKind: "asc" }, select: { payeeKind: true, amountCents: true, computedAt: true } })).toEqual(before);
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: e.id, action: "revenueSplit.recomputeRefused" } })).toBe(1);
      /* And a write that skips the domain is refused by Postgres. */
      await expect(prisma.revenueSplit.deleteMany({ where: { tenantId: T, editionId: e.id } })).rejects.toThrow(/revenuesplit_locked/);
      await expect(prisma.revenueSplit.updateMany({ where: { tenantId: T, editionId: e.id }, data: { amountCents: 0 } })).rejects.toThrow(/revenuesplit_locked/);

      /* Finance cannot unlock its own lock; BTG admin can, with a reason. */
      await expect(splitLock.unlockSplit(finance as never, e.id, { reason: "Mine" })).rejects.toMatchObject({ status: 403 });
      await expect(splitLock.unlockSplit(staff as never, e.id, { reason: "" })).rejects.toMatchObject({ status: 422 });
      expect(await splitLock.unlockSplit(staff as never, e.id, { reason: "A sale was mis-keyed" })).toEqual({ id: e.id, splitLocked: null });
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: e.id, action: "revenueSplit.unlock" } })).toBe(1);
      await expect(splitLock.unlockSplit(staff as never, e.id, { reason: "Again" })).rejects.toMatchObject({ status: 409 });
      /* Unlocked, a recompute goes through. */
      expect(await prisma.$transaction((tx) => ed.resolveSplit(tx, { userId: null, tenantId: T }, T, e.id))).toBe(1);
      splitLock.assertSplitLocked({ splitLockedAt: new Date() });
      expect(() => splitLock.assertSplitLocked({ splitLockedAt: null })).toThrow(/hasn't locked/);
    });
  });

  describe("P9-BE-19 · cancelling an edition queues its refunds", () => {
    it("releases slots, cancels the ad-only campaigns, and makes one refund row per paid sale — on a retry too", async () => {
      const s = await school("cancel");
      /* Two editions selling at the school: the automatic sale holds (EDITION_CHOICE), and SALES sells by hand. */
      const e = await edition(s, "NXA Cancel", { slots: [["P02-HALF", "HALF", 50_000], ["P03-QTR", "QUARTER", 25_000], ["P04-FULL", "FULL", 80_000]] });
      const other = await edition(s, "NXA Cancel other", { slots: [["P02-FULL", "FULL", 80_000]] });
      const paidAdOnly = await campaign(await sponsor("cancel_paid", ["APPAREL"], s), "NEXT-AD-HALF");
      const unpaidAdOnly = await campaign(await sponsor("cancel_unpaid", ["FOOTWEAR"], s), "NEXT-AD-QUARTER");
      const twoEditions = await campaign(await sponsor("cancel_two", ["FITNESS"], s), "NEXT-AD-FULL");
      for (const c of [paidAdOnly, unpaidAdOnly, twoEditions]) await ed.sellCampaignSlots(salesRep as never, e.id, c);
      await ed.sellCampaignSlots(salesRep as never, other.id, twoEditions);
      /* Money received is what Zoho says was paid. */
      await prisma.campaignInvoice.createMany({ data: [
        { tenantId: T, campaignId: paidAdOnly, zohoInvoiceId: "nxa_inv_paid", status: "paid", amount: 50_000, paidAt: new Date() },
        { tenantId: T, campaignId: unpaidAdOnly, zohoInvoiceId: "nxa_inv_unpaid", status: "sent", amount: 25_000 },
        { tenantId: T, campaignId: twoEditions, zohoInvoiceId: "nxa_inv_two", status: "paid", amount: 80_000, paidAt: new Date() },
      ] });

      const out = await ed.transitionEdition(staff, e.id, "CANCELLED");
      expect(out.state).toBe("CANCELLED");
      expect(await prisma.adSlot.count({ where: { tenantId: T, editionId: e.id, campaignId: { not: null } } })).toBe(0);
      const states = Object.fromEntries((await prisma.campaign.findMany({
        where: { id: { in: [paidAdOnly, unpaidAdOnly, twoEditions] } }, select: { id: true, state: true },
      })).map((c) => [c.id, c.state]));
      expect(states).toEqual({ [paidAdOnly]: "CANCELLED", [unpaidAdOnly]: "CANCELLED", [twoEditions]: "DRAFT" });
      expect(await soldTo(twoEditions)).toEqual([{ slotCode: "P02-FULL", editionId: other.id, soldCents: 80_000 }]);

      const rows = await prisma.refundDue.findMany({
        where: { tenantId: T, editionId: e.id }, select: { campaignId: true, amountCents: true, cause: true, paidVia: true, orderId: true, state: true },
        orderBy: { amountCents: "asc" },
      });
      expect(rows).toEqual([
        { campaignId: paidAdOnly, amountCents: 50_000, cause: "EDITION_CANCELLED", paidVia: "ZOHO_INVOICE", orderId: null, state: "OPEN" },
        { campaignId: twoEditions, amountCents: 80_000, cause: "EDITION_CANCELLED", paidVia: "ZOHO_INVOICE", orderId: null, state: "OPEN" },
      ]);

      /* A retry: the cancellation is refused, and recording the refund again finds the row. */
      await expect(ed.transitionEdition(staff, e.id, "CANCELLED")).rejects.toMatchObject({ status: 409 });
      const again = await prisma.$transaction((tx) => refunds.recordEditionRefund(tx, { userId: null, tenantId: T }, {
        tenantId: T, editionId: e.id, campaignId: paidAdOnly, sponsorId: "nxa_sponsor_cancel_paid", soldCents: 50_000,
      }));
      expect(again).toMatchObject({ amountCents: 50_000 });
      expect(await prisma.refundDue.count({ where: { tenantId: T, editionId: e.id } })).toBe(2);
      await expect(prisma.refundDue.create({ data: {
        tenantId: T, campaignId: paidAdOnly, editionId: e.id, sponsorId: "nxa_sponsor_cancel_paid", amountCents: 1, cause: "EDITION_CANCELLED", paidVia: "ZOHO_INVOICE",
      } })).rejects.toThrow();

      /* The other edition cancelled too: the two-edition campaign has paid for one, already refunded — nothing more. */
      await ed.transitionEdition(staff, other.id, "CANCELLED");
      expect(await prisma.refundDue.count({ where: { tenantId: T, campaignId: twoEditions } })).toBe(1);
      expect((await prisma.campaign.findUniqueOrThrow({ where: { id: twoEditions }, select: { state: true } })).state).toBe("CANCELLED");

      /* Finance's list names the edition and the campaign, with the credit-note note; sending it works without an order. */
      const list = await refunds.listRefunds(finance as never, "OPEN");
      const mine = list.refunds.filter((r) => r.edition?.id === e.id);
      expect(mine).toHaveLength(2);
      expect(mine[0]).toMatchObject({ orderId: null, orderRef: null, wholeOrder: false, zohoNote: refunds.ZOHO_NOTE, edition: { label: "NXA Cancel" }, causeWords: expect.stringMatching(/cancelled the edition/) });
      const sent = await refunds.markRefundSent(finance as never, mine[0]!.id, { method: "BANK_TRANSFER", reference: "NXA-CN-1", sentOn: new Date().toISOString().slice(0, 10) });
      expect(sent.state).toBe("SENT");
    });

    it("a Zoho payment after the cancellation becomes one refund row; a redelivered webhook adds none", async () => {
      const s = await school("late");
      const e = await edition(s, "NXA Late", { slots: [["P02-HALF", "HALF", 50_000]] });
      const c = await campaign(await sponsor("late", ["APPAREL"], s), "NEXT-AD-HALF");
      expect(await soldTo(c)).toHaveLength(1);
      await prisma.campaign.update({ where: { id: c }, data: { zohoDealId: "nxa_deal_late" }, select: { id: true } });
      const invoice = { invoiceId: "nxa_zinv_late", dealId: "nxa_deal_late", number: "INV-NXA-1", status: "sent", amount: 50_000 };
      await prisma.$transaction((tx) => ingestZohoInvoice(tx, invoice));

      /* Unpaid when the edition is cancelled: nothing to refund yet. */
      await ed.transitionEdition(staff, e.id, "CANCELLED");
      const rows = () => prisma.refundDue.findMany({
        where: { tenantId: T, campaignId: c }, select: { cause: true, amountCents: true, editionId: true, paidVia: true },
      });
      expect(await rows()).toEqual([]);

      /* Zoho marks it paid afterwards: the money goes onto Finance's list. */
      const paid = { ...invoice, status: "paid", paidAt: new Date().toISOString() };
      await prisma.$transaction((tx) => ingestZohoInvoice(tx, paid));
      expect(await rows()).toEqual([{ cause: "PAID_AFTER_EDITION_CANCELLED", amountCents: 50_000, editionId: e.id, paidVia: "ZOHO_INVOICE" }]);

      /* Redelivered as is — and again with a field changed: nothing new. */
      expect(await prisma.$transaction((tx) => ingestZohoInvoice(tx, paid))).toMatchObject({ applied: false });
      await prisma.$transaction((tx) => ingestZohoInvoice(tx, { ...paid, number: "INV-NXA-1b" }));
      expect(await rows()).toHaveLength(1);
      const listed = (await refunds.listRefunds(finance as never, "OPEN")).refunds.find((r) => r.edition?.campaignId === c);
      expect(listed).toMatchObject({ cause: "PAID_AFTER_EDITION_CANCELLED", zohoNote: refunds.ZOHO_NOTE, orderRef: null });
    });

    it("a refunded sale stops counting for the student: the total drops and the $500 milestone is taken back", async () => {
      const s = await school("student");
      await prisma.student.create({ data: { id: "nxa_student", tenantId: T, propertyId: s, legalName: "NXA Legal Student", displayName: "NXA Student", state: "ACTIVE" } });
      await prisma.studentCode.create({ data: { tenantId: T, studentId: "nxa_student", code: "nxa-code-1" } });
      const e = await edition(s, "NXA Student sale", { slots: [["P02-FULL", "FULL", 80_000]] });
      /* The Local Business Package: $1,500, credited to the student — three $500 marks. */
      const c = await campaign(await sponsor("student", ["RESTAURANT"], s), "NEXT-LOCAL-1500", [], staff, "nxa-code-1");
      expect(await soldTo(c)).toHaveLength(1);
      const total = async () => (await prisma.salesAttribution.aggregate({ where: { tenantId: T, studentId: "nxa_student" }, _sum: { value: true } }))._sum.value ?? 0;
      const points = async () => (await prisma.studentPointAccrual.aggregate({ where: { tenantId: T, studentId: "nxa_student" }, _sum: { points: true } }))._sum.points ?? 0;
      expect(await total()).toBe(150_000);
      expect(await points()).toBe(300);

      await ed.transitionEdition(staff, e.id, "CANCELLED");
      expect(await total()).toBe(0);
      expect(await points()).toBe(0);
      /* The original row is untouched; the reversal names it. */
      const rows = await prisma.salesAttribution.findMany({ where: { tenantId: T, studentId: "nxa_student" }, select: { id: true, value: true, reversesId: true }, orderBy: { value: "desc" } });
      expect(rows).toEqual([{ id: expect.any(String), value: 150_000, reversesId: null }, { id: expect.any(String), value: -150_000, reversesId: rows[0]!.id }]);
      /* A sale is reversed once — Postgres refuses a second reversal. */
      await expect(prisma.salesAttribution.create({ data: { tenantId: T, studentId: "nxa_student", sponsorId: "nxa_sponsor_student", value: -1, reversesId: rows[0]!.id }, select: { id: true } })).rejects.toThrow();

      /* The next sale ($500) counts from the lower total: its one $500 mark is its own — none comes from the refunded sale. */
      const next = await edition(s, "NXA Student next", { slots: [["P03-HALF", "HALF", 50_000]] });
      await campaign(await sponsor("student_next", ["RESTAURANT"], s), "NEXT-AD-HALF", [], staff, "nxa-code-1");
      expect(await prisma.adSlot.count({ where: { tenantId: T, editionId: next.id, campaignId: { not: null } } })).toBe(1);
      expect(await total()).toBe(50_000);
      expect(await points()).toBe(100);
    });
  });
});

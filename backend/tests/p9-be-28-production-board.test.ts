/* --------------------------------------------------------------------------
   P9-BE-28 — the production board's data: every piece of an edition and
   what it still needs, asked as the publishing gate asks. Real database.
   -------------------------------------------------------------------------- */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const R = randomBytes(3).toString("hex");
const T = `epb_tenant_${R}`;
const T2 = `epb_other_${R}`;

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-28 · the production board", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { productionBoard } = await import("../src/domain/edition-production");
  const { rightsGap } = await import("../src/domain/content-rights");

  const base = { sponsorId: null, athleteId: null, guardianId: null, propertyId: null, studentId: null };
  const btg = { ...base, userId: `epb_btg_${R}`, tenantId: T, roles: ["BTG_ADMIN" as const] };
  const otherBtg = { ...base, userId: `epb_btg2_${R}`, tenantId: T2, roles: ["BTG_ADMIN" as const] };
  const advisor = { ...base, userId: `epb_adv_${R}`, tenantId: T, roles: ["ADVISOR" as const], propertyId: `epb_school_${R}` };
  const ED = `epb_edition_${R}`;
  const id = (n: string) => `epb_${n}_${R}`;

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1)`, [T, T2]).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, T2] } } }).catch(() => {});
  }
  const licence = (assetId: string, over: Record<string, unknown> = {}) =>
    prisma.contentRight.create({ data: { tenantId: T, assetId, grantorKind: "BTG", grantorRef: "BTG", licenseRef: `L-${assetId}`, mayPublishDigital: true, startsAt: new Date("2026-01-01"), ...over } });

  beforeAll(async () => {
    await wipe();
    const far = new Date(Date.now() + 365 * 864e5);
    await prisma.tenant.createMany({ data: [{ id: T, name: "EPB" }, { id: T2, name: "EPB other" }] });
    await prisma.property.create({ data: { id: id("school"), tenantId: T, slug: `epb-${R}`, name: "EPB High", kind: "SCHOOL" } });
    await prisma.sponsor.create({ data: { id: id("sponsor"), tenantId: T, name: "Joe's Deli" } });
    await prisma.student.create({ data: { id: id("student"), tenantId: T, propertyId: id("school"), legalName: "Jo S", displayName: "Jo S.", ageBand: "18_PLUS", state: "ACTIVE", masthead: ["WRITER"] } });
    await prisma.publication.create({ data: { id: id("pub"), tenantId: T, name: "EPB Times", propertyId: id("school") } });
    await prisma.edition.create({ data: { id: ED, tenantId: T, publicationId: id("pub"), label: "EPB Fall", closeDate: far, publishTarget: new Date("2026-12-15"), thresholdCents: 1, state: "SELLING" } });
    await prisma.campaign.create({ data: { id: id("campaign"), tenantId: T, sponsorId: id("sponsor"), name: "EPB ads", budget: 1, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), state: "ACTIVE" } });
    await prisma.adSlot.createMany({ data: ["A", "B", "C"].map((c) => ({ id: id(`slot${c}`), tenantId: T, editionId: ED, slotCode: `EPB-${c}`, kind: "HALF", priceCents: 1000, campaignId: id("campaign"), soldCents: 1000, soldAt: new Date() })) });
    /* Student work: not started, sent back, waiting for the advisor. */
    await prisma.studentAssignment.createMany({ data: [
      { id: id("a1"), tenantId: T, editionId: ED, studentId: id("student"), propertyId: id("school"), kind: "ARTICLE", title: "Not started", brief: "b" },
      { id: id("a2"), tenantId: T, editionId: ED, studentId: id("student"), propertyId: id("school"), kind: "ARTICLE", title: "Sent back", brief: "b", reviewState: "DRAFT_SUBMITTED", draftText: "x", version: 1, submittedAt: new Date(), revisionNote: "Tighten it." },
      { id: id("a3"), tenantId: T, editionId: ED, studentId: id("student"), propertyId: id("school"), kind: "PHOTO", title: "With the advisor", brief: "b", reviewState: "BTG_REVIEW", draftText: "x", version: 1, submittedAt: new Date() },
    ] });
    /* Content: no file and no right; a file but no right; complete. */
    await prisma.editionAsset.createMany({ data: [
      { id: id("c1"), tenantId: T, editionId: ED, kind: "PHOTO", title: "Title only", sourceKind: "BTG" },
      { id: id("c2"), tenantId: T, editionId: ED, kind: "PHOTO", title: "No right", sourceKind: "BTG", r2Key: "k2", fileType: "image/png" },
      { id: id("c3"), tenantId: T, editionId: ED, kind: "PHOTO", title: "Ready", sourceKind: "BTG", r2Key: "k3", fileType: "image/png", webProblem: "This photo is over 50 MB, so it can't be shown on the web." },
    ] });
    await licence(id("c3"));
    /* Artwork: none on A; B with the sponsor; C approved with its right. */
    await prisma.editionAsset.createMany({ data: [
      { id: id("artB"), tenantId: T, editionId: ED, kind: "AD_CREATIVE", title: "B art", sourceKind: "THIRD_PARTY", adSlotId: id("slotB"), r2Key: "kb", reviewState: "SPONSOR_REVIEW", artworkVersion: 1, submittedAt: new Date() },
      { id: id("artC"), tenantId: T, editionId: ED, kind: "AD_CREATIVE", title: "C art", sourceKind: "THIRD_PARTY", adSlotId: id("slotC"), r2Key: "kc", reviewState: "APPROVED", artworkVersion: 1, submittedAt: new Date() },
    ] });
    await licence(id("artB"), { grantorKind: "THIRD_PARTY" });
    await licence(id("artC"), { grantorKind: "THIRD_PARTY" });
    await prisma.edition.update({ where: { id: ED }, data: { state: "CLOSED", printDate: new Date("2026-12-20") } });
  });

  afterAll(wipe);

  it("lists every piece with what it still needs, in words", async () => {
    const b = await productionBoard(btg, ED);
    const by = new Map(b.pieces.map((p) => [p.title, p]));
    expect(by.get("Not started")).toMatchObject({ source: "ASSIGNMENT", who: "Jo S.", needs: ["The student's draft"], ref: { assignmentId: id("a1") } });
    expect(by.get("Sent back")?.needs).toEqual(["The student's changes (the advisor asked for some)"]);
    expect(by.get("With the advisor")?.needs).toEqual(["The advisor's approval"]);
    expect(by.get("Title only")?.needs).toEqual(["Its file", "A digital right", "A print right (for the printed edition)"]);
    expect(by.get("No right")?.needs).toEqual(["A digital right", "A print right (for the printed edition)"]);
    expect(by.get("Ready")).toMatchObject({ needs: ["A print right (for the printed edition)"], note: expect.stringMatching(/^Not on the web yet: This photo is over 50 MB/) });
    expect(by.get("EPB-A ad")).toMatchObject({ source: "ARTWORK", who: "Joe's Deli", needs: ["The sponsor's artwork"], ref: { slotId: id("slotA") } });
    expect(by.get("EPB-B ad")?.needs).toEqual(["The sponsor's sign-off", "A print right (for the printed edition)"]);
    expect(by.get("EPB-C ad")?.needs).toEqual(["A print right (for the printed edition)"]);
    expect(by.get("Cover")?.needs).toEqual(["A cover"]);
    expect(by.get("Press PDF")?.needs).toEqual(["The press PDF (for the printed edition)"]);
    expect(b.gates).toMatchObject({ rightsCleared: false, artworkApproved: false });
    expect(b.counts).toEqual({ total: b.pieces.length, ready: 0, waiting: b.pieces.length });
  });

  it("asks the gate's own question: 'A digital right' is exactly the gate's digital gap", async () => {
    const e = await prisma.edition.findUniqueOrThrow({ where: { id: ED }, select: { publishTarget: true } });
    const gap = await prisma.$transaction((tx) => rightsGap(tx, T, ED, "DIGITAL", e.publishTarget));
    const b = await productionBoard(btg, ED);
    const flagged = b.pieces.filter((p) => p.needs.includes("A digital right")).map((p) => p.ref.assetId).sort();
    expect(flagged).toEqual(gap.map((g) => g.id).sort());
  });

  it("fixing a piece clears it; without a print date, print isn't asked", async () => {
    await licence(id("c2"));
    await prisma.edition.update({ where: { id: ED }, data: { printDate: null } });
    const b = await productionBoard(btg, ED);
    const by = new Map(b.pieces.map((p) => [p.title, p]));
    expect(by.get("No right")?.needs).toEqual([]);
    expect(by.get("Ready")?.needs).toEqual([]);
    expect(by.get("Press PDF")).toMatchObject({ needs: [], note: "Only needed if the edition is printed." });
    expect(b.counts.ready).toBeGreaterThanOrEqual(4);
  });

  it("is BTG's, in its own tenant: an advisor and another tenant's BTG are refused", async () => {
    await expect(productionBoard(advisor, ED)).rejects.toMatchObject({ status: 403 });
    await expect(productionBoard(otherBtg, ED)).rejects.toMatchObject({ status: 403 });
  });
});

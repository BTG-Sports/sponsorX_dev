/* --------------------------------------------------------------------------
   P9-BE-26 — photos, video and ads in the public reader.

   Real database and a real S3 endpoint (tests/support/object-store.ts). Each
   piece's original sits in the private bucket; the sync makes its public
   copy (location data removed) or takes it down; the public read returns a
   link only while the same rule lets the reader show it.
   -------------------------------------------------------------------------- */
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const R = randomBytes(3).toString("hex");
const T = `epx_tenant_${R}`;
const previousEndpoint = process.env.S3_ENDPOINT;
vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));

const { startObjectStore } = await import("./support/object-store");
const store = await startObjectStore();
process.env.S3_ENDPOINT = store.endpoint;

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-26 · photos, video and ads in the public reader", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const storage = await import("../src/lib/storage");
  const pics = await import("../src/domain/edition-pictures");
  const { VideoToolMissingError, VIDEO_TOOL_MISSING } = await import("../src/lib/web-copy");
  const { textPdf } = await import("./support/document-fixtures");
  const { createApp } = await import("../src/app");
  store.verifyWith(storage.s3);
  const PRIV = storage.BUCKETS.private;
  const PUB = storage.BUCKETS.public;

  const ED = `epx_edition_${R}`;
  const DRAFT = `epx_draft_${R}`;
  const SCHOOL = `epx-school-${R}`;
  const id = (n: string) => `epx_${n}_${R}`;
  const toolCalls: string[][] = [];
  /* A stand-in ffmpeg: writes the output file it is asked for. */
  const fakeTool = async (args: string[]) => { toolCalls.push(args); await writeFile(args[args.length - 1]!, Buffer.alloc(3_000, 9)); };
  const missingTool = async () => { throw new VideoToolMissingError(); };
  const deps = (videoTool = fakeTool) => ({ ...pics.pictureDeps, videoTool, videoReady: async () => videoTool !== missingTool });

  let base = "";
  let server: { close: () => void };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: T } }).catch(() => {});
  }

  /** A private original in the store, and its piece. */
  async function piece(n: string, data: Record<string, unknown>, body: Buffer, type: string, editionId = ED) {
    const key = `edition-content/${T}/${editionId}/${n}`;
    store.objects.set(`${PRIV}/${key}`, { body, type });
    await prisma.editionAsset.create({ data: { id: id(n), tenantId: T, editionId, kind: "PHOTO", title: n, sourceKind: "BTG", r2Key: key, fileType: type, ...data } });
  }
  const licence = (n: string, over: Record<string, unknown> = {}) =>
    prisma.contentRight.create({ data: { tenantId: T, assetId: id(n), grantorKind: "BTG", grantorRef: "BTG", licenseRef: `L-${n}`, mayPublishDigital: true, startsAt: new Date("2026-01-01"), ...over } });
  const consent = (n: string, grantorKind: "STUDENT" | "GUARDIAN", acceptanceId: string) =>
    prisma.contentRight.create({ data: { tenantId: T, assetId: id(n), grantorKind, grantorRef: n, acceptanceId, mayPublishDigital: true, startsAt: new Date("2026-01-01") } });
  const row = (n: string) => prisma.editionAsset.findUniqueOrThrow({ where: { id: id(n) }, select: { webKey: true, webType: true, webProblem: true } });
  const publicCopies = () => [...store.objects.keys()].filter((k) => k.startsWith(`${PUB}/editions/${ED}/`));
  const read = async () => (await (await fetch(`${base}/api/v1/public/editions/${SCHOOL}/${ED}`)).json()) as {
    contents: Array<{ id: string; picture: { url: string; kind: string } | null }>;
    sponsors: Array<{ id: string; ad: { url: string } | null }>;
  };

  beforeAll(async () => {
    await wipe();
    const far = new Date(Date.now() + 365 * 864e5);
    await prisma.tenant.create({ data: { id: T, name: "EPX Tenant" } });
    await prisma.property.create({ data: { id: id("school"), tenantId: T, slug: SCHOOL, name: "EPX High", kind: "SCHOOL" } });
    await prisma.sponsor.create({ data: { id: id("sponsor"), tenantId: T, name: "Joe's Deli" } });
    await prisma.guardian.create({ data: { id: id("guardian"), tenantId: T, legalName: "EPX Parent", email: `epx-g-${R}@epx.invalid`, relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.student.createMany({ data: [
      { id: id("adult"), tenantId: T, propertyId: id("school"), legalName: "Adult S", displayName: "Adult S.", ageBand: "18_PLUS", state: "ACTIVE", masthead: ["PHOTOGRAPHER"] },
      { id: id("minor"), tenantId: T, propertyId: id("school"), legalName: "Minor S", displayName: "Minor S.", ageBand: "16_17", guardianId: id("guardian"), state: "ACTIVE", masthead: ["PHOTOGRAPHER"] },
    ] });
    await prisma.agreement.create({ data: { id: id("feature"), tenantId: T, kind: "FEATURE", version: 1, bodyHash: "h", effectiveAt: new Date("2026-01-01") } });
    const accAdult = await prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: id("feature"), studentId: id("adult"), bodyHash: "h", ip: "t", userAgent: "t" } });
    const accMinorSelf = await prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: id("feature"), studentId: id("minor"), bodyHash: "h", ip: "t", userAgent: "t" } });
    const accGuardian = await prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: id("feature"), studentId: id("minor"), guardianId: id("guardian"), bodyHash: "h", ip: "t", userAgent: "t" } });
    await prisma.publication.create({ data: { id: id("pub"), tenantId: T, name: "EPX Times", propertyId: id("school") } });
    await prisma.edition.createMany({ data: [
      /* Selling while its slots are sold and its pieces added (database rules), published below. */
      { id: ED, tenantId: T, publicationId: id("pub"), label: "EPX Fall", closeDate: far, publishTarget: new Date("2026-11-01"), thresholdCents: 1, state: "SELLING" },
      { id: DRAFT, tenantId: T, publicationId: id("pub"), label: "EPX Winter", closeDate: far, publishTarget: far, thresholdCents: 1, state: "SELLING" },
    ] });
    await prisma.campaign.create({ data: { id: id("campaign"), tenantId: T, sponsorId: id("sponsor"), name: "EPX ads", budget: 100000, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), state: "ACTIVE" } });
    await prisma.adSlot.createMany({ data: [
      { id: id("slotA"), tenantId: T, editionId: ED, slotCode: "EPX-FULL", kind: "FULL", priceCents: 50000, campaignId: id("campaign"), soldCents: 50000, soldAt: new Date() },
      { id: id("slotB"), tenantId: T, editionId: ED, slotCode: "EPX-HALF", kind: "HALF", priceCents: 25000, campaignId: id("campaign"), soldCents: 25000, soldAt: new Date() },
    ] });

    const gpsJpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#36c" } }).jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "38/1 54/1 0/1" } }).toBuffer();
    const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#3c6" } }).png().toBuffer();

    await piece("adultPhoto", { sourceKind: "STUDENT", studentId: id("adult") }, gpsJpeg, "image/jpeg");
    await consent("adultPhoto", "STUDENT", accAdult.id);
    await piece("minorSelf", { sourceKind: "STUDENT", studentId: id("minor") }, png, "image/png");
    await consent("minorSelf", "STUDENT", accMinorSelf.id);
    await piece("minorGuardian", { sourceKind: "STUDENT", studentId: id("minor") }, png, "image/png");
    await consent("minorGuardian", "GUARDIAN", accGuardian.id);
    await piece("video", { kind: "VIDEO" }, Buffer.alloc(5_000, 1), "video/quicktime");
    await licence("video");
    await piece("design", { kind: "DESIGN" }, Buffer.alloc(500, 2), "application/x-indesign");
    await licence("design");
    await piece("lapsed", {}, png, "image/png");
    await licence("lapsed", { endsAt: new Date("2026-02-01") });
    await piece("noDigital", {}, png, "image/png");
    await licence("noDigital", { mayPublishDigital: false, mayPublishPrint: true });
    await piece("adPng", { kind: "AD_CREATIVE", sourceKind: "THIRD_PARTY", fileType: null, adSlotId: id("slotA"), reviewState: "APPROVED", artworkVersion: 1, submittedAt: new Date(), artworkContentType: "image/png" }, png, "image/png");
    await licence("adPng", { grantorKind: "THIRD_PARTY" });
    await piece("adPdf", { kind: "AD_CREATIVE", sourceKind: "THIRD_PARTY", fileType: null, adSlotId: id("slotB"), reviewState: "APPROVED", artworkVersion: 1, submittedAt: new Date(), artworkContentType: "application/pdf" }, textPdf(["JOE'S DELI", "HALF OFF"]), "application/pdf");
    await licence("adPdf", { grantorKind: "THIRD_PARTY" });
    await piece("unpublished", {}, png, "image/png", DRAFT);
    await licence("unpublished");
    await prisma.edition.update({ where: { id: ED }, data: { state: "PUBLISHED_DIGITAL" } });

    const s = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => s.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    server = s;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
    await store.close();
    if (previousEndpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = previousEndpoint;
  });

  it("publishing makes a copy of each piece the reader may show — and of nothing else", async () => {
    const first = await pics.syncEditionPictures(ED, deps(missingTool));
    expect(first).toMatchObject({ made: 4, removed: 0, problems: 1 });
    for (const n of ["adultPhoto", "minorGuardian", "adPng", "adPdf"]) expect((await row(n)).webKey).toMatch(new RegExp(`^editions/${ED}/[0-9a-f-]{36}\\.`));
    for (const n of ["minorSelf", "design", "lapsed", "noDigital"]) expect(await row(n)).toMatchObject({ webKey: null, webProblem: null });
    expect(publicCopies()).toHaveLength(4);
    /* The draft edition's piece: nothing public before publication. */
    expect(await pics.syncEditionPictures(DRAFT, deps())).toMatchObject({ made: 0 });
    expect((await row("unpublished")).webKey).toBeNull();
  });

  it("the photo's copy carries no location data, is cached ten minutes at most, and a PDF ad is a picture", async () => {
    const photo = store.objects.get(`${PUB}/${(await row("adultPhoto")).webKey}`)!;
    expect(photo.type).toBe("image/jpeg");
    expect(photo.cacheControl).toBe("public, max-age=600");
    expect((await sharp(photo.body).metadata()).exif).toBeUndefined();
    expect(await row("adPdf")).toMatchObject({ webType: "image/png" });
    expect((await sharp(store.objects.get(`${PUB}/${(await row("adPdf")).webKey}`)!.body).metadata()).format).toBe("png");
  });

  it("without the video tool a video waits with the reason, and is copied once the tool is there", async () => {
    expect(await row("video")).toMatchObject({ webKey: null, webProblem: VIDEO_TOOL_MISSING });
    /* No tool: no signed read was handed out for it. */
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateDownloadGrant", entityId: id("video") } })).toBe(0);
    expect(await pics.syncEditionPictures(ED, deps(missingTool))).toMatchObject({ made: 0, problems: 1 });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateDownloadGrant", entityId: id("video") } })).toBe(0);
    const second = await pics.syncEditionPictures(ED, deps(fakeTool));
    expect(second).toMatchObject({ made: 1, removed: 0, problems: 0 });
    expect(await row("video")).toMatchObject({ webType: "video/mp4", webProblem: null });
    const args = toolCalls.at(-1)!;
    expect(args).toEqual(expect.arrayContaining(["-map_metadata", "-1", "-c", "copy"]));
    /* ffmpeg read the original through a signed, recorded link. */
    expect(args[args.indexOf("-i") + 1]).toMatch(/X-Amz-Signature=/);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateDownloadGrant", entityId: id("video") } })).toBe(1);
    expect(store.objects.get(`${PUB}/${(await row("video")).webKey}`)).toMatchObject({ type: "video/mp4", cacheControl: "public, max-age=600" });
    /* Running again changes nothing. */
    expect(await pics.syncEditionPictures(ED, deps())).toMatchObject({ made: 0, removed: 0, problems: 0 });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "editionAsset.webCopy" } })).toBe(5);
  });

  it("the public reader returns each picture, video and ad — and none for the rest", async () => {
    const body = await read();
    const pic = new Map(body.contents.map((c) => [c.id, c.picture]));
    expect(pic.get(id("adultPhoto"))).toMatchObject({ kind: "image", url: expect.stringMatching(/\/editions\/.+\.jpg$/) });
    expect(pic.get(id("minorGuardian"))).toMatchObject({ kind: "image" });
    expect(pic.get(id("video"))).toMatchObject({ kind: "video", url: expect.stringMatching(/\.mp4$/) });
    expect(pic.get(id("design"))).toBeNull();
    expect(pic.get(id("minorSelf"))).toBeNull();
    const ads = new Map(body.sponsors.map((s) => [s.id, s.ad]));
    expect(ads.get(id("slotA"))).toMatchObject({ url: expect.stringMatching(/\.png$/) });
    expect(ads.get(id("slotB"))).toMatchObject({ url: expect.stringMatching(/\.png$/) });
  });

  it("a right that ends takes its copy down — from the reader at once, from storage at the next sweep", async () => {
    const key = (await row("adultPhoto")).webKey!;
    await prisma.contentRight.updateMany({ where: { assetId: id("adultPhoto") }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(new Map((await read()).contents.map((c) => [c.id, c.picture])).has(id("adultPhoto"))).toBe(false);
    const swept = await pics.sweepEditionPictures(deps());
    expect(swept.removed).toBe(1);
    expect(store.objects.has(`${PUB}/${key}`)).toBe(false);
    expect((await row("adultPhoto")).webKey).toBeNull();
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "editionAsset.webCopyRemoved", entityId: id("adultPhoto") } })).toBe(1);
  });

  it("a cancelled edition takes every copy down, and the sweep still finds it", async () => {
    await prisma.edition.update({ where: { id: ED }, data: { state: "CANCELLED" } });
    const swept = await pics.sweepEditionPictures(deps());
    expect(swept.removed).toBe(4);
    expect(publicCopies()).toEqual([]);
    expect(await prisma.editionAsset.count({ where: { tenantId: T, webKey: { not: null } } })).toBe(0);
    expect((await fetch(`${base}/api/v1/public/editions/${SCHOOL}/${ED}`)).status).toBe(404);
  });

  it("publishing or cancelling queues the job, in the same transaction", async () => {
    const { transitionEditionIn } = await import("../src/domain/edition");
    const far = new Date(Date.now() + 365 * 864e5);
    await prisma.edition.create({ data: {
      id: id("empty"), tenantId: T, publicationId: id("pub"), label: "EPX Empty", closeDate: far, publishTarget: far, thresholdCents: 1,
      state: "IN_PRODUCTION", contentReady: true, rightsCleared: true, revenueMet: true,
    } });
    await prisma.$transaction((tx) => transitionEditionIn(tx, { userId: null, tenantId: T }, T, id("empty"), "IN_PRODUCTION", "PUBLISHED_DIGITAL"));
    const jobs = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "edition.pictures" }, select: { payload: true } });
    expect(jobs.map((j) => j.payload)).toEqual([{ editionId: id("empty") }]);
  });
});

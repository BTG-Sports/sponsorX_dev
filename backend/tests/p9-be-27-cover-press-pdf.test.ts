/* --------------------------------------------------------------------------
   P9-BE-27 — an edition's cover image and press PDF.

   Real database and a real S3 endpoint (tests/support/object-store.ts):
   grant → PUT through the signed URL → record. The cover goes public once
   the edition is published (a copy without its metadata, retaken when the
   cover is replaced); the press PDF never does.
   -------------------------------------------------------------------------- */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const R = randomBytes(3).toString("hex");
const T = `ecp_tenant_${R}`;
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

describe.skipIf(!hasDatabase)("P9-BE-27 · an edition's cover and press PDF", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const storage = await import("../src/lib/storage");
  const files = await import("../src/domain/edition-files");
  const pics = await import("../src/domain/edition-pictures");
  const { getEdition } = await import("../src/domain/edition");
  const { createApp } = await import("../src/app");
  const { textPdf } = await import("./support/document-fixtures");
  store.verifyWith(storage.s3);
  const PUB = storage.BUCKETS.public;

  const base0 = { sponsorId: null, athleteId: null, guardianId: null, propertyId: null, studentId: null };
  const btg = { ...base0, userId: `ecp_btg_${R}`, tenantId: T, roles: ["BTG_ADMIN" as const] };
  const advisor = { ...base0, userId: `ecp_adv_${R}`, tenantId: T, roles: ["ADVISOR" as const], propertyId: `ecp_school_${R}` };
  const ED = `ecp_edition_${R}`;
  const SCHOOL = `ecp-school-${R}`;
  const deps = { ...pics.pictureDeps, videoReady: async () => false };
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

  const put = (url: string, type: string, body: Buffer) => fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });
  async function upload(which: "cover" | "press-pdf", type: string, body: Buffer, actor = btg) {
    const g = await files.presignEditionFileUpload(actor, ED, which, { contentType: type, bytes: body.length });
    expect((await put(g.url, g.contentType, body)).status).toBe(200);
    return g;
  }
  const png = (color: string) => sharp({ create: { width: 60, height: 80, channels: 3, background: color } }).png().toBuffer();
  const cover = () => prisma.edition.findUniqueOrThrow({ where: { id: ED }, select: { coverKey: true, coverWebKey: true, coverWebFrom: true } });

  beforeAll(async () => {
    await wipe();
    const far = new Date(Date.now() + 365 * 864e5);
    await prisma.tenant.create({ data: { id: T, name: "ECP Tenant" } });
    await prisma.property.create({ data: { id: `ecp_school_${R}`, tenantId: T, slug: SCHOOL, name: "ECP High", kind: "SCHOOL" } });
    await prisma.user.createMany({ data: [
      { id: btg.userId, tenantId: T, clerkId: btg.userId, email: `ecp-btg-${R}@ecp.invalid`, roles: ["BTG_ADMIN"] },
      { id: advisor.userId, tenantId: T, clerkId: advisor.userId, email: `ecp-adv-${R}@ecp.invalid`, roles: ["ADVISOR"], propertyId: `ecp_school_${R}` },
    ] });
    await prisma.publication.create({ data: { id: `ecp_pub_${R}`, tenantId: T, name: "ECP Times", propertyId: `ecp_school_${R}` } });
    await prisma.edition.create({ data: { id: ED, tenantId: T, publicationId: `ecp_pub_${R}`, label: "ECP Fall", closeDate: far, publishTarget: new Date("2026-11-01"), thresholdCents: 1, state: "IN_PRODUCTION" } });
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

  it("BTG uploads a cover and a press PDF; each is checked and recorded, and the edition says so without its keys", async () => {
    const c = await upload("cover", "image/png", await png("#c00"));
    expect(await files.recordEditionFile(btg, ED, "cover", { r2Key: c.key })).toMatchObject({ which: "cover", type: "image/png", replaced: false });
    const pdf = textPdf(["ECP TIMES", "FALL 2026"]);
    const p = await upload("press-pdf", "application/pdf", pdf);
    expect(await files.recordEditionFile(btg, ED, "press-pdf", { r2Key: p.key, fileName: "ECP Fall FINAL.pdf" })).toMatchObject({ bytes: pdf.length, fileName: "ECP Fall FINAL.pdf" });
    const e = await getEdition(btg, ED);
    expect(e).toMatchObject({ coverType: "image/png", pressPdfName: "ECP Fall FINAL.pdf", pressPdfBytes: pdf.length });
    expect(e).not.toHaveProperty("coverKey");
    expect(e).not.toHaveProperty("pressPdfKey");
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: { in: ["edition.cover", "edition.pressPdf"] }, entityId: ED } })).toBe(2);
  });

  it("the press PDF is BTG's, read as a download by its name; the advisor reads only the cover", async () => {
    const r = await files.editionPressPdfUrl(btg, ED);
    expect(new URL(r.url).searchParams.get("response-content-disposition")).toBe('attachment; filename="ECP Fall FINAL.pdf"');
    expect((await fetch(r.url)).status).toBe(200);
    await expect(files.editionPressPdfUrl(advisor, ED)).rejects.toMatchObject({ status: 403 });
    expect((await files.editionCoverUrl(advisor, ED)).type).toBe("image/png");
    await expect(files.presignEditionFileUpload(advisor, ED, "cover", { contentType: "image/png", bytes: 10 })).rejects.toMatchObject({ status: 403 });
  });

  it("refuses the wrong type, a key this edition's grant didn't hand out, a file that never arrived, and a cover that isn't a picture", async () => {
    await expect(files.presignEditionFileUpload(btg, ED, "cover", { contentType: "application/pdf", bytes: 10 })).rejects.toMatchObject({ status: 422 });
    await expect(files.presignEditionFileUpload(btg, ED, "press-pdf", { contentType: "image/png", bytes: 10 })).rejects.toMatchObject({ status: 422 });
    await expect(files.presignEditionFileUpload(btg, ED, "cover", { contentType: "image/png", bytes: 50 * 1024 * 1024 + 1 })).rejects.toMatchObject({ status: 422 });
    const c = await upload("cover", "image/png", await png("#0c0"));
    /* A cover's key can't be recorded as the press PDF, nor a made-up key. */
    await expect(files.recordEditionFile(btg, ED, "press-pdf", { r2Key: c.key })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/wasn't uploaded for this edition/) });
    await expect(files.recordEditionFile(btg, ED, "cover", { r2Key: `edition-files/${T}/${ED}/cover/made-up` })).rejects.toMatchObject({ status: 422 });
    const never = await files.presignEditionFileUpload(btg, ED, "cover", { contentType: "image/png", bytes: 999 });
    await expect(files.recordEditionFile(btg, ED, "cover", { r2Key: never.key })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/hasn't arrived yet/) });
    const junk = await upload("cover", "image/png", Buffer.alloc(800, 5));
    await expect(files.recordEditionFile(btg, ED, "cover", { r2Key: junk.key })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/couldn't be opened as a picture/) });
    expect(store.objects.has(`${storage.BUCKETS.private}/${junk.key}`)).toBe(false);
  });

  it("nothing is public before publication; once published the cover shows in the reader and the edition list", async () => {
    expect(await pics.syncEditionPictures(ED, deps)).toMatchObject({ made: 0 });
    expect((await cover()).coverWebKey).toBeNull();
    await prisma.edition.update({ where: { id: ED }, data: { state: "PUBLISHED_DIGITAL" } });
    expect(await pics.syncEditionPictures(ED, deps)).toMatchObject({ made: 1 });
    const { coverWebKey } = await cover();
    expect(coverWebKey).toMatch(new RegExp(`^editions/${ED}/cover-`));
    expect(store.objects.get(`${PUB}/${coverWebKey}`)).toMatchObject({ type: "image/png", cacheControl: "public, max-age=600" });
    const reader = await (await fetch(`${base}/api/v1/public/editions/${SCHOOL}/${ED}`)).json() as { cover: { url: string } | null };
    expect(reader.cover?.url).toMatch(new RegExp(`${coverWebKey}$`));
    const list = await (await fetch(`${base}/api/v1/public/next/editions`)).json() as { editions: Array<{ id: string; cover: { url: string } | null }> };
    expect(list.editions.find((e) => e.id === ED)?.cover?.url).toMatch(new RegExp(`${coverWebKey}$`));
  });

  it("a replaced cover is recorded, queues its copy, and the old copy comes down", async () => {
    const old = (await cover()).coverWebKey!;
    const c = await upload("cover", "image/png", await png("#00c"));
    expect(await files.recordEditionFile(btg, ED, "cover", { r2Key: c.key })).toMatchObject({ replaced: true });
    expect(await prisma.outboxJob.count({ where: { tenantId: T, name: "edition.pictures" } })).toBe(1);
    /* Until the worker retakes it, the reader shows no stale cover. */
    expect((await (await fetch(`${base}/api/v1/public/editions/${SCHOOL}/${ED}`)).json() as { cover: unknown }).cover).toBeNull();
    expect(await pics.syncEditionPictures(ED, deps)).toMatchObject({ made: 1, removed: 1 });
    expect(store.objects.has(`${PUB}/${old}`)).toBe(false);
    expect(await cover()).toMatchObject({ coverKey: c.key, coverWebFrom: c.key });
  });

  it("a cancelled edition's cover comes down at the sweep", async () => {
    const live = (await cover()).coverWebKey!;
    await prisma.edition.update({ where: { id: ED }, data: { state: "CANCELLED" } });
    expect((await pics.sweepEditionPictures(deps)).removed).toBeGreaterThanOrEqual(1);
    expect(store.objects.has(`${PUB}/${live}`)).toBe(false);
    expect((await cover()).coverWebKey).toBeNull();
    await expect(files.presignEditionFileUpload(btg, ED, "cover", { contentType: "image/png", bytes: 10 })).rejects.toMatchObject({ status: 409 });
  });
});

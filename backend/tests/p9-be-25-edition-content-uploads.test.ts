/* --------------------------------------------------------------------------
   P9-BE-25 — uploads for edition content, in any format (owner, 2026-11-19:
   the magazine takes "any format").

   Real database, and a real S3 endpoint that checks presigned signatures the
   way R2 does (tests/support/object-store.ts) — no storage mock. Each upload
   is driven as a browser drives it: grant → PUT to the signed URL → save.

     - BTG uploads a video, a design file with no type, and a photo, each to a
       piece of content; the piece records the type, size and name;
     - only a key this edition's grant handed out is accepted, once;
     - a file that never arrived is refused;
     - a file-less piece takes a file once; artwork, a student's piece and a
       published edition don't;
     - the signed read of a file a browser mustn't open in place downloads;
     - a student's draft takes any format, and an approved DESIGN piece
       becomes content of a real kind, carrying its file's type;
     - an advisor, a student, a sponsor and another tenant's BTG are refused.
   -------------------------------------------------------------------------- */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const R = randomBytes(3).toString("hex");
const T = `ecu_tenant_${R}`;
const T2 = `ecu_other_${R}`;
const previousEndpoint = process.env.S3_ENDPOINT;
vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
/* The assignment steps email whoever's turn it is; nothing is sent here. */
vi.mock("../src/lib/email", async (orig) => ({ ...(await orig<object>()), send: async () => ({ id: "test" }) }));

const { startObjectStore } = await import("./support/object-store");
const store = await startObjectStore();
/* The API's S3 client reads S3_ENDPOINT when storage.ts is first imported, below. */
process.env.S3_ENDPOINT = store.endpoint;

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-25 · edition content uploads, in any format", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const storage = await import("../src/lib/storage");
  const rights = await import("../src/domain/content-rights");
  const assignments = await import("../src/domain/student-assignment");
  store.verifyWith(storage.s3);

  const base = { sponsorId: null, athleteId: null, guardianId: null, propertyId: null, studentId: null };
  const btg = { ...base, userId: `ecu_btg_${R}`, tenantId: T, roles: ["BTG_ADMIN" as const] };
  const otherBtg = { ...base, userId: `ecu_btg2_${R}`, tenantId: T2, roles: ["BTG_ADMIN" as const] };
  const advisor = { ...base, userId: `ecu_adv_${R}`, tenantId: T, roles: ["ADVISOR" as const], propertyId: `ecu_school_${R}` };
  const student = { ...base, userId: `ecu_stu_user_${R}`, tenantId: T, roles: ["STUDENT" as const], propertyId: `ecu_school_${R}`, studentId: `ecu_student_${R}` };
  const sponsor = { ...base, userId: `ecu_sp_${R}`, tenantId: T, roles: ["SPONSOR_ADMIN" as const], sponsorId: `ecu_sponsor_${R}` };
  const EDITION = `ecu_edition_${R}`;
  const PUBLISHED = `ecu_published_${R}`;

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1)`, [T, T2]).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, T2] } } }).catch(() => {});
  }

  beforeAll(async () => {
    await wipe();
    const far = new Date(Date.now() + 365 * 864e5);
    await prisma.tenant.createMany({ data: [{ id: T, name: "ECU Tenant" }, { id: T2, name: "ECU Other" }] });
    await prisma.property.create({ data: { id: `ecu_school_${R}`, tenantId: T, slug: `ecu-school-${R}`, name: "ECU High", kind: "SCHOOL" } });
    await prisma.sponsor.create({ data: { id: `ecu_sponsor_${R}`, tenantId: T, name: "ECU Sponsor" } });
    await prisma.student.create({ data: {
      id: `ecu_student_${R}`, tenantId: T, propertyId: `ecu_school_${R}`, legalName: "ECU Student", displayName: "ECU S.", ageBand: "18_PLUS", state: "ACTIVE", masthead: ["DESIGNER"],
    } });
    await prisma.user.createMany({ data: [
      { id: btg.userId, tenantId: T, clerkId: btg.userId, email: `ecu-btg-${R}@ecu.invalid`, roles: ["BTG_ADMIN"] },
      { id: otherBtg.userId, tenantId: T2, clerkId: otherBtg.userId, email: `ecu-btg2-${R}@ecu.invalid`, roles: ["BTG_ADMIN"] },
      { id: advisor.userId, tenantId: T, clerkId: advisor.userId, email: `ecu-adv-${R}@ecu.invalid`, roles: ["ADVISOR"], propertyId: `ecu_school_${R}` },
      { id: student.userId, tenantId: T, clerkId: student.userId, email: `ecu-stu-${R}@ecu.invalid`, roles: ["STUDENT"], propertyId: `ecu_school_${R}`, studentId: `ecu_student_${R}` },
      { id: sponsor.userId, tenantId: T, clerkId: sponsor.userId, email: `ecu-sp-${R}@ecu.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: `ecu_sponsor_${R}` },
    ] });
    await prisma.publication.create({ data: { id: `ecu_pub_${R}`, tenantId: T, name: "ECU Times", propertyId: `ecu_school_${R}` } });
    await prisma.edition.createMany({ data: [
      { id: EDITION, tenantId: T, publicationId: `ecu_pub_${R}`, label: "ECU Fall", closeDate: far, publishTarget: far, thresholdCents: 100000, state: "SELLING" },
      { id: PUBLISHED, tenantId: T, publicationId: `ecu_pub_${R}`, label: "ECU Spring", closeDate: far, publishTarget: far, thresholdCents: 100000, state: "PUBLISHED_DIGITAL" },
    ] });
  });

  afterAll(async () => {
    await wipe();
    await store.close();
    if (previousEndpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = previousEndpoint;
  });

  const put = (url: string, type: string, body: Buffer) => fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });
  const disposition = (url: string) => new URL(url).searchParams.get("response-content-disposition");

  /** Grant, PUT through the URL as a browser would, and hand back the key. */
  async function upload(editionId: string, declared: string, bytes: number, actor = btg) {
    const g = await rights.presignEditionContentUpload(actor, editionId, { contentType: declared, bytes });
    expect((await put(g.url, g.contentType, Buffer.alloc(bytes, 3))).status).toBe(200);
    return g;
  }

  it("BTG uploads a video, a design file the browser can't name and a photo; each piece records its file", async () => {
    const video = await upload(EDITION, "Video/MP4; codecs=avc1", 40_000);
    expect(video.contentType).toBe("video/mp4");
    expect(video.maxBytes).toBe(2_000_000_000);
    expect(video.key.startsWith(`edition-content/${T}/${EDITION}/`)).toBe(true);
    const v = await rights.addEditionAsset(btg, EDITION, { kind: "VIDEO", title: "Homecoming highlights", sourceKind: "BTG", r2Key: video.key, fileName: "highlights final.mp4" });

    const design = await upload(EDITION, "", 12_000);
    expect(design.contentType).toBe("application/octet-stream");
    const d = await rights.addEditionAsset(btg, EDITION, { kind: "DESIGN", title: "Cover layout", sourceKind: "THIRD_PARTY", r2Key: design.key, fileName: "../cover/Cover v3.indd" });

    const photo = await upload(EDITION, "image/jpeg", 8_000);
    const p = await rights.addEditionAsset(btg, EDITION, { kind: "PHOTO", title: "Team photo", sourceKind: "BTG", r2Key: photo.key, fileName: "team.jpg" });

    const rows = await prisma.editionAsset.findMany({ where: { id: { in: [v.id, d.id, p.id] } }, select: { id: true, r2Key: true, fileType: true, fileBytes: true, fileName: true } });
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get(v.id)).toMatchObject({ r2Key: video.key, fileType: "video/mp4", fileBytes: 40_000, fileName: "highlights final.mp4" });
    expect(by.get(d.id)).toMatchObject({ fileType: "application/octet-stream", fileBytes: 12_000, fileName: "Cover v3.indd" });
    expect(by.get(p.id)).toMatchObject({ fileType: "image/jpeg", fileBytes: 8_000 });

    const created = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "editionAsset.create", entityId: v.id }, select: { after: true } });
    expect(created?.after).toMatchObject({ file: { key: video.key, type: "video/mp4", bytes: 40_000 } });

    /* The list says what each piece's file is; the key itself stays server-side. */
    const list = await rights.listAssets(btg, EDITION);
    const listed = list.find((a) => a.id === d.id)!;
    expect(listed).toMatchObject({ hasFile: true, fileType: "application/octet-stream", fileBytes: 12_000, fileName: "Cover v3.indd" });
    expect(listed).not.toHaveProperty("r2Key");

    /* Reads: the video and photo open in place; the design file downloads, by its name. */
    const vr = await rights.editionAssetFileUrl(btg, v.id);
    expect(vr).toMatchObject({ fileType: "video/mp4", download: false });
    expect(disposition(vr.url)).toBeNull();
    const dr = await rights.editionAssetFileUrl(btg, d.id);
    expect(dr.download).toBe(true);
    expect(disposition(dr.url)).toBe('attachment; filename="Cover v3.indd"');
    const fetched = await fetch(dr.url);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-disposition")).toBe('attachment; filename="Cover v3.indd"');
    const grant = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "storage.privateDownloadGrant", entityId: d.id }, select: { after: true } });
    expect(grant?.after).toMatchObject({ key: design.key, disposition: 'attachment; filename="Cover v3.indd"' });
  });

  it("an HTML page or an SVG is stored, but only ever handed back as a download", async () => {
    for (const type of ["text/html", "image/svg+xml"]) {
      const g = await upload(EDITION, type, 2_000);
      const a = await rights.addEditionAsset(btg, EDITION, { kind: "PHOTO", title: `A ${type}`, sourceKind: "BTG", r2Key: g.key });
      const r = await rights.editionAssetFileUrl(btg, a.id);
      expect(r.download).toBe(true);
      expect(disposition(r.url)).toBe("attachment");
    }
  });

  it("refuses a type that isn't one, and a file over 2 GB", async () => {
    await expect(rights.presignEditionContentUpload(btg, EDITION, { contentType: "not a type", bytes: 10 })).rejects.toMatchObject({ status: 422 });
    await expect(rights.presignEditionContentUpload(btg, EDITION, { contentType: "video/mp4", bytes: 2_000_000_001 })).rejects.toMatchObject({ status: 422, message: "Keep the file under 2 GB." });
  });

  it("accepts only a key this edition's grant handed out, and only once", async () => {
    const title = { kind: "PHOTO" as const, title: "Stray", sourceKind: "BTG" as const };
    /* Another edition's prefix, a made-up key under ours, and a climb out of it. */
    const elsewhere = await upload(PUBLISHED, "image/png", 1_000);
    await expect(rights.addEditionAsset(btg, EDITION, { ...title, r2Key: elsewhere.key })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/wasn't uploaded for this edition/) });
    await expect(rights.addEditionAsset(btg, EDITION, { ...title, r2Key: `edition-content/${T}/${EDITION}/made-up` })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/wasn't uploaded for this edition/) });
    await expect(rights.addEditionAsset(btg, EDITION, { ...title, r2Key: `edition-content/${T}/${EDITION}/../x` })).rejects.toMatchObject({ status: 422 });
    /* A real one, used twice. */
    const g = await upload(EDITION, "image/png", 1_000);
    await rights.addEditionAsset(btg, EDITION, { ...title, r2Key: g.key });
    await expect(rights.addEditionAsset(btg, EDITION, { ...title, r2Key: g.key })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already another piece's/) });
    expect(await prisma.editionAsset.count({ where: { tenantId: T, r2Key: g.key } })).toBe(1);
  });

  it("a file that never arrived is refused, and nothing is saved", async () => {
    const g = await rights.presignEditionContentUpload(btg, EDITION, { contentType: "video/quicktime", bytes: 5_000 });
    await expect(rights.addEditionAsset(btg, EDITION, { kind: "VIDEO", title: "Never sent", sourceKind: "BTG", r2Key: g.key })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/hasn't arrived yet/) });
    expect(await prisma.editionAsset.count({ where: { tenantId: T, title: "Never sent" } })).toBe(0);
  });

  it("a piece added by title takes its file once; artwork, a student's piece and a published edition don't", async () => {
    const piece = await rights.addEditionAsset(btg, EDITION, { kind: "ARTICLE", title: "Title only", sourceKind: "BTG" });
    const g = await upload(EDITION, "application/pdf", 3_000);
    const attached = await rights.attachEditionAssetFile(btg, piece.id, { r2Key: g.key, fileName: "story.pdf" });
    expect(attached).toMatchObject({ fileType: "application/pdf", fileBytes: 3_000, fileName: "story.pdf" });
    const again = await upload(EDITION, "application/pdf", 3_000);
    await expect(rights.attachEditionAssetFile(btg, piece.id, { r2Key: again.key })).rejects.toMatchObject({ status: 409, message: "This piece already has its file." });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "editionAsset.file", entityId: piece.id } })).toBe(1);

    await prisma.campaign.create({ data: {
      id: `ecu_campaign_${R}`, tenantId: T, sponsorId: `ecu_sponsor_${R}`, name: "ECU Campaign", budget: 500000,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), state: "ACTIVE",
    } });
    await prisma.adSlot.create({ data: {
      id: `ecu_slot_${R}`, tenantId: T, editionId: EDITION, slotCode: "ECU-BACK", kind: "BACK_COVER", priceCents: 50000,
      campaignId: `ecu_campaign_${R}`, soldCents: 50000, soldAt: new Date(),
    } });
    const artwork = await prisma.editionAsset.create({ data: {
      tenantId: T, editionId: EDITION, kind: "AD_CREATIVE", title: "An ad", sourceKind: "THIRD_PARTY",
      adSlotId: `ecu_slot_${R}`, r2Key: `t/${T}/ad-slot/ecu_slot_${R}/art`, reviewState: "DRAFT_SUBMITTED", artworkVersion: 1, submittedAt: new Date(),
    } });
    await expect(rights.attachEditionAssetFile(btg, artwork.id, { r2Key: again.key })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/uploaded by its sponsor/) });

    const late = await rights.addEditionAsset(btg, PUBLISHED, { kind: "PHOTO", title: "Late", sourceKind: "BTG" });
    const lateFile = await upload(PUBLISHED, "image/png", 1_000);
    await expect(rights.attachEditionAssetFile(btg, late.id, { r2Key: lateFile.key })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/published or cancelled/) });
    await expect(rights.addEditionAsset(btg, PUBLISHED, { kind: "PHOTO", title: "Late 2", sourceKind: "BTG", r2Key: lateFile.key })).rejects.toMatchObject({ status: 409 });
  });

  it("a student's draft takes any format; an approved DESIGN piece becomes content of a real kind, with its file's type", async () => {
    const a = await assignments.createAssignment(advisor, EDITION, { studentId: student.studentId!, kind: "DESIGN", title: "Back-page graphic", brief: "Design the back page." });
    expect((await assignments.presignDraftUpload(student, a.id, "not a type", 10).catch((e: { status: number }) => e)).status).toBe(422);
    await expect(assignments.presignDraftUpload(student, a.id, "video/quicktime", 2_000_000_001)).rejects.toMatchObject({ message: "Keep the file under 2 GB." });
    const g = await assignments.presignDraftUpload(student, a.id, "Video/QuickTime", 25_000);
    expect(g.contentType).toBe("video/quicktime");
    expect((await put(g.url, g.contentType, Buffer.alloc(25_000, 1))).status).toBe(200);
    await assignments.submitDraft(student, a.id, { text: "My graphic, animated.", r2Key: g.key });

    /* A file a browser mustn't open in place downloads from the review, too. */
    const design = await assignments.createAssignment(advisor, EDITION, { studentId: student.studentId!, kind: "DESIGN", title: "Masthead", brief: "Redo the masthead." });
    const dg = await assignments.presignDraftUpload(student, design.id, "", 9_000);
    expect(dg.contentType).toBe("application/octet-stream");
    expect((await put(dg.url, dg.contentType, Buffer.alloc(9_000, 1))).status).toBe(200);
    await assignments.submitDraft(student, design.id, { r2Key: dg.key });
    expect(disposition((await assignments.assignmentFileUrl(advisor, design.id)).url)).toBe("attachment");
    expect(disposition((await assignments.assignmentFileUrl(advisor, a.id)).url)).toBeNull();

    const approved = await assignments.approveAssignment(advisor, a.id);
    expect(approved.state).toBe("APPROVED");
    const asset = await prisma.studentAssignment.findUniqueOrThrow({ where: { id: a.id }, select: { asset: { select: { kind: true, fileType: true, r2Key: true } } } });
    expect(asset.asset).toMatchObject({ kind: "DESIGN", fileType: "video/quicktime", r2Key: g.key });
    expect((rights.ASSET_KINDS as readonly string[]).includes(asset.asset!.kind)).toBe(true);
  });

  it("an advisor, a student, a sponsor and another tenant's BTG can't upload; a sponsor can't read a piece's file", async () => {
    for (const actor of [advisor, student, sponsor]) {
      await expect(rights.presignEditionContentUpload(actor, EDITION, { contentType: "image/png", bytes: 10 })).rejects.toMatchObject({ status: 403 });
    }
    await expect(rights.presignEditionContentUpload(otherBtg, EDITION, { contentType: "image/png", bytes: 10 })).rejects.toMatchObject({ status: 403 });
    const piece = await prisma.editionAsset.findFirstOrThrow({ where: { tenantId: T, editionId: EDITION, fileType: "video/mp4" }, select: { id: true } });
    await expect(rights.editionAssetFileUrl(sponsor, piece.id)).rejects.toMatchObject({ status: 403 });
    await expect(rights.editionAssetFileUrl(otherBtg, piece.id)).rejects.toMatchObject({ status: 403 });
    await expect(rights.attachEditionAssetFile(advisor, piece.id, { r2Key: "x" })).rejects.toMatchObject({ status: 403 });
    /* The school's advisor reads their own edition's content. */
    expect((await rights.editionAssetFileUrl(advisor, piece.id)).fileType).toBe("video/mp4");
  });
});

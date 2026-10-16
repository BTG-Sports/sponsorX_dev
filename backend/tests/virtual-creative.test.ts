import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   4S2-BE-01/02/03 — creative on virtual placements, deployments, the manifest
   (documentation/SponsorX-Virtual-Registry.md §5–§7).
   Done when:
     02  an asset failing the placement's technical constraints is rejected at upload;
     01  a deployment record ties campaign, placement, asset version and schedule;
     03  the manifest returns only approved, in-window deployments for the requested world and time.

   No storage mock: uploads go through the in-process bucket that checks
   presigned signatures the way R2 does (tests/support/object-store.ts).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const R = await import("../src/domain/virtual-rules");

describe("4S2 · the creative rules (pure)", () => {
  const led = { kind: "LED_SCREEN", widthPx: 1920, heightPx: 1080, creativeTypes: ["IMAGE", "VIDEO"], maxBytes: 5_000_000, maxVideoSeconds: 15 };
  const png = { creativeType: "IMAGE" as const, mime: "image/png", widthPx: 1920, heightPx: 1080, bytes: 100_000 };

  it("fits: the placement's type, a matching file type, exactly its pixels, its size, its video length", () => {
    expect(R.creativeProblems(led, png)).toEqual([]);
    expect(R.creativeProblems(led, { ...png, widthPx: 1000, heightPx: 500 })).toEqual(["It must be exactly 1920×1080 px; this is 1000×500."]);
    expect(R.creativeProblems(led, { ...png, creativeType: "LOGO" })).toEqual(["This led screen takes image or video, not logo."]);
    expect(R.creativeProblems(led, { ...png, mime: "video/mp4" })).toEqual(["A image is image/png, image/jpeg, image/webp, not video/mp4."]);
    expect(R.creativeProblems(led, { ...png, creativeType: "VIDEO", mime: "video/mp4", durationSeconds: 20 })).toEqual(["A video here runs at most 15 s; this runs 20 s."]);
    expect(R.creativeProblems(led, { ...png, bytes: 6_000_000 })[0]).toMatch(/^It must be at most/);
  });

  it("a deployment runs inside its booked window", () => {
    const w = { startsAt: new Date("2026-11-02T00:00:00Z"), endsAt: new Date("2026-11-09T00:00:00Z") };
    expect(R.deploymentDatesProblem(w, w)).toBeNull();
    expect(R.deploymentDatesProblem({ startsAt: w.startsAt, endsAt: new Date("2026-11-10T00:00:00Z") }, w)).toBe("A deployment runs inside its booked window.");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("4S2-BE-01/02/03 · creative, deployments and the manifest, against the database", { timeout: 120_000 }, async () => {
  const previousEndpoint = process.env.S3_ENDPOINT;
  const { startObjectStore } = await import("./support/object-store");
  const store = await startObjectStore();
  process.env.S3_ENDPOINT = store.endpoint;
  const storage = await import("../src/lib/storage");
  store.verifyWith(storage.s3);

  const { prisma } = await import("../src/db/client");
  const V = await import("../src/domain/virtual-registry");
  const B = await import("../src/domain/virtual-bookings");
  const C = await import("../src/domain/virtual-creative");
  const { ForbiddenError } = await import("../src/auth/errors");

  const T = `vc_t_${randomBytes(3).toString("hex")}`;
  const OTHER = `${T}_o`;
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const actor = (tenantId: string, role: string, extra: Record<string, unknown> = {}) =>
    ({ userId: `vc_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const admin = actor(T, "BTG_ADMIN");
  const cm = actor(T, "CAMPAIGN_MGR");
  const NOW = new Date("2026-10-20T12:00:00Z");

  const image = (w: number, h: number, format: "png" | "jpeg" = "png") =>
    sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } })[format]().toBuffer();
  /** Upload a file the way a browser does: the signed URL, the signed type and length. */
  async function upload(windowId: string, contentType: string, body: Buffer) {
    const { url, key } = await C.presignCreative(cm, windowId, { contentType, bytes: body.length });
    const put = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body });
    expect(put.status).toBe(200);
    return key;
  }

  async function clean() {
    for (const t of ["CreativeDeployment", "VirtualAsset", "PlacementWindow", "VirtualPlacement", "VirtualZone", "VirtualWorld", "InventoryItem", "OutboxJob", "AuditLog", "Campaign", "Sponsor", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  let world = "";
  let w1 = "";
  let w2 = "";
  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Creative" }, { id: OTHER, name: "Another operator" }] });
    await prisma.property.create({ data: { id: `${T}_p`, tenantId: T, slug: `${T}-infinex`, name: "INFINEX", kind: "VIRTUAL", listingAccessAt: new Date("2026-10-01") }, select: { id: true } });
    await prisma.sponsor.create({ data: { id: `${T}_sp`, tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.campaign.createMany({ data: ["c1", "c2"].map((c) => ({
      id: `${T}_${c}`, tenantId: T, sponsorId: `${T}_sp`, name: `Campaign ${c}`, budget: 1, startDate: D("2026-11-01"), endDate: D("2026-11-30"), state: "DRAFT" as const,
    })) });
    world = (await V.createWorld(admin, { propertyId: `${T}_p`, externalId: "arena", name: "INFINEX Arena", environment: "PRODUCTION" })).world.id;
    const led = (await V.createPlacement(admin, world, {
      externalId: "east-led", name: "East LED", kind: "LED_SCREEN", widthPx: 1920, heightPx: 1080, creativeTypes: ["IMAGE", "VIDEO"], maxBytes: 5_000_000, maxVideoSeconds: 15, rackPriceCents: 70_000,
    })).placement.id;
    await V.publishPlacement(admin, led);
    w1 = (await B.bookPlacement(cm, led, { campaignId: `${T}_c1`, startsAt: D("2026-11-02"), endsAt: D("2026-11-09") })).window.id;
    w2 = (await B.bookPlacement(cm, led, { campaignId: `${T}_c2`, startsAt: D("2026-11-09"), endsAt: D("2026-11-16") })).window.id;
  });
  afterAll(async () => {
    await clean();
    await store.close();
    process.env.S3_ENDPOINT = previousEndpoint;
  });

  let good = "";

  it("02 · an image of exactly the placement's pixels is VALIDATED — pixels, size and checksum read from the stored file; audited", async () => {
    const body = await image(1920, 1080);
    const key = await upload(w1, "image/png", body);
    /* Declared pixels are not trusted for an image: SponsorX reads them. */
    const out = await C.registerCreative(cm, w1, { r2Key: key, creativeType: "IMAGE", widthPx: 1, heightPx: 1 });
    expect(out.asset).toMatchObject({ state: "VALIDATED", version: 1, widthPx: 1920, heightPx: 1080, bytes: body.length, mime: "image/png", problems: [] });
    expect(out.asset.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "virtual.creativeRegister" } })).toBe(1);
    good = out.asset.id;
  });

  it("02 · a file that does not fit is REJECTED at upload with every reason, recorded, and its file deleted", async () => {
    const small = await image(1000, 500);
    const key = await upload(w1, "image/png", small);
    const out = await C.registerCreative(cm, w1, { r2Key: key, creativeType: "IMAGE", widthPx: 1920, heightPx: 1080 });
    expect(out.asset).toMatchObject({ state: "REJECTED", version: 2, problems: ["It must be exactly 1920×1080 px; this is 1000×500."] });
    expect(store.objects.has(`${storage.BUCKETS.private}/${key}`)).toBe(false);
    /* A JPEG sent as a PNG: the file says what it is. */
    const jpeg = await image(1920, 1080, "jpeg");
    const k2 = await upload(w1, "image/png", jpeg);
    expect((await C.registerCreative(cm, w1, { r2Key: k2, creativeType: "IMAGE" })).asset.problems).toEqual(["The file is jpeg, not the image/png it was uploaded as."]);
    /* A logo on a screen that takes image or video. */
    const k3 = await upload(w1, "image/png", await image(1920, 1080));
    expect((await C.registerCreative(cm, w1, { r2Key: k3, creativeType: "LOGO" })).asset.problems).toEqual(["This led screen takes image or video, not logo."]);
  });

  it("02 · a video: its pixels and length are declared, and a long one is rejected", async () => {
    const clip = randomBytes(40_000);
    const k1 = await upload(w1, "video/mp4", clip);
    expect((await C.registerCreative(cm, w1, { r2Key: k1, creativeType: "VIDEO", widthPx: 1920, heightPx: 1080, durationSeconds: 20 })).asset.problems).toEqual(["A video here runs at most 15 s; this runs 20 s."]);
    const k2 = await upload(w1, "video/mp4", clip);
    expect((await C.registerCreative(cm, w1, { r2Key: k2, creativeType: "VIDEO", widthPx: 1920, heightPx: 1080, durationSeconds: 10 })).asset.state).toBe("VALIDATED");
  });

  it("02 · refused before checking: a file not uploaded yet, or one uploaded for another window", async () => {
    const { key } = await C.presignCreative(cm, w1, { contentType: "image/png", bytes: 1000 });
    await expect(C.registerCreative(cm, w1, { r2Key: key, creativeType: "IMAGE" })).rejects.toThrow(/hasn't arrived yet/);
    const other = await upload(w2, "image/png", await image(1920, 1080));
    await expect(C.registerCreative(cm, w1, { r2Key: other, creativeType: "IMAGE" })).rejects.toThrow(/not uploaded for this window/);
  });

  let dep = "";

  it("01 · a deployment ties the campaign, the placement, the creative version and the dates — inside the window; a rejected version never deploys", async () => {
    const d = await C.createDeployment(cm, w1, { assetId: good });
    expect(d.deployment).toMatchObject({ windowId: w1, campaignId: `${T}_c1`, assetId: good, assetVersion: 1, state: "DRAFT", startsAt: "2026-11-02T00:00:00.000Z", endsAt: "2026-11-09T00:00:00.000Z" });
    dep = d.deployment.id;
    const rejected = (await prisma.virtualAsset.findFirstOrThrow({ where: { tenantId: T, windowId: w1, state: "REJECTED" }, select: { id: true } })).id;
    await expect(C.createDeployment(cm, w1, { assetId: rejected })).rejects.toThrow(/can never be deployed/);
    await expect(C.createDeployment(cm, w1, { assetId: good, startsAt: D("2026-11-01"), endsAt: D("2026-11-05") })).rejects.toMatchObject({ problems: ["A deployment runs inside its booked window."] });
  });

  it("03 · the manifest: nothing until approved; then only in its dates; versioned, with an ETag that holds while nothing changes", async () => {
    const before = await C.worldManifest(admin, world, new Date("2026-11-03T12:00:00Z"));
    expect(before.manifest).toMatchObject({ worldId: "arena", environment: "PRODUCTION", manifestVersion: 0, placements: [] });

    const approved = await C.approveDeployment(cm, dep, NOW);
    expect(approved.deployment).toMatchObject({ state: "APPROVED", sequence: 2 });
    const during = await C.worldManifest(admin, world, new Date("2026-11-03T12:00:00Z"));
    expect(during.manifest.manifestVersion).toBe(1);
    expect(during.manifest.placements).toEqual([expect.objectContaining({
      placementId: "east-led", deploymentId: dep, sequence: 2, campaignId: `${T}_c1`,
      asset: expect.objectContaining({ assetId: good, version: 1, mime: "image/png", widthPx: 1920, heightPx: 1080, checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/), url: null }),
      window: { startsAt: "2026-11-02T00:00:00.000Z", endsAt: "2026-11-09T00:00:00.000Z" },
    })]);
    expect((await C.worldManifest(admin, world, new Date("2026-11-03T13:00:00Z"))).etag).toBe(during.etag);
    /* Outside its dates: not shown — and a different ETag. */
    const after = await C.worldManifest(admin, world, new Date("2026-11-10T12:00:00Z"));
    expect(after.manifest.placements).toEqual([]);
    expect(after.etag).not.toBe(during.etag);
  });

  it("01 · one creative at a time on a window: a second overlapping approval is refused (the database's rule)", async () => {
    const second = await C.createDeployment(cm, w1, { assetId: good, startsAt: D("2026-11-05"), endsAt: D("2026-11-09") });
    await expect(C.approveDeployment(cm, second.deployment.id, NOW)).rejects.toThrow(/already runs on this window/);
  });

  it("ending, and a window given back, take creative off the world", async () => {
    await C.endDeployment(cm, dep, { reason: "Swapping the creative" }, NOW);
    expect((await C.worldManifest(admin, world, new Date("2026-11-03T12:00:00Z"))).manifest.placements).toEqual([]);

    const k = await upload(w2, "image/png", await image(1920, 1080));
    const a = (await C.registerCreative(cm, w2, { r2Key: k, creativeType: "IMAGE" })).asset.id;
    const d2 = (await C.createDeployment(cm, w2, { assetId: a })).deployment.id;
    await C.approveDeployment(cm, d2, NOW);
    expect((await C.worldManifest(admin, world, new Date("2026-11-10T12:00:00Z"))).manifest.placements).toHaveLength(1);
    await B.releaseWindow(cm, w2, { reason: "The sponsor moved the dates" }, NOW);
    expect((await prisma.creativeDeployment.findFirstOrThrow({ where: { id: d2 }, select: { state: true, endReason: true } }))).toMatchObject({ state: "ENDED", endReason: "Its window was given back: The sponsor moved the dates" });
    expect((await C.worldManifest(admin, world, new Date("2026-11-10T12:00:00Z"))).manifest.placements).toEqual([]);
  });

  it("who: BTG and campaign managers upload and deploy; Sales and sponsors cannot; a world's owner reads its manifest; another tenant reaches nothing", async () => {
    await expect(C.presignCreative(actor(T, "SALES"), w1, { contentType: "image/png", bytes: 100 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(C.presignCreative(actor(T, "SPONSOR_ADMIN", { sponsorId: `${T}_sp` }), w1, { contentType: "image/png", bytes: 100 })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await C.worldManifest(actor(T, "PROPERTY_MGR", { propertyId: `${T}_p` }), world)).manifest.worldId).toBe("arena");
    await expect(C.worldManifest(actor(OTHER, "BTG_ADMIN"), world)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
    await expect(C.presignCreative(actor(OTHER, "BTG_ADMIN"), w1, { contentType: "image/png", bytes: 100 })).rejects.toBeInstanceOf(V.VirtualNotFoundError);
    await expect(C.approveDeployment(actor(OTHER, "BTG_ADMIN"), dep)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
  });
});

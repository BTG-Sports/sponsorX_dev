import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   4S2-BE-05 — creative is paused, resumed or rolled back from SponsorX, and
   the world sees it on its next manifest poll: no INFINEX release. Pausing
   takes a deployment off the manifest; resuming is checked again like an
   approval; rolling back puts an earlier validated version on the window
   from that moment to the old end, in one step. Uploads go through the
   in-process bucket that checks the signature, as in virtual-creative.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("4S2-BE-05 · pause, resume and roll back creative without an INFINEX release", { timeout: 120_000 }, async () => {
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

  const T = `vdc_t_${randomBytes(3).toString("hex")}`;
  const OTHER = `${T}_o`;
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const actor = (tenantId: string, role: string) =>
    ({ userId: `vdc_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const admin = actor(T, "BTG_ADMIN");
  const cm = actor(T, "CAMPAIGN_MGR");
  /* The moment SponsorX acts, inside the booked days; the world asks a day later. */
  const NOW = new Date("2026-11-03T12:00:00Z");
  const AT = new Date("2026-11-04T12:00:00Z");

  const image = (shade: number) => sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: shade, g: 30, b: 30 } } }).png().toBuffer();
  async function version(windowId: string, shade: number) {
    const body = await image(shade);
    const { url, key } = await C.presignCreative(cm, windowId, { contentType: "image/png", bytes: body.length });
    expect((await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body })).status).toBe(200);
    const a = (await C.registerCreative(cm, windowId, { r2Key: key, creativeType: "IMAGE" })).asset;
    expect(a.state).toBe("VALIDATED");
    return a;
  }
  const shown = async () => (await C.worldManifest(admin, world, AT)).manifest!;

  async function clean() {
    for (const t of ["CreativeDeployment", "VirtualAsset", "PlacementWindow", "VirtualPlacement", "VirtualZone", "VirtualWorld", "InventoryItem", "Fact", "CampaignDaySummary", "OutboxJob", "AuditLog", "Campaign", "Sponsor", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  let world = "";
  let win = "";
  let v1 = { id: "", version: 0 };
  let v2 = { id: "", version: 0 };
  let running = "";
  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Deployment control" }, { id: OTHER, name: "Another operator" }] });
    await prisma.property.create({ data: { id: `${T}_p`, tenantId: T, slug: `${T}-infinex`, name: "INFINEX", kind: "VIRTUAL", listingAccessAt: D("2026-10-01") }, select: { id: true } });
    await prisma.sponsor.create({ data: { id: `${T}_sp`, tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.campaign.create({ data: { id: `${T}_c`, tenantId: T, sponsorId: `${T}_sp`, name: "Arena push", budget: 1, startDate: D("2026-11-01"), endDate: D("2026-11-30"), state: "DRAFT" }, select: { id: true } });
    world = (await V.createWorld(admin, { propertyId: `${T}_p`, externalId: "arena", name: "INFINEX Arena", environment: "PRODUCTION" })).world.id;
    const led = (await V.createPlacement(admin, world, {
      externalId: "east-led", name: "East LED", kind: "LED_SCREEN", widthPx: 1920, heightPx: 1080, creativeTypes: ["IMAGE"], maxBytes: 5_000_000, rackPriceCents: 70_000,
    })).placement.id;
    await V.publishPlacement(admin, led);
    win = (await B.bookPlacement(cm, led, { campaignId: `${T}_c`, startsAt: D("2026-11-02"), endsAt: D("2026-11-09") })).window.id;
    v1 = await version(win, 200);
    v2 = await version(win, 100);
    running = (await C.createDeployment(cm, win, { assetId: v2.id })).deployment.id;
    await C.approveDeployment(cm, running, NOW);
  });
  afterAll(async () => {
    await clean();
    await store.close();
    process.env.S3_ENDPOINT = previousEndpoint;
  });

  it("pausing takes the creative off the world's manifest at once — a new version and ETag, recorded with when and why", async () => {
    const before = await C.worldManifest(admin, world, AT);
    expect(before.manifest!.placements.map((p) => p.asset.version)).toEqual([v2.version]);
    const paused = (await C.pauseDeployment(cm, running, { reason: "The sponsor asked for it down" }, NOW)).deployment;
    expect(paused).toMatchObject({ state: "PAUSED", pausedAt: NOW.toISOString(), stateReason: "The sponsor asked for it down" });
    const after = await C.worldManifest(admin, world, AT);
    expect(after.manifest!.placements).toEqual([]);
    expect(after.manifest!.manifestVersion).toBe(before.manifest!.manifestVersion + 1);
    expect(after.etag).not.toBe(before.etag);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "virtual.deploymentPause", entityId: running } })).toBe(1);
    await expect(C.pauseDeployment(cm, running, { reason: "Again" }, NOW)).rejects.toThrow(/only an approved deployment can be paused/);
  });

  it("resuming puts it back, checked again; it is refused when another approved deployment took its days meanwhile", async () => {
    const stand = (await C.createDeployment(cm, win, { assetId: v1.id })).deployment.id;
    await C.approveDeployment(cm, stand, NOW);
    await expect(C.resumeDeployment(cm, running)).rejects.toThrow(/Another approved deployment now runs/);
    await C.endDeployment(cm, stand, { reason: "Stand-in no longer needed" }, NOW);

    const resumed = (await C.resumeDeployment(cm, running)).deployment;
    expect(resumed).toMatchObject({ state: "APPROVED", pausedAt: null, stateReason: null });
    expect((await shown()).placements.map((p) => p.asset.version)).toEqual([v2.version]);
    await expect(C.resumeDeployment(cm, running)).rejects.toThrow(/not paused/);
  });

  it("rolling back puts the previous validated version on the world from now to the old end, in one step", async () => {
    const out = await C.rollbackWindow(cm, win, { reason: "The new artwork has a typo" }, NOW);
    expect(out.rolledBack).toMatchObject({ id: running, state: "ROLLED_BACK", rolledBackAt: NOW.toISOString(), stateReason: "The new artwork has a typo", replacedById: out.deployment.id });
    expect(out.deployment).toMatchObject({ state: "APPROVED", assetId: v1.id, assetVersion: v1.version, startsAt: NOW.toISOString(), endsAt: "2026-11-09T00:00:00.000Z" });
    const m = await shown();
    expect(m.placements).toEqual([expect.objectContaining({ deploymentId: out.deployment.id, asset: expect.objectContaining({ version: v1.version }) })]);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "virtual.deploymentRollback", entityId: running } })).toBe(1);
    running = out.deployment.id;
  });

  it("refused: nothing earlier to roll back to, the version already running, a rolled-back deployment ended twice", async () => {
    await expect(C.rollbackWindow(cm, win, { reason: "Further back" }, NOW)).rejects.toThrow(/no earlier validated version/);
    await expect(C.rollbackWindow(cm, win, { reason: "Same one", assetId: v1.id }, NOW)).rejects.toThrow(/already running/);
    const rolled = (await prisma.creativeDeployment.findFirstOrThrow({ where: { tenantId: T, state: "ROLLED_BACK" }, select: { id: true } })).id;
    await expect(C.endDeployment(cm, rolled, { reason: "Tidy up" }, NOW)).rejects.toThrow(/was rolled back/);
    /* Forward again, by naming the newer version. */
    const forward = await C.rollbackWindow(cm, win, { reason: "Typo fixed upstream", assetId: v2.id }, NOW);
    expect((await shown()).placements.map((p) => p.asset.version)).toEqual([v2.version]);
    running = forward.deployment.id;
  });

  it("giving the window back ends what runs; what was rolled back stays as it was", async () => {
    await B.releaseWindow(cm, win, { reason: "The sponsor moved the dates" }, NOW);
    expect((await shown()).placements).toEqual([]);
    const states = await prisma.creativeDeployment.groupBy({ by: ["state"], where: { tenantId: T, windowId: win }, _count: true });
    expect(Object.fromEntries(states.map((s) => [s.state, s._count]))).toEqual({ ENDED: 2, ROLLED_BACK: 2 });
    await expect(C.rollbackWindow(cm, win, { reason: "Too late" }, NOW)).rejects.toThrow(/Nothing is running or paused/);
  });

  it("who: Sales cannot pause or roll back; another tenant reaches nothing", async () => {
    await expect(C.pauseDeployment(actor(T, "SALES"), running, { reason: "Not mine" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(C.rollbackWindow(actor(T, "SALES"), win, { reason: "Not mine" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(C.pauseDeployment(actor(OTHER, "BTG_ADMIN"), running, { reason: "Not mine" }, NOW)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
    await expect(C.resumeDeployment(actor(OTHER, "BTG_ADMIN"), running)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
    await expect(C.rollbackWindow(actor(OTHER, "BTG_ADMIN"), win, { reason: "Not mine" }, NOW)).rejects.toBeInstanceOf(V.VirtualNotFoundError);
  });
});

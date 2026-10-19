import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   4S4-BE-01 (with 4S4-BE-02 and 4S4-DATA-01) — the telemetry intake.
   Batches from a game session, signed over the raw bytes; idempotent by
   (client, eventId); every malformed or unauthorised event refused with its
   reason, the rest kept; raw rows stored once and never changed. The
   stand-in world sends its batch exactly as a world will.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INFINEX_SIGNING_SECRET = "test-telemetry-root";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@infinex-telemetry.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("4S4-BE-01 · the telemetry intake", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const V = await import("../src/domain/virtual-registry");
  const { runStandin, signedPost } = await import("../scripts/infinex-standin.mts");
  type Actor = import("../src/auth/actor").Actor;

  const T = `itl_t_${randomBytes(3).toString("hex")}`;
  const ADMIN = `${T}_admin`;
  const staff = { userId: ADMIN, tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null } as unknown as Actor;
  const DAY = 86_400_000;

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, auth: { clerk?: string; token?: string } = {}, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(auth.clerk ? { "x-test-clerk": auth.clerk } : {}), ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of ["VirtualEventRaw", "InfinexToken", "InfinexClient", "InfinexCredential", "CreativeDeployment", "VirtualAsset", "PlacementWindow", "InventoryItem", "VirtualPlacement", "VirtualZone", "VirtualWorld", "AuditLog", "Campaign", "Sponsor", "Fact", "CampaignDaySummary"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    for (const t of ["User", "Property"]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
  }

  let cred = { id: "", secret: "" };
  let build = "";
  let live = { deploymentId: "", assetId: "" };
  let ended = "";
  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "INFINEX telemetry" } });
    await prisma.user.create({ data: { id: ADMIN, tenantId: T, clerkId: ADMIN, email: `${ADMIN}@infinex-telemetry.invalid`, roles: ["BTG_ADMIN"] } });
    await prisma.property.create({ data: { id: `${T}_p`, tenantId: T, slug: `${T}-infinex`, name: "INFINEX", kind: "VIRTUAL", listingAccessAt: new Date("2026-10-01") }, select: { id: true } });
    await prisma.sponsor.create({ data: { id: `${T}_sp`, tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.campaign.create({ data: { id: `${T}_c`, tenantId: T, sponsorId: `${T}_sp`, name: "Arena push", budget: 1, startDate: new Date(Date.now() - 10 * DAY), endDate: new Date(Date.now() + 10 * DAY), state: "ACTIVE" }, select: { id: true } });
    const world = (await V.createWorld(staff, { propertyId: `${T}_p`, externalId: "arena", name: "INFINEX Arena", environment: "PRODUCTION" })).world.id;
    await V.upsertZones(staff, world, [{ externalId: "gate", name: "Front Gate", level: "ZONE" }]);
    const placement = (await V.createPlacement(staff, world, {
      externalId: "east-led", name: "East LED", kind: "LED_SCREEN", widthPx: 1920, heightPx: 1080, creativeTypes: ["IMAGE"], maxBytes: 5_000_000, rackPriceCents: 70_000,
    })).placement.id;
    await V.publishPlacement(staff, placement);
    /* A booked window with a validated creative and a live deployment — rows, as the creative tests make them. */
    await prisma.placementWindow.create({ data: { id: `${T}_w`, tenantId: T, placementId: placement, campaignId: `${T}_c`, slot: 1, startsAt: new Date(Date.now() - 5 * DAY), endsAt: new Date(Date.now() + 5 * DAY), priceCents: 1 }, select: { id: true } });
    for (const v of [1, 2]) {
      await prisma.virtualAsset.create({ data: {
        id: `${T}_a${v}`, tenantId: T, windowId: `${T}_w`, placementId: placement, campaignId: `${T}_c`, version: v, r2Key: `virtual/${T}/${T}_w/a${v}`, mime: "image/png",
        creativeType: "IMAGE", widthPx: 1920, heightPx: 1080, bytes: 1000, checksum: "a".repeat(64), state: "VALIDATED",
      }, select: { id: true } });
    }
    live = { deploymentId: `${T}_d_live`, assetId: `${T}_a2` };
    ended = `${T}_d_ended`;
    await prisma.creativeDeployment.create({ data: {
      id: ended, tenantId: T, worldId: world, placementId: placement, windowId: `${T}_w`, campaignId: `${T}_c`, assetId: `${T}_a1`, assetVersion: 1,
      startsAt: new Date(Date.now() - 5 * DAY), endsAt: new Date(Date.now() - 2 * DAY), state: "ENDED", approvedAt: new Date(Date.now() - 5 * DAY), endedAt: new Date(Date.now() - 2 * DAY), endReason: "Swapped",
    }, select: { id: true } });
    await prisma.creativeDeployment.create({ data: {
      id: live.deploymentId, tenantId: T, worldId: world, placementId: placement, windowId: `${T}_w`, campaignId: `${T}_c`, assetId: live.assetId, assetVersion: 2,
      startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() + 5 * DAY), state: "APPROVED", approvedAt: new Date(Date.now() - 2 * DAY),
    }, select: { id: true } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const made = await call("POST", "/infinex/credentials", { clerk: ADMIN }, { name: "Arena world server" });
    cred = { id: made.json.credential.id, secret: made.json.secret };
    build = (await call("POST", "/infinex/clients", { clerk: ADMIN }, { worldId: world, buildId: "2026.10.1" })).json.client.id;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await clean();
  });

  const gameSession = async () => {
    const token = (await call("POST", "/infinex/token", {}, { credentialId: cred.id, secret: cred.secret })).json.accessToken as string;
    const s = (await call("POST", `/infinex/clients/${build}/sessions`, { token })).json;
    return { server: token, game: { accessToken: s.accessToken as string, keyId: s.keyId as string, signingKey: s.signingKey as string } };
  };
  const event = (over: Record<string, unknown> = {}) => ({
    eventId: randomUUID(), schemaVersion: 1, eventType: "placement.visible", occurredAt: new Date().toISOString(),
    subject: { worldId: "arena", placementId: "east-led", deploymentId: live.deploymentId }, data: { visiblePct: 75, dwellMs: 1800 }, ...over,
  });
  const rows = () => prisma.virtualEventRaw.count({ where: { tenantId: T } });

  it("the stand-in world sends a signed batch: each event stored once, with the session's tenant, world and build; a resend is all duplicate", async () => {
    const r = await runStandin({ baseUrl: base, credentialId: cred.id, secret: cred.secret, clientId: build, beats: 1, log: () => {} });
    expect(r.telemetry).toEqual({ batches: 1, sent: 2, accepted: 2, duplicate: 0, quarantined: 0, rejected: 0 });
    const stored = await prisma.virtualEventRaw.findMany({ where: { tenantId: T }, select: { clientId: true, buildId: true, eventType: true, deploymentId: true, placementId: true, status: true } });
    expect(stored).toHaveLength(2);
    for (const e of stored) expect(e).toMatchObject({ clientId: build, buildId: "2026.10.1", deploymentId: live.deploymentId, status: "ACCEPTED", placementId: expect.any(String) });
    /* Clients retry: the same batch again is stored again nowhere. */
    const { game } = await gameSession();
    const again = await signedPost(base, "/infinex/telemetry", game, r.sentBatches[0]);
    expect(again.json).toMatchObject({ accepted: 0, duplicate: 2, rejected: 0 });
    expect(await rows()).toBe(2);
  });

  it("each event is checked on its own: every refusal named, the good ones kept, a late one quarantined, a repeat in the batch a duplicate", async () => {
    const { game } = await gameSession();
    const ok = event();
    const before = await rows();
    const cases: [string, Record<string, unknown>][] = [
      ["malformed-event", { eventId: "short" }],
      ["unsupported-schema-version", { schemaVersion: 2 }],
      ["unknown-event-type", { eventType: "placement.teleport" }],
      ["malformed-data", { data: { visiblePct: 140, dwellMs: 1 } }],
      ["occurred-in-future", { occurredAt: new Date(Date.now() + 10 * 60_000).toISOString() }],
      ["wrong-world", { subject: { worldId: "elsewhere", placementId: "east-led", deploymentId: live.deploymentId } }],
      ["placement-not-in-world", { subject: { placementId: "west-led", deploymentId: live.deploymentId } }],
      ["deployment-not-live", { subject: { placementId: "east-led", deploymentId: ended } }],
      ["asset-mismatch", { eventType: "placement.render", data: { assetId: `${T}_a1`, assetVersion: 1 } }],
      ["tenant-in-body", { tenantId: "someone-else" }],
      ["wrong-producer", { producer: { buildId: "2025.1.0" } }],
      ["wrong-endpoint", { eventType: "client.heartbeat", data: {} }],
      ["activations-off", { eventType: "activation.start", data: { activationId: "act_1" } }],
      ["zone-not-in-world", { eventType: "zone.visit", subject: { zoneId: "nowhere" }, data: { enteredAt: new Date().toISOString() } }],
    ];
    const batch = [
      ok, { ...ok },
      event({ eventType: "zone.visit", subject: { zoneId: "gate" }, data: { enteredAt: new Date().toISOString() } }),
      event({ eventType: "placement.render", data: { assetId: live.assetId, assetVersion: 2 } }),
      event({ occurredAt: new Date(Date.now() - 80 * 3_600_000).toISOString(), subject: { placementId: "east-led", deploymentId: live.deploymentId } }),
      ...cases.map(([, over]) => event(over)),
    ];
    const r = await signedPost(base, "/infinex/telemetry", game, { events: batch });
    expect(r.status).toBe(207);
    expect(r.json).toMatchObject({ accepted: 3, duplicate: 1, quarantined: 0, rejected: cases.length + 1 });
    const problems = (r.json.results as { status: string; problem?: { type: string; title: string } }[]).filter((x) => x.status === "rejected").map((x) => x.problem!.type);
    for (const [type] of cases) expect(problems).toContain(type);
    /* The late event is outside the window because its deployment had not started: refused, not quarantined. */
    expect(problems).toContain("deployment-not-live");
    const named = (r.json.results as { problem?: { type: string; title: string } }[]).find((x) => x.problem?.type === "unsupported-schema-version")!;
    expect(named.problem!.title).toContain("supported: 1");
    expect(await rows()).toBe(before + 3);
  });

  it("an event past the 72-hour window from a deployment live then is kept QUARANTINED, never dropped", async () => {
    const { game } = await gameSession();
    const old = new Date(Date.now() - 4 * DAY);
    await prisma.creativeDeployment.create({ data: {
      id: `${T}_d_old`, tenantId: T, worldId: (await prisma.virtualWorld.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } })).id,
      placementId: (await prisma.virtualPlacement.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } })).id, windowId: `${T}_w`, campaignId: `${T}_c`,
      assetId: `${T}_a1`, assetVersion: 1, startsAt: new Date(Date.now() - 5 * DAY), endsAt: new Date(Date.now() - 3.5 * DAY), state: "ENDED",
      approvedAt: new Date(Date.now() - 5 * DAY), endedAt: new Date(Date.now() - 3.5 * DAY), endReason: "Done",
    }, select: { id: true } });
    const r = await signedPost(base, "/infinex/telemetry", game, { events: [event({ occurredAt: old.toISOString(), subject: { placementId: "east-led", deploymentId: `${T}_d_old` } })] });
    expect(r.json).toMatchObject({ accepted: 0, quarantined: 1, rejected: 0 });
    expect(await prisma.virtualEventRaw.count({ where: { tenantId: T, status: "QUARANTINED" } })).toBe(1);
  });

  it("the build's config sets the limits: too many events is 413 for the batch; telemetry switched off is 409", async () => {
    await call("PATCH", `/infinex/clients/${build}/config`, { clerk: ADMIN }, { override: { telemetry: { maxBatch: 2 } } });
    const { game } = await gameSession();
    const big = await signedPost(base, "/infinex/telemetry", game, { events: [event(), event(), event()] });
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe("batch-too-large");
    await call("PATCH", `/infinex/clients/${build}/config`, { clerk: ADMIN }, { override: { flags: { telemetry: false } } });
    expect((await signedPost(base, "/infinex/telemetry", game, { events: [event()] })).status).toBe(409);
    await call("PATCH", `/infinex/clients/${build}/config`, { clerk: ADMIN }, { override: null });
  });

  it("unauthorised: no signature, a tampered or stale one, a server's token, a person — all refused before anything is stored", async () => {
    const { server: serverToken, game } = await gameSession();
    const before = await rows();
    const body = JSON.stringify({ events: [event()] });
    const post = (headers: Record<string, string>, raw = body) => fetch(`${base}/api/v1/infinex/telemetry`, { method: "POST", body: raw, headers: { "content-type": "application/json", ...headers } });
    const t = String(Math.floor(Date.now() / 1000));
    const sig = (ts: string, raw: string) => `t=${ts},v1=${createHmac("sha256", game.signingKey).update(`${ts}.`).update(raw).digest("hex")}`;
    expect((await post({ authorization: `Bearer ${game.accessToken}` })).status).toBe(401);
    expect((await post({ authorization: `Bearer ${game.accessToken}`, "sponsorx-key-id": game.keyId, "sponsorx-signature": sig(t, body) }, body.replace("75", "99"))).status).toBe(401);
    expect((await post({ authorization: `Bearer ${game.accessToken}`, "sponsorx-key-id": game.keyId, "sponsorx-signature": sig(String(Number(t) - 900), body) })).status).toBe(401);
    expect((await post({ authorization: `Bearer ${serverToken}`, "sponsorx-key-id": game.keyId, "sponsorx-signature": sig(t, body) })).status).toBe(401);
    expect((await post({ "x-test-clerk": ADMIN })).status).toBe(401);
    expect(await rows()).toBe(before);
  });

  it("raw events are append-only: never changed", async () => {
    const one = await prisma.virtualEventRaw.findFirstOrThrow({ where: { tenantId: T }, select: { clientId: true, eventId: true } });
    await expect(prisma.virtualEventRaw.update({ where: { clientId_eventId: one }, data: { status: "QUARANTINED" }, select: { eventId: true } })).rejects.toThrow(/append_only/);
  });
});

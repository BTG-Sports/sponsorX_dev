import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   4S3-INT-03 — the client configuration endpoint. Config is served per build
   (the reviewed defaults, with BTG's override inside its limits) and the
   stand-in world honours it: it reads its config first, sends a heartbeat
   every `heartbeat.everySeconds` and reads the manifest again once
   `manifest.pollSeconds` has passed. A build's heartbeat interval also sets
   when it counts as missing.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@infinex-config.invalid` } : null;
  },
}));

const C = await import("../src/domain/infinex-config");

describe("4S3-INT-03 · the defaults and the limits", () => {
  it("serves the reviewed defaults, and an override changes only what it names", () => {
    expect(C.effectiveConfig(null)).toEqual(C.CONFIG_DEFAULTS);
    const mixed = C.effectiveConfig({ heartbeat: { everySeconds: 10 }, telemetry: { sampleRates: { "placement.view": 0.5 } }, flags: { activations: true } });
    expect(mixed.heartbeat.everySeconds).toBe(10);
    expect(mixed.telemetry).toMatchObject({ maxBatch: 500, sampleRates: { "placement.view": 0.5, "placement.interaction": 1 } });
    expect(mixed.flags).toEqual({ telemetry: true, activations: true });
    expect(C.missingAfterSeconds(null)).toBe(150);
    expect(C.missingAfterSeconds({ heartbeat: { everySeconds: 10 } })).toBe(50);
  });

  it("refuses every value outside its limit, an unknown event type and an unknown flag — all at once", () => {
    expect(C.overrideProblems({
      telemetry: { maxBatch: 5000, maxBytes: 10, flushSeconds: 1.5, sampleRates: { "placement.view": 2, "made.up": 1 } },
      manifest: { pollSeconds: 1 }, heartbeat: { everySeconds: 0 }, flags: { firehose: true },
    })).toEqual([
      "telemetry.maxBatch must be a whole number from 1 to 1000.",
      "telemetry.maxBytes must be a whole number from 1024 to 1048576.",
      "telemetry.flushSeconds must be a whole number from 1 to 300.",
      "manifest.pollSeconds must be a whole number from 15 to 900.",
      "heartbeat.everySeconds must be a whole number from 10 to 300.",
      "telemetry.sampleRates.placement.view must be from 0 to 1.",
      "made.up is not an event type with a sample rate.",
      "firehose is not a flag.",
    ]);
    expect(C.overrideProblems({ telemetry: { maxBatch: 100 }, heartbeat: { everySeconds: 10 } })).toEqual([]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("4S3-INT-03 · config served per build, and honoured by the stand-in world", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const V = await import("../src/domain/virtual-registry");
  const H = await import("../src/domain/infinex-clients");
  const { runStandin } = await import("../scripts/infinex-standin.mts");
  type Actor = import("../src/auth/actor").Actor;

  const T = `icf_t_${randomBytes(3).toString("hex")}`;
  const B = `${T}_b`;
  const ADMIN = `${T}_admin`, ADMIN_B = `${B}_admin`;
  const staff = (tenantId: string) =>
    ({ userId: tenantId === T ? ADMIN : ADMIN_B, tenantId, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, auth: { clerk?: string; token?: string } = {}, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(auth.clerk ? { "x-test-clerk": auth.clerk } : {}), ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}), "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, etag: res.headers.get("etag"), json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of ["InfinexToken", "InfinexClient", "InfinexCredential", "VirtualPlacement", "VirtualZone", "VirtualWorld", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, B]);
    }
    for (const t of ["User", "Property"]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, B]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, B]);
  }

  let cred = { id: "", secret: "" };
  let fast = "", plain = "";
  const quiet = () => {};
  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "INFINEX config" }, { id: B, name: "Another operator" }] });
    await prisma.user.createMany({ data: [
      { id: ADMIN, tenantId: T, clerkId: ADMIN, email: `${ADMIN}@infinex-config.invalid`, roles: ["BTG_ADMIN"] },
      { id: ADMIN_B, tenantId: B, clerkId: ADMIN_B, email: `${ADMIN_B}@infinex-config.invalid`, roles: ["BTG_ADMIN"] },
    ] });
    await prisma.property.create({ data: { id: `${T}_p`, tenantId: T, slug: `${T}-infinex`, name: "INFINEX", kind: "VIRTUAL", listingAccessAt: new Date("2026-10-01") }, select: { id: true } });
    const arena = (await V.createWorld(staff(T), { propertyId: `${T}_p`, externalId: "arena", name: "INFINEX Arena", environment: "STAGING" })).world.id;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const made = await call("POST", "/infinex/credentials", { clerk: ADMIN }, { name: "Arena world server" });
    cred = { id: made.json.credential.id, secret: made.json.secret };
    fast = (await call("POST", "/infinex/clients", { clerk: ADMIN }, { worldId: arena, buildId: "fast" })).json.client.id;
    plain = (await call("POST", "/infinex/clients", { clerk: ADMIN }, { worldId: arena, buildId: "plain" })).json.client.id;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await clean();
  });

  const session = async (clientId: string) => {
    const token = (await call("POST", "/infinex/token", {}, { credentialId: cred.id, secret: cred.secret })).json.accessToken as string;
    return { server: token, game: (await call("POST", `/infinex/clients/${clientId}/sessions`, { token })).json.accessToken as string };
  };

  it("a game reads its own build's config — the defaults until BTG changes them — with an ETag that holds while nothing changes", async () => {
    const { game } = await session(fast);
    const r = await call("GET", "/infinex/config", { token: game });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ clientId: fast, buildId: "fast", defaultsVersion: C.CONFIG_DEFAULTS_VERSION, configVersion: 0, overridden: false, ...C.CONFIG_DEFAULTS });
    expect((await call("GET", "/infinex/config", { token: game }, undefined, { "if-none-match": r.etag! })).status).toBe(304);
  });

  it("BTG overrides one build within the limits; the other keeps the defaults; out-of-limit values are refused with every reason", async () => {
    const bad = await call("PATCH", `/infinex/clients/${fast}/config`, { clerk: ADMIN }, { override: { heartbeat: { everySeconds: 1 }, telemetry: { maxBatch: 9999 } } });
    expect(bad.status).toBe(422);
    expect(bad.json.error.message).toContain("heartbeat.everySeconds must be a whole number from 10 to 300.");
    const ok = await call("PATCH", `/infinex/clients/${fast}/config`, { clerk: ADMIN }, { override: { heartbeat: { everySeconds: 10 }, manifest: { pollSeconds: 20 }, telemetry: { maxBatch: 100 } } });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ configVersion: 1, overridden: true, heartbeat: { everySeconds: 10 }, manifest: { pollSeconds: 20 }, telemetry: { maxBatch: 100, maxBytes: 1_048_576 } });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "infinex.clientConfig", entityId: fast } })).toBe(1);
    const other = await call("GET", `/infinex/clients/${plain}/config`, { clerk: ADMIN });
    expect(other.json).toMatchObject({ configVersion: 0, override: null, heartbeat: { everySeconds: 30 } });
  });

  it("the stand-in world honours its config: a heartbeat every 10 s, the manifest again after 20 s, the limits it was given", async () => {
    const slept: number[] = [];
    const lines: string[] = [];
    const r = await runStandin({ baseUrl: base, credentialId: cred.id, secret: cred.secret, clientId: fast, beats: 4, log: (l) => lines.push(l), sleep: async (ms) => { slept.push(ms); } });
    expect(slept).toEqual([10_000, 10_000, 10_000]);
    expect(r.manifestReads).toBe(2);
    expect(r.config).toEqual({ heartbeatSeconds: 10, pollSeconds: 20, maxBatch: 100, maxBytes: 1_048_576, configVersion: 1 });
    expect(lines.join("\n")).toContain("manifest unchanged");
    /* The plain build, on the defaults: 30 s between heartbeats. */
    const plainSlept: number[] = [];
    await runStandin({ baseUrl: base, credentialId: cred.id, secret: cred.secret, clientId: plain, beats: 2, log: quiet, sleep: async (ms) => { plainSlept.push(ms); } });
    expect(plainSlept).toEqual([30_000]);
  });

  it("each build counts as missing after five of its own heartbeat intervals", async () => {
    const now = new Date();
    const sixtySecondsAgo = new Date(now.getTime() - 60_000);
    await prisma.infinexClient.updateMany({ where: { tenantId: T }, data: { lastHeartbeatAt: sixtySecondsAgo, missingSince: null } });
    expect(await H.sweepMissingHeartbeats(prisma, now, { tenantId: T })).toEqual({ missing: 1 });
    const rows = await prisma.infinexClient.findMany({ where: { tenantId: T }, select: { buildId: true, missingSince: true } });
    expect(Object.fromEntries(rows.map((c) => [c.buildId, c.missingSince !== null]))).toEqual({ fast: true, plain: false });
  });

  it("who: machines read config and never change it; a game reads only its own; another tenant reaches nothing; null clears", async () => {
    const { server: serverToken, game } = await session(plain);
    expect((await call("GET", `/infinex/clients/${fast}/config`, { token: serverToken })).status).toBe(200);
    expect((await call("PATCH", `/infinex/clients/${fast}/config`, { token: serverToken }, { override: null })).status).toBe(403);
    expect((await call("PATCH", `/infinex/clients/${plain}/config`, { token: game }, { override: null })).status).toBe(403);
    expect((await call("GET", `/infinex/clients/${fast}/config`, { token: game })).status).toBe(404);
    expect((await call("GET", "/infinex/config", { token: serverToken })).status).toBe(409);
    expect((await call("GET", `/infinex/clients/${fast}/config`, { clerk: ADMIN_B })).status).toBe(404);
    expect((await call("PATCH", `/infinex/clients/${fast}/config`, { clerk: ADMIN_B }, { override: null })).status).toBe(404);
    const cleared = await call("PATCH", `/infinex/clients/${fast}/config`, { clerk: ADMIN }, { override: null });
    expect(cleared.json).toMatchObject({ configVersion: 2, overridden: false, override: null, heartbeat: { everySeconds: 30 } });
  });
});

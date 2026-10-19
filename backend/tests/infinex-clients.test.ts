import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   4S3-INT-02 — the INFINEX client registry and heartbeats, proven with the
   stand-in world (scripts/infinex-standin.mts), which calls SponsorX through
   the public API exactly as a world will. A registered build's heartbeat is
   recorded; a build that reported and then goes quiet is marked missing and
   alerted (audit + the Integrations screen) until it reports again.

   INFINEX_SIGNING_SECRET is deliberately unset: a session still starts and
   heartbeats work, with no signing key (the signed routes refuse until set).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
delete process.env.INFINEX_SIGNING_SECRET;
delete process.env.INFINEX_SIGNING_SECRET_PREVIOUS;

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@infinex-clients.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("4S3-INT-02 · client registry and heartbeats, proven with the stand-in world", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const V = await import("../src/domain/virtual-registry");
  const H = await import("../src/domain/infinex-clients");
  const { integrationHealth } = await import("../src/domain/integration-health");
  const { runStandin } = await import("../scripts/infinex-standin.mts");
  type Actor = import("../src/auth/actor").Actor;

  const T = `ic_t_${randomBytes(3).toString("hex")}`;
  const B = `${T}_b`;
  const ADMIN = `${T}_admin`, ADMIN_B = `${B}_admin`;
  const staff = (tenantId: string) =>
    ({ userId: tenantId === T ? ADMIN : ADMIN_B, tenantId, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;

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
    for (const t of ["InfinexToken", "InfinexClient", "InfinexCredential", "VirtualPlacement", "VirtualZone", "VirtualWorld", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, B]);
    }
    for (const t of ["User", "Property"]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, B]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, B]);
  }

  let arena = "", worldB = "";
  let cred = { id: "", secret: "" };
  let build = "";
  const quiet = (_line: string) => {};
  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "INFINEX clients" }, { id: B, name: "Another operator" }] });
    await prisma.user.createMany({ data: [
      { id: ADMIN, tenantId: T, clerkId: ADMIN, email: `${ADMIN}@infinex-clients.invalid`, roles: ["BTG_ADMIN"] },
      { id: ADMIN_B, tenantId: B, clerkId: ADMIN_B, email: `${ADMIN_B}@infinex-clients.invalid`, roles: ["BTG_ADMIN"] },
    ] });
    for (const [tenant, id] of [[T, `${T}_p`], [B, `${B}_p`]] as const) {
      await prisma.property.create({ data: { id, tenantId: tenant, slug: `${id}-infinex`, name: "INFINEX", kind: "VIRTUAL", listingAccessAt: new Date("2026-10-01") }, select: { id: true } });
    }
    arena = (await V.createWorld(staff(T), { propertyId: `${T}_p`, externalId: "arena", name: "INFINEX Arena", environment: "STAGING" })).world.id;
    worldB = (await V.createWorld(staff(B), { propertyId: `${B}_p`, externalId: "arena", name: "Other Arena", environment: "STAGING" })).world.id;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const made = await call("POST", "/infinex/credentials", { clerk: ADMIN }, { name: "Arena world server" });
    cred = { id: made.json.credential.id, secret: made.json.secret };
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await clean();
  });

  const serverToken = async () => (await call("POST", "/infinex/token", {}, { credentialId: cred.id, secret: cred.secret })).json.accessToken as string;

  it("registers a game build for a world: BTG or the world's server; one per world and build; never on another tenant's world", async () => {
    const r = await call("POST", "/infinex/clients", { clerk: ADMIN }, { worldId: arena, buildId: "2026.10.1" });
    expect(r.status).toBe(201);
    expect(r.json.client).toMatchObject({ worldId: arena, buildId: "2026.10.1", status: "ACTIVE", heartbeatCount: 0, lastHeartbeatAt: null, missing: false });
    build = r.json.client.id;
    expect((await call("POST", "/infinex/clients", { clerk: ADMIN }, { worldId: arena, buildId: "2026.10.1" })).status).toBe(409);
    expect((await call("POST", "/infinex/clients", { token: await serverToken() }, { worldId: arena, buildId: "2026.10.2" })).status).toBe(201);
    expect((await call("POST", "/infinex/clients", { clerk: ADMIN }, { worldId: worldB, buildId: "x" })).status).toBe(404);
    expect((await call("POST", "/infinex/clients", { clerk: ADMIN }, { worldId: arena, buildId: "bad build!" })).status).toBe(422);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "infinex.clientRegister" } })).toBe(2);
  });

  it("the stand-in world: server token → game session (no signing key yet) → manifest → heartbeats, recorded on the build", async () => {
    const lines: string[] = [];
    const r = await runStandin({ baseUrl: base, credentialId: cred.id, secret: cred.secret, clientId: build, beats: 2, everySeconds: 0, fps: 58.5, log: (l) => lines.push(l), sleep: async () => {} });
    expect(r).toEqual({ worldId: arena, manifestVersion: 0, placements: 0, heartbeats: 2 });
    expect(lines.join("\n")).toContain("no signing key");
    const row = await prisma.infinexClient.findFirstOrThrow({ where: { tenantId: T, id: build }, select: { heartbeatCount: true, lastManifestVersion: true, lastFps: true, lastErrorCount: true, lastHeartbeatAt: true } });
    expect(row).toMatchObject({ heartbeatCount: 2, lastManifestVersion: 0, lastFps: 58.5, lastErrorCount: 0 });
    expect(Date.now() - row.lastHeartbeatAt!.getTime()).toBeLessThan(60_000);
  });

  it("a heartbeat is the session's own: the body cannot name another build, a server cannot send one, a game sees only itself", async () => {
    const token = await serverToken();
    const game = (await call("POST", `/infinex/clients/${build}/sessions`, { token })).json.accessToken as string;
    expect((await call("POST", "/infinex/heartbeat", { token: game }, { manifestVersion: 0, buildId: "2026.10.2" })).status).toBe(422);
    expect((await call("POST", "/infinex/heartbeat", { token }, { manifestVersion: 0 })).status).toBe(409);
    expect((await call("POST", "/infinex/heartbeat", { clerk: ADMIN }, { manifestVersion: 0 })).status).toBe(409);
    const seen = await call("GET", "/infinex/clients", { token: game });
    expect(seen.json.clients.map((c: { id: string }) => c.id)).toEqual([build]);
    expect((await call("POST", "/infinex/clients", { token: game }, { worldId: arena, buildId: "2026.10.3" })).status).toBe(409);
  });

  it("missing: a build quiet for five minutes is marked and alerted once; the Integrations screen shows it; its next heartbeat recovers it", async () => {
    const now = new Date();
    await prisma.infinexClient.update({ where: { id: build }, data: { lastHeartbeatAt: new Date(now.getTime() - 6 * 60_000) }, select: { id: true } });
    expect(await H.sweepMissingHeartbeats(prisma, now)).toEqual({ missing: 1 });
    expect(await H.sweepMissingHeartbeats(prisma, new Date(now.getTime() + 60_000))).toEqual({ missing: 0 });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "infinex.heartbeatMissing", entityId: build } })).toBe(1);

    const health = await integrationHealth(staff(T), now);
    expect(health.infinex).toMatchObject({ thresholdSeconds: 300, active: 2, missing: 1 });
    expect(health.infinex.clients[0]).toMatchObject({ id: build, missing: true, heartbeatAgeSeconds: 360 });
    /* The second build was registered and never launched: no alarm. */
    expect(health.infinex.clients[1]).toMatchObject({ buildId: "2026.10.2", missing: false, lastHeartbeatAt: null });

    await runStandin({ baseUrl: base, credentialId: cred.id, secret: cred.secret, clientId: build, beats: 1, log: quiet });
    expect((await integrationHealth(staff(T))).infinex.missing).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "infinex.heartbeatRecovered", entityId: build } })).toBe(1);
  });

  it("revoking a build stops its session on the next call; another tenant reaches none of it", async () => {
    const game = (await call("POST", `/infinex/clients/${build}/sessions`, { token: await serverToken() })).json.accessToken as string;
    expect((await call("POST", `/infinex/clients/${build}/revoke`, { clerk: ADMIN_B }, { reason: "Not yours" })).status).toBe(404);
    expect((await call("GET", "/infinex/clients", { clerk: ADMIN_B })).json.clients).toEqual([]);
    expect((await call("POST", `/infinex/clients/${build}/revoke`, { clerk: ADMIN }, { reason: "Build withdrawn" })).status).toBe(200);
    expect((await call("POST", "/infinex/heartbeat", { token: game }, { manifestVersion: 0 })).status).toBe(401);
    expect((await call("POST", `/infinex/clients/${build}/revoke`, { clerk: ADMIN }, { reason: "Again" })).status).toBe(409);
    expect(await H.sweepMissingHeartbeats(prisma, new Date(Date.now() + 3_600_000))).toEqual({ missing: 0 });
  });
});

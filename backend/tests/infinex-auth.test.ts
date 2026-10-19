import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   4S0-SEC-01 — trusted client authentication for INFINEX
   (SponsorX-INFINEX-API-and-Event-Spec.md §6; auth/machine.ts).

   A world's server swaps its machine credential for a 15-minute token; it
   starts 15-minute game sessions (a token pinned to one world, and a signing
   key); every request is checked against Postgres, so revoking takes effect
   on the next call; scopes narrow and never widen; and a game's signature is
   checked over the raw bytes. Through the real HTTP stack: only Clerk (for
   the BTG admin's own calls) and the rate limiter are stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INFINEX_SIGNING_SECRET = "test-infinex-root-current";
process.env.INFINEX_SIGNING_SECRET_PREVIOUS = "test-infinex-root-previous";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@infinex-auth.invalid` } : null;
  },
}));

const M = await import("../src/auth/machine");

describe("4S0-SEC-01 · a game's signature over the raw bytes", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const t = String(Math.floor(now.getTime() / 1000));
  const body = Buffer.from('{"events":[{"eventId":"e1"}]}');
  const sign = (secret: string, tokenId: string, ts = t, bytes = body) =>
    `t=${ts},v1=${createHmac("sha256", M.signingKeyFor(secret, tokenId)).update(`${ts}.`).update(bytes).digest("hex")}`;
  const check = (header: string | undefined, over: Partial<{ rawBody: Buffer; keyId: string; tokenId: string; secrets: string[] }> = {}) =>
    M.verifyClientSignature({ rawBody: over.rawBody ?? body, header, keyId: over.keyId ?? "tok1", tokenId: over.tokenId ?? "tok1" }, now, over.secrets ?? ["root-now", "root-before"]);

  it("accepts the session's own signature — under the current root, and the previous one during a rotation", () => {
    expect(check(sign("root-now", "tok1"))).toEqual({ ok: true });
    expect(check(sign("root-before", "tok1"))).toEqual({ ok: true });
  });

  it("refuses a changed body, another session's key, a stale or malformed header, a missing one, and an unconfigured root", () => {
    expect(check(sign("root-now", "tok1"), { rawBody: Buffer.from('{"events":[{"eventId":"e2"}]}') })).toEqual({ ok: false, problem: "mismatch" });
    expect(check(sign("root-now", "tok2"))).toEqual({ ok: false, problem: "mismatch" });
    expect(check(sign("root-now", "tok1"), { keyId: "tok2" })).toEqual({ ok: false, problem: "wrong-key" });
    expect(check(sign("root-now", "tok1", String(Number(t) - 301)))).toEqual({ ok: false, problem: "stale" });
    expect(check("t=abc,v1=zz")).toEqual({ ok: false, problem: "malformed" });
    expect(check(undefined)).toEqual({ ok: false, problem: "missing" });
    expect(check(sign("root-now", "tok1"), { secrets: [] })).toEqual({ ok: false, problem: "not-configured" });
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("4S0-SEC-01 · machine credentials, tokens and game sessions, through HTTP", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { requireActor, resolveActor } = await import("../src/auth/actor");
  const V = await import("../src/domain/virtual-registry");
  type Actor = import("../src/auth/actor").Actor;

  const T = `ia_t_${randomBytes(3).toString("hex")}`;
  const B = `${T}_b`;
  const ADMIN = `${T}_admin`, ADMIN_B = `${B}_admin`;
  const staff = (tenantId: string) =>
    ({ userId: tenantId === T ? ADMIN : ADMIN_B, tenantId, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, auth: { clerk?: string; token?: string } = {}, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        ...(auth.clerk ? { "x-test-clerk": auth.clerk } : {}),
        ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
        "content-type": "application/json", ...extra,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of ["InfinexToken", "InfinexClient", "InfinexCredential", "VirtualPlacement", "VirtualZone", "VirtualWorld", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, B]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "tenantId" = ANY($1::text[])`, [T, B]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Property" WHERE "tenantId" = ANY($1::text[])`, [T, B]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, B]);
  }

  let arena = "", plaza = "", worldB = "";
  let client = "", clientB = "";
  let cred = { id: "", secret: "" };
  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "INFINEX auth" }, { id: B, name: "Another operator" }] });
    await prisma.user.createMany({ data: [
      { id: ADMIN, tenantId: T, clerkId: ADMIN, email: `${ADMIN}@infinex-auth.invalid`, roles: ["BTG_ADMIN"] },
      { id: ADMIN_B, tenantId: B, clerkId: ADMIN_B, email: `${ADMIN_B}@infinex-auth.invalid`, roles: ["BTG_ADMIN"] },
    ] });
    for (const [tenant, id] of [[T, `${T}_p`], [B, `${B}_p`]] as const) {
      await prisma.property.create({ data: { id, tenantId: tenant, slug: `${id}-infinex`, name: "INFINEX", kind: "VIRTUAL", listingAccessAt: new Date("2026-10-01") }, select: { id: true } });
    }
    arena = (await V.createWorld(staff(T), { propertyId: `${T}_p`, externalId: "arena", name: "INFINEX Arena", environment: "PRODUCTION" })).world.id;
    plaza = (await V.createWorld(staff(T), { propertyId: `${T}_p`, externalId: "plaza", name: "INFINEX Plaza", environment: "PRODUCTION" })).world.id;
    worldB = (await V.createWorld(staff(B), { propertyId: `${B}_p`, externalId: "arena", name: "Other Arena", environment: "PRODUCTION" })).world.id;
    /* Registering clients is 4S3-INT-02; here they are rows. */
    client = (await prisma.infinexClient.create({ data: { tenantId: T, worldId: arena, buildId: "2026.10.1" }, select: { id: true } })).id;
    clientB = (await prisma.infinexClient.create({ data: { tenantId: B, worldId: worldB, buildId: "2026.10.1" }, select: { id: true } })).id;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await clean();
  });

  const tokenFor = async (c: { id: string; secret: string }) => (await call("POST", "/infinex/token", {}, { credentialId: c.id, secret: c.secret })).json?.accessToken as string;

  it("BTG issues a credential: the secret is in that answer only, stored as a hash, with its own service user; audited", async () => {
    const made = await call("POST", "/infinex/credentials", { clerk: ADMIN }, { name: "Arena world server" });
    expect(made.status).toBe(201);
    expect(made.json.secret).toMatch(/^sxs_[A-Za-z0-9_-]{43}$/);
    cred = { id: made.json.credential.id, secret: made.json.secret };
    const row = await prisma.infinexCredential.findFirstOrThrow({ where: { tenantId: T, id: cred.id }, select: { secretHash: true, userId: true } });
    expect(row.secretHash).toBe(M.sha256(cred.secret));
    expect(await prisma.user.findFirstOrThrow({ where: { id: row.userId }, select: { roles: true, email: true } })).toMatchObject({ roles: ["INFINEX_SERVICE", "INFINEX_CLIENT"], email: expect.stringMatching(/@machine\.invalid$/) });
    const listed = await call("GET", "/infinex/credentials", { clerk: ADMIN });
    expect(JSON.stringify(listed.json)).not.toContain(cred.secret);
    expect(JSON.stringify(listed.json)).not.toContain(row.secretHash);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "infinex.credentialCreate", entityId: cred.id } })).toBe(1);
  });

  it("the credential is the login: a 15-minute token for the right secret, the same 401 for a wrong one or an unknown id", async () => {
    expect((await call("POST", "/infinex/token", {}, { credentialId: cred.id, secret: "sxs_wrong" })).status).toBe(401);
    expect((await call("POST", "/infinex/token", {}, { credentialId: "nope", secret: cred.secret })).status).toBe(401);
    const ok = await call("POST", "/infinex/token", {}, { credentialId: cred.id, secret: cred.secret });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ accessToken: expect.stringMatching(/^sxm_/), tokenType: "Bearer", expiresIn: 900 });
    const stored = await prisma.infinexToken.findFirstOrThrow({ where: { tenantId: T, tokenHash: M.sha256(ok.json.accessToken) }, select: { kind: true } });
    expect(stored.kind).toBe("SERVICE");
    expect(await prisma.infinexToken.count({ where: { tokenHash: ok.json.accessToken } })).toBe(0);
  });

  it("a server's token reads its tenant's worlds and manifests, and nothing it was not given: no writes, no campaigns, no other tenant", async () => {
    const token = await tokenFor(cred);
    const worlds = await call("GET", "/virtual/worlds", { token });
    expect(worlds.status).toBe(200);
    expect(JSON.stringify(worlds.json)).toContain("INFINEX Plaza");
    expect(JSON.stringify(worlds.json)).not.toContain("Other Arena");
    expect((await call("GET", `/virtual/worlds/${arena}/manifest`, { token })).status).toBe(200);
    expect((await call("GET", `/virtual/worlds/${worldB}/manifest`, { token })).status).toBe(404);
    expect((await call("POST", "/virtual/worlds", { token }, { propertyId: `${T}_p`, externalId: "x", name: "X", environment: "PRODUCTION" })).status).toBe(403);
    expect((await call("GET", "/campaigns", { token })).status).toBe(403);
    expect((await call("GET", "/infinex/credentials", { token })).status).toBe(403);
  });

  it("a game session: a token for its client's world only, and the key it signs with; only a server's token starts one", async () => {
    const token = await tokenFor(cred);
    const s = await call("POST", `/infinex/clients/${client}/sessions`, { token });
    expect(s.status).toBe(201);
    expect(s.json).toMatchObject({ accessToken: expect.stringMatching(/^sxm_/), keyId: expect.any(String), worldId: arena, clientId: client });
    expect(s.json.signingKey).toBe(M.signingKeyFor("test-infinex-root-current", s.json.keyId));
    /* The key is derived, not stored: the session's row holds only its token's hash. */
    const row = await prisma.infinexToken.findFirstOrThrow({ where: { tenantId: T, id: s.json.keyId }, select: { kind: true, clientId: true, tokenHash: true } });
    expect(row).toEqual({ kind: "CLIENT", clientId: client, tokenHash: M.sha256(s.json.accessToken) });
    const game = s.json.accessToken as string;
    expect((await call("GET", `/virtual/worlds/${arena}/manifest`, { token: game })).status).toBe(200);
    expect((await call("GET", `/virtual/worlds/${plaza}/manifest`, { token: game })).status).toBe(404);
    expect((await call("GET", "/virtual/worlds", { token: game })).json?.worlds?.map((w: { id: string }) => w.id)).toEqual([arena]);
    /* A game cannot start sessions, and a person cannot either, even BTG (refused after the role check: since
       4S3-INT-02 a game session may write its own client row, its heartbeat). */
    expect((await call("POST", `/infinex/clients/${client}/sessions`, { token: game })).status).toBe(409);
    expect((await call("POST", `/infinex/clients/${client}/sessions`, { clerk: ADMIN })).status).toBe(409);
    /* Another tenant's client is not there. */
    expect((await call("POST", `/infinex/clients/${clientB}/sessions`, { token })).status).toBe(404);
  });

  it("a signed route accepts the game's signature over the raw bytes and refuses a tampered body", async () => {
    const token = await tokenFor(cred);
    const s = (await call("POST", `/infinex/clients/${client}/sessions`, { token })).json;
    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
    app.post("/signed", requireActor, M.requireClientSignature, (_req, res) => { res.json({ ok: true }); });
    app.use((err: { status?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(err.status ?? 500).json({ code: err.code }); });
    const srv = app.listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", r));
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/signed`;
    const raw = '{"events":[{"eventId":"e1"}]}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `t=${ts},v1=${createHmac("sha256", s.signingKey).update(`${ts}.`).update(raw).digest("hex")}`;
    const send = (bytes: string, header = sig) => fetch(url, { method: "POST", body: bytes, headers: { authorization: `Bearer ${s.accessToken}`, "content-type": "application/json", "sponsorx-key-id": s.keyId, "sponsorx-signature": header } });
    expect((await send(raw)).status).toBe(200);
    expect((await send('{"events":[{"eventId":"e2"}]}')).status).toBe(401);
    expect(await (await send(raw, `t=${Number(ts) - 600},v1=${"0".repeat(64)}`)).json()).toEqual({ code: "stale-signature" });
    await new Promise((r) => srv.close(r));
  });

  it("scopes narrow and never widen", async () => {
    const narrow = (await call("POST", "/infinex/credentials", { clerk: ADMIN }, { name: "Read-only server", scopes: ["virtualWorld:read"] })).json;
    const narrowToken = await tokenFor({ id: narrow.credential.id, secret: narrow.secret });
    expect((await call("GET", "/virtual/worlds", { token: narrowToken })).status).toBe(200);
    expect((await call("POST", `/infinex/clients/${client}/sessions`, { token: narrowToken })).status).toBe(403);
    const wide = (await call("POST", "/infinex/credentials", { clerk: ADMIN }, { name: "Asks for too much", scopes: ["campaign:write", "virtualWorld:read"] })).json;
    const wideToken = await tokenFor({ id: wide.credential.id, secret: wide.secret });
    expect((await call("POST", "/campaigns/any-campaign/transition", { token: wideToken }, { to: "CANCELLED" })).status).toBe(403);
    expect((await call("POST", "/infinex/credentials", { clerk: ADMIN }, { name: "Bad scope", scopes: ["everything"] })).status).toBe(422);
  });

  it("checked on every call: an expired token, a revoked client and a revoked credential all stop at once", async () => {
    const token = await tokenFor(cred);
    const game = (await call("POST", `/infinex/clients/${client}/sessions`, { token })).json.accessToken as string;
    await prisma.infinexToken.updateMany({ where: { tenantId: T, tokenHash: M.sha256(token) }, data: { issuedAt: new Date(Date.now() - 20 * 60_000), expiresAt: new Date(Date.now() - 1000) } });
    expect((await call("GET", "/virtual/worlds", { token })).status).toBe(401);

    await prisma.infinexClient.update({ where: { id: client }, data: { status: "REVOKED", revokedAt: new Date() }, select: { id: true } });
    expect((await call("GET", `/virtual/worlds/${arena}/manifest`, { token: game })).status).toBe(401);
    await prisma.infinexClient.update({ where: { id: client }, data: { status: "ACTIVE", revokedAt: null }, select: { id: true } });

    const fresh = await tokenFor(cred);
    expect((await call("POST", `/infinex/credentials/${cred.id}/revoke`, { clerk: ADMIN_B }, { reason: "Not yours" })).status).toBe(404);
    expect((await call("POST", `/infinex/credentials/${cred.id}/revoke`, { clerk: ADMIN }, { reason: "Server rebuilt" })).status).toBe(200);
    expect((await call("GET", "/virtual/worlds", { token: fresh })).status).toBe(401);
    expect((await call("GET", `/virtual/worlds/${arena}/manifest`, { token: game })).status).toBe(401);
    expect((await call("POST", "/infinex/token", {}, { credentialId: cred.id, secret: cred.secret })).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "infinex.credentialRevoke", entityId: cred.id } })).toBe(1);
  });

  it("a person can never sign in as a machine's user", async () => {
    const row = await prisma.infinexCredential.findFirstOrThrow({ where: { tenantId: T, id: cred.id }, select: { userId: true } });
    const user = await prisma.user.findFirstOrThrow({ where: { id: row.userId }, select: { email: true } });
    await expect(resolveActor("user_someone_new", user.email)).rejects.toMatchObject({ status: 403 });
  });

  it("who: only BTG issues, lists and revokes credentials", async () => {
    await prisma.user.create({ data: { id: `${T}_sales`, tenantId: T, clerkId: `${T}_sales`, email: `${T}_sales@infinex-auth.invalid`, roles: ["SALES"] } });
    expect((await call("GET", "/infinex/credentials", { clerk: `${T}_sales` })).status).toBe(403);
    expect((await call("POST", "/infinex/credentials", { clerk: `${T}_sales` }, { name: "Mine now" })).status).toBe(403);
    expect((await call("GET", "/infinex/credentials", {})).status).toBe(401);
  });
});

/**
 * INFINEX machine credentials and game sessions — 4S0-SEC-01
 * (documentation/SponsorX-INFINEX-API-and-Event-Spec.md §6; auth/machine.ts
 * is the verifier).
 *
 *   BTG issues a world operator's server a credential: an id and a secret,
 *   shown once, stored only as its SHA-256. The credential acts as its own
 *   User (roles INFINEX_SERVICE and INFINEX_CLIENT, an address that cannot
 *   receive mail), so audit rows name it and revoking takes effect at once.
 *   Optional scopes ("<resource>:<action>") narrow what its tokens may do.
 *
 *   The server swaps the credential for a 15-minute SERVICE token
 *   (`POST /infinex/token`, no other login) and starts 15-minute game
 *   sessions for the clients registered for its worlds
 *   (`POST /infinex/clients/{id}/sessions`): a CLIENT token and a signing key
 *   for the game on the player's device. Registering clients and their
 *   heartbeats are 4S3-INT-02.
 */
import type { Actor } from "../auth/actor";
import { UnauthenticatedError } from "../auth/errors";
import { issueToken, newSecret, SECRET_PREFIX, sha256, signingKeyFor, signingSecrets } from "../auth/machine";
import { ACTIONS, RESOURCES } from "../auth/policy";
import { assertAllowed, whereFor } from "../auth/scope";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { prisma } from "../db/client";
import { safeEqual } from "../lib/rotating-secret";

export class InfinexInputError extends Error {
  readonly status = 422;
  readonly code = "infinex_input";
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "InfinexInputError";
  }
}
export class InfinexNotFoundError extends Error {
  readonly status = 404;
  readonly code = "infinex_not_found";
  constructor(what: string) {
    super(`No such ${what}.`);
    this.name = "InfinexNotFoundError";
  }
}
export class InfinexConflictError extends Error {
  readonly status = 409;
  readonly code = "infinex_conflict";
  constructor(message: string) {
    super(message);
    this.name = "InfinexConflictError";
  }
}
const CREDENTIAL = { id: true, name: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true, revokeReason: true } as const;
type CredentialRow = { id: string; name: string; scopes: string[]; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null; revokeReason: string | null };
const view = (c: CredentialRow) => ({
  ...c, createdAt: c.createdAt.toISOString(), lastUsedAt: c.lastUsedAt?.toISOString() ?? null, revokedAt: c.revokedAt?.toISOString() ?? null,
});

const VALID_SCOPES = new Set(RESOURCES.flatMap((r) => ACTIONS.map((a) => `${r}:${a}`)));
const reasonOf = (reason: string) => {
  const r = reason.trim();
  if (r.length < 3 || r.length > 500) throw new InfinexInputError(["Say why (3 to 500 characters)."]);
  return r;
};

/** POST /infinex/credentials { name, scopes? } — a new server credential. The secret is in this answer and nowhere else. */
export async function createCredential(actor: Actor, input: { name: string; scopes?: string[] }) {
  assertAllowed(actor, "infinexCredential", "write");
  const name = input.name.trim();
  const scopes = [...new Set(input.scopes ?? [])];
  const problems = [
    ...(name.length < 3 || name.length > 120 ? ["Name it (3 to 120 characters)."] : []),
    ...scopes.filter((s) => !VALID_SCOPES.has(s)).map((s) => `${s} is not a scope ("<resource>:<action>").`),
  ];
  if (problems.length) throw new InfinexInputError(problems);
  const secret = newSecret(SECRET_PREFIX);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { tenantId: actor.tenantId, clerkId: `machine:${sha256(secret).slice(0, 24)}`, email: `infinex-${sha256(secret).slice(0, 16)}@machine.invalid`, roles: ["INFINEX_SERVICE", "INFINEX_CLIENT"] },
      select: { id: true },
    });
    const c = await tx.infinexCredential.create({
      data: { tenantId: actor.tenantId, name, userId: user.id, secretHash: sha256(secret), scopes, createdBy: actor.userId },
      select: CREDENTIAL,
    });
    await audit(tx, actor, AUDIT_ACTIONS.infinex.credentialCreate, "InfinexCredential", c.id, { after: { name, scopes, userId: user.id } });
    return { credential: view(c), secret };
  });
}

/** GET /infinex/credentials — the tenant's credentials, never their secrets. */
export async function listCredentials(actor: Actor) {
  const rows = await prisma.infinexCredential.findMany({ where: whereFor(actor, "infinexCredential", "read"), orderBy: { createdAt: "desc" }, select: CREDENTIAL });
  return { credentials: rows.map(view) };
}

/** POST /infinex/credentials/{id}/revoke { reason } — its tokens stop working on their next call. */
export async function revokeCredential(actor: Actor, credentialId: string, input: { reason: string }, now = new Date()) {
  assertAllowed(actor, "infinexCredential", "write");
  const reason = reasonOf(input.reason);
  return prisma.$transaction(async (tx) => {
    const c = await tx.infinexCredential.findFirst({ where: { ...whereFor(actor, "infinexCredential", "write"), id: credentialId }, select: { id: true, tenantId: true, revokedAt: true } });
    if (!c) throw new InfinexNotFoundError("credential");
    if (c.revokedAt) throw new InfinexConflictError("It is already revoked.");
    const next = await tx.infinexCredential.update({
      /* tenant-scope: the credential found above through whereFor. */
      where: { id: c.id }, data: { revokedAt: now, revokedBy: actor.userId, revokeReason: reason }, select: CREDENTIAL,
    });
    await audit(tx, actor, AUDIT_ACTIONS.infinex.credentialRevoke, "InfinexCredential", c.id, { after: { reason } });
    return { credential: view(next) };
  });
}

/**
 * POST /infinex/token { credentialId, secret } — no login: the credential is the login. Any failure is the same
 * 401, so the answer never says whether the id exists.
 */
export async function issueServiceToken(input: { credentialId: string; secret: string }, now = new Date()) {
  const refused = () => new UnauthenticatedError("Those credentials are not valid.");
  const c = await prisma.infinexCredential.findUnique({
    /* tenant-scope: identity resolution — the credential names its tenant. */
    where: { id: input.credentialId },
    select: { id: true, tenantId: true, userId: true, secretHash: true, scopes: true, revokedAt: true },
  });
  const ok = safeEqual(sha256(input.secret), c?.secretHash ?? "0".repeat(64));
  if (!c || !ok || c.revokedAt) throw refused();
  const user = await prisma.user.findFirst({ where: { tenantId: c.tenantId, id: c.userId }, select: { roles: true, disabledAt: true } });
  if (!user || user.disabledAt || !user.roles.includes("INFINEX_SERVICE")) throw refused();
  return prisma.$transaction(async (tx) => {
    const t = await issueToken(tx, { tenantId: c.tenantId, kind: "SERVICE", credentialId: c.id, clientId: null, scopes: c.scopes }, now);
    await tx.infinexCredential.update({ /* tenant-scope: the credential just checked. */ where: { id: c.id }, data: { lastUsedAt: now }, select: { id: true } });
    await audit(tx, { userId: c.userId, tenantId: c.tenantId }, AUDIT_ACTIONS.infinex.tokenIssue, "InfinexCredential", c.id, { after: { kind: "SERVICE", tokenId: t.tokenId, expiresAt: t.expiresAt.toISOString() } });
    return { accessToken: t.token, tokenType: "Bearer" as const, expiresAt: t.expiresAt.toISOString(), expiresIn: Math.round((t.expiresAt.getTime() - now.getTime()) / 1000), scopes: c.scopes };
  });
}

/**
 * POST /infinex/clients/{clientId}/sessions — a world's server starts a 15-minute session for one of its game
 * clients: a CLIENT token for that client's world only, and the key the game signs its requests with.
 */
export async function startClientSession(actor: Actor, clientId: string, now = new Date()) {
  assertAllowed(actor, "infinexClient", "write");
  if (!actor.machine || actor.machine.clientId) throw new InfinexConflictError("Only an INFINEX server's token starts a game session.");
  /* 4S3-INT-02 — without INFINEX_SIGNING_SECRET a session still starts (manifest, heartbeat), with no signing
     key; the signed routes refuse it (503) until the secret is set. */
  const secret = signingSecrets()[0] ?? null;
  const client = await prisma.infinexClient.findFirst({ where: { ...whereFor(actor, "infinexClient", "write"), id: clientId }, select: { id: true, tenantId: true, worldId: true, status: true } });
  if (!client) throw new InfinexNotFoundError("client");
  if (client.status !== "ACTIVE") throw new InfinexConflictError("This client is revoked.");
  return prisma.$transaction(async (tx) => {
    const t = await issueToken(tx, { tenantId: client.tenantId, kind: "CLIENT", credentialId: actor.machine!.credentialId, clientId: client.id, scopes: [] }, now);
    await audit(tx, actor, AUDIT_ACTIONS.infinex.sessionStart, "InfinexClient", client.id, { after: { tokenId: t.tokenId, expiresAt: t.expiresAt.toISOString() } });
    return {
      accessToken: t.token, tokenType: "Bearer" as const, expiresAt: t.expiresAt.toISOString(),
      keyId: t.tokenId, signingKey: secret ? signingKeyFor(secret, t.tokenId) : null, clientId: client.id, worldId: client.worldId,
    };
  });
}

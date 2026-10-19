/**
 * Machine authentication for INFINEX — 4S0-SEC-01
 * (documentation/SponsorX-INFINEX-API-and-Event-Spec.md §6).
 *
 * Clerk authenticates people. A world's server and a game on a player's
 * device are not people, so they authenticate here, and come out as an
 * ordinary `Actor`: `whereFor`, `assertAllowed`, field denials and `audit()`
 * work unchanged.
 *
 *   SERVER. A world operator's server holds an `InfinexCredential` (id and
 *   secret, issued once by BTG). It swaps them at `POST /infinex/token` for a
 *   15-minute SERVICE token. The secret is stored only as its SHA-256.
 *
 *   GAME. A game on a player's device never holds a long-lived secret. Its
 *   world's server starts a 15-minute session for one registered
 *   `InfinexClient` (`POST /infinex/clients/{id}/sessions`) and hands the game
 *   the CLIENT token and a signing key. The key is derived from
 *   INFINEX_SIGNING_SECRET and the session's token id, so it is never stored:
 *   the verifier derives it again. The game signs each request body it sends
 *   (`SponsorX-Signature: t=<unix>,v1=<hex HMAC-SHA256(key, t + "." + body)>`),
 *   over the raw bytes, with a timestamp within ±300 s.
 *
 *   TOKENS are random (`sxm_…`), stored only as their SHA-256, and looked up
 *   on every request with their credential, its user and (for a session) its
 *   client — so revoking any of them, or a role on the user, takes effect on
 *   the next call. The token's kind narrows the user's roles to one machine
 *   role; its scopes narrow further (scope.ts `scopeOf`) and never widen.
 *
 *   WHAT THIS DOES NOT STOP. Someone who takes a running game apart can sign
 *   events with its session key for that session's 15 minutes. That is true of
 *   any client a player holds; it is bounded by the session's life and limits,
 *   and caught by the fraud and anomaly checks (4S8-DATA-01).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { prisma } from "../db/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { acceptedSecrets } from "../lib/rotating-secret";
import type { Actor } from "./actor";
import { AccountDisabledError, UnauthenticatedError } from "./errors";
import { ROLES, type Role } from "./policy";

type Db = PrismaClient | Prisma.TransactionClient;

export const TOKEN_PREFIX = "sxm_";
export const SECRET_PREFIX = "sxs_";
export const TOKEN_TTL_SECONDS = 15 * 60;
export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const SIGNATURE_HEADER = "sponsorx-signature";
export const KEY_ID_HEADER = "sponsorx-key-id";

export type TokenKind = "SERVICE" | "CLIENT";
/** The one machine role each kind of token acts as. */
const ROLE_OF: Record<TokenKind, Role> = { SERVICE: "INFINEX_SERVICE", CLIENT: "INFINEX_CLIENT" };
const ROLE_SET = new Set<string>(ROLES);

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const newSecret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** Is this bearer value a machine token (rather than a Clerk session)? */
export const isMachineToken = (bearer: string | undefined): bearer is string => !!bearer && bearer.startsWith(TOKEN_PREFIX);

/** Issue a 15-minute token. The caller has checked the credential (and client); only the hash is stored. */
export async function issueToken(
  db: Db,
  input: { tenantId: string; kind: TokenKind; credentialId: string; clientId: string | null; scopes: string[] },
  now: Date,
): Promise<{ token: string; tokenId: string; expiresAt: Date }> {
  const token = newSecret(TOKEN_PREFIX);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000);
  const row = await db.infinexToken.create({
    data: { tenantId: input.tenantId, tokenHash: sha256(token), kind: input.kind, credentialId: input.credentialId, clientId: input.clientId, scopes: input.scopes, issuedAt: now, expiresAt },
    select: { id: true },
  });
  return { token, tokenId: row.id, expiresAt };
}

/**
 * A machine token → an Actor, or 401. Everything is read now: the token (not
 * expired), its credential (not revoked), the credential's user (not disabled,
 * still holding the role) and, for a session, its client (still ACTIVE).
 */
export async function resolveMachineActor(token: string, now = new Date()): Promise<Actor> {
  const refused = () => new UnauthenticatedError("That machine token is not valid.");
  const t = await prisma.infinexToken.findUnique({
    /* tenant-scope: identity resolution — the token names its tenant. */
    where: { tokenHash: sha256(token) },
    select: { id: true, tenantId: true, kind: true, credentialId: true, clientId: true, scopes: true, expiresAt: true },
  });
  if (!t || t.expiresAt <= now) throw refused();
  const credential = await prisma.infinexCredential.findFirst({
    where: { tenantId: t.tenantId, id: t.credentialId },
    select: { userId: true, revokedAt: true },
  });
  if (!credential || credential.revokedAt) throw refused();
  const user = await prisma.user.findFirst({
    where: { tenantId: t.tenantId, id: credential.userId },
    select: { id: true, roles: true, disabledAt: true, disabledReason: true },
  });
  if (!user) throw refused();
  if (user.disabledAt) throw new AccountDisabledError(user.disabledReason);
  const kind = t.kind as TokenKind;
  const role = ROLE_OF[kind];
  if (!role || !user.roles.includes(role) || !ROLE_SET.has(role)) throw refused();
  let worldId: string | null | undefined;
  if (kind === "CLIENT") {
    const client = t.clientId
      ? await prisma.infinexClient.findFirst({ where: { tenantId: t.tenantId, id: t.clientId }, select: { worldId: true, status: true } })
      : null;
    if (!client || client.status !== "ACTIVE") throw refused();
    worldId = client.worldId;
  }
  return {
    userId: user.id,
    tenantId: t.tenantId,
    roles: [role],
    sponsorId: null,
    athleteId: null,
    guardianId: null,
    propertyId: null,
    scopes: t.scopes,
    machine: { credentialId: t.credentialId, clientId: t.clientId, tokenId: t.id },
    ...(kind === "CLIENT" ? { infinexWorldId: worldId ?? null } : {}),
  };
}

/** The secrets a session key may come from, current first; empty when INFINEX_SIGNING_SECRET is unset. */
export const signingSecrets = () => acceptedSecrets(env.INFINEX_SIGNING_SECRET, env.INFINEX_SIGNING_SECRET_PREVIOUS);

/** A game session's signing key: derived from a root secret and the session's token id, never stored. */
export const signingKeyFor = (secret: string, tokenId: string) => createHmac("sha256", secret).update(`infinex-session:${tokenId}`).digest("base64url");

const signatureOf = (key: string, t: string, body: Buffer) => createHmac("sha256", key).update(`${t}.`).update(body).digest("hex");

export type SignatureProblem = "missing" | "malformed" | "stale" | "wrong-key" | "mismatch" | "not-configured";

/**
 * Check a game's signature over the raw body. `keyId` must be the session's own
 * token id; the key is derived again from each accepted root secret, and every
 * candidate is compared, so the time taken does not say which matched.
 */
export function verifyClientSignature(
  input: { rawBody: Buffer | undefined; header: string | undefined; keyId: string | undefined; tokenId: string },
  now: Date,
  secrets: readonly string[] = signingSecrets(),
): { ok: true } | { ok: false; problem: SignatureProblem } {
  if (!secrets.length) return { ok: false, problem: "not-configured" };
  if (!input.header || !input.keyId || !input.rawBody) return { ok: false, problem: "missing" };
  const parts = Object.fromEntries(input.header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d{1,12}$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) return { ok: false, problem: "malformed" };
  if (Math.abs(now.getTime() / 1000 - Number(t)) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, problem: "stale" };
  if (input.keyId !== input.tokenId) return { ok: false, problem: "wrong-key" };
  const given = Buffer.from(v1, "hex");
  let ok = false;
  for (const secret of secrets) {
    const expected = Buffer.from(signatureOf(signingKeyFor(secret, input.tokenId), t, input.rawBody), "hex");
    ok = (expected.length === given.length && timingSafeEqual(expected, given)) || ok;
  }
  return ok ? { ok: true } : { ok: false, problem: "mismatch" };
}

export class MachineSignatureError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(readonly problem: SignatureProblem) {
    super(problem === "not-configured" ? "Signed game requests are not configured here yet." : `The request's signature was refused (${problem}).`);
    this.status = problem === "not-configured" ? 503 : 401;
    this.code = problem === "stale" ? "stale-signature" : "bad-signature";
    this.name = "MachineSignatureError";
  }
}

/**
 * Middleware for routes a game signs (telemetry, 4S4-BE-01): after `requireActor`, the caller must be a game
 * session, and its body must carry a valid signature from that session's key. Needs the raw body (app.ts keeps
 * it for /api/v1/infinex/).
 */
export function requireClientSignature(req: Request, _res: Response, next: NextFunction): void {
  const machine = req.actor?.machine;
  if (!machine?.clientId) throw new UnauthenticatedError("Only a game session signs this request.");
  const r = verifyClientSignature(
    { rawBody: (req as { rawBody?: Buffer }).rawBody, header: req.get(SIGNATURE_HEADER), keyId: req.get(KEY_ID_HEADER), tokenId: machine.tokenId },
    new Date(),
  );
  if (!r.ok) throw new MachineSignatureError(r.problem);
  next();
}

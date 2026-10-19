/**
 * The INFINEX client registry and heartbeats — 4S3-INT-02
 * (documentation/SponsorX-INFINEX-API-and-Event-Spec.md §4.2, §5.5).
 *
 *   A CLIENT is one game build for one world (unique per world and build).
 *   BTG or the world's own server registers it and can revoke it; a revoked
 *   client's sessions stop on their next call (auth/machine.ts).
 *
 *   A HEARTBEAT comes from a game session (4S0-SEC-01): the client and world
 *   are the session's, never the body's. The latest one is kept on the client
 *   row with a count — not one row per beat, which would grow by a row every
 *   half-minute per running game and say nothing more. Not signed: it is not
 *   billing data.
 *
 *   MISSING. A build that has reported at least once and then sends nothing
 *   for MISSING_AFTER_BEATS of its own heartbeat intervals (4S3-INT-03: 2.5
 *   minutes at the default 30 s) is marked missing by the worker's minute
 *   sweep, which raises the alert: an
 *   audit row, and the client listed as missing on the Integrations screen
 *   (integration-health.ts). Its next heartbeat clears it and records the
 *   recovery. A build nobody has launched yet never alarms.
 */
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { assertAllowed, whereFor } from "../auth/scope";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import { prisma } from "../db/client";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { InfinexConflictError, InfinexInputError, InfinexNotFoundError } from "./infinex-auth";
import {
  CONFIG_DEFAULTS_VERSION, configEtag, effectiveConfig, LIMITS, missingAfterSeconds, overrideProblems, type ConfigOverride,
} from "./infinex-config";

type Db = PrismaClient | Prisma.TransactionClient;

/** The default threshold, for the Integrations screen's heading; each build uses its own (missingAfterSeconds). */
export const HEARTBEAT_MISSING_SECONDS = missingAfterSeconds(null);

const CLIENT = {
  id: true, worldId: true, buildId: true, status: true, createdAt: true, revokedAt: true, revokeReason: true,
  lastHeartbeatAt: true, lastManifestVersion: true, lastFps: true, lastErrorCount: true, heartbeatCount: true, missingSince: true,
  configOverride: true, configVersion: true,
} as const;
type ClientRow = Prisma.InfinexClientGetPayload<{ select: typeof CLIENT }>;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const view = ({ configOverride, ...c }: ClientRow, now: Date) => ({
  ...c, createdAt: c.createdAt.toISOString(), revokedAt: iso(c.revokedAt), lastHeartbeatAt: iso(c.lastHeartbeatAt), missingSince: iso(c.missingSince),
  heartbeatAgeSeconds: c.lastHeartbeatAt ? Math.max(0, Math.round((now.getTime() - c.lastHeartbeatAt.getTime()) / 1000)) : null,
  missing: c.missingSince !== null,
  missingAfterSeconds: missingAfterSeconds(configOverride as ConfigOverride | null),
  configOverridden: configOverride !== null,
});

const BUILD = /^[A-Za-z0-9._+-]{1,64}$/;

/** POST /infinex/clients { worldId, buildId } — register a game build for a world the caller may read. */
export async function registerClient(actor: Actor, input: { worldId: string; buildId: string }, now = new Date()) {
  assertAllowed(actor, "infinexClient", "write");
  if (actor.machine?.clientId) throw new InfinexConflictError("A game session cannot register clients.");
  const buildId = input.buildId.trim();
  if (!BUILD.test(buildId)) throw new InfinexInputError(["The build is 1 to 64 letters, digits, dots, dashes, pluses or underscores."]);
  const world = await prisma.virtualWorld.findFirst({ where: { ...whereFor(actor, "virtualWorld", "read"), id: input.worldId }, select: { id: true, tenantId: true, status: true } });
  if (!world) throw new InfinexNotFoundError("world");
  if (world.status !== "ACTIVE") throw new InfinexConflictError("That world is retired.");
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.infinexClient.create({ data: { tenantId: world.tenantId, worldId: world.id, buildId, createdBy: actor.userId }, select: CLIENT });
      await audit(tx, actor, AUDIT_ACTIONS.infinex.clientRegister, "InfinexClient", c.id, { after: { worldId: world.id, buildId } });
      return { client: view(c, now) };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new InfinexConflictError("That build is already registered for this world.");
    throw e;
  }
}

/** GET /infinex/clients?worldId — the tenant's game builds, with their heartbeat age. */
export async function listClients(actor: Actor, query: { worldId?: string } = {}, now = new Date()) {
  const rows = await prisma.infinexClient.findMany({
    where: { ...whereFor(actor, "infinexClient", "read"), ...(query.worldId ? { worldId: query.worldId } : {}) },
    orderBy: [{ worldId: "asc" }, { createdAt: "asc" }], select: CLIENT,
  });
  return { clients: rows.map((c) => view(c, now)) };
}

/** POST /infinex/clients/{id}/revoke { reason } — its sessions stop on their next call. */
export async function revokeClient(actor: Actor, clientId: string, input: { reason: string }, now = new Date()) {
  assertAllowed(actor, "infinexClient", "write");
  if (actor.machine?.clientId) throw new InfinexConflictError("A game session cannot revoke clients.");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new InfinexInputError(["Say why (3 to 500 characters)."]);
  return prisma.$transaction(async (tx) => {
    const c = await tx.infinexClient.findFirst({ where: { ...whereFor(actor, "infinexClient", "write"), id: clientId }, select: { id: true, status: true } });
    if (!c) throw new InfinexNotFoundError("client");
    if (c.status === "REVOKED") throw new InfinexConflictError("It is already revoked.");
    const next = await tx.infinexClient.update({
      /* tenant-scope: the client found above through whereFor. */
      where: { id: c.id }, data: { status: "REVOKED", revokedAt: now, revokedBy: actor.userId, revokeReason: reason, missingSince: null }, select: CLIENT,
    });
    await audit(tx, actor, AUDIT_ACTIONS.infinex.clientRevoke, "InfinexClient", c.id, { after: { reason } });
    return { client: view(next, now) };
  });
}

/**
 * POST /infinex/heartbeat { manifestVersion, buildId?, fps?, errorCount? } — from a game session only. Recorded
 * on the session's own client; a client that was missing is recovered (audited).
 */
export async function recordHeartbeat(
  actor: Actor,
  input: { manifestVersion: number; buildId?: string; fps?: number | null; errorCount?: number | null },
  now = new Date(),
) {
  assertAllowed(actor, "infinexClient", "write");
  const clientId = actor.machine?.clientId;
  if (!clientId) throw new InfinexConflictError("Only a game session sends heartbeats.");
  return prisma.$transaction(async (tx) => {
    const c = await tx.infinexClient.findFirst({ where: { ...whereFor(actor, "infinexClient", "write"), id: clientId }, select: { id: true, buildId: true, status: true, missingSince: true } });
    if (!c || c.status !== "ACTIVE") throw new InfinexNotFoundError("client");
    if (input.buildId !== undefined && input.buildId !== c.buildId) throw new InfinexInputError([`This session is for build ${c.buildId}, not ${input.buildId}.`]);
    await tx.infinexClient.update({
      /* tenant-scope: the session's own client, found above. */
      where: { id: c.id },
      data: {
        lastHeartbeatAt: now, lastManifestVersion: input.manifestVersion, lastFps: input.fps ?? null, lastErrorCount: input.errorCount ?? null,
        heartbeatCount: { increment: 1 }, missingSince: null,
      },
      select: { id: true },
    });
    if (c.missingSince) {
      await audit(tx, actor, AUDIT_ACTIONS.infinex.heartbeatRecovered, "InfinexClient", c.id, {
        before: { missingSince: c.missingSince.toISOString() }, after: { recoveredAt: now.toISOString(), missingForSeconds: Math.round((now.getTime() - c.missingSince.getTime()) / 1000) },
      });
    }
  });
}

/**
 * The worker's minute sweep: every ACTIVE client that has reported and then gone quiet for longer than
 * HEARTBEAT_MISSING_SECONDS is marked missing, once, with an audit row (the alert). Returns how many.
 */
export async function sweepMissingHeartbeats(db: PrismaClient = prisma, now = new Date(), opts: { tenantId?: string } = {}): Promise<{ missing: number }> {
  /* Every build quiet for at least the shortest threshold any build can have; then each against its own. */
  const shortest = new Date(now.getTime() - LIMITS.heartbeatSeconds.min * 5 * 1000);
  const candidates = await db.infinexClient.findMany({
    /* tenant-scope: the system's sweep across tenants; each alert is filed under its client's own tenant. */
    where: { status: "ACTIVE", missingSince: null, lastHeartbeatAt: { lt: shortest }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    select: { id: true, tenantId: true, worldId: true, buildId: true, lastHeartbeatAt: true, configOverride: true },
  });
  const quiet = candidates.map((c) => ({ ...c, thresholdSeconds: missingAfterSeconds(c.configOverride as ConfigOverride | null) }))
    .filter((c) => c.lastHeartbeatAt!.getTime() < now.getTime() - c.thresholdSeconds * 1000);
  let missing = 0;
  for (const c of quiet) {
    const cutoff = new Date(now.getTime() - c.thresholdSeconds * 1000);
    /* Marked and alerted together; a heartbeat that lands first wins (missingSince is no longer null). */
    missing += await db.$transaction(async (tx) => {
      const marked = await tx.infinexClient.updateMany({ where: { id: c.id, tenantId: c.tenantId, status: "ACTIVE", missingSince: null, lastHeartbeatAt: { lt: cutoff } }, data: { missingSince: now } });
      if (!marked.count) return 0;
      const by: AuditActor = { userId: null, tenantId: c.tenantId };
      await audit(tx, by, AUDIT_ACTIONS.infinex.heartbeatMissing, "InfinexClient", c.id, {
        after: { worldId: c.worldId, buildId: c.buildId, lastHeartbeatAt: c.lastHeartbeatAt!.toISOString(), thresholdSeconds: c.thresholdSeconds },
      });
      return 1;
    });
  }
  return { missing };
}

/** For the Integrations screen (§5.5): the tenant's ACTIVE clients, their heartbeat age, and which are missing. */
export async function clientHealth(db: Db, tenantId: string, now = new Date()) {
  const rows = await db.infinexClient.findMany({
    where: { tenantId, status: "ACTIVE" }, orderBy: [{ missingSince: { sort: "asc", nulls: "last" } }, { worldId: "asc" }, { buildId: "asc" }], select: CLIENT,
  });
  const clients = rows.map((c) => view(c, now));
  return { thresholdSeconds: HEARTBEAT_MISSING_SECONDS, active: clients.length, missing: clients.filter((c) => c.missing).length, clients };
}

/* ───────────────────────────── client config (4S3-INT-03) ───────────────────────────── */

const configOf = (c: { id: string; buildId: string; worldId: string; configOverride: unknown; configVersion: number }) => {
  const config = effectiveConfig(c.configOverride as ConfigOverride | null);
  return {
    etag: configEtag(config, c.configVersion),
    body: { clientId: c.id, worldId: c.worldId, buildId: c.buildId, defaultsVersion: CONFIG_DEFAULTS_VERSION, configVersion: c.configVersion, overridden: c.configOverride !== null, ...config },
  };
};
const CONFIG_ROW = { id: true, buildId: true, worldId: true, status: true, configOverride: true, configVersion: true } as const;

/** GET /infinex/config — a game session's own build's effective config, with its ETag. */
export async function sessionConfig(actor: Actor) {
  assertAllowed(actor, "infinexClient", "read");
  const clientId = actor.machine?.clientId;
  if (!clientId) throw new InfinexConflictError("Only a game session reads its config here; BTG and servers use /infinex/clients/{id}/config.");
  const c = await prisma.infinexClient.findFirst({ where: { ...whereFor(actor, "infinexClient", "read"), id: clientId }, select: CONFIG_ROW });
  if (!c || c.status !== "ACTIVE") throw new InfinexNotFoundError("client");
  return configOf(c);
}

/** GET /infinex/clients/{id}/config — a build's effective config and its override (BTG and the world's server). */
export async function readClientConfig(actor: Actor, clientId: string) {
  assertAllowed(actor, "infinexClient", "read");
  const c = await prisma.infinexClient.findFirst({ where: { ...whereFor(actor, "infinexClient", "read"), id: clientId }, select: CONFIG_ROW });
  if (!c) throw new InfinexNotFoundError("client");
  return { ...configOf(c).body, override: (c.configOverride as ConfigOverride | null) ?? null, limits: LIMITS };
}

/**
 * PATCH /infinex/clients/{id}/config { override } — BTG sets (or, with null, clears) a build's override. Refused
 * with every reason when a value is outside its limits. Machines read their config; they never change it.
 */
export async function setClientConfig(actor: Actor, clientId: string, input: { override: ConfigOverride | null }) {
  assertAllowed(actor, "infinexClient", "write");
  if (actor.machine) throw new ForbiddenError("infinexClient", "write");
  const problems = input.override ? overrideProblems(input.override) : [];
  if (problems.length) throw new InfinexInputError(problems);
  return prisma.$transaction(async (tx) => {
    const c = await tx.infinexClient.findFirst({ where: { ...whereFor(actor, "infinexClient", "write"), id: clientId }, select: { id: true, configOverride: true } });
    if (!c) throw new InfinexNotFoundError("client");
    const next = await tx.infinexClient.update({
      /* tenant-scope: the client found above through whereFor. */
      where: { id: c.id },
      data: { configOverride: input.override ?? Prisma.DbNull, configVersion: { increment: 1 } },
      select: CONFIG_ROW,
    });
    await audit(tx, actor, AUDIT_ACTIONS.infinex.clientConfig, "InfinexClient", c.id, { before: { override: c.configOverride ?? null }, after: { override: input.override, configVersion: next.configVersion } });
    return { ...configOf(next).body, override: input.override, limits: LIMITS };
  });
}

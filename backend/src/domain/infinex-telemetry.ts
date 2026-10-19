/**
 * INFINEX telemetry intake — 4S4-BE-01, with 4S4-BE-02 (versioned event
 * schema) and 4S4-DATA-01 (raw storage)
 * (documentation/SponsorX-INFINEX-API-and-Event-Spec.md §5.1–§5.3).
 *
 *   WHO. A game session only, and only with a valid signature over the raw
 *   bytes (auth/machine.ts `requireClientSignature`). The tenant, world and
 *   build come from the session, never from an event: an event that names a
 *   tenant, another client or another build is refused.
 *
 *   LIMITS come from the build's own config (4S3-INT-03): at most `maxBatch`
 *   events and `maxBytes` bytes (413 for the whole batch); telemetry switched
 *   off for the build is 409; activation events wait for the `activations`
 *   flag (4S6).
 *
 *   EACH EVENT is checked on its own, so one bad event never costs the rest:
 *   its envelope, its `schemaVersion` (one the config lists as supported, or
 *   refused naming those that are), its type's data (v1 shapes below), its
 *   time (not more than 5 minutes ahead), and what it names — a placement in
 *   the session's own world, showing a deployment that was live then, with
 *   the creative that deployment carries; a zone in that world.
 *
 *   STORED ONCE. An accepted event is a `VirtualEventRaw` row keyed by
 *   (client, eventId): a resent event is answered `duplicate` and never
 *   stored twice — the database's key, not the code's care (4S4-BE-03 builds
 *   the counting on it). An event older than the 72-hour late-arrival window
 *   is kept as QUARANTINED, never dropped and never counted until reviewed.
 *   Raw rows are append-only and separate from every aggregate.
 */
import { z } from "zod";

import type { Actor } from "../auth/actor";
import { assertAllowed } from "../auth/scope";
import { prisma } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { InfinexConflictError, InfinexNotFoundError } from "./infinex-auth";
import { effectiveConfig, type ConfigOverride } from "./infinex-config";

export const FUTURE_TOLERANCE_MS = 5 * 60_000;
export const LATE_WINDOW_MS = 72 * 3_600_000;
export const MAX_EVENT_BYTES = 8 * 1024;

export class TelemetryRefusedError extends Error {
  readonly code: string;
  constructor(readonly status: number, code: string, message: string, readonly limits?: Record<string, number>) {
    super(message);
    this.code = code;
    this.name = "TelemetryRefusedError";
  }
}

const ref = z.string().min(1).max(128);
const iso = z.string().datetime({ offset: true });

/** The envelope (§5.1). Strict: an unknown key is a malformed event, never silently kept. */
const Envelope = z.object({
  eventId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  schemaVersion: z.number().int().min(1),
  eventType: z.string().min(1).max(64),
  occurredAt: iso,
  producer: z.object({ kind: z.string().max(64).optional(), clientId: ref.optional(), buildId: ref.optional() }).strict().optional(),
  tenantId: z.unknown().optional(),
  subject: z.object({ worldId: ref.optional(), zoneId: ref.optional(), placementId: ref.optional(), deploymentId: ref.optional(), activationId: ref.nullable().optional() }).strict().optional(),
  session: z.object({ sessionRef: ref.optional(), subjectRef: ref.optional() }).strict().optional(),
  sequence: z.number().int().min(0).optional(),
  data: z.record(z.string(), z.unknown()),
}).strict();
type Event = z.infer<typeof Envelope>;

/** 4S4-BE-02 — each event type's data, schema version 1 (§5.2). */
const DATA_V1: Record<string, z.ZodType> = {
  "zone.visit": z.object({ enteredAt: iso, exitedAt: iso.optional() }).strict(),
  "placement.render": z.object({ assetId: ref, assetVersion: z.number().int().min(1), lod: z.number().int().min(0).max(10).optional() }).strict(),
  "placement.visible": z.object({
    visiblePct: z.number().min(0).max(100), dwellMs: z.number().int().min(0).max(86_400_000),
    viewportPct: z.number().min(0).max(100).optional(), occluded: z.boolean().optional(),
  }).strict(),
  "placement.interaction": z.object({ interactionType: z.enum(["CLICK", "TOUCH", "ENTER", "USE", "SHARE"]), targetRef: ref.optional() }).strict(),
  "placement.error": z.object({ code: z.string().min(1).max(64), message: z.string().max(500), assetId: ref.optional(), assetVersion: z.number().int().min(1).optional() }).strict(),
  "activation.start": z.object({ activationId: ref }).strict(),
  "activation.progress": z.object({ activationId: ref, step: z.number().int().min(1), of: z.number().int().min(1) }).strict(),
};
export const SCHEMAS: Record<number, Record<string, z.ZodType>> = { 1: DATA_V1 };
/** Sent elsewhere, never in a batch. */
const ELSEWHERE: Record<string, string> = {
  "activation.complete": "Send activation.complete to POST /infinex/activations/{id}/complete, not in a batch.",
  "client.heartbeat": "Send heartbeats to POST /infinex/heartbeat, not in a batch.",
};

export type EventResult = { eventId: string | null; status: "accepted" | "duplicate" | "quarantined" | "rejected"; problem?: { type: string; title: string } };

const refuse = (eventId: string | null, type: string, title: string): EventResult => ({ eventId, status: "rejected", problem: { type, title } });

/** POST /infinex/telemetry { events } — a game session's signed batch. 207 with a result for every event not simply accepted. */
export async function ingestTelemetry(actor: Actor, body: unknown, rawBytes: number, now = new Date()) {
  assertAllowed(actor, "virtualEvent", "write");
  const m = actor.machine;
  if (!m?.clientId || !actor.infinexWorldId) throw new InfinexConflictError("Only a game session sends telemetry.");
  const client = await prisma.infinexClient.findFirst({
    where: { tenantId: actor.tenantId, id: m.clientId },
    select: { id: true, worldId: true, buildId: true, status: true, configOverride: true },
  });
  if (!client || client.status !== "ACTIVE") throw new InfinexNotFoundError("client");
  const config = effectiveConfig(client.configOverride as ConfigOverride | null);
  if (!config.flags.telemetry) throw new TelemetryRefusedError(409, "telemetry-off", "Telemetry is switched off for this build.");
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) throw new TelemetryRefusedError(400, "malformed-batch", "The body is { events: [ … ] }.");
  if (events.length > config.telemetry.maxBatch || rawBytes > config.telemetry.maxBytes) {
    throw new TelemetryRefusedError(413, "batch-too-large", `A batch is at most ${config.telemetry.maxBatch} events and ${config.telemetry.maxBytes} bytes for this build.`, {
      maxBatch: config.telemetry.maxBatch, maxBytes: config.telemetry.maxBytes,
    });
  }

  /* What the events may name, read once: the session's world, its zones and placements, and the deployments named. */
  const [world, zones, placements] = await Promise.all([
    prisma.virtualWorld.findFirst({ where: { tenantId: actor.tenantId, id: client.worldId }, select: { id: true, externalId: true } }),
    prisma.virtualZone.findMany({ where: { tenantId: actor.tenantId, worldId: client.worldId }, select: { id: true, externalId: true } }),
    prisma.virtualPlacement.findMany({ where: { tenantId: actor.tenantId, worldId: client.worldId }, select: { id: true, externalId: true } }),
  ]);
  if (!world) throw new InfinexNotFoundError("world");
  const zoneBy = new Map(zones.map((z) => [z.externalId, z.id]));
  const placementBy = new Map(placements.map((p) => [p.externalId, p.id]));
  const deploymentIds = [...new Set(events.map((e) => (e as Event)?.subject?.deploymentId).filter((d): d is string => typeof d === "string"))];
  const deployments = new Map((deploymentIds.length ? await prisma.creativeDeployment.findMany({
    where: { tenantId: actor.tenantId, worldId: client.worldId, id: { in: deploymentIds } },
    select: { id: true, placementId: true, assetId: true, assetVersion: true, state: true, startsAt: true, endsAt: true, approvedAt: true, endedAt: true, pausedAt: true, rolledBackAt: true },
  }) : []).map((d) => [d.id, d]));
  const supported = config.schemaVersions.supported;

  const results: EventResult[] = [];
  const rows: Prisma.VirtualEventRawCreateManyInput[] = [];
  const seen = new Set<string>();
  for (const raw of events) {
    const id = typeof (raw as { eventId?: unknown })?.eventId === "string" ? String((raw as { eventId: string }).eventId).slice(0, 64) : null;
    if (JSON.stringify(raw ?? null).length > MAX_EVENT_BYTES) { results.push(refuse(id, "event-too-large", `An event is at most ${MAX_EVENT_BYTES} bytes.`)); continue; }
    const parsed = Envelope.safeParse(raw);
    if (!parsed.success) { results.push(refuse(id, "malformed-event", parsed.error.issues.map((i) => `${i.path.join(".") || "event"}: ${i.message}`).join("; "))); continue; }
    const e = parsed.data;
    if (seen.has(e.eventId)) { results.push({ eventId: e.eventId, status: "duplicate" }); continue; }
    seen.add(e.eventId);
    if (e.tenantId !== undefined) { results.push(refuse(e.eventId, "tenant-in-body", "The tenant comes from the session, never the event.")); continue; }
    if ((e.producer?.clientId && e.producer.clientId !== client.id) || (e.producer?.buildId && e.producer.buildId !== client.buildId)) {
      results.push(refuse(e.eventId, "wrong-producer", `This session is client ${client.id}, build ${client.buildId}.`)); continue;
    }
    if (ELSEWHERE[e.eventType]) { results.push(refuse(e.eventId, "wrong-endpoint", ELSEWHERE[e.eventType]!)); continue; }
    if (!supported.includes(e.schemaVersion)) {
      results.push(refuse(e.eventId, "unsupported-schema-version", `schemaVersion ${e.schemaVersion} is not supported; supported: ${supported.join(", ")}.`)); continue;
    }
    const dataSchema = SCHEMAS[e.schemaVersion]?.[e.eventType];
    if (!dataSchema) { results.push(refuse(e.eventId, "unknown-event-type", `${e.eventType} is not an event type in schema version ${e.schemaVersion}.`)); continue; }
    const data = dataSchema.safeParse(e.data);
    if (!data.success) { results.push(refuse(e.eventId, "malformed-data", data.error.issues.map((i) => `data.${i.path.join(".")}: ${i.message}`).join("; "))); continue; }
    if (e.eventType.startsWith("activation.") && !config.flags.activations) { results.push(refuse(e.eventId, "activations-off", "Activations are switched off for this build.")); continue; }
    const at = new Date(e.occurredAt);
    if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) { results.push(refuse(e.eventId, "occurred-in-future", "occurredAt is more than 5 minutes ahead.")); continue; }
    if (e.subject?.worldId && e.subject.worldId !== world.externalId && e.subject.worldId !== world.id) {
      results.push(refuse(e.eventId, "wrong-world", `This session is for world ${world.externalId}.`)); continue;
    }

    let placementId: string | null = null;
    let zoneId: string | null = null;
    let deploymentId: string | null = null;
    if (e.eventType.startsWith("placement.")) {
      placementId = e.subject?.placementId ? placementBy.get(e.subject.placementId) ?? null : null;
      if (!placementId) { results.push(refuse(e.eventId, "placement-not-in-world", `No placement ${e.subject?.placementId ?? "(none)"} in world ${world.externalId}.`)); continue; }
      const d = e.subject?.deploymentId ? deployments.get(e.subject.deploymentId) : undefined;
      const t = at.getTime();
      /* Live then: approved by then, inside its dates, and not yet ended, paused or rolled back at that moment. */
      const live = d && d.placementId === placementId && d.state !== "DRAFT" && d.approvedAt && d.approvedAt.getTime() <= t
        && d.startsAt.getTime() <= t && t < d.endsAt.getTime()
        && (!d.endedAt || d.endedAt.getTime() > t) && (!d.pausedAt || d.pausedAt.getTime() > t) && (!d.rolledBackAt || d.rolledBackAt.getTime() > t);
      if (!live) { results.push(refuse(e.eventId, "deployment-not-live", "The deployment named was not live on this placement at occurredAt.")); continue; }
      if (e.eventType === "placement.render") {
        const r = data.data as { assetId: string; assetVersion: number };
        if (r.assetId !== d.assetId || r.assetVersion !== d.assetVersion) { results.push(refuse(e.eventId, "asset-mismatch", "The creative rendered is not the one that deployment carries.")); continue; }
      }
      deploymentId = d.id;
    }
    if (e.eventType === "zone.visit") {
      zoneId = e.subject?.zoneId ? zoneBy.get(e.subject.zoneId) ?? null : null;
      if (!zoneId) { results.push(refuse(e.eventId, "zone-not-in-world", `No zone ${e.subject?.zoneId ?? "(none)"} in world ${world.externalId}.`)); continue; }
    }
    const late = at.getTime() < now.getTime() - LATE_WINDOW_MS;
    rows.push({
      clientId: client.id, eventId: e.eventId, tenantId: actor.tenantId, worldId: client.worldId, buildId: client.buildId, sessionKeyId: m.tokenId,
      eventType: e.eventType, schemaVersion: e.schemaVersion, occurredAt: at, receivedAt: now, placementId, deploymentId, zoneId,
      activationId: e.subject?.activationId ?? null, sessionRef: e.session?.sessionRef ?? null, subjectRef: e.session?.subjectRef ?? null,
      sequence: e.sequence ?? null, data: data.data as Prisma.InputJsonValue, status: late ? "QUARANTINED" : "ACCEPTED",
    });
    results.push({ eventId: e.eventId, status: late ? "quarantined" : "accepted" });
  }

  /* Stored once: a row already there (a resent event) is skipped by the key, and answered duplicate. */
  const stored = rows.length ? await prisma.virtualEventRaw.createManyAndReturn({ data: rows, skipDuplicates: true, select: { eventId: true } }) : [];
  const fresh = new Set(stored.map((r) => r.eventId));
  for (const r of results) if ((r.status === "accepted" || r.status === "quarantined") && r.eventId && !fresh.has(r.eventId)) r.status = "duplicate";

  const count = (s: EventResult["status"]) => results.filter((r) => r.status === s).length;
  return {
    accepted: count("accepted"), duplicate: count("duplicate"), quarantined: count("quarantined"), rejected: count("rejected"),
    results: results.filter((r) => r.status !== "accepted"),
  };
}

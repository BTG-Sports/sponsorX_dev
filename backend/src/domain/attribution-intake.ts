/**
 * Partner intake — 3S6-BE-01 (documentation/SponsorX-Attribution-Framework.md).
 *
 * The engine side of the adapter framework (attribution-adapters.ts). It
 * knows only the adapter interface: a partner is a row naming its adapter,
 * so a new partner format is a new adapter, never a change here.
 *
 *   PARTNERS. BTG adds a partner (a name and an adapter); SponsorX makes it a
 *   secret token, shown once and kept only as its SHA-256. Each partner
 *   belongs to one tenant (`attribution`, RBAC matrix §36).
 *
 *   DELIVERIES. A partner POSTs to /api/v1/attribution/partners/{id}/events
 *   with `Authorization: Bearer <token>`. The token is checked in constant
 *   time; the partner's adapter parses the body; the delivery is kept as
 *   received (`AttributionDelivery`) with the events it yielded and every
 *   problem, so nothing a partner sends disappears silently.
 *
 *   EVENTS (3S6-BE-02/03). Each event becomes one `PartnerSaleAttribution`
 *   — once: the partner's own id is unique per partner, so a resent sale is
 *   counted once — matched as it arrives, exact keys first
 *   (attribution-matching.ts). One that does not match waits in the queue
 *   with its reason (3S6-BE-04).
 *
 * Zoho, Stripe and every other vendor stay off this path; it never calls out.
 * The feature can be switched off per tenant (`attribution`, 3S8-OPS-01).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Prisma } from "../generated/prisma/client";
import { adapterFor, adapters, describeAdapter, type PartnerEvent } from "./attribution-adapters";
import { basisOf, columnsOf, matchEvent, modelFor, type MatchContext, type Outcome } from "./attribution-matching";
import { assertFeature, featureEnabled } from "./model-registry";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class PartnerAuthError extends Error {
  readonly status = 401;
  readonly code = "partner_unauthenticated";
  constructor() {
    super("Unknown partner or wrong token.");
    this.name = "PartnerAuthError";
  }
}

export class PartnerInputError extends Error {
  readonly status = 422;
  readonly code = "partner_input";
  constructor(message: string) {
    super(message);
    this.name = "PartnerInputError";
  }
}

export class PartnerOffError extends Error {
  readonly status = 403;
  readonly code = "partner_off";
  constructor() {
    super("This partner is switched off.");
    this.name = "PartnerOffError";
  }
}

/** POST /api/v1/attribution/partners/:partnerId/events — a partner's delivery, proven by its token. */
export async function receiveDelivery(partnerId: string, authorization: string | undefined, payload: unknown, now = new Date()) {
  const token = /^Bearer (.+)$/.exec(authorization ?? "")?.[1]?.trim() ?? "";
  const partner = await prisma.attributionPartner.findFirst({
    /* tenant-scope: a public endpoint — the partner is found by its own opaque id and proven by its token below; its tenant comes from the row. */
    where: { id: partnerId },
    select: { id: true, tenantId: true, adapter: true, tokenHash: true, enabled: true },
  });
  /* Same answer for an unknown partner and a wrong token: nothing to probe. */
  const given = Buffer.from(sha256(token), "hex");
  const known = Buffer.from(partner?.tokenHash ?? "0".repeat(64), "hex");
  if (!partner || !token || !timingSafeEqual(given, known)) throw new PartnerAuthError();
  if (!partner.enabled || !(await featureEnabled(prisma, partner.tenantId, "attribution"))) throw new PartnerOffError();
  const adapter = adapterFor(partner.adapter);
  const parsed = adapter ? adapter.parse(payload) : { events: [], problems: [`No adapter "${partner.adapter}" is registered.`] };

  /* Each event once: one already stored (or repeated in this delivery) is a duplicate, not a second sale. */
  const seen = new Set((parsed.events.length ? await prisma.partnerSaleAttribution.findMany({
    where: { tenantId: partner.tenantId, partnerId: partner.id, externalId: { in: parsed.events.map((e) => e.externalId) } },
    select: { externalId: true },
  }) : []).map((r) => r.externalId));
  const fresh: PartnerEvent[] = [];
  for (const e of parsed.events) if (!seen.has(e.externalId)) { seen.add(e.externalId); fresh.push(e); }

  /* Matched oldest first, so a sale is matched before a refund of it in the same delivery. */
  const matched: Array<{ e: PartnerEvent; o: Outcome }> = [];
  if (adapter && fresh.length) {
    const ctx: MatchContext = { tenantId: partner.tenantId, partnerId: partner.id, adapter, model: await modelFor(prisma, partner.tenantId, adapter), batchOrders: new Map() };
    for (const e of [...fresh].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))) {
      const o = await matchEvent(prisma, ctx, e);
      if (o.status === "matched" && e.kind === "sale" && e.keys.order_id && !ctx.batchOrders!.has(e.keys.order_id)) {
        ctx.batchOrders!.set(e.keys.order_id, { campaignId: o.campaignId, athleteId: o.athleteId, basis: basisOf(o) });
      }
      matched.push({ e, o });
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    const d = await tx.attributionDelivery.create({
      data: {
        tenantId: partner.tenantId, partnerId: partner.id, adapter: partner.adapter, receivedAt: now,
        status: parsed.events.length ? "accepted" : "rejected", eventCount: parsed.events.length, problems: parsed.problems.slice(0, 100),
        events: parsed.events as unknown as Prisma.InputJsonValue, payload: payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    if (matched.length) {
      await tx.partnerSaleAttribution.createMany({
        data: matched.map(({ e, o }) => ({
          tenantId: partner.tenantId, partnerId: partner.id, deliveryId: d.id, adapter: partner.adapter,
          externalId: e.externalId, kind: e.kind, occurredAt: new Date(e.occurredAt), receivedAt: now,
          amountCents: e.amountCents, currency: e.currency, keys: e.keys as Prisma.InputJsonValue,
          orderId: e.keys.order_id ?? null, stateCode: e.stateCode ?? null, windowDays: adapter!.lookbackDays,
          ...columnsOf(o, now),
        })),
        /* Two deliveries racing with the same sale: the second is a duplicate, not an error. */
        skipDuplicates: true,
      });
    }
    return d;
  });
  return {
    deliveryId: row.id, accepted: parsed.events.length, problems: parsed.problems,
    matched: matched.filter((m) => m.o.status === "matched").length, queued: matched.filter((m) => m.o.status === "unmatched").length,
    duplicates: parsed.events.length - fresh.length,
  };
}

/* ───────────────────────────── BTG's side ───────────────────────────── */

/** GET /intelligence/attribution/partners — the adapters available, and this tenant's partners with their deliveries. */
export async function partnerDesk(actor: Actor) {
  assertTenantWide(actor, "attribution", "read");
  await assertFeature(prisma, actor.tenantId, "attribution");
  const [partners, counts] = await Promise.all([
    prisma.attributionPartner.findMany({
      where: { tenantId: actor.tenantId }, orderBy: { createdAt: "asc" },
      select: { id: true, name: true, adapter: true, enabled: true, createdAt: true },
    }),
    prisma.attributionDelivery.groupBy({
      where: { tenantId: actor.tenantId }, by: ["partnerId", "status"], _count: { _all: true }, _sum: { eventCount: true }, _max: { receivedAt: true },
    }),
  ]);
  return {
    adapters: adapters().map(describeAdapter),
    partners: partners.map((p) => {
      const mine = counts.filter((c) => c.partnerId === p.id);
      const last = mine.map((c) => c._max.receivedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        id: p.id, name: p.name, adapter: p.adapter, enabled: p.enabled, createdAt: p.createdAt.toISOString(),
        deliveries: mine.reduce((t, c) => t + c._count._all, 0), rejected: mine.filter((c) => c.status === "rejected").reduce((t, c) => t + c._count._all, 0),
        events: mine.reduce((t, c) => t + (c._sum.eventCount ?? 0), 0), lastDeliveryAt: last?.toISOString() ?? null,
      };
    }),
  };
}

/** POST /intelligence/attribution/partners — add a partner; its token is returned once, and kept only as a hash. */
export async function addPartner(actor: Actor, input: { name: string; adapter: string }) {
  assertTenantWide(actor, "attribution", "write");
  await assertFeature(prisma, actor.tenantId, "attribution");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new PartnerInputError("Name the partner (2 to 120 characters).");
  if (!adapterFor(input.adapter)) throw new PartnerInputError(`No adapter "${input.adapter}". Available: ${adapters().map((a) => a.key).join(", ")}.`);
  const token = `sxp_${randomBytes(24).toString("hex")}`;
  const row = await prisma.$transaction(async (tx) => {
    const p = await tx.attributionPartner.create({
      data: { tenantId: actor.tenantId, name, adapter: input.adapter, tokenHash: sha256(token), enabled: true, createdBy: actor.userId },
      select: { id: true },
    });
    await audit(tx, actor, AUDIT_ACTIONS.attribution.partnerAdd, "AttributionPartner", p.id, { after: { name, adapter: input.adapter } });
    return p;
  });
  return {
    partner: { id: row.id, name, adapter: input.adapter, enabled: true },
    /* Shown once. Give it to the partner with the endpoint below; SponsorX keeps only its hash. */
    token,
    endpoint: `/api/v1/attribution/partners/${row.id}/events`,
  };
}

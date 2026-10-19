/**
 * The attribution desk and the reconciliation queue — 3S6-BE-03/04
 * (documentation/SponsorX-Attribution-Matching.md), read by 3S6-FE-01
 * (/admin/intelligence/attribution; contract: frontend/src/lib/attribution-live.ts).
 *
 * THE FOUR CLASSES ARE NEVER ADDED TOGETHER (SponsorX-Attribution-Claims.md):
 *   VERIFIED_REDEMPTION    fans' redemptions, counted by SponsorX — no money;
 *   VERIFIED_TRANSACTION   partner sales matched exactly: sales less refunds;
 *   MODELLED               partner sales a model linked: sales less refunds;
 *   ESTIMATED_MEDIA_VALUE  verified views × the tenant's benchmark per 1,000.
 *
 * THE QUEUE (3S6-BE-04). "Unmatched and ambiguous events remain in a
 * reviewable queue." A partner sale that matched no campaign stays with its
 * reason until the nightly retry matches it or a BTG admin dismisses it, with
 * a reason. A dismissed sale stays on the list, marked, with who and why; it
 * is never assigned to a campaign by hand — a person's pick is neither an
 * exact match nor a model's, and every sale says how it was matched.
 *
 * Who: BTG admins, campaign managers and Sales read (`attribution`, RBAC
 * matrix §36); dismissing is BTG admins'.
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { prisma } from "../db/client";
import type { PageInfo, PageRequest } from "../lib/paging";
import { peopleWords } from "./anomaly-engine";
import { BENCHMARK_METRIC } from "./benchmarks";
import { assertFeature } from "./model-registry";

export type AttributionClass = "VERIFIED_REDEMPTION" | "VERIFIED_TRANSACTION" | "MODELLED" | "ESTIMATED_MEDIA_VALUE";

export class AttributionNotFoundError extends Error {
  readonly status = 404;
  readonly code = "attribution_not_found";
  constructor(message = "No such unmatched sale.") {
    super(message);
    this.name = "AttributionNotFoundError";
  }
}

export class AttributionInputError extends Error {
  readonly status = 422;
  readonly code = "attribution_input";
  constructor(message: string) {
    super(message);
    this.name = "AttributionInputError";
  }
}

/** The sale is on the list but no longer open: already dismissed, or matched by the nightly retry meanwhile. */
export class AttributionDecidedError extends Error {
  readonly status = 409;
  readonly code = "attribution_decided";
  constructor(message: string) {
    super(message);
    this.name = "AttributionDecidedError";
  }
}

const signed = (kind: string, cents: number | null) => (cents === null ? null : kind === "refund" ? -cents : cents);

/** GET /intelligence/attribution?campaign&tab=events|unmatched&class&page&size */
export async function attributionDesk(
  actor: Actor,
  q: { campaign?: string; tab: "events" | "unmatched"; class?: AttributionClass; page: PageRequest },
  now = new Date(),
) {
  assertTenantWide(actor, "attribution", "read");
  await assertFeature(prisma, actor.tenantId, "attribution");
  const tenantId = actor.tenantId;
  const campaign = q.campaign
    ? await prisma.campaign.findFirst({ where: { tenantId, id: q.campaign }, select: { id: true, name: true } })
    : null;
  if (q.campaign && !campaign) throw new AttributionNotFoundError("No such campaign.");
  const inCampaign = campaign ? { campaignId: campaign.id } : {};

  const [byClass, redemptions, views, benchmark, unmatched] = await Promise.all([
    prisma.partnerSaleAttribution.groupBy({
      where: { tenantId, status: "matched", ...inCampaign }, by: ["class", "kind"], _count: { _all: true }, _sum: { amountCents: true },
    }),
    prisma.rewardEvent.count({ where: { tenantId, type: "REDEEM", ...(campaign ? { token: { is: { reward: { is: { campaignId: campaign.id } } } } } : {}) } }),
    prisma.campaignDaySummary.aggregate({ where: { tenantId, ...inCampaign }, _sum: { viewsVerifiedApi: true, viewsVerifiedManual: true } }),
    prisma.benchmark.findFirst({ where: { tenantId, dimension: "ALL", segment: "", metric: BENCHMARK_METRIC }, select: { median: true } }),
    prisma.partnerSaleAttribution.count({ where: { tenantId, status: "unmatched" } }),
  ]);

  /* Sales are counted; refunds take their amount back off. Four figures, never one. */
  const partnerTotal = (cls: "VERIFIED_TRANSACTION" | "MODELLED") => {
    const rows = byClass.filter((r) => r.class === cls);
    const sales = rows.find((r) => r.kind === "sale");
    const refunds = rows.find((r) => r.kind === "refund");
    return { count: sales?._count._all ?? 0, amountCents: (sales?._sum.amountCents ?? 0) - (refunds?._sum.amountCents ?? 0) };
  };
  const viewCount = Number(views._sum.viewsVerifiedApi ?? 0) + Number(views._sum.viewsVerifiedManual ?? 0);
  const totals: Record<AttributionClass, { count: number; amountCents: number }> = {
    VERIFIED_REDEMPTION: { count: redemptions, amountCents: 0 },
    VERIFIED_TRANSACTION: partnerTotal("VERIFIED_TRANSACTION"),
    MODELLED: partnerTotal("MODELLED"),
    ESTIMATED_MEDIA_VALUE: { count: viewCount, amountCents: benchmark ? Math.round((viewCount * benchmark.median) / 1000) : 0 },
  };
  const matchedCount = byClass.filter((r) => !q.class || r.class === q.class).reduce((t, r) => t + r._count._all, 0);
  const base = { asOf: now.toISOString(), scope: { campaign }, totals, counts: { events: byClass.reduce((t, r) => t + r._count._all, 0), unmatched } };

  const partners = new Map((await prisma.attributionPartner.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const source = (r: { partnerId: string; adapter: string }) => ({ partner: partners.get(r.partnerId) ?? "A removed partner", adapter: r.adapter });

  if (q.tab === "unmatched") {
    /* The queue is the whole tenant's — an unmatched sale has no campaign. Open first, then dismissed; newest first. */
    const where = { tenantId, status: { in: ["unmatched", "dismissed"] } };
    const [rows, total] = await Promise.all([
      prisma.partnerSaleAttribution.findMany({
        /* tenant-scope: `where` carries the caller's tenantId. */
        where, orderBy: [{ status: "desc" }, { receivedAt: "desc" }, { id: "asc" }], skip: q.page.skip, take: q.page.take,
        select: {
          id: true, partnerId: true, adapter: true, externalId: true, kind: true, occurredAt: true, receivedAt: true, amountCents: true, keys: true,
          reason: true, candidates: true, status: true, dismissedBy: true, dismissedAt: true, dismissNote: true,
        },
      }),
      prisma.partnerSaleAttribution.count({ /* tenant-scope: `where` carries the caller's tenantId. */ where }),
    ]);
    const page: PageInfo = { page: q.page.page, size: q.page.size, total, pages: Math.max(1, Math.ceil(total / q.page.size)) };
    const who = await peopleWords(tenantId, rows.map((r) => r.dismissedBy));
    return {
      ...base,
      unmatched: rows.map((r) => ({
        id: r.id, source: source(r), reference: r.externalId, reason: r.reason!, candidates: r.candidates, amountCents: signed(r.kind, r.amountCents),
        receivedAt: r.receivedAt.toISOString(), kind: r.kind, occurredAt: r.occurredAt.toISOString(),
        /* Which keys it carried, never their values: a reward token is a fan's code. */
        keysGiven: Object.keys((r.keys ?? {}) as Record<string, string>).sort(),
        dismissed: r.status === "dismissed" ? { by: who(r.dismissedBy), at: r.dismissedAt!.toISOString(), reason: r.dismissNote } : null,
      })),
      page,
    };
  }

  /* Only partner sales are events here; the other two classes are the tiles' figures. */
  const partnerClass = !q.class || q.class === "VERIFIED_TRANSACTION" || q.class === "MODELLED";
  const rows = partnerClass ? await prisma.partnerSaleAttribution.findMany({
    where: { tenantId, status: "matched", ...inCampaign, ...(q.class ? { class: q.class } : {}) },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }], skip: q.page.skip, take: q.page.take,
    select: {
      id: true, partnerId: true, adapter: true, kind: true, class: true, method: true, matchKey: true, windowDays: true, confidence: true,
      modelVersion: true, amountCents: true, occurredAt: true, campaignId: true, athleteId: true,
    },
  }) : [];
  const total = partnerClass ? matchedCount : 0;
  const [campaigns, athletes] = await Promise.all([
    prisma.campaign.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.campaignId!))] } }, select: { id: true, name: true } }),
    prisma.athlete.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.athleteId).filter((a): a is string => !!a))] } }, select: { id: true, displayName: true } }),
  ]);
  const campaignOf = new Map(campaigns.map((c) => [c.id, c]));
  const athleteOf = new Map(athletes.map((a) => [a.id, { id: a.id, name: a.displayName }]));
  const page: PageInfo = { page: q.page.page, size: q.page.size, total, pages: Math.max(1, Math.ceil(total / q.page.size)) };
  return {
    ...base,
    events: rows.map((r) => ({
      id: r.id, source: source(r), class: r.class as AttributionClass, method: r.method as "deterministic" | "probabilistic",
      matchKey: r.matchKey as "token" | "order_id" | "click_id" | null, windowDays: r.windowDays, confidence: r.confidence!, modelVersion: r.modelVersion,
      amountCents: signed(r.kind, r.amountCents), occurredAt: r.occurredAt.toISOString(), kind: r.kind,
      campaign: campaignOf.get(r.campaignId!) ?? null, athlete: r.athleteId ? athleteOf.get(r.athleteId) ?? null : null,
    })),
    page,
  };
}

/** POST /intelligence/attribution/unmatched/:id/dismiss { reason } — off the open queue, still on the list; audited. */
export async function dismissUnmatched(actor: Actor, id: string, input: { reason: string }, now = new Date()) {
  assertTenantWide(actor, "attribution", "write");
  await assertFeature(prisma, actor.tenantId, "attribution");
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new AttributionInputError("Say why it is dismissed (10 to 500 characters).");
  return prisma.$transaction(async (tx) => {
    const row = await tx.partnerSaleAttribution.findFirst({ where: { tenantId: actor.tenantId, id }, select: { id: true, reason: true, status: true } });
    if (!row) throw new AttributionNotFoundError();
    /* A decision stands: dismissed is final, and a sale the nightly retry matched meanwhile has left the queue — 409, not "no such sale". */
    if (row.status === "dismissed") throw new AttributionDecidedError("Already dismissed; the record stands.");
    if (row.status !== "unmatched") throw new AttributionDecidedError("This sale was matched meanwhile and is no longer in the queue.");
    /* Guarded by status: a sale the nightly retry matched meanwhile is not dismissed. */
    const n = await tx.partnerSaleAttribution.updateMany({
      where: { tenantId: actor.tenantId, id, status: "unmatched" },
      data: { status: "dismissed", dismissedBy: actor.userId, dismissedAt: now, dismissNote: reason },
    });
    /* Lost a race: another person dismissed it, or the nightly retry matched it, between the read and the write — the record stands (409, not 404). */
    if (!n.count) throw new AttributionDecidedError("Already decided meanwhile; the record stands.");
    await audit(tx, actor, AUDIT_ACTIONS.attribution.dismiss, "PartnerSaleAttribution", id, { before: { status: "unmatched", reason: row.reason }, after: { status: "dismissed", note: reason } });
    return { id, status: "dismissed" as const, dismissedAt: now.toISOString() };
  });
}

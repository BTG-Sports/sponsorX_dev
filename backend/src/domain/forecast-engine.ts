/**
 * The delivery forecast — 3S4-DATA-01, 3S4-BE-01, 3S4-BE-02
 * (documentation/SponsorX-Forecasting.md). The rules are forecast-rules.ts;
 * this file gathers the facts, stores what was made, raises alerts and
 * answers the forecast dashboard (3S4-FE-01, /admin/intelligence/forecasts).
 *
 * NIGHTLY, after the fact check (the worker): for every ACTIVE campaign in
 * its flight, the day's pacing (and any day missing since the start), then
 * the day's forecast — kept, one per campaign per day, so the model can be
 * judged later — then the alert move. A tenant whose fact check failed
 * forecasts nothing that night.
 *
 * DELIVERY IS VERIFIED DELIVERY. Impressions and engagements are the
 * ledger's verified labels (API and manual); redemptions are REDEEM events;
 * deliverables are the ledger's verified deliverables. A self-reported
 * figure never evidences delivery against a promise (delivery-health.ts).
 *
 * WHO. BTG admins, campaign managers and Sales read; BTG admins and campaign
 * managers set a campaign's guarantee (`campaignForecast`, RBAC matrix §30).
 * Sponsors never see a forecast.
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide, can } from "../auth/scope";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { PageInfo, PageRequest } from "../lib/paging";
import type { AthleteFeatures } from "./feature-snapshots";
import {
  addDays, alertMove, daysInclusive, flight, FORECAST_MODEL_VERSION, forecastDeliverables, forecastFlow, GUARANTEE_METRICS, isoDay,
  projectionPath, recommendedActions, riskFactors, riskOf,
  type ChannelDelivery, type GuaranteeMetric, type PendingDeliverable, type Risk,
} from "./forecast-rules";
import { campaignMakeGoods } from "./makegood-engine";
import { appUrl, tell } from "./order-mail";

type Tx = Prisma.TransactionClient;
const BOOKED_ORDER_STATES = ["ACCEPTED", "ACTIVE", "COMPLETED"] as const;

export class ForecastNotFoundError extends Error {
  readonly status = 404;
  readonly code = "forecast_not_found";
  constructor() {
    super("No forecast for this campaign in this tenant (forecasts are made nightly for active campaigns).");
    this.name = "ForecastNotFoundError";
  }
}

export class GuaranteeError extends Error {
  readonly status = 422;
  readonly code = "guarantee";
  constructor(message: string) {
    super(message);
    this.name = "GuaranteeError";
  }
}

const day = (d: Date) => new Date(`${isoDay(d)}T00:00:00Z`);

type CampaignRow = { id: string; name: string; startDate: Date; endDate: Date; guaranteeMetric: string | null; guaranteeValue: number | null; sponsor: { name: string } };

/** Everything one campaign's forecast needs, read from the ledger and the app. */
async function factsFor(tenantId: string, c: CampaignRow, today: Date) {
  const deliverables = await prisma.deliverable.findMany({
    /* tenant-scope: explicit — this campaign's deliverables on its booked orders. */
    where: { tenantId, order: { campaignId: c.id, state: { in: [...BOOKED_ORDER_STATES] } } },
    select: { id: true, dueDate: true, state: true, order: { select: { athleteId: true } } },
  });
  const metric = (GUARANTEE_METRICS as readonly string[]).includes(c.guaranteeMetric ?? "") && c.guaranteeValue !== null
    ? (c.guaranteeMetric as GuaranteeMetric) : "deliverables";
  const guarantee = metric === "deliverables" && c.guaranteeMetric !== "deliverables" ? deliverables.length : c.guaranteeValue ?? deliverables.length;

  /* Verified delivery per day of the flight, and per channel. */
  const rows = await prisma.$queryRawUnsafe<Array<{ day: Date; channel: string; api: bigint; manual: bigint; eapi: bigint; emanual: bigint; verified: bigint; published: bigint }>>(
    /* tenant-scope: explicit — this campaign's daily summaries. */
    `SELECT day, channel, sum("viewsVerifiedApi") AS api, sum("viewsVerifiedManual") AS manual,
            sum("engagementsVerifiedApi") AS eapi, sum("engagementsVerifiedManual") AS emanual,
            sum("deliverablesVerified") AS verified, sum("deliverablesPublished") AS published
       FROM "CampaignDaySummary" WHERE "tenantId" = $1 AND "campaignId" = $2 AND day BETWEEN $3::date AND $4::date
      GROUP BY day, channel`,
    tenantId, c.id, isoDay(c.startDate), isoDay(today),
  );
  const redeems = metric === "redemptions" ? await prisma.$queryRawUnsafe<Array<{ day: Date; n: bigint }>>(
    /* tenant-scope: explicit — this campaign's redemptions. */
    `SELECT date_trunc('day', e.at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
       FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId" JOIN "Reward" r ON r.id = t."rewardId"
      WHERE e."tenantId" = $1 AND r."campaignId" = $2 AND e.type = 'REDEEM' AND e.at >= $3::date AND e.at < ($4::date + 1)
      GROUP BY 1`,
    tenantId, c.id, isoDay(c.startDate), isoDay(today),
  ) : [];

  const f = flight(c.startDate, c.endDate, today);
  const daily = Array.from({ length: f.gone }, () => 0);
  const at = (d: Date) => daysInclusive(c.startDate, d) - 1;
  let api = 0;
  let manual = 0;
  const channels = new Map<string, ChannelDelivery>();
  for (const r of rows) {
    const i = at(r.day);
    const views = Number(r.api) + Number(r.manual);
    const engagements = Number(r.eapi) + Number(r.emanual);
    const v = metric === "impressions" ? views : metric === "engagements" ? engagements : metric === "deliverables" ? Number(r.verified) : 0;
    if (i >= 0 && i < daily.length) daily[i]! += v;
    api += metric === "engagements" ? Number(r.eapi) : Number(r.api);
    manual += metric === "engagements" ? Number(r.emanual) : Number(r.manual);
    const ch = channels.get(r.channel) ?? { channel: r.channel, published: 0, delivered: 0 };
    ch.published += Number(r.published);
    ch.delivered += metric === "engagements" ? engagements : views;
    channels.set(r.channel, ch);
  }
  for (const r of redeems) { const i = at(r.day); if (i >= 0 && i < daily.length) daily[i]! += Number(r.n); }
  const delivered = daily.reduce((t, x) => t + x, 0);
  const deliveredSource = metric === "impressions" || metric === "engagements" ? (manual > api ? "VERIFIED_MANUAL" : "VERIFIED_API") : "VERIFIED_SYSTEM";

  /* The deliverables still to verify, each with its athlete's on-time record (latest feature snapshot). */
  const pendingRows = deliverables.filter((d) => d.state !== "VERIFIED");
  const athleteIds = [...new Set(pendingRows.map((d) => d.order.athleteId))];
  const snaps = athleteIds.length ? await prisma.$queryRawUnsafe<Array<{ entityId: string; features: AthleteFeatures }>>(
    /* tenant-scope: explicit — this tenant's latest snapshots of the campaign's athletes. */
    `SELECT DISTINCT ON ("entityId") "entityId", features FROM "FeatureSnapshot"
      WHERE "tenantId" = $1 AND "entityType" = 'ATHLETE' AND "entityId" = ANY($2::text[]) AND day <= $3::date ORDER BY "entityId", day DESC`,
    tenantId, athleteIds, isoDay(today),
  ) : [];
  const onTime = new Map(snaps.map((s) => [s.entityId, s.features.delivery.dueByToday >= 3 ? s.features.delivery.onTimeRate : null]));
  const pending: PendingDeliverable[] = pendingRows.map((d) => ({ dueOn: d.dueDate, onTimeRate: onTime.get(d.order.athleteId) ?? null }));
  const overdue = pendingRows.filter((d) => day(d.dueDate) < day(today)).length;

  /* What the plan expected each day: the guarantee spread evenly for a flow; the schedule for deliverables. */
  const expectedBy = (d: Date) => metric === "deliverables"
    ? Math.min(guarantee, deliverables.filter((x) => day(x.dueDate) <= day(d)).length)
    : Math.round((guarantee * Math.min(f.total, Math.max(0, daysInclusive(c.startDate, d)))) / f.total);

  return { metric, guarantee, daily, delivered, deliveredSource, pending, overdue, channels: [...channels.values()], flight: f, expectedBy };
}

export type ForecastReport = { tenants: number; campaigns: number; forecasts: number; alertsRaised: number; emails: number; skipped: string[] };

/**
 * The nightly run, for every tenant or one. Pacing rows for every day of each
 * flight so far (missing ones filled), today's forecast (kept; a second run
 * the same day changes nothing), and the alert move.
 */
export async function runForecasts(db: PrismaClient, now: Date, opts: { tenantId?: string; skipTenants?: string[]; emails?: boolean } = {}): Promise<ForecastReport> {
  const skip = new Set(opts.skipTenants ?? []);
  const tenants = opts.tenantId ? [opts.tenantId] : (await db.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const today = day(now);
  const report: ForecastReport = { tenants: 0, campaigns: 0, forecasts: 0, alertsRaised: 0, emails: 0, skipped: tenants.filter((t) => skip.has(t)) };
  for (const tenantId of tenants.filter((t) => !skip.has(t))) {
    report.tenants += 1;
    const campaigns = await db.campaign.findMany({
      /* tenant-scope: explicit — this tenant's campaigns in flight. */
      where: { tenantId, state: "ACTIVE", startDate: { lte: addDays(today, 1) }, endDate: { gte: today } },
      select: { id: true, name: true, startDate: true, endDate: true, guaranteeMetric: true, guaranteeValue: true, sponsor: { select: { name: true } } },
      orderBy: { id: "asc" },
    });
    for (const c of campaigns) {
      if (day(c.startDate) > today) continue;
      report.campaigns += 1;
      const x = await factsFor(tenantId, c, today);

      /* 3S4-DATA-01 — pacing, every day of the flight so far. */
      let cumulative = 0;
      await db.campaignPacing.createMany({
        data: x.daily.map((v, i) => {
          cumulative += v;
          const d = addDays(c.startDate, i);
          return { tenantId, campaignId: c.id, day: d, metric: x.metric, guarantee: x.guarantee, delivered: cumulative, expected: x.expectedBy(d),
            elapsed: Math.round(((i + 1) / x.flight.total) * 10_000) / 10_000 };
        }),
        skipDuplicates: true,
      });

      /* 3S4-BE-01 — the forecast. */
      const p = x.metric === "deliverables"
        ? forecastDeliverables(x.guarantee, x.delivered, x.pending, today, c.endDate)
        : forecastFlow(x.guarantee, x.daily, x.flight.total);
      const risk = riskOf(p.probability);
      const situation = {
        metric: x.metric, guarantee: x.guarantee, delivered: x.delivered, expectedToday: x.expectedBy(today), projectedMid: p.mid,
        elapsed: x.flight.elapsed, daysLeft: x.flight.left, overdue: x.overdue, channels: x.channels, risk,
      };
      const made = await db.campaignForecast.createMany({
        data: [{
          tenantId, campaignId: c.id, day: today, modelVersion: FORECAST_MODEL_VERSION, metric: x.metric, guarantee: x.guarantee,
          delivered: x.delivered, deliveredSource: x.deliveredSource, elapsed: x.flight.elapsed, low: p.low, mid: p.mid, high: p.high,
          probability: p.probability, risk,
          riskFactors: riskFactors(situation) as unknown as Prisma.InputJsonValue,
          actions: recommendedActions(situation) as unknown as Prisma.InputJsonValue,
          projection: projectionPath(today, c.endDate, x.delivered, p) as unknown as Prisma.InputJsonValue,
        }],
        skipDuplicates: true,
      });
      if (!made.count) continue;
      report.forecasts += 1;

      /* 3S4-BE-02 — the alert move, once per new forecast. */
      const moved = await db.$transaction(async (tx) => alertFor(tx, tenantId, c, risk, p.probability, p.mid, x.guarantee, x.metric, situation, today, opts.emails ?? false));
      report.alertsRaised += moved.raised;
      report.emails += moved.emails;
    }
  }
  return report;
}

async function alertFor(
  tx: Tx, tenantId: string, c: CampaignRow, risk: Risk, probability: number, mid: number, guarantee: number, metric: GuaranteeMetric,
  situation: Parameters<typeof recommendedActions>[0], today: Date, emails: boolean,
): Promise<{ raised: number; emails: number }> {
  const open = await tx.campaignForecastAlert.findFirst({
    /* tenant-scope: explicit — this campaign's open alert. */
    where: { tenantId, campaignId: c.id, recoveredAt: null },
    orderBy: { raisedAt: "desc" },
    select: { id: true, risk: true, emailed: true, raisedAt: true },
  });
  const move = alertMove(open ? { id: open.id, risk: open.risk as "watch" | "at_risk", emailed: open.emailed } : null, risk, day(today) <= day(c.endDate), situation.elapsed);
  let sent = 0;
  const people = async () => tx.user.findMany({
    /* tenant-scope: explicit — the tenant's BTG admins and campaign managers. */
    where: { tenantId, disabledAt: null, OR: [{ roles: { has: "BTG_ADMIN" } }, { roles: { has: "CAMPAIGN_MGR" } }] },
    select: { email: true }, orderBy: { createdAt: "asc" },
  });
  const url = appUrl(`/admin/intelligence/forecasts/${c.id}`);
  if (move.close && open) {
    await tx.campaignForecastAlert.update({
      /* tenant-scope: the open alert just read, in this tenant. */
      where: { id: open.id }, data: { recoveredAt: new Date() }, select: { id: true },
    });
    if (move.emailRecovery && emails) {
      for (const u of await people()) {
        await tell(tx, { tenantId, email: u.email }, "forecast.recovered", open.id, { campaignName: c.name, since: isoDay(open.raisedAt), probability: `${Math.round(probability * 100)}%`, forecastUrl: url });
        sent += 1;
      }
    }
  }
  if (move.raise) {
    const alert = await tx.campaignForecastAlert.create({
      data: { tenantId, campaignId: c.id, risk: move.raise.risk, threshold: move.raise.threshold, probability, emailed: move.raise.email && emails },
      select: { id: true },
    });
    if (move.raise.email && emails) {
      const actions = recommendedActions(situation).map((a) => `• ${a.label}: ${a.detail}`).join("\n");
      for (const u of await people()) {
        await tell(tx, { tenantId, email: u.email }, "forecast.atRisk", alert.id, {
          campaignName: c.name, sponsorName: c.sponsor.name, probability: `${Math.round(probability * 100)}%`,
          guarantee: `${guarantee.toLocaleString("en-US")} ${metric}`, projected: `${mid.toLocaleString("en-US")} ${metric}`,
          endsOn: isoDay(c.endDate), actions, forecastUrl: url,
        });
        sent += 1;
      }
    }
  }
  return { raised: move.raise ? 1 : 0, emails: sent };
}

/* ───────────────────────────── reads ───────────────────────────── */

type LatestRow = {
  campaignId: string; campaignName: string; sponsorName: string; startDate: Date; endDate: Date; day: Date; modelVersion: string;
  metric: string; guarantee: number; delivered: number; deliveredSource: string; elapsed: number; low: number; mid: number; high: number;
  probability: number; risk: Risk; forecastAt: Date;
};

const RISK_RANK: Record<Risk, number> = { at_risk: 0, watch: 1, on_track: 2 };

/** The latest forecast of each ACTIVE campaign. */
async function latest(tenantId: string, campaignId?: string): Promise<LatestRow[]> {
  return prisma.$queryRawUnsafe<LatestRow[]>(
    /* tenant-scope: explicit — this tenant's active campaigns and their forecasts. */
    `SELECT DISTINCT ON (f."campaignId") f."campaignId", c.name AS "campaignName", s.name AS "sponsorName", c."startDate", c."endDate",
            f.day, f."modelVersion", f.metric, f.guarantee, f.delivered, f."deliveredSource", f.elapsed, f.low, f.mid, f.high,
            f.probability, f.risk, f."forecastAt"
       FROM "CampaignForecast" f
       JOIN "Campaign" c ON c.id = f."campaignId" AND c."tenantId" = f."tenantId"
       JOIN "Sponsor" s ON s.id = c."sponsorId"
      WHERE f."tenantId" = $1 AND c.state = 'ACTIVE' AND ($2::text IS NULL OR f."campaignId" = $2)
      ORDER BY f."campaignId", f.day DESC`,
    tenantId, campaignId ?? null,
  );
}

const row = (r: LatestRow) => ({
  campaignId: r.campaignId, campaignName: r.campaignName, sponsorName: r.sponsorName,
  startsAt: r.startDate.toISOString(), endsAt: r.endDate.toISOString(), elapsed: r.elapsed,
  guarantee: { metric: r.metric, value: r.guarantee }, delivered: r.delivered, deliveredSource: r.deliveredSource,
  projectedFinal: { low: r.low, mid: r.mid, high: r.high }, probabilityOfGuarantee: r.probability, risk: r.risk,
  /* Confidence: how much of the flight the forecast has seen (the observed rate is trusted fully at 30%). */
  stamp: { modelVersion: r.modelVersion, confidence: Math.round(Math.min(1, 0.4 + 2 * r.elapsed) * 100) / 100, computedAt: r.forecastAt.toISOString() },
});

/** GET /intelligence/forecasts?risk=all|at_risk|watch|on_track — every active campaign's latest forecast, riskiest first. */
export async function forecastList(actor: Actor, q: { risk?: Risk | "all"; page: PageRequest }) {
  assertTenantWide(actor, "campaignForecast", "read");
  const all = (await latest(actor.tenantId)).sort((a, b) =>
    RISK_RANK[a.risk] - RISK_RANK[b.risk] || a.probability - b.probability || a.endDate.getTime() - b.endDate.getTime() || a.campaignId.localeCompare(b.campaignId));
  const counts = { active: all.length, at_risk: 0, watch: 0, on_track: 0 };
  for (const r of all) counts[r.risk] += 1;
  const shown = q.risk && q.risk !== "all" ? all.filter((r) => r.risk === q.risk) : all;
  const page: PageInfo = { page: q.page.page, size: q.page.size, total: shown.length, pages: Math.max(1, Math.ceil(shown.length / q.page.size)) };
  return { counts, campaigns: shown.slice(q.page.skip, q.page.skip + q.page.take).map(row), page };
}

/** GET /intelligence/forecasts/:campaignId — the latest forecast with its pacing, projection, reasons, actions, alert and history. */
export async function forecastDetail(actor: Actor, campaignId: string) {
  assertTenantWide(actor, "campaignForecast", "read");
  const [r] = await latest(actor.tenantId, campaignId);
  if (!r) throw new ForecastNotFoundError();
  /* tenant-scope: every read below is this campaign in the caller's tenant (`where`). */
  const where = { tenantId: actor.tenantId, campaignId };
  const [f, pacing, history, alert] = await Promise.all([
    prisma.campaignForecast.findFirstOrThrow({ where: { ...where, day: r.day }, select: { riskFactors: true, actions: true, projection: true } }),
    prisma.campaignPacing.findMany({ where: { ...where, day: { lte: r.day } }, orderBy: { day: "asc" }, select: { day: true, delivered: true, expected: true } }),
    prisma.campaignForecast.findMany({ where: { ...where }, orderBy: { day: "desc" }, select: { forecastAt: true, mid: true, probability: true, modelVersion: true } }),
    prisma.campaignForecastAlert.findFirst({ where: { ...where, recoveredAt: null }, orderBy: { raisedAt: "desc" }, select: { raisedAt: true, risk: true, threshold: true } }),
  ]);
  return {
    ...row(r),
    pacing: pacing.map((p) => ({ date: isoDay(p.day), delivered: p.delivered, expected: p.expected })),
    projection: f.projection,
    riskFactors: f.riskFactors,
    actions: f.actions,
    alert: alert ? { raisedAt: alert.raisedAt.toISOString(), risk: alert.risk, threshold: alert.threshold } : null,
    history: history.map((h) => ({ forecastAt: h.forecastAt.toISOString(), projectedMid: h.mid, probability: h.probability, modelVersion: h.modelVersion })),
    /* 3S5 — the campaign's open and approved make-goods, for those who may see them (not Sales). */
    ...(can(actor, "makeGood", "read") ? { makeGoods: await campaignMakeGoods(actor.tenantId, campaignId) } : {}),
  };
}

/** PUT /intelligence/forecasts/:campaignId/guarantee — BTG sets (or, with no metric, clears) what the campaign is promised. */
export async function setGuarantee(actor: Actor, campaignId: string, input: { metric: GuaranteeMetric | null; value?: number | null }) {
  assertTenantWide(actor, "campaignForecast", "write");
  const c = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: actor.tenantId }, select: { id: true, guaranteeMetric: true, guaranteeValue: true } });
  if (!c) throw new ForecastNotFoundError();
  if (input.metric !== null && (!input.value || input.value < 1)) throw new GuaranteeError("A guarantee needs a value of at least 1.");
  const after = input.metric === null ? { guaranteeMetric: null, guaranteeValue: null } : { guaranteeMetric: input.metric, guaranteeValue: input.value! };
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      /* tenant-scope: the campaign just found in the caller's tenant. */
      where: { id: c.id }, data: after, select: { id: true },
    });
    await audit(tx, actor, AUDIT_ACTIONS.campaign.guaranteeSet, "Campaign", c.id, { before: { guaranteeMetric: c.guaranteeMetric, guaranteeValue: c.guaranteeValue }, after });
  });
  return { campaignId: c.id, guarantee: after.guaranteeMetric ? { metric: after.guaranteeMetric, value: after.guaranteeValue } : null };
}

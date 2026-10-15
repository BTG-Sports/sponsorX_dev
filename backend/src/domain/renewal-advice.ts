/**
 * Renewal advice — shared by the sponsor's hub (3S7-BE-02) and the Zoho push
 * (3S7-INT-01), so the two never disagree. From each campaign's latest
 * forecast (3S4-BE-01): the share of the promise it is on course to deliver
 * (or delivered), advised at the forecast's thresholds (user, 2026-10-15):
 * RENEW at 80% or more, ADJUST at 50% or more, LET_END below.
 *
 * No global database client: the reads take theirs, so the worker's Zoho job
 * module can import this without loading the app's configuration.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { AT_RISK_BELOW, WATCH_BELOW } from "./forecast-rules";

type Db = PrismaClient | Prisma.TransactionClient;

export const RENEWAL_VERSION = "renewal-rules@1.0.0";
/** Renewal advice covers campaigns ending this many days ahead… */
export const RENEWAL_AHEAD_DAYS = 45;
/** …and those that ended this many days ago. */
export const RENEWAL_BEHIND_DAYS = 30;

const DAY_MS = 86_400_000;
const n = (x: number) => Math.round(x).toLocaleString("en-US");
const round2 = (x: number) => Math.round(x * 100) / 100;

export type RenewalAdvice = "RENEW" | "ADJUST" | "LET_END";

/** The renewal advice for a share of the promise delivered (user, 2026-10-15: the forecast's 80% / 50%). */
export function renewalOf(share: number): RenewalAdvice {
  return share >= WATCH_BELOW ? "RENEW" : share >= AT_RISK_BELOW ? "ADJUST" : "LET_END";
}

type RenewalCampaign = { id: string; name: string; state: string; endDate: Date };
type RenewalForecast = { campaignId: string; metric: string; guarantee: number; mid: number; elapsed: number; forecastAt: Date };

/**
 * The renewal advice for campaigns ending in the next RENEWAL_AHEAD_DAYS or
 * ended in the last RENEWAL_BEHIND_DAYS, from each one's latest forecast —
 * soonest ending first. Shared by the sponsor's hub and the Zoho push
 * (3S7-INT-01), so the two never disagree.
 */
export function buildRenewals(campaigns: readonly RenewalCampaign[], forecasts: readonly RenewalForecast[], redeemsBy: ReadonlyMap<string, number>, now: Date) {
  const forecastBy = new Map(forecasts.map((f) => [f.campaignId, f]));
  const lo = now.getTime() - RENEWAL_BEHIND_DAYS * DAY_MS;
  const hi = now.getTime() + RENEWAL_AHEAD_DAYS * DAY_MS;
  return campaigns
    .filter((c) => c.state !== "CANCELLED" && c.state !== "DRAFT" && c.endDate.getTime() >= lo && c.endDate.getTime() <= hi && forecastBy.has(c.id))
    .map((c) => {
      const f = forecastBy.get(c.id)!;
      const share = f.guarantee > 0 ? f.mid / f.guarantee : 0;
      const advice = renewalOf(share);
      const ended = c.endDate.getTime() < now.getTime();
      const reasons = [
        `${ended ? "Delivered" : "On course to deliver"} ${n(f.mid)} of the ${n(f.guarantee)} ${f.metric} promised (${Math.round(share * 100)}%).`,
        ...(redeemsBy.get(c.id) ? [`${n(redeemsBy.get(c.id)!)} fans redeemed your offer.`] : []),
        advice === "RENEW" ? "It delivered what was promised, so it is worth booking again."
          : advice === "ADJUST" ? "It fell short of the promise, so renew with a different format or partner."
            : "It fell well short of the promise.",
      ];
      return {
        campaignId: c.id, campaignName: c.name, endsAt: c.endDate.toISOString(), ended, renewalScore: round2(Math.min(1, share)), recommendation: advice, reasons,
        stamp: { modelVersion: RENEWAL_VERSION, confidence: round2(Math.min(1, 0.4 + 2 * f.elapsed)), computedAt: f.forecastAt.toISOString() },
      };
    })
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.campaignId.localeCompare(b.campaignId));
}

/** A sponsor's renewal advice, read from the database (all-time redemptions) — for the Zoho push. Takes its client, so the worker's job module loads no global one. */
export async function sponsorRenewals(db: Db, tenantId: string, sponsorId: string, now: Date) {
  const campaigns = await db.campaign.findMany({
    /* tenant-scope: explicit — this sponsor's campaigns in its tenant. */
    where: { tenantId, sponsorId, state: { notIn: ["DRAFT", "CANCELLED"] } },
    select: { id: true, name: true, state: true, endDate: true },
  });
  const ids = campaigns.map((c) => c.id);
  if (!ids.length) return [];
  const [forecasts, redeems] = await Promise.all([
    db.$queryRawUnsafe<RenewalForecast[]>(
      /* tenant-scope: explicit — the latest forecast of each of this sponsor's campaigns. */
      `SELECT DISTINCT ON ("campaignId") "campaignId", metric, guarantee, mid, elapsed, "forecastAt"
         FROM "CampaignForecast" WHERE "tenantId" = $1 AND "campaignId" = ANY($2::text[]) ORDER BY "campaignId", day DESC`,
      tenantId, ids,
    ),
    db.$queryRawUnsafe<Array<{ campaignId: string; n: bigint }>>(
      /* tenant-scope: explicit — redemptions of this sponsor's campaigns' rewards. */
      `SELECT r."campaignId", count(*) AS n FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId" JOIN "Reward" r ON r.id = t."rewardId"
        WHERE e."tenantId" = $1 AND r."campaignId" = ANY($2::text[]) AND e.type = 'REDEEM' GROUP BY 1`,
      tenantId, ids,
    ),
  ]);
  return buildRenewals(campaigns, forecasts, new Map(redeems.map((r) => [r.campaignId, Number(r.n)])), now);
}


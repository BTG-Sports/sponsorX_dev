/**
 * The public site's network numbers — P8-FE-09 (staging dry run, 2026-10-26).
 *
 * The home page's "Real Impact" card and the closing "The numbers" panel
 * printed fixture constants (148 athletes, 86 campaigns, $2.3M "attributed
 * fan value") on sponsorx.net, labelled as samples only in a hover tooltip.
 * Visitors read them as facts. Every figure a page shows must come from a
 * real read (stats-must-be-retrievable), so this is that read.
 *
 * FOUR COUNTS, EACH A ROW COUNT IN OUR OWN DATABASE — facts, not estimates:
 *   athletes            Athlete ACTIVE or FEATURED (the bookable roster, as
 *                       the match engine counts it)
 *   campaignsDelivered  Campaign COMPLETED
 *   postsVerified       Deliverable VERIFIED (checked by the platform or BTG)
 *   rewardsRedeemed     RewardEvent REDEEM (§16, a fan used the offer)
 * "Attributed fan value" is gone: no record holds a money figure that could
 * honestly carry that name.
 *
 * Pinned to the configured public tenant (BTG's own), like the public price
 * list, because a visitor has none. Counts only: no names, no ids, no money.
 */
import { prisma } from "../db/client";

export type PublicNetworkStats = {
  athletes: number;
  campaignsDelivered: number;
  postsVerified: number;
  rewardsRedeemed: number;
  /** When the counts were read. */
  readAt: string;
};

/** The bookable roster, as the match engine counts it (match-engine.ts BOOKABLE_STATES). */
const BOOKABLE_ATHLETE_STATES = ["ACTIVE", "FEATURED"] as const;

export async function readPublicNetworkStats(tenantId: string, now: Date = new Date()): Promise<PublicNetworkStats> {
  /* tenant-scope: public read, pinned to the configured public tenant. */
  const [athletes, campaignsDelivered, postsVerified, rewardsRedeemed] = await Promise.all([
    prisma.athlete.count({ where: { tenantId, state: { in: [...BOOKABLE_ATHLETE_STATES] } } }),
    prisma.campaign.count({ where: { tenantId, state: "COMPLETED" } }),
    prisma.deliverable.count({ where: { tenantId, state: "VERIFIED" } }),
    prisma.rewardEvent.count({ where: { tenantId, type: "REDEEM" } }),
  ]);
  return { athletes, campaignsDelivered, postsVerified, rewardsRedeemed, readAt: now.toISOString() };
}

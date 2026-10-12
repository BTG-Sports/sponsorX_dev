/**
 * "Your campaign is live" — 3S0-BE-02 (3S0-DATA-01 gap G1).
 *
 * The handler behind `notify.campaignLive`, which `launchCampaign` has queued
 * since P5-BE-04 with nothing to consume it. It turns one launch into the
 * emails, through `send()`, so the vendor call still happens in one place.
 *
 * RESOLVED AT SEND TIME. The job carries the campaign id only. A campaign
 * cancelled between its launch and the drain must not tell anyone it is live,
 * so the current state is read and anything but ACTIVE sends nothing.
 *
 * WHO IS TOLD:
 *   - the sponsor's admins — of the sponsor whose campaign it is, signed-in
 *     accounts that are not disabled;
 *   - every athlete with an ACTIVE order on it (the launch moved the accepted
 *     ones there), at their own login or, without one, the profile address;
 *   - and a minor's guardian while a guardian is in control — the same rule
 *     the offer emails use (`guardianControls`).
 * One email per address: the idempotency key is the campaign and the address,
 * so a retried job never sends twice.
 */
import { prisma } from "../db/client";
import { env } from "../config/env";
import { send } from "../lib/email";
import { guardianControls } from "./guardian-rules";

export type CampaignLiveOutcome = { queued: number } | { skipped: string };

type Recipient = { email: string; firstName: string; seat: "sponsor" | "athlete" | "guardian"; athleteFirstName?: string; url: string };

const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export async function notifyCampaignLive(campaignId: string): Promise<CampaignLiveOutcome> {
  const app = env.APP_URL.replace(/\/+$/, "");
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      /* tenant-scope: worker job — the campaign named by the job; its own tenantId scopes everything below. */
      where: { id: campaignId },
      select: {
        id: true, tenantId: true, name: true, state: true, sponsorId: true,
        sponsor: { select: { name: true } },
        orders: {
          where: { state: "ACTIVE" },
          select: {
            athlete: {
              select: {
                id: true, displayName: true, legalName: true, email: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
                comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
                guardian: { select: { legalName: true, email: true } },
              },
            },
          },
        },
      },
    });
    if (!campaign) return { skipped: "campaign no longer exists" };
    if (campaign.state !== "ACTIVE") return { skipped: `campaign is ${campaign.state}` };

    const recipients: Recipient[] = [];
    const admins = await tx.user.findMany({
      /* tenant-scope: explicit — the campaign's tenant and its own sponsor. */
      where: { tenantId: campaign.tenantId, sponsorId: campaign.sponsorId, roles: { has: "SPONSOR_ADMIN" }, disabledAt: null },
      select: { email: true }, orderBy: { id: "asc" },
    });
    for (const u of admins) recipients.push({ email: u.email, firstName: "", seat: "sponsor", url: `${app}/sponsor/campaigns/${campaign.id}` });

    const athletes = new Map(campaign.orders.map((o) => [o.athlete.id, o.athlete]));
    for (const a of athletes.values()) {
      const login = await tx.user.findFirst({
        /* tenant-scope: explicit — the athlete's own login, in the campaign's tenant. */
        where: { tenantId: campaign.tenantId, athleteId: a.id, disabledAt: null }, select: { email: true }, orderBy: { id: "asc" },
      });
      const athleteFirst = firstOf(a.legalName || a.displayName) || a.displayName;
      const url = `${app}/athlete/deliverables`;
      const own = login?.email ?? a.email;
      if (own) recipients.push({ email: own, firstName: athleteFirst, seat: "athlete", url });
      if (a.guardian?.email && guardianControls(a)) {
        recipients.push({ email: a.guardian.email, firstName: firstOf(a.guardian.legalName), seat: "guardian", athleteFirstName: athleteFirst, url });
      }
    }

    const seen = new Set<string>();
    for (const r of recipients) {
      const to = r.email.toLowerCase();
      if (seen.has(to)) continue;
      seen.add(to);
      await send(tx, campaign.tenantId, {
        template: "campaign.live", to: r.email, idempotencyKey: `campaign.live:${campaign.id}:${to}`,
        data: {
          firstName: r.firstName, seat: r.seat, campaignName: campaign.name, sponsorName: campaign.sponsor.name, campaignUrl: r.url,
          ...(r.athleteFirstName ? { athleteFirstName: r.athleteFirstName } : {}),
        },
      });
    }
    return { queued: seen.size };
  });
}

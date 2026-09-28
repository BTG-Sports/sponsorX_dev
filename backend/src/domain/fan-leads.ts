/**
 * Fan leads — the ONE place a fan's address may be read for a sponsor
 * (2S6-BE-03, 2S6-INT-03; RBAC matrix §7.2 / §10 as amended 2026-09-28).
 *
 * Everywhere else the address is never selected (tests/fan-pii.test.ts
 * enforces that). Here it is — but only for claims where the fan ticked the
 * separate "the sponsor may contact me" box and has not withdrawn either
 * consent, and that condition is IN THE QUERY (`SPONSOR_CONTACTABLE`, fan-consent.ts), not in
 * a filter applied afterwards. A claim without the tick, or withdrawn, is not
 * fetched at all, so no later code can leak it.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { canReadField } from "../auth/fields";
import { SPONSOR_CONTACTABLE } from "./fan-consent";

/**
 * GET /campaigns/:id/leads — the fans who asked to hear from this sponsor.
 * Scoped like every reward-event read (the sponsor's own campaign, BTG's
 * tenant) and gated on the `rewardClaim.sponsorLead` field.
 */
export async function campaignLeads(actor: Actor, campaignId: string) {
  assertAllowed(actor, "rewardEvent", "read");
  if (!canReadField(actor.roles, "rewardClaim.sponsorLead")) throw new ForbiddenError("rewardEvent", "read");
  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: { id: true },
  });
  if (!campaign) throw new ForbiddenError("campaign", "read");
  const rows = await prisma.rewardEvent.findMany({
    where: {
      ...whereFor(actor, "rewardEvent", "read"),
      ...SPONSOR_CONTACTABLE,
      token: { is: { reward: { is: { campaignId } } } },
    },
    select: { id: true, fanEmail: true, sponsorContactAt: true, sponsorContactVersion: true },
    orderBy: { at: "desc" },
  });
  return rows.map((r) => ({ email: r.fanEmail!, consentedAt: r.sponsorContactAt, consentVersion: r.sponsorContactVersion }));
}

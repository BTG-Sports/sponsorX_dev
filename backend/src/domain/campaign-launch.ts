/**
 * Campaigns that launch on their start date — P4-BE-13 (BTG admin review,
 * item 20; programme owner, 2026-10-03).
 *
 * A campaign in APPROVAL launches on its own, as the system, from 00:00 UTC
 * on its startDate — at once when that day has already passed. It goes
 * through `launchIn`, launchCampaign's own body, so every check and every
 * side effect is the one BTG's launch has: the APPROVAL → ACTIVE rule,
 * ACCEPTED orders (and only those) going ACTIVE, the Zoho push and the
 * "campaign live" notification queued, the complete draft rewards going
 * live. BTG's manual launch still works at any time before that.
 *
 * WHAT APPROVAL WAITS FOR. Found, not assumed: nothing but the launch. The
 * code has no sponsor approval or signature at campaign level — APPROVAL
 * raises BTG's own CRM task ("Approve campaign") and emails BTG's campaign
 * managers, and the sponsor's only approvals are per deliverable. So the
 * start date is the whole rule.
 *
 * SAFETY. The sweep reads only APPROVAL campaigns, and each launch takes the
 * campaign's row lock and decides again under it (still APPROVAL, start day
 * reached), so a cancelled campaign, one BTG launched or moved back a moment
 * ago, and a second sweep all launch nothing. An ad-only campaign follows
 * the same rule. Platform-wide or `opts.tenantIds` (tests); each campaign in
 * its own transaction and its own books.
 */
import { prisma } from "../db/client";
import type { AuditActor } from "../db/audit";
import { lockCampaign } from "./campaign-stages";
import { launchIn } from "./campaign";
import { dueBefore, launchDay, launchDue } from "./auto-staffing-rules";
import { logError } from "../lib/redact";

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

/** Launch one campaign as the system if it is due; null when it was not. */
export async function launchIfDue(tenantId: string, campaignId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const state = await lockCampaign(tx, campaignId, tenantId);
    if (state !== "APPROVAL") return null;
    const c = await tx.campaign.findFirst({
      /* tenant-scope: explicit — the campaign locked above, in its own tenant. */
      where: { id: campaignId, tenantId }, select: { id: true, tenantId: true, startDate: true },
    });
    if (!c || !launchDue(c.startDate, now)) return null;
    const day = launchDay(c.startDate).toISOString().slice(0, 10);
    return launchIn(tx, SYSTEM(tenantId), { id: c.id, tenantId: c.tenantId }, state, now, {
      reason: launchDay(c.startDate).getTime() < launchDay(now).getTime()
        ? `Launched on its own: its start date (${day}) had already passed when it was ready.`
        : `Launched on its own on its start date (${day}).`,
    });
  });
}

/** The sweep (worker, every ten minutes). Idempotent. */
export async function sweepCampaignLaunches(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { checked: 0, launched: 0, failed: 0 };
  const books = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  let after: string | undefined;
  for (;;) {
    const batch = await prisma.campaign.findMany({
      /* tenant-scope: the system sweep — every tenant's (or opts.tenantIds') APPROVAL campaigns whose start day has come; each launched in its own books. */
      where: { ...books, state: "APPROVAL", startDate: { lt: dueBefore(now) }, ...(after ? { id: { gt: after } } : {}) },
      select: { id: true, tenantId: true },
      orderBy: { id: "asc" },
      take: 200,
    });
    if (batch.length === 0) break;
    after = batch[batch.length - 1]!.id;
    for (const c of batch) {
      out.checked++;
      try {
        if (await launchIfDue(c.tenantId, c.id, now)) out.launched++;
      } catch (error) {
        out.failed++;
        logError(`[campaign-launch] launching ${c.id} failed, will retry:`, error);
      }
    }
  }
  return out;
}

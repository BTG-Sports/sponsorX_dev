/**
 * Campaign stages that move by themselves, and rewards that follow the
 * campaign — P4-BE-09 and P6-BE-09 (BTG admin review, items 20 and 22).
 *
 * The rules are in campaign-stage-rules.ts; this is where they meet the
 * database. Three things live here:
 *
 *   - `applyStageMove` — the one body every campaign stage change runs
 *     through, manual or automatic: claim the row on the state it was read
 *     in, audit, and the side effects (CRM tasks, Zoho, the report render,
 *     the emails, the rewards). `transitionCampaign` uses it for BTG's moves.
 *   - `advanceCampaign` — the automatic move, called inside the transaction
 *     of the event that makes it true (an order or offer accepted, a
 *     deliverable verified, the final report rendered) and by the sweep.
 *   - `sweepCampaignStages` — the worker's safety net, every ten minutes.
 *
 * CONCURRENCY. Every stage change — BTG's transition and launch as well as
 * the automatic ones — takes the campaign's row lock first (`lockCampaign`,
 * SELECT … FOR UPDATE) and decides on the state read under it, then claims
 * the row on that state (`updateMany where {id, state: from}`). A manual move
 * and an automatic one therefore run one after the other: the second sees
 * the first's result, and either makes the next legal move from it or none.
 * Never both from the same state.
 *
 * THE SYSTEM ACTOR. An automatic move is audited with no actor (`userId:
 * null`), `automatic: true` and the reason in words — the same convention as
 * the marketplace sweeps. That is what the reads' `movedAutomatically` is
 * read from.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import { send } from "../lib/email";
import { env } from "../config/env";
import { canTransitionCampaign, IllegalCampaignTransitionError, isAdOnly, type CampaignShape, type CampaignState } from "./campaign-state";
import {
  automaticMove,
  nextStep,
  STAGE_AUDIT_ACTIONS,
  stageChangeOf,
  type Audience,
  type NextStep,
  type StageChange,
  type StageFacts,
} from "./campaign-stage-rules";
import { OPEN_INVITE_STATES } from "./invite-state";
import { notReadyToGoLive, type RewardState } from "./reward-state";
import { raiseSyncTask } from "./sync-tasks";

type Tx = Prisma.TransactionClient;

export const CAMPAIGN_AUDIT_ACTIONS: Record<CampaignState, `${string}.${string}`> = {
  DRAFT: "campaign.draft",
  STAFFING: "campaign.staff",
  APPROVAL: "campaign.submitForApproval",
  ACTIVE: "campaign.launch",
  REPORTING: "campaign.report",
  COMPLETED: "campaign.complete",
  CANCELLED: "campaign.cancel",
};

/** Signed orders: the contract exists (acceptOrder / an accepted offer). */
const SIGNED = ["ACCEPTED", "ACTIVE", "COMPLETED"] as const;
const SYSTEM_REASON_LAUNCH = "The campaign launched.";
const SYSTEM_REASON_CANCEL = "The campaign was cancelled.";

/** A campaign moved under another move's feet — the claim found it changed. */
export class CampaignStateConflictError extends Error {
  readonly status = 409;
  readonly code = "campaign_state_conflict";
  constructor(from: CampaignState, to: CampaignState) {
    super(`This campaign is no longer ${from}, so it can't move to ${to}. Reload it and look again.`);
    this.name = "CampaignStateConflictError";
  }
}

/** Take the campaign's row lock and read its state under it; null if absent. */
export async function lockCampaign(tx: Tx, campaignId: string, tenantId?: string): Promise<CampaignState | null> {
  const rows = tenantId
    ? await tx.$queryRaw<Array<{ state: CampaignState }>>`SELECT state::text AS state FROM "Campaign" WHERE id = ${campaignId} AND "tenantId" = ${tenantId} FOR UPDATE`
    : await tx.$queryRaw<Array<{ state: CampaignState }>>`SELECT state::text AS state FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
  return rows[0]?.state ?? null;
}

/** New staffing on a campaign whose staffing is settled. */
export class CampaignNotStaffingError extends Error {
  readonly status = 409;
  readonly code = "campaign_not_staffing";
  constructor(state: CampaignState) {
    super(
      `This campaign is ${state}, so it takes no new orders, offers or invitations. ` +
        (state === "APPROVAL" ? "Move it back to STAFFING to add athletes." : "Its staffing is finished."),
    );
    this.name = "CampaignNotStaffingError";
  }
}

/** The states in which a campaign may still be staffed: before approval,
 *  and while live (a replacement athlete). */
const STAFFABLE: readonly CampaignState[] = ["DRAFT", "STAFFING", "ACTIVE"];

/**
 * P4-BE-09 — creating an order, an offer or an invitation, or sending an
 * offer, takes the campaign's row lock first, as every stage change does, so
 * it cannot interleave with the automatic STAFFING → APPROVAL move: either it
 * commits first and the move sees it (and waits for its answer), or the move
 * commits first and this is refused, because the campaign is no longer
 * being staffed. The caller has loaded the campaign through its own scope.
 */
export async function lockCampaignForStaffing(tx: Tx, campaignId: string): Promise<CampaignState> {
  const state = await lockCampaign(tx, campaignId);
  if (!state) throw new Error(`Campaign ${campaignId} disappeared while it was being staffed.`);
  if (!STAFFABLE.includes(state)) throw new CampaignNotStaffingError(state);
  return state;
}

/* ------------------------------------------------------------------ facts */

export type StageRead = { facts: StageFacts; history: StageChange[] };

/**
 * The facts the rules need, for each campaign named. The ids must already be
 * scoped by the caller (whereFor, or the sweep's own tenant filter), and
 * every read below is keyed by them.
 */
export async function loadStageFacts(db: Tx, campaignIds: string[], now: Date): Promise<Map<string, StageRead>> {
  const out = new Map<string, StageRead>();
  if (campaignIds.length === 0) return out;
  const ids = { in: campaignIds };
  const [campaigns, orders, deliverables, offers, invites, audits, files] = await Promise.all([
    db.campaign.findMany({
      /* tenant-scope: ids the caller loaded through whereFor, or the sweep's tenant-filtered ids. */
      where: { id: ids },
      select: {
        id: true, state: true, _count: { select: { orders: true, adSlots: true } },
        /* The package's athlete range — fully staffed is its maximum. */
        brief: { select: { package: { select: { athleteCountMin: true, athleteCountMax: true } } } },
      },
    }),
    db.campaignOrder.findMany({
      /* tenant-scope: keyed by campaigns already scoped by the caller. */
      where: { campaignId: ids },
      select: { campaignId: true, state: true, athleteId: true, jobId: true },
    }),
    db.deliverable.findMany({
      /* tenant-scope: keyed by campaigns already scoped by the caller. */
      where: { order: { campaignId: ids, state: { in: [...SIGNED] } } },
      select: { state: true, order: { select: { campaignId: true } } },
    }),
    db.offer.groupBy({
      /* tenant-scope: keyed by campaigns already scoped by the caller. */
      by: ["campaignId"],
      where: { campaignId: ids, state: "SENT", expiresAt: { gt: now } },
      _count: { _all: true },
    }),
    db.campaignInvite.findMany({
      /* tenant-scope: keyed by campaigns already scoped by the caller. */
      where: {
        campaignId: ids,
        OR: [{ state: { in: [...OPEN_INVITE_STATES] }, expiresAt: { gt: now } }, { state: "ACCEPTED" }],
      },
      select: { campaignId: true, state: true, athleteId: true, jobId: true },
    }),
    db.auditLog.findMany({
      /* tenant-scope: the stage-change rows of campaigns already scoped by the caller. */
      where: { entity: "Campaign", entityId: ids, action: { in: [...STAGE_AUDIT_ACTIONS] } },
      select: { entityId: true, action: true, at: true, actorId: true, after: true },
      orderBy: [{ at: "desc" }, { id: "desc" }],
    }),
    db.reportFile.findMany({
      /* tenant-scope: keyed by campaigns already scoped by the caller. */
      where: { campaignId: ids },
      select: { campaignId: true, renderedAt: true },
      orderBy: { renderedAt: "desc" },
    }),
  ]);

  for (const c of campaigns) {
    const mine = orders.filter((o) => o.campaignId === c.id);
    const ordered = new Set(mine.map((o) => `${o.athleteId}|${o.jobId}`));
    const ds = deliverables.filter((d) => d.order.campaignId === c.id);
    const rows = audits.filter((a) => a.entityId === c.id);
    const enteredReporting = rows.find((a) => a.action === CAMPAIGN_AUDIT_ACTIONS.REPORTING)?.at ?? null;
    /* Only a file rendered once the campaign was in REPORTING is final. With
       no recorded entry (a row written straight into REPORTING, never moved
       there) there is no such moment, so nothing completes it on its own. */
    const latestFile = enteredReporting
      ? files.find((f) => f.campaignId === c.id && f.renderedAt >= enteredReporting)
      : undefined;
    const facts: StageFacts = {
      state: c.state as CampaignState,
      ordersAll: c._count.orders,
      ordersSigned: mine.filter((o) => (SIGNED as readonly string[]).includes(o.state)).length,
      athletesSigned: new Set(mine.filter((o) => (SIGNED as readonly string[]).includes(o.state)).map((o) => o.athleteId)).size,
      athleteRange: c.brief?.package ? { min: c.brief.package.athleteCountMin, max: c.brief.package.athleteCountMax } : null,
      ordersSent: mine.filter((o) => o.state === "SENT").length,
      ordersDraft: mine.filter((o) => o.state === "DRAFT").length,
      offersWaiting: offers.find((o) => o.campaignId === c.id)?._count._all ?? 0,
      invitesWaiting: invites.filter((i) => i.campaignId === c.id && i.state !== "ACCEPTED").length,
      invitesWithoutOrder: invites.filter((i) => i.campaignId === c.id && i.state === "ACCEPTED" && !ordered.has(`${i.athleteId}|${i.jobId}`)).length,
      adSlots: c._count.adSlots,
      deliverables: {
        total: ds.length,
        published: ds.filter((d) => d.state === "PUBLISHED").length,
        verified: ds.filter((d) => d.state === "VERIFIED").length,
      },
      reportingSince: enteredReporting,
      finalReportAt: latestFile?.renderedAt ?? null,
    };
    const history = rows.map(stageChangeOf).filter((s): s is StageChange => s !== null);
    out.set(c.id, { facts, history });
  }
  return out;
}

/** What the campaign reads add (P4-BE-09): the next step, and the latest
 *  stage change with whether it was made automatically. */
export type StageView = { nextStep: NextStep; stageChange: StageChange | null; stageHistory: StageChange[] };

export async function stageViews(campaignIds: string[], audience: Audience, now = new Date()): Promise<Map<string, StageView>> {
  const read = await loadStageFacts(prisma, campaignIds, now);
  return new Map(
    [...read].map(([id, r]) => [id, { nextStep: nextStep(r.facts, audience), stageChange: r.history[0] ?? null, stageHistory: r.history }]),
  );
}

/* ------------------------------------------------------------------ moves */

export type CampaignForMove = { id: string; tenantId: string; name: string; sponsorId: string; sponsor: { name: string } };
export const CAMPAIGN_FOR_MOVE = {
  id: true, tenantId: true, name: true, sponsorId: true, sponsor: { select: { name: true } },
} as const;

/**
 * One stage change and everything that goes with it, in the caller's
 * transaction. The caller holds the campaign's row lock and read `from`
 * under it. The move is asked of campaign-state.ts here as well, so no
 * caller can make one around the rules; the claim is the last word.
 *
 * ACTIVE never comes through here — `launchCampaign` is the only door.
 */
export async function applyStageMove(
  tx: Tx,
  actor: AuditActor,
  campaign: CampaignForMove,
  from: CampaignState,
  to: Exclude<CampaignState, "ACTIVE">,
  opts: { automatic?: { reason: string }; shape: CampaignShape },
): Promise<void> {
  if (!canTransitionCampaign(from, to, opts.shape)) throw new IllegalCampaignTransitionError(from, to);
  const adOnly = isAdOnly(opts.shape);
  const claimed = await tx.campaign.updateMany({
    /* tenant-scope: the campaign the caller loaded and locked; claimed on the state read under the lock. */
    where: { id: campaign.id, state: from },
    data: { state: to as Prisma.CampaignUpdateManyMutationInput["state"] },
  });
  if (claimed.count !== 1) throw new CampaignStateConflictError(from, to);

  await audit(tx, actor, CAMPAIGN_AUDIT_ACTIONS[to], "Campaign", campaign.id, {
    before: { state: from },
    after: { state: to, ...(opts.automatic ? { automatic: true, reason: opts.automatic.reason } : {}) },
  });

  /* §18, P8-INT-01 / P8-INT-06. Each is queued in this transaction. */
  if (to === "APPROVAL") {
    await raiseSyncTask(tx, actor, { kind: "APPROVAL", campaignId: campaign.id, subject: `Approve campaign: ${campaign.name}` });
    await tellManagersReady(tx, campaign, actor.userId);
  }
  if (to === "CANCELLED") {
    /* A cancelled campaign's Deal is Closed Lost — SponsorX asserts it. */
    await enqueue(tx, actor.tenantId, "zoho.pushDeal", { campaignId: campaign.id });
    /* P6-BE-09 — its live rewards stop taking new claims. */
    await pauseRewardsOnCancel(tx, campaign);
  }
  if (to === "REPORTING" && !adOnly) {
    /* P4-BE-09 — the final report is rendered on the worker; its render
       completes the campaign in the render's own transaction. */
    await enqueue(tx, actor.tenantId, "report.render", { campaignId: campaign.id, trigger: "FINAL", requestedBy: actor.userId });
  }
  if (to === "COMPLETED") {
    /* §18 row 9: campaign closure opens the renewal Deal, and the renewal
       conversation lands in the CRM as a task on it. */
    await enqueue(tx, actor.tenantId, "zoho.pushRenewal", { campaignId: campaign.id });
    if (opts.automatic) {
      /* Completed BY the final report's render: that file is the report the
         renewal signer is sent, and the sponsor is told it is ready now. */
      await tellSponsorFinalReport(tx, campaign);
    } else {
      /* 2S7-BE-02 — BTG completed it by hand: the report is rendered on the
         worker, and its render tells the sponsor (afterReportRendered). */
      await enqueue(tx, actor.tenantId, "report.render", { campaignId: campaign.id, trigger: "COMPLETED", requestedBy: actor.userId });
    }
    await raiseSyncTask(tx, actor, {
      kind: "RENEWAL",
      campaignId: campaign.id,
      subject: `Renewal conversation: ${campaign.sponsor.name}`,
      body: `${campaign.name} completed. Open the renewal.`,
    });
  }
}

/**
 * Make every automatic move the facts allow, as the system — P4-BE-09.
 *
 * Called inside the transaction of the event that made a move true, and by
 * the sweep. Locks the campaign first, so it waits for (or is waited for by)
 * BTG's own move, and reads the facts under that lock. Idempotent: a
 * campaign with nothing to do is left exactly as it was.
 */
export async function advanceCampaign(
  tx: Tx,
  tenantId: string,
  campaignId: string,
  now = new Date(),
): Promise<Array<{ from: CampaignState; to: CampaignState }>> {
  const moved: Array<{ from: CampaignState; to: CampaignState }> = [];
  if (!(await lockCampaign(tx, campaignId, tenantId))) return moved;
  /* At most one move per stage, and never past APPROVAL (launching is BTG's). */
  for (let i = 0; i < 3; i++) {
    const read = (await loadStageFacts(tx, [campaignId], now)).get(campaignId);
    if (!read) break;
    const { facts } = read;
    const move = automaticMove(facts);
    if (!move || move.to === "ACTIVE") break;
    const shape = { orders: facts.ordersAll, adSlots: facts.adSlots };
    if (!canTransitionCampaign(facts.state, move.to, shape)) break;
    const campaign = await tx.campaign.findFirstOrThrow({
      where: { id: campaignId, tenantId }, select: CAMPAIGN_FOR_MOVE,
    });
    await applyStageMove(tx, { userId: null, tenantId }, campaign, facts.state, move.to, {
      automatic: { reason: move.reason }, shape,
    });
    moved.push({ from: facts.state, to: move.to });
  }
  return moved;
}

/** The automatic move for the campaign an order belongs to — the hook the
 *  order, offer and deliverable events call. */
export async function advanceCampaignOfOrder(tx: Tx, orderId: string, now = new Date()) {
  const order = await tx.campaignOrder.findUnique({
    /* tenant-scope: the order the caller just moved, loaded through its own whereFor. */
    where: { id: orderId }, select: { campaignId: true, tenantId: true },
  });
  return order ? advanceCampaign(tx, order.tenantId, order.campaignId, now) : [];
}

/**
 * After a report file is written (worker/jobs/render-report.mts), in the
 * same transaction: a campaign in REPORTING now has its final report and
 * completes; one BTG completed by hand has the report it was waiting for,
 * and the sponsor is told.
 */
export async function afterReportRendered(
  tx: Tx,
  job: { tenantId: string; campaignId: string; trigger: string },
  now = new Date(),
): Promise<Array<{ from: CampaignState; to: CampaignState }>> {
  const state = await lockCampaign(tx, job.campaignId, job.tenantId);
  if (state === "REPORTING") return advanceCampaign(tx, job.tenantId, job.campaignId, now);
  if (state === "COMPLETED" && job.trigger === "COMPLETED") {
    /* Only the first hand-off file tells the sponsor: counted under the row
       lock, so a retried or doubled render job queues no second message. */
    const handoffs = await tx.reportFile.count({ where: { tenantId: job.tenantId, campaignId: job.campaignId, trigger: "COMPLETED" } });
    if (handoffs === 1) {
      const campaign = await tx.campaign.findFirstOrThrow({ where: { id: job.campaignId, tenantId: job.tenantId }, select: CAMPAIGN_FOR_MOVE });
      await tellSponsorFinalReport(tx, campaign);
    }
  }
  return [];
}

/**
 * The safety net (worker, every ten minutes): every campaign that could move
 * on its own, checked, and moved if an event was missed. Platform-wide, or
 * only `opts.tenantIds` (tests). Each campaign in its own transaction, so one
 * failure is retried next run and stops nothing else.
 */
export async function sweepCampaignStages(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { checked: 0, moved: 0, failed: 0 };
  const books = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  let after: string | undefined;
  for (;;) {
    const batch = await prisma.campaign.findMany({
      /* tenant-scope: the system sweep — every tenant's (or opts.tenantIds') campaigns in a stage that can move on its own; each is moved in its own books. */
      where: { ...books, state: { in: ["STAFFING", "ACTIVE", "REPORTING"] }, ...(after ? { id: { gt: after } } : {}) },
      select: { id: true, tenantId: true },
      orderBy: { id: "asc" },
      take: 200,
    });
    if (batch.length === 0) break;
    after = batch[batch.length - 1]!.id;
    out.checked += batch.length;
    /* A cheap look first, outside any lock; only a campaign with a move to
       make opens a transaction, which decides again under the lock. */
    const read = await loadStageFacts(prisma, batch.map((c) => c.id), now);
    for (const c of batch) {
      const r = read.get(c.id);
      if (!r || !automaticMove(r.facts)) continue;
      try {
        const moved = await prisma.$transaction((tx) => advanceCampaign(tx, c.tenantId, c.id, now));
        out.moved += moved.length;
      } catch (error) {
        out.failed++;
        console.error(`[campaign-stages] advancing ${c.id} failed, will retry:`, error);
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------- rewards */

export type RewardsOnLaunch = { activated: number; leftInDraft: Array<{ id: string; offerText: string; reason: string }> };

/**
 * P6-BE-09 — when BTG launches the campaign, its complete DRAFT rewards go
 * live, as the system; an incomplete one stays a draft and the launch says
 * why. In the launch's transaction.
 */
export async function activateRewardsOnLaunch(tx: Tx, campaign: { id: string; tenantId: string }, now: Date): Promise<RewardsOnLaunch> {
  const drafts = await tx.reward.findMany({
    where: { campaignId: campaign.id, tenantId: campaign.tenantId, state: "DRAFT" },
    select: { id: true, state: true, expiresAt: true, offerText: true, terms: true },
    orderBy: { id: "asc" },
  });
  const out: RewardsOnLaunch = { activated: 0, leftInDraft: [] };
  for (const r of drafts) {
    const why = notReadyToGoLive({ ...r, state: r.state as RewardState }, now);
    if (why) {
      out.leftInDraft.push({ id: r.id, offerText: r.offerText, reason: why });
      continue;
    }
    const moved = await tx.reward.updateMany({
      /* tenant-scope: a draft of this campaign, loaded above with its tenant; claimed while still DRAFT. */
      where: { id: r.id, state: "DRAFT" }, data: { state: "ACTIVE" },
    });
    if (!moved.count) continue;
    await audit(tx, { userId: null, tenantId: campaign.tenantId }, AUDIT_ACTIONS.reward.transition, "Reward", r.id, {
      before: { state: "DRAFT" }, after: { state: "ACTIVE", automatic: true, reason: SYSTEM_REASON_LAUNCH },
    });
    out.activated++;
  }
  return out;
}

/** P6-BE-09 — a cancelled campaign's live rewards pause, as the system.
 *  Tokens fans hold stay valid records; nothing new can be claimed. */
async function pauseRewardsOnCancel(tx: Tx, campaign: { id: string; tenantId: string }): Promise<number> {
  const live = await tx.reward.findMany({
    where: { campaignId: campaign.id, tenantId: campaign.tenantId, state: "ACTIVE" }, select: { id: true },
  });
  let paused = 0;
  for (const r of live) {
    const moved = await tx.reward.updateMany({
      /* tenant-scope: a live reward of this campaign, loaded above with its tenant; claimed while still ACTIVE. */
      where: { id: r.id, state: "ACTIVE" }, data: { state: "PAUSED" },
    });
    if (!moved.count) continue;
    await audit(tx, { userId: null, tenantId: campaign.tenantId }, AUDIT_ACTIONS.reward.transition, "Reward", r.id, {
      before: { state: "ACTIVE" }, after: { state: "PAUSED", automatic: true, reason: SYSTEM_REASON_CANCEL },
    });
    paused++;
  }
  return paused;
}

/* ----------------------------------------------------------------- emails */

const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;

/**
 * "Ready for you to launch" — to the tenant's campaign managers (BTG's
 * admins when it has none), except whoever made the move. Keyed on the
 * campaign, which time it reached APPROVAL, and the person: a retry sends
 * nothing new, a second trip through APPROVAL is a new message.
 */
async function tellManagersReady(tx: Tx, campaign: CampaignForMove, movedBy: string | null) {
  const occurrence = await tx.auditLog.count({
    where: { tenantId: campaign.tenantId, entity: "Campaign", entityId: campaign.id, action: CAMPAIGN_AUDIT_ACTIONS.APPROVAL },
  });
  const active = { tenantId: campaign.tenantId, disabledAt: null };
  let staff = await tx.user.findMany({
    /* tenant-scope: explicit — `active` is the campaign's own tenant. */
    where: { ...active, roles: { has: "CAMPAIGN_MGR" } }, select: { id: true, email: true }, orderBy: { id: "asc" },
  });
  if (!staff.length) {
    staff = await tx.user.findMany({
      /* tenant-scope: explicit — `active` is the campaign's own tenant. */
      where: { ...active, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true }, orderBy: { id: "asc" },
    });
  }
  for (const u of staff) {
    if (u.id === movedBy) continue;
    await send(tx, campaign.tenantId, {
      template: "campaign.readyToLaunch",
      to: u.email,
      idempotencyKey: `campaign.readyToLaunch:${campaign.id}:${occurrence}:${u.id}`,
      data: { campaignName: campaign.name, sponsorName: campaign.sponsor.name, campaignUrl: appUrl(`/admin/campaigns/${campaign.id}`) },
    });
  }
}

/**
 * "Your final report is ready" — to the sponsor's admins (the primary
 * contact when the sponsor has no login yet). COMPLETED is terminal, so the
 * key is the campaign and the address: sent once, whichever path completed it.
 */
async function tellSponsorFinalReport(tx: Tx, campaign: CampaignForMove) {
  const users = await tx.user.findMany({
    where: { tenantId: campaign.tenantId, sponsorId: campaign.sponsorId, roles: { has: "SPONSOR_ADMIN" }, disabledAt: null },
    select: { email: true }, orderBy: { createdAt: "asc" },
  });
  let to = users.map((u) => u.email);
  if (!to.length) {
    const contact = await tx.sponsorContact.findFirst({
      where: { tenantId: campaign.tenantId, sponsorId: campaign.sponsorId, isPrimary: true }, select: { email: true },
    });
    to = contact ? [contact.email] : [];
  }
  const seen = new Set<string>();
  for (const email of to) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await send(tx, campaign.tenantId, {
      template: "campaign.finalReportReady",
      to: email,
      idempotencyKey: `campaign.finalReportReady:${campaign.id}:${key}`,
      data: { campaignName: campaign.name, sponsorName: campaign.sponsor.name, reportUrl: appUrl(`/sponsor/campaigns/${campaign.id}/report`) },
    });
  }
}

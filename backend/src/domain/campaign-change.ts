/**
 * P8-BE-12 — cancel and change a campaign, automatically.
 *
 * Rodney asked (2026-10-28) how a campaign is cancelled or changed. Before
 * this, BTG could move one to CANCELLED, which paused its rewards, released
 * its placements and closed the Zoho deal — but left every offer, invitation
 * and athlete order open and told nobody; and nothing could change a
 * campaign once set up. Here:
 *
 *   - the IMPACT, read before anything happens (`cancelImpact`,
 *     `changeImpact`): every affected product grouped with its outcome, and
 *     the money. The rules are campaign-change-rules.ts (pure);
 *   - a SAFE cancel or change APPLIES AT ONCE, in one transaction under the
 *     campaign's row lock (`applyCancelIn`, `applyChangeIn`);
 *   - an UNSAFE one is HELD for BTG (CampaignChangeRequest), and BTG's
 *     admins are emailed the reasons;
 *   - BTG APPROVES (the impact is read again under the lock, and applied) or
 *     DECLINES with a note; the requester is emailed either way.
 *
 * WHO: a sponsor's admin for their own campaigns, and BTG (admin, campaign
 * manager) — the `campaignChange` resource, the campaign found through the
 * caller's own campaign scope. BTG decides held requests.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { applyStageMove, CAMPAIGN_FOR_MOVE, lockCampaign, staffingRows } from "./campaign-stages";
import type { CampaignState } from "./campaign-state";
import { tallyStaffing } from "./auto-staffing-rules";
import { requiresGuardian } from "./guardian-rules";
import { btgAdmins, sellerRecipients, tell, appUrl } from "./order-mail";
import { releaseAdSlotsIn } from "./edition";
import { factOrderCancelled } from "./fact-writers";
import { PAUSING } from "./deal-pause";
import { campaignPaidCents } from "./refunds";
import {
  cancelImpact, changeImpact, orderStage, type CampaignFacts, type CampaignImpact, type ChangeProposal,
} from "./campaign-change-rules";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type ChangeOutcome = { outcome: "CANCELLED" | "CHANGED" | "HELD_FOR_BTG"; reasons: string[]; impact: CampaignImpact; requestId?: string };

export class CampaignChangeError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "CampaignChangeError";
    this.status = status;
  }
}

const OPEN_EDITION = new Set(["PLANNING", "SELLING"]);
const CAMPAIGN_SELECT = { ...CAMPAIGN_FOR_MOVE, state: true, startDate: true, endDate: true, budget: true } as const;
type CampaignRow = Prisma.CampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

/* ───────────────────────────── who, and which campaign ───────────────────────────── */

/** The caller may ask to cancel or change it, and it is one they reach (their own, as a sponsor). */
async function campaignOf(actor: Actor, campaignId: string, db: Db = prisma): Promise<CampaignRow> {
  assertAllowed(actor, "campaignChange", "write");
  const c = await db.campaign.findFirst({ where: { ...whereFor(actor, "campaign", "read"), id: campaignId }, select: CAMPAIGN_SELECT });
  if (!c) throw new ForbiddenError("campaign", "read");
  return c;
}

/* ───────────────────────────── the facts ───────────────────────────── */

async function factsOf(db: Db, c: CampaignRow, now: Date): Promise<CampaignFacts> {
  const where = { tenantId: c.tenantId, campaignId: c.id };
  const [orders, offers, invites, rewards, windows, slots, openDisputes, paidCents, refunded, held, rows] = await Promise.all([
    db.campaignOrder.findMany({
      /* tenant-scope: `where` is the campaign's own tenant and id. */
      where, select: {
        id: true, state: true, sellPrice: true, dueDate: true,
        athlete: { select: { displayName: true, birthDate: true, ageBand: true, majorityAge: true } },
        deliverables: { select: { state: true, dueDate: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.offer.findMany({ where: { ...where, state: { in: ["DRAFT", "SENT"] } }, select: { id: true, athlete: { select: { displayName: true } } }, orderBy: { id: "asc" } }),
    db.campaignInvite.findMany({ where: { ...where, state: { in: ["INVITED", "VIEWED"] } }, select: { id: true, athlete: { select: { displayName: true } } }, orderBy: { id: "asc" } }),
    db.reward.findMany({ where: { ...where, state: "ACTIVE" }, select: { id: true, offerText: true, expiresAt: true }, orderBy: { id: "asc" } }),
    db.placementWindow.findMany({ where: { ...where, state: "BOOKED" }, select: { id: true, slot: true, startsAt: true, endsAt: true }, orderBy: { startsAt: "asc" } }),
    db.adSlot.findMany({
      /* tenant-scope: `where` is the campaign's own tenant and id. */
      where, select: { id: true, slotCode: true, soldCents: true, edition: { select: { label: true, state: true, closeDate: true, publishTarget: true } } },
      orderBy: { slotCode: "asc" },
    }),
    db.dealDispute.count({ where: { tenantId: c.tenantId, order: { campaignId: c.id }, state: { in: [...PAUSING] } } }),
    campaignPaidCents(db as Tx, c.tenantId, c.id),
    db.refundDue.aggregate({ /* tenant-scope: `where` is the campaign's own tenant and id. */ where, _sum: { amountCents: true } }),
    db.campaignChangeRequest.count({ where: { ...where, state: "HELD" } }),
    staffingRows(db as Tx, [c.id]),
  ]);
  const staffing = rows.get(c.id);
  return {
    name: c.name, state: c.state, startDate: c.startDate, endDate: c.endDate, budget: c.budget,
    committed: staffing ? tallyStaffing(staffing, now).committed : 0,
    heldRequest: held > 0,
    orders: orders.map((o) => ({
      id: o.id, state: o.state, sellPrice: o.sellPrice, dueDate: o.dueDate, athleteName: o.athlete.displayName,
      minor: requiresGuardian(o.athlete), deliverables: o.deliverables,
    })),
    offers: offers.map((o) => ({ id: o.id, athleteName: o.athlete.displayName })),
    invites: invites.map((i) => ({ id: i.id, athleteName: i.athlete.displayName })),
    rewards: rewards.map((r) => ({ id: r.id, name: r.offerText, expiresAt: r.expiresAt })),
    windows: windows.map((w) => ({ id: w.id, name: `Placement ${w.slot}`, startsAt: w.startsAt, endsAt: w.endsAt })),
    slots: slots.map((s) => ({
      id: s.id, slotCode: s.slotCode, editionLabel: s.edition.label, soldCents: s.soldCents ?? 0, publishTarget: s.edition.publishTarget,
      open: OPEN_EDITION.has(s.edition.state) && s.edition.closeDate.getTime() > now.getTime(),
    })),
    openDisputes,
    paidCents,
    refundedCents: refunded._sum.amountCents ?? 0,
  };
}

/* ───────────────────────────── the impact reads ───────────────────────────── */

/** GET /campaigns/:id/cancel-impact */
export async function readCancelImpact(actor: Actor, campaignId: string, now = new Date()): Promise<CampaignImpact> {
  const c = await campaignOf(actor, campaignId);
  return cancelImpact(await factsOf(prisma, c, now));
}

/** POST /campaigns/:id/change-impact */
export async function readChangeImpact(actor: Actor, campaignId: string, p: ChangeProposal, now = new Date()): Promise<CampaignImpact> {
  const c = await campaignOf(actor, campaignId);
  return changeImpact(await factsOf(prisma, c, now), p);
}

/* ───────────────────────────── applying ───────────────────────────── */

/**
 * Cancel, under the campaign's lock. `approved`: BTG approved a held cancel,
 * so the work under way is cancelled too (its earnings held for Finance) and
 * any money paid is queued to refund. Delivered work is never touched.
 */
async function applyCancelIn(tx: Tx, by: AuditActor, c: CampaignRow, impact: CampaignImpact, reason: string, approved: boolean, now: Date) {
  const where = { tenantId: c.tenantId, campaignId: c.id };
  const facts = await factsOf(tx, c, now);
  const words = `The campaign ${c.name} was cancelled: ${reason}`;

  /* Offers and invitations not yet accepted: withdrawn. */
  const offers = await tx.offer.findMany({ where: { ...where, state: { in: ["DRAFT", "SENT"] } }, select: { id: true, state: true } });
  for (const o of offers) {
    const moved = await tx.offer.updateMany({
      /* tenant-scope: the campaign's own offers, in its tenant, still as read. */
      where: { id: o.id, tenantId: c.tenantId, state: o.state }, data: { state: "WITHDRAWN", respondedAt: now },
    });
    if (moved.count) await audit(tx, by, "offer.withdraw", "Offer", o.id, { before: { state: o.state }, after: { state: "WITHDRAWN", reason: words } });
  }
  const invites = await tx.campaignInvite.findMany({ where: { ...where, state: { in: ["INVITED", "VIEWED"] } }, select: { id: true, state: true } });
  for (const i of invites) {
    const moved = await tx.campaignInvite.updateMany({
      /* tenant-scope: the campaign's own invitations, in its tenant, still as read. */
      where: { id: i.id, tenantId: c.tenantId, state: i.state }, data: { state: "EXPIRED", respondedAt: now },
    });
    if (moved.count) await audit(tx, by, "invitation.withdrawnAtCancel", "CampaignInvite", i.id, { before: { state: i.state }, after: { state: "EXPIRED", reason: words } });
  }

  /* Orders: not started → cancelled (athlete emailed, earning voided); under way → cancelled on approval, earning held for Finance. */
  const orders = await tx.campaignOrder.findMany({
    where, select: { id: true, state: true, athleteId: true, athlete: { select: { tenantId: true } }, earning: { select: { id: true, state: true } } },
  });
  const stageOf = new Map(facts.orders.map((o) => [o.id, orderStage(o)]));
  for (const o of orders) {
    const stage = stageOf.get(o.id);
    const cancel = stage === "unaccepted" || stage === "notStarted" || (approved && stage === "inProgress");
    if (!cancel) continue;
    const moved = await tx.campaignOrder.updateMany({
      /* tenant-scope: the campaign's own orders, in its tenant, still as read. */
      where: { id: o.id, tenantId: c.tenantId, state: o.state }, data: { state: "CANCELLED" },
    });
    if (!moved.count) continue;
    await audit(tx, by, "order.cancel", "CampaignOrder", o.id, { before: { state: o.state }, after: { state: "CANCELLED", reason: words } });
    await factOrderCancelled(tx, o.id, now);
    if (o.earning?.state === "PENDING") {
      const to = stage === "inProgress" ? "HELD" : "VOIDED";
      await tx.earning.updateMany({
        /* tenant-scope: this order's own earning, still PENDING. */
        where: { id: o.earning.id, state: "PENDING" }, data: { state: to },
      });
      await audit(tx, by, to === "VOIDED" ? "earning.void" : "earning.hold", "Earning", o.earning.id, {
        before: { state: "PENDING" },
        after: { state: to, reason: to === "VOIDED" ? "Its order was cancelled before any work: nothing is owed." : "Its order was cancelled with work under way: Finance settles what was done." },
      });
    }
    if (o.state !== "DRAFT") {
      for (const r of await sellerRecipients(tx, { propertyId: null, propertyTenantId: null, athleteId: o.athleteId, athleteTenantId: o.athlete.tenantId })) {
        await tell(tx, r, "campaign.orderCancelled", `campaign.orderCancelled:${o.id}:${r.email}`, {
          firstName: r.firstName, campaignName: c.name, sponsorName: c.sponsor.name, portalUrl: appUrl(r.portal === "athlete" ? "/athlete" : "/property"),
        });
      }
    }
  }

  /* NEXT ads: released while their edition still sells; a closed edition's stay, and their money is in the refund. */
  const slots = await tx.adSlot.findMany({
    /* tenant-scope: `where` is the campaign's own tenant and id. */
    where, select: { id: true, slotCode: true, soldCents: true, editionId: true, edition: { select: { state: true, closeDate: true } } },
  });
  const open = slots.filter((s) => OPEN_EDITION.has(s.edition.state) && s.edition.closeDate.getTime() > now.getTime());
  for (const editionId of new Set(open.map((s) => s.editionId))) {
    await releaseAdSlotsIn(tx, by, {
      tenantId: c.tenantId, editionId, campaignId: c.id, sponsorId: c.sponsorId, now, reason: words,
      slots: open.filter((s) => s.editionId === editionId).map((s) => ({ id: s.id, slotCode: s.slotCode, soldCents: s.soldCents })),
    });
  }
  await tx.adSaleHold.updateMany({ where: { ...where, resolvedAt: null }, data: { resolvedAt: now, resolution: "CAMPAIGN_CANCELLED" } });

  /* Money paid that the delivered work doesn't cover: queued for Finance (a credit note in Zoho Books). Only ever on BTG's approval. */
  if (approved && impact.money.refundCents > 0) {
    const made = await tx.refundDue.createMany({
      data: [{ tenantId: c.tenantId, orderId: null, lineId: null, campaignId: c.id, editionId: null, sponsorId: c.sponsorId, amountCents: impact.money.refundCents, cause: "CAMPAIGN_CANCELLED", paidVia: "ZOHO_INVOICE" }],
      skipDuplicates: true,
    });
    if (made.count) {
      await audit(tx, by, "refundDue.create", "Campaign", c.id, {
        after: { amountCents: impact.money.refundCents, cause: "CAMPAIGN_CANCELLED", paidVia: "ZOHO_INVOICE", paidCents: facts.paidCents, owedCents: impact.money.owedCents },
      });
    }
  }

  /* The campaign itself: rewards paused, placements released, the Zoho deal Closed Lost (campaign-stages.ts). */
  const shape = await shapeOf(tx, c);
  await applyStageMove(tx, by, c, c.state as CampaignState, "CANCELLED", { shape });
  await audit(tx, by, "campaign.cancelSettled", "Campaign", c.id, { after: { reason, approved, groups: impact.affected.groups.map((g) => ({ key: g.key, count: g.count })), money: impact.money } });
}

async function shapeOf(tx: Tx, c: { id: string; tenantId: string }) {
  const n = await tx.campaign.findFirstOrThrow({
    where: { id: c.id, tenantId: c.tenantId },
    select: { _count: { select: { orders: true, adSlots: true, placementWindows: { where: { state: "BOOKED" } } } } },
  });
  return { orders: n._count.orders, adSlots: n._count.adSlots, placementWindows: n._count.placementWindows };
}

async function applyChangeIn(tx: Tx, by: AuditActor, c: CampaignRow, p: ChangeProposal, reason: string | null) {
  const data = {
    ...(p.name?.trim() ? { name: p.name.trim() } : {}),
    ...(p.startDate ? { startDate: p.startDate } : {}),
    ...(p.endDate ? { endDate: p.endDate } : {}),
    ...(p.budget !== undefined ? { budget: p.budget } : {}),
  };
  await tx.campaign.updateMany({
    /* tenant-scope: the campaign found through the caller's scope, locked. */
    where: { id: c.id, tenantId: c.tenantId }, data,
  });
  await audit(tx, by, "campaign.change", "Campaign", c.id, {
    before: { name: c.name, startDate: c.startDate.toISOString(), endDate: c.endDate.toISOString(), budget: c.budget },
    after: { ...data, ...(data.startDate ? { startDate: data.startDate.toISOString() } : {}), ...(data.endDate ? { endDate: data.endDate.toISOString() } : {}), reason },
  });
  /* The deal carries the name and the amount (zoho-sync.ts): pushed again, queued. */
  await enqueue(tx, c.tenantId, "zoho.pushDeal", { campaignId: c.id });
}

/* ───────────────────────────── holding for BTG ───────────────────────────── */

async function holdIn(
  tx: Tx, actor: Actor, c: CampaignRow, kind: "CANCEL" | "CHANGE", impact: CampaignImpact, reason: string | null, proposed: ChangeProposal | null,
) {
  const me = await tx.user.findFirst({ where: { id: actor.userId ?? "", tenantId: actor.tenantId }, select: { email: true } });
  const row = await tx.campaignChangeRequest.create({
    data: {
      tenantId: c.tenantId, campaignId: c.id, kind, reason, holdReasons: impact.holdReasons,
      proposed: proposed ? proposalJson(proposed) : undefined, impact: impact as unknown as Prisma.InputJsonValue,
      requestedById: actor.userId ?? "system", requestedByEmail: me?.email ?? null, requestedByRole: actor.roles[0] ?? null,
    },
    select: { id: true },
  });
  await audit(tx, actor, "campaignChange.hold", "CampaignChangeRequest", row.id, { after: { campaignId: c.id, kind, holdReasons: impact.holdReasons, reason } });
  for (const admin of await btgAdmins(tx, c.tenantId)) {
    await tell(tx, { tenantId: c.tenantId, email: admin.email }, "campaign.changeHeld", `campaign.changeHeld:${row.id}:${admin.id}`, {
      campaignName: c.name, sponsorName: c.sponsor.name, kind: kind === "CANCEL" ? "cancel" : "change",
      requestedBy: me?.email ?? "someone", reasons: impact.holdReasons.map((r) => `- ${r}`).join("\n"),
      reviewUrl: appUrl("/admin/campaign-requests"),
    });
  }
  return row.id;
}

const proposalJson = (p: ChangeProposal) => ({
  ...(p.name !== undefined ? { name: p.name } : {}),
  ...(p.startDate ? { startDate: p.startDate.toISOString().slice(0, 10) } : {}),
  ...(p.endDate ? { endDate: p.endDate.toISOString().slice(0, 10) } : {}),
  ...(p.budget !== undefined ? { budget: p.budget } : {}),
});
const proposalOf = (j: unknown): ChangeProposal => {
  const o = (j ?? {}) as { name?: string; startDate?: string; endDate?: string; budget?: number };
  return {
    ...(o.name !== undefined ? { name: o.name } : {}),
    ...(o.startDate ? { startDate: new Date(`${o.startDate}T00:00:00Z`) } : {}),
    ...(o.endDate ? { endDate: new Date(`${o.endDate}T00:00:00Z`) } : {}),
    ...(o.budget !== undefined ? { budget: o.budget } : {}),
  };
};

/* ───────────────────────────── the actions ───────────────────────────── */

/** POST /campaigns/:id/cancel — at once when safe; held for BTG otherwise. */
export async function cancelCampaign(actor: Actor, campaignId: string, reason: string, now = new Date()): Promise<ChangeOutcome> {
  await campaignOf(actor, campaignId);
  return prisma.$transaction(async (tx) => {
    const c = await campaignOf(actor, campaignId, tx);
    await lockCampaign(tx, c.id, c.tenantId);
    const locked = await campaignOf(actor, campaignId, tx);
    const impact = cancelImpact(await factsOf(tx, locked, now));
    if (!impact.allowed) throw new CampaignChangeError(impact.refusals[0]!);
    if (!impact.automatic) {
      const requestId = await holdIn(tx, actor, locked, "CANCEL", impact, reason, null);
      return { outcome: "HELD_FOR_BTG" as const, reasons: impact.holdReasons, impact, requestId };
    }
    await applyCancelIn(tx, actor, locked, impact, reason, false, now);
    return { outcome: "CANCELLED" as const, reasons: [], impact };
  }, { timeout: 30_000 });
}

/** POST /campaigns/:id/change — at once when safe; held for BTG otherwise. */
export async function changeCampaign(actor: Actor, campaignId: string, p: ChangeProposal & { reason?: string }, now = new Date()): Promise<ChangeOutcome> {
  await campaignOf(actor, campaignId);
  return prisma.$transaction(async (tx) => {
    const c = await campaignOf(actor, campaignId, tx);
    await lockCampaign(tx, c.id, c.tenantId);
    const locked = await campaignOf(actor, campaignId, tx);
    const impact = changeImpact(await factsOf(tx, locked, now), p);
    if (!impact.allowed) throw new CampaignChangeError(impact.refusals[0]!, 422);
    if (!impact.automatic) {
      const requestId = await holdIn(tx, actor, locked, "CHANGE", impact, p.reason?.trim() || null, p);
      return { outcome: "HELD_FOR_BTG" as const, reasons: impact.holdReasons, impact, requestId };
    }
    await applyChangeIn(tx, actor, locked, p, p.reason?.trim() || null);
    return { outcome: "CHANGED" as const, reasons: [], impact };
  }, { timeout: 30_000 });
}

/* ───────────────────────────── BTG's queue ───────────────────────────── */

const REQUEST_SELECT = {
  id: true, kind: true, state: true, reason: true, proposed: true, holdReasons: true, impact: true,
  requestedByEmail: true, requestedByRole: true, createdAt: true, decidedAt: true, decidedByEmail: true, decisionNote: true,
  campaign: { select: { id: true, name: true, sponsor: { select: { name: true } } } },
} as const;
type RequestRow = Prisma.CampaignChangeRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

function requestView(r: RequestRow) {
  return {
    id: r.id, kind: r.kind as "CANCEL" | "CHANGE", state: r.state,
    campaign: { id: r.campaign.id, name: r.campaign.name, sponsorName: r.campaign.sponsor.name },
    requestedBy: { email: r.requestedByEmail, role: r.requestedByRole },
    requestedAt: r.createdAt.toISOString(), reason: r.reason, proposed: r.proposed, holdReasons: r.holdReasons, impact: r.impact,
    decision: r.state === "HELD" ? null : {
      decision: r.state === "APPLIED" ? "APPROVE" : "DECLINE", note: r.decisionNote, at: r.decidedAt?.toISOString() ?? null, by: r.decidedByEmail,
    },
  };
}

/** GET /campaign-requests — held first (oldest on top), then the decided ones, newest first. */
export async function listCampaignRequests(actor: Actor, q: { state?: string } = {}) {
  assertTenantWide(actor, "campaignChange", "approve");
  const rows = await prisma.campaignChangeRequest.findMany({
    where: { tenantId: actor.tenantId, ...(q.state ? { state: q.state } : {}) }, select: REQUEST_SELECT,
    orderBy: { createdAt: "asc" }, take: 200,
  });
  const held = rows.filter((r) => r.state === "HELD");
  const done = rows.filter((r) => r.state !== "HELD").reverse();
  return { requests: [...held, ...done].map(requestView), counts: { held: held.length } };
}

/**
 * POST /campaign-requests/:id/decision — BTG approves (the impact is read
 * again under the lock and applied; refused if it can no longer apply) or
 * declines with a note. The requester is emailed the answer.
 */
export async function decideCampaignRequest(
  actor: Actor, id: string, d: { decision: "APPROVE" } | { decision: "DECLINE"; note: string }, now = new Date(),
) {
  assertTenantWide(actor, "campaignChange", "approve");
  if (d.decision === "DECLINE" && !d.note?.trim()) throw new CampaignChangeError("Declining needs a note — the requester reads it.", 422);
  return prisma.$transaction(async (tx) => {
    const req = await tx.campaignChangeRequest.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, state: true, kind: true, campaignId: true, reason: true, proposed: true, requestedByEmail: true } });
    if (!req) throw new ForbiddenError("campaignChange", "approve");
    if (req.state !== "HELD") throw new CampaignChangeError("This request has already been decided.");
    await lockCampaign(tx, req.campaignId, actor.tenantId);
    const c = await tx.campaign.findFirstOrThrow({ where: { id: req.campaignId, tenantId: actor.tenantId }, select: CAMPAIGN_SELECT });
    const me = await tx.user.findFirst({ where: { id: actor.userId ?? "", tenantId: actor.tenantId }, select: { email: true } });

    /* Claimed on HELD first, so two deciders never both act. */
    const claimed = await tx.campaignChangeRequest.updateMany({
      where: { id: req.id, tenantId: actor.tenantId, state: "HELD" },
      data: { state: d.decision === "APPROVE" ? "APPLIED" : "DECLINED", decidedAt: now, decidedById: actor.userId ?? "system", decidedByEmail: me?.email ?? null, decisionNote: d.decision === "DECLINE" ? d.note.trim() : null },
    });
    if (!claimed.count) throw new CampaignChangeError("This request has already been decided.");

    if (d.decision === "APPROVE") {
      /* Read again: what was true when it was asked may not be now. The hold is BTG's to lift; a refusal still stands. */
      const facts = await factsOf(tx, c, now);
      const impact = req.kind === "CANCEL" ? cancelImpact({ ...facts, heldRequest: false }) : changeImpact({ ...facts, heldRequest: false }, proposalOf(req.proposed));
      if (!impact.allowed) throw new CampaignChangeError(`It can't be applied now: ${impact.refusals[0]}`);
      if (req.kind === "CANCEL") await applyCancelIn(tx, actor, c, impact, req.reason ?? "approved by BTG", true, now);
      else await applyChangeIn(tx, actor, c, proposalOf(req.proposed), req.reason);
    }
    await audit(tx, actor, d.decision === "APPROVE" ? "campaignChange.approve" : "campaignChange.decline", "CampaignChangeRequest", req.id, {
      before: { state: "HELD" }, after: { state: d.decision === "APPROVE" ? "APPLIED" : "DECLINED", campaignId: req.campaignId, ...(d.decision === "DECLINE" ? { note: d.note.trim() } : {}) },
    });
    if (req.requestedByEmail) {
      await tell(tx, { tenantId: c.tenantId, email: req.requestedByEmail }, "campaign.changeDecided", `campaign.changeDecided:${req.id}`, {
        campaignName: c.name, kind: req.kind === "CANCEL" ? "cancel" : "change",
        decision: d.decision === "APPROVE" ? "approved — it has been applied" : "declined",
        note: d.decision === "DECLINE" ? d.note.trim() : "",
        campaignUrl: appUrl(`/sponsor/campaigns/${c.id}`),
      });
    }
    const row = await tx.campaignChangeRequest.findFirstOrThrow({ where: { id: req.id, tenantId: actor.tenantId }, select: REQUEST_SELECT });
    return { request: requestView(row) };
  }, { timeout: 30_000 });
}


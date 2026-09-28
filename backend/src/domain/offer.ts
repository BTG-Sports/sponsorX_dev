/**
 * The formal athlete offer — 2S2-BE-03.
 *
 * "Phase 2's offer is a commercial instrument, not an invitation: brief,
 * compensation, deliverables, usage rights, exclusivity period, disclosures.
 * Acceptance creates an immutable terms snapshot." Done when: "Accepting an
 * offer freezes commercial terms and schedules deliverables; later rate-card
 * edits do not alter it."
 *
 * DRAFT  — BTG writes it on a campaign in its tenant. The line must clear the
 *          margin floor and fit the campaign's budget, as a Phase 1 order must.
 * SENT   — the terms are hashed and fixed. From here Postgres refuses any
 *          change to them (prisma/sql/offer_terms_immutable.sql).
 * ACCEPTED — the athlete accepts the hash they were shown, with agreement
 *          evidence and the guardian gate, in ONE transaction that writes the
 *          terms snapshot, creates the CampaignOrder (already ACCEPTED), a
 *          scheduled Deliverable per line of the offer, and the PENDING
 *          earning. The order copies its figures from the offer, never from
 *          the rate card or the inventory item, so neither can move it later.
 * DECLINED / WITHDRAWN — the athlete says no, or BTG takes it back.
 *
 * Offers live in the campaign's tenant (as Phase 1 invitations do). Offers to
 * athletes in an outside team's tenant arrive with the marketplace order flow
 * (2S4).
 */
import { createHash } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { canReadField } from "../auth/fields";
import { acceptAgreementIn, type AcceptanceRequest } from "./agreement";
import { assertBudgetCarriesLine, assertLineClearsFloor } from "./margin-floor";
import { createEarningForOrder } from "./earning";
import { assertNoRestriction, writeExclusivity } from "./restrictions";
import { checkInventoryItem, UnavailableError } from "./availability";

export type OfferState = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
export type OfferDeliverable = { title: string; dueDate: Date };

export type OfferTerms = {
  brief: string;
  compensation: number;
  sellPrice: number;
  deliverables: OfferDeliverable[];
  usageRights: string;
  exclusivityDays?: number | null;
  disclosures: string[];
  expiresAt: Date;
  inventoryItemId?: string | null;
};

export class OfferError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "OfferError";
    this.status = status;
  }
}

const SELECT = {
  id: true, campaignId: true, athleteId: true, jobId: true, inventoryItemId: true, brief: true, compensation: true,
  sellPrice: true, deliverables: true, usageRights: true, exclusivityDays: true, disclosures: true, expiresAt: true,
  state: true, sentAt: true, respondedAt: true, termsHash: true, termsSnapshot: true, orderId: true, createdAt: true,
  campaign: { select: { name: true } },
} as const;
type Row = Prisma.OfferGetPayload<{ select: typeof SELECT }>;

const CAMPAIGN_TERMS = {
  startDate: true, endDate: true,
  sponsor: { select: { name: true, categories: true } },
  brief: { select: { categories: true } },
} as const;
type CampaignTerms = { startDate: Date; endDate: Date; sponsor: { name: string; categories: string[] }; brief: { categories: string[] } | null };

/** The sponsor's categories and the brief's — what a restriction is asked against. */
const categoriesOf = (c: CampaignTerms) => [...new Set([...c.sponsor.categories, ...(c.brief?.categories ?? [])])];

/**
 * A restricted category blocks the offer for the dates it covers — the
 * campaign's, stretched to the last deliverable — and an offer on an
 * inventory item is a purchase of it: the availability check applies, with
 * the athlete's pay as the price paid.
 */
async function assertCleared(
  tx: Prisma.TransactionClient, tenantId: string, athleteId: string, itemId: string | null, campaign: CampaignTerms,
  deliverables: Array<{ dueDate: Date }>, compensation: number, ignore?: { source: string; sourceId: string },
) {
  const dues = deliverables.map((d) => d.dueDate.getTime());
  const categories = categoriesOf(campaign);
  await assertNoRestriction(tx, {
    tenantId, athleteId, categories,
    startsOn: new Date(Math.min(campaign.startDate.getTime(), ...dues)), endsOn: new Date(Math.max(campaign.endDate.getTime(), ...dues)),
  });
  if (itemId) {
    const check = await checkInventoryItem(tx, itemId, tenantId, {
      quantity: 1, startsOn: new Date(Math.min(...dues)), endsOn: new Date(Math.max(...dues)), categories, unitPriceCents: compensation, ignore,
    });
    if (!check.ok) throw new UnavailableError(check.reasons);
  }
}

/** What the athlete accepts, in a canonical order — the thing that is hashed. */
export function canonicalTerms(o: {
  campaignId: string; athleteId: string; jobId: string; inventoryItemId: string | null; brief: string; compensation: number;
  deliverables: Array<{ title: string; dueDate: Date | string }>; usageRights: string; exclusivityDays: number | null;
  disclosures: string[]; expiresAt: Date | string;
}) {
  return {
    campaignId: o.campaignId, athleteId: o.athleteId, jobId: o.jobId, inventoryItemId: o.inventoryItemId,
    brief: o.brief, compensation: o.compensation,
    deliverables: o.deliverables.map((d) => ({ title: d.title, dueDate: new Date(d.dueDate).toISOString() })),
    usageRights: o.usageRights, exclusivityDays: o.exclusivityDays, disclosures: [...o.disclosures],
    expiresAt: new Date(o.expiresAt).toISOString(),
  };
}

export function termsHashOf(terms: ReturnType<typeof canonicalTerms>): string {
  return createHash("sha256").update(JSON.stringify(terms)).digest("hex");
}

function view(actor: Actor, r: Row) {
  const { campaign, ...rest } = r;
  const out: Record<string, unknown> = { ...rest, campaignName: campaign.name };
  /* The margin is protected from the athlete side (FIELD_DENIALS). */
  if (!canReadField(actor.roles, "campaignOrder.sellPrice")) delete out.sellPrice;
  return out;
}

function assertTerms(t: OfferTerms, now = new Date()) {
  if (!t.brief.trim()) throw new OfferError("An offer needs a brief.");
  if (!Number.isInteger(t.compensation) || t.compensation < 1) throw new OfferError("compensation: whole cents, above zero.");
  if (!t.deliverables.length || t.deliverables.length > 20) throw new OfferError("An offer schedules between 1 and 20 deliverables.");
  for (const d of t.deliverables) {
    if (!d.title.trim()) throw new OfferError("Every deliverable needs a title.");
    if (d.dueDate <= now) throw new OfferError(`Deliverable "${d.title}" is due in the past.`);
  }
  if (t.expiresAt <= now) throw new OfferError("expiresAt must be in the future.");
  if (t.exclusivityDays != null && (!Number.isInteger(t.exclusivityDays) || t.exclusivityDays < 0 || t.exclusivityDays > 730)) {
    throw new OfferError("exclusivityDays: 0 to 730.");
  }
}

export async function listOffers(actor: Actor) {
  const rows = await prisma.offer.findMany({ where: whereFor(actor, "offer", "read"), select: SELECT, orderBy: { createdAt: "asc" } });
  return rows.map((r) => view(actor, r));
}

export async function getOffer(actor: Actor, id: string) {
  const row = await prisma.offer.findFirst({ where: { ...whereFor(actor, "offer", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("offer", "read");
  return view(actor, row);
}

/** BTG drafts an offer. It must clear the floor and fit the budget, like any line. */
export async function createOffer(actor: Actor, input: OfferTerms & { campaignId: string; athleteId: string; jobId: string }) {
  assertTenantWide(actor, "offer", "write");
  assertTerms(input);
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "write"), id: input.campaignId },
      select: { id: true, budget: true, ...CAMPAIGN_TERMS },
    });
    if (!campaign) throw new ForbiddenError("offer", "write");
    const athlete = await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: input.athleteId }, select: { id: true, tier: true } });
    if (!athlete) throw new ForbiddenError("offer", "write");
    const job = await tx.nilJob.findFirst({ where: { tenantId: actor.tenantId, id: input.jobId }, select: { id: true } });
    if (!job) throw new OfferError(`No catalogue job ${input.jobId}.`);
    if (input.inventoryItemId) {
      const item = await tx.inventoryItem.findFirst({
        where: { tenantId: actor.tenantId, id: input.inventoryItemId, athleteId: athlete.id }, select: { id: true },
      });
      if (!item) throw new OfferError("That inventory item is not this athlete's.");
    }
    if (input.exclusivityDays && !campaign.sponsor.categories.length) {
      throw new OfferError("An exclusive offer needs the sponsor's brand categories — BTG sets them first.");
    }
    /* 2S2-BE-02 / 2S3-BE-03 — the same questions a purchase is asked. */
    await assertCleared(tx, actor.tenantId, athlete.id, input.inventoryItemId ?? null, campaign, input.deliverables, input.compensation);
    assertLineClearsFloor(input.jobId, athlete.tier ?? null, input.compensation, input.sellPrice);
    const committed = await tx.campaignOrder.aggregate({
      /* tenant-scope: keyed by the campaign loaded above through whereFor. */
      where: { campaignId: campaign.id, state: { not: "CANCELLED" } }, _sum: { compensation: true },
    });
    assertBudgetCarriesLine(input.jobId, athlete.tier ?? null, input.compensation, committed._sum.compensation ?? 0, campaign.budget);

    const row = await tx.offer.create({
      data: {
        tenantId: actor.tenantId, campaignId: campaign.id, athleteId: athlete.id, jobId: job.id,
        inventoryItemId: input.inventoryItemId ?? null, brief: input.brief.trim(), compensation: input.compensation,
        sellPrice: input.sellPrice,
        deliverables: input.deliverables.map((d) => ({ title: d.title.trim(), dueDate: d.dueDate.toISOString() })) as Prisma.InputJsonValue,
        usageRights: input.usageRights.trim(), exclusivityDays: input.exclusivityDays ?? null,
        disclosures: input.disclosures.map((d) => d.trim()).filter(Boolean), expiresAt: input.expiresAt, createdBy: actor.userId,
      },
      select: SELECT,
    });
    await audit(tx, actor, "offer.create", "Offer", row.id, { after: { campaignId: campaign.id, athleteId: athlete.id, compensation: row.compensation } });
    return view(actor, row);
  });
}

async function staffOffer(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  assertTenantWide(actor, "offer", "write");
  const row = await tx.offer.findFirst({ where: { ...whereFor(actor, "offer", "write"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("offer", "write");
  return row;
}

/** Send: the terms are hashed and fixed from this moment. */
export async function sendOffer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "DRAFT") throw new OfferError(`An offer that is ${row.state} cannot be sent.`, 409);
    if (row.expiresAt <= new Date()) throw new OfferError("This offer has already expired — set a new expiry before sending.", 409);
    const termsHash = termsHashOf(canonicalTerms({ ...row, deliverables: row.deliverables as unknown as OfferDeliverable[] }));
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id }, data: { state: "SENT", sentAt: new Date(), termsHash }, select: SELECT,
    });
    await audit(tx, actor, "offer.send", "Offer", id, { before: { state: "DRAFT" }, after: { state: "SENT", termsHash } });
    return view(actor, updated);
  });
}

export async function withdrawOffer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "SENT" && row.state !== "DRAFT") throw new OfferError(`An offer that is ${row.state} cannot be withdrawn.`, 409);
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id }, data: { state: "WITHDRAWN", respondedAt: new Date() }, select: SELECT,
    });
    await audit(tx, actor, "offer.withdraw", "Offer", id, { before: { state: row.state }, after: { state: "WITHDRAWN" } });
    return view(actor, updated);
  });
}

/**
 * The athlete's answer. ACCEPT freezes the snapshot and creates the order,
 * its scheduled deliverables and the earning — all or nothing.
 */
export async function respondToOffer(
  actor: Actor,
  id: string,
  response: { decision: "ACCEPT" | "DECLINE"; termsHashShown?: string } & Partial<AcceptanceRequest>,
) {
  const scope = assertAllowed(actor, "offer", "write");
  if (scope !== "own") throw new ForbiddenError("offer", "write"); // it is the athlete's to answer
  return prisma.$transaction(async (tx) => {
    const row = await tx.offer.findFirst({ where: { ...whereFor(actor, "offer", "write"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("offer", "write");
    if (row.state !== "SENT") throw new OfferError(`An offer that is ${row.state} cannot be answered.`, 409);
    const now = new Date();
    if (row.expiresAt <= now) throw new OfferError("This offer has expired.", 409);

    if (response.decision === "DECLINE") {
      const updated = await tx.offer.update({
        /* tenant-scope: the row loaded above through whereFor(offer, write). */
        where: { id: row.id }, data: { state: "DECLINED", respondedAt: now }, select: SELECT,
      });
      await audit(tx, actor, "offer.decline", "Offer", id, { before: { state: "SENT" }, after: { state: "DECLINED" } });
      return view(actor, updated);
    }

    if (!response.termsHashShown || response.termsHashShown !== row.termsHash) {
      throw new OfferError("The terms shown are not the terms of this offer — reload and accept again.", 409);
    }
    if (!response.agreementId || !response.bodyHashShown || !response.ip || !response.userAgent) {
      throw new OfferError("Acceptance needs the agreement shown and the signer's evidence.");
    }
    /* Re-asked at the moment of commitment: a restriction or a sale since the
       offer was sent stops it here. */
    const campaign = await tx.campaign.findFirstOrThrow({
      /* tenant-scope: the offer's own campaign, in the offer's tenant (loaded above through whereFor). */
      where: { id: row.campaignId, tenantId: actor.tenantId }, select: CAMPAIGN_TERMS,
    });
    const due = (row.deliverables as unknown as Array<{ dueDate: string }>).map((d) => ({ dueDate: new Date(d.dueDate) }));
    await assertCleared(tx, actor.tenantId, row.athleteId, row.inventoryItemId, campaign, due, row.compensation);

    /* Evidence and the guardian gate: the same acceptance a Phase 1 order takes. */
    const acceptance = await acceptAgreementIn(tx, actor, {
      agreementId: response.agreementId, bodyHashShown: response.bodyHashShown, ip: response.ip, userAgent: response.userAgent,
    }, { oncePerSigner: false });

    const lines = (row.deliverables as unknown as Array<{ title: string; dueDate: string }>).map((d) => ({ title: d.title, dueDate: new Date(d.dueDate) }));
    const dueDate = new Date(Math.max(...lines.map((d) => d.dueDate.getTime())));
    let order: { id: string };
    try {
      order = await tx.campaignOrder.create({
        data: {
          tenantId: actor.tenantId, campaignId: row.campaignId, athleteId: row.athleteId, jobId: row.jobId,
          /* Copied from the offer — never from the rate card or the item. */
          compensation: row.compensation, sellPrice: row.sellPrice, usageRights: row.usageRights,
          exclusivity: row.exclusivityDays != null ? `${row.exclusivityDays} days` : null, dueDate,
          state: "ACCEPTED", acceptedAt: now, acceptanceId: acceptance.acceptanceId,
        },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new OfferError("This athlete already has an order for this job on this campaign.", 409);
      throw error;
    }
    for (const d of lines) {
      await tx.deliverable.create({ data: { tenantId: actor.tenantId, orderId: order.id, title: d.title, dueDate: d.dueDate }, select: { id: true } });
    }
    await createEarningForOrder(tx, actor, { id: order.id, tenantId: actor.tenantId, athleteId: row.athleteId, compensation: row.compensation, dueDate });
    /* 2S3-BE-03 — the item is now spoken for; 2S2-BE-02 — the exclusivity starts. */
    if (row.inventoryItemId) {
      await tx.inventoryCommitment.create({
        data: {
          tenantId: actor.tenantId, inventoryItemId: row.inventoryItemId, quantity: 1, source: "OFFER", sourceId: row.id,
          startsOn: new Date(Math.min(...lines.map((d) => d.dueDate.getTime()))), endsOn: dueDate,
        },
        select: { id: true },
      });
    }
    await writeExclusivity(tx, { id: row.id, tenantId: actor.tenantId, athleteId: row.athleteId, exclusivityDays: row.exclusivityDays }, campaign.sponsor.categories, now, campaign.sponsor.name);

    const snapshot = {
      terms: canonicalTerms({ ...row, deliverables: lines }), termsHash: row.termsHash,
      line: { sellPrice: row.sellPrice }, acceptedAt: now.toISOString(), acceptanceId: acceptance.acceptanceId, orderId: order.id,
    };
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id },
      data: { state: "ACCEPTED", respondedAt: now, termsSnapshot: snapshot as Prisma.InputJsonValue, orderId: order.id },
      select: SELECT,
    });
    await audit(tx, actor, "offer.accept", "Offer", id, {
      before: { state: "SENT" }, after: { state: "ACCEPTED", orderId: order.id, termsHash: row.termsHash, deliverables: lines.length },
    });
    return view(actor, updated);
  });
}

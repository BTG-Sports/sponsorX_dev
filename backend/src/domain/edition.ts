/**
 * SponsorX NEXT editions and their ad inventory — P9-BE-02, -03, -06, -09,
 * -12. Spec v2.0 §5.2, §5.7, §6.4.
 *
 * A school's masthead (`Publication`) has editions; an edition has sellable
 * positions (`AdSlot`); a NEXT sale is an ordinary `Campaign` that buys
 * positions through its package's `includes` (P9-BE-01) — never a
 * CampaignOrder, because an ad has no athlete and no job. At close, the
 * edition's sold revenue is split four ways into `RevenueSplit`, and never
 * into `Earning`. Readers' engagement lands in `EditionEvent`, its own stream,
 * with print (QR_SCAN) and digital kept apart.
 *
 * The inventory rules are enforced twice: here, for a readable refusal, and
 * by Postgres (trigger `adslot_guard_sale`, partial unique index
 * `AdSlot_one_exclusive_per_edition`), for every write that does not come
 * through here.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { canReadField } from "../auth/fields";
import { ForbiddenError } from "../auth/errors";
import {
  assertCanSell,
  assertEditionTransition,
  PUBLISHED_STATES,
  type EditionState,
} from "./edition-state";
import { allocateSplit } from "./revenue-split";
import { attributeSale } from "./student";
import { heldCategories } from "./student-moves";
import { AdSaleRefusedError, categoryHolds, clashHold, saleCategories, type SaleHold } from "./ad-sale-rules";
import { applyStageMove, CAMPAIGN_FOR_MOVE, lockCampaign } from "./campaign-stages";
import { canTransitionCampaign, type CampaignState } from "./campaign-state";
import { recordEditionRefund } from "./refunds";
import { reverseSaleAttributions } from "./attribution-reversal";
import { rateCardPrice } from "./edition-rate-card";
import { rightsGap } from "./content-rights";
import { artworkGap } from "./edition-artwork";
import { describeBlocker } from "./edition-artwork-rules";
import { resolveSchoolPools } from "./dmv-pools";

export type AdSlotKind = "QUARTER" | "HALF" | "FULL" | "BACK_COVER" | "PRESENTING";
export type EngagementType = "QR_SCAN" | "LINK_CLICK" | "PROFILE_VIEW" | "CAMPAIGN_VIEW" | "CTA_CLICK";
export const ENGAGEMENT_TYPES: readonly EngagementType[] = ["QR_SCAN", "LINK_CLICK", "PROFILE_VIEW", "CAMPAIGN_VIEW", "CTA_CLICK"];
export const TARGET_KINDS = ["AD_SLOT", "ARTICLE", "ATHLETE_PROFILE"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/* ── errors ─────────────────────────────────────────────────────────────── */

export class SlotConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "SlotConflictError";
  }
}

export class NoAdInventoryError extends Error {
  readonly status = 422;
  constructor() {
    super("This campaign's package includes no ad placement, so there is nothing to sell it in an edition.");
    this.name = "NoAdInventoryError";
  }
}

export class RightsNotClearedError extends Error {
  readonly status = 409;
  readonly uncleared: string[];
  constructor(format: "digital" | "print", titles: string[]) {
    super(`No ${format} right covers: ${titles.join(", ")}.`);
    this.name = "RightsNotClearedError";
    this.uncleared = titles;
  }
}

/** P9-BE-18 — a slot's price against its masthead's rate card. */
export class RateCardPriceError extends Error {
  readonly status = 422;
  readonly code = "rate_card_price";
  constructor(message: string) {
    super(message);
    this.name = "RateCardPriceError";
  }
}

export class EditionNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("No published edition matches.");
    this.name = "EditionNotFoundError";
  }
}

/** Postgres refusals from the inventory trigger and unique indexes, as 409s
 *  a caller can read, instead of a 500 that says nothing. */
function asSlotConflict(error: unknown): never {
  const text = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : "";
  const code = (error as { code?: string } | null)?.code;
  if (text.includes("adslot_already_sold")) throw new SlotConflictError("That slot is already sold.");
  if (text.includes("adslot_edition_closed")) throw new SlotConflictError("This edition is no longer selling.");
  if (text.includes("AdSlot_one_exclusive_per_edition")) {
    throw new SlotConflictError("An edition has one back cover and one presenting sponsor.");
  }
  if (code === "P2002") throw new SlotConflictError("That slot code already exists in this edition.");
  throw error;
}

/* ── publications and editions (P9-BE-02) ───────────────────────────────── */

export async function createPublication(
  actor: Actor,
  input: { name: string; propertyId: string | null },
): Promise<{ id: string }> {
  assertAllowed(actor, "publication", "write");
  return prisma.$transaction(async (tx) => {
    if (input.propertyId) {
      /* A school's masthead belongs to a school in this tenant; null is the
         regional (DMV) edition. */
      const property = await tx.property.findFirst({
        where: { tenantId: actor.tenantId, id: input.propertyId },
        select: { id: true },
      });
      if (!property) throw new ForbiddenError("publication", "write");
    }
    const pub = await tx.publication.create({
      data: { tenantId: actor.tenantId, name: input.name, propertyId: input.propertyId },
      select: { id: true },
    });
    await audit(tx, actor, "publication.create", "Publication", pub.id, { after: input });
    return pub;
  });
}

export async function createEdition(
  actor: Actor,
  publicationId: string,
  input: {
    label: string; closeDate: Date; publishTarget: Date; printDate?: Date | null;
    pageCount?: number | null; thresholdCents: number;
    /** P9-BE-17 — sales open by themselves on this day; null: BTG opens by hand. */
    salesOpenAt?: Date | null;
  },
): Promise<{ id: string; state: EditionState }> {
  assertAllowed(actor, "edition", "write");
  return prisma.$transaction(async (tx) => {
    const pub = await tx.publication.findFirst({
      where: { ...whereFor(actor, "publication", "write"), id: publicationId },
      select: { id: true },
    });
    if (!pub) throw new ForbiddenError("publication", "write");
    const edition = await tx.edition.create({
      data: {
        tenantId: actor.tenantId, publicationId, label: input.label,
        closeDate: input.closeDate, publishTarget: input.publishTarget,
        printDate: input.printDate ?? null, pageCount: input.pageCount ?? null,
        thresholdCents: input.thresholdCents, salesOpenAt: input.salesOpenAt ?? null,
      },
      select: { id: true, state: true },
    });
    await audit(tx, actor, "edition.create", "Edition", edition.id, {
      after: { publicationId, label: input.label, salesOpenAt: input.salesOpenAt?.toISOString() ?? null },
    });
    return { id: edition.id, state: edition.state as EditionState };
  });
}

export async function getEdition(actor: Actor, editionId: string) {
  const edition = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "read"), id: editionId },
    select: {
      id: true, tenantId: true, publicationId: true, label: true, closeDate: true, publishTarget: true,
      printDate: true, pageCount: true, contentReady: true, rightsCleared: true,
      revenueMet: true, thresholdCents: true, state: true, salesOpenAt: true,
      splitLockedAt: true, splitLockedBy: true, splitLockNote: true,
    },
  });
  if (!edition) throw new ForbiddenError("edition", "read");
  return edition;
}

/**
 * Take the edition's row lock and read its state under it — every stage
 * change takes it, BTG's by hand and the sweep's (P9-BE-17), and so does
 * a cancellation's release of the inventory. Null if absent.
 */
export async function lockEdition(tx: Prisma.TransactionClient, editionId: string, tenantId: string): Promise<EditionState | null> {
  const rows = await tx.$queryRaw<Array<{ state: EditionState }>>`SELECT state::text AS state FROM "Edition" WHERE id = ${editionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  return rows[0]?.state ?? null;
}

/** The one production condition a person decides. The other two are
 *  computed, never typed in: `revenueMet` from what sold, at close, and
 *  `rightsCleared` from the rights ledger, at the transition (P9-BE-10). */
export async function setEditionConditions(
  actor: Actor,
  editionId: string,
  input: { contentReady?: boolean },
): Promise<{ contentReady: boolean; rightsCleared: boolean; revenueMet: boolean }> {
  assertAllowed(actor, "edition", "approve");
  return prisma.$transaction(async (tx) => {
    const edition = await tx.edition.findFirst({
      where: { ...whereFor(actor, "edition", "approve"), id: editionId },
      select: { id: true, tenantId: true, contentReady: true },
    });
    if (!edition) throw new ForbiddenError("edition", "approve");
    /* P9-BE-17 — the lock the sweep's moves take: content marked not ready
       while the sweep is publishing waits for it, or stops it. */
    await lockEdition(tx, editionId, edition.tenantId);
    /* tenant-scope: the row loaded above through whereFor(edition, approve), and locked. */
    const updated = await tx.edition.update({
      where: { id: editionId },
      data: { ...(input.contentReady === undefined ? {} : { contentReady: input.contentReady }) },
      select: { contentReady: true, rightsCleared: true, revenueMet: true },
    });
    await audit(tx, actor, "edition.conditions", "Edition", editionId, {
      before: { contentReady: edition.contentReady },
      after: { contentReady: updated.contentReady },
    });
    return updated;
  });
}

/**
 * Move an edition through §5.2, or refuse. Closing it freezes its revenue:
 * the four-way split is computed from what sold, in the same transaction,
 * and `revenueMet` is set against the edition's threshold.
 *
 * P9-BE-17 — the edition's row lock first, as the sweep takes it: a move by
 * hand racing an automatic one runs after it (or before it), and the second
 * reads the state the first left — so the two make one move, never two.
 */
export async function transitionEdition(
  actor: Actor,
  editionId: string,
  to: EditionState,
): Promise<{ id: string; state: EditionState }> {
  assertAllowed(actor, "edition", "approve");
  return prisma.$transaction(async (tx) => {
    const found = await tx.edition.findFirst({
      where: { ...whereFor(actor, "edition", "approve"), id: editionId },
      select: { id: true, tenantId: true },
    });
    if (!found) throw new ForbiddenError("edition", "approve");
    const from = await lockEdition(tx, found.id, found.tenantId);
    if (!from) throw new ForbiddenError("edition", "approve");
    /* The audit names the person; the edition's tenant is where it happened
       (a SUPER_ADMIN's own tenant is not the edition's). */
    return transitionEditionIn(tx, { userId: actor.userId, tenantId: found.tenantId }, found.tenantId, editionId, from, to);
  });
}

/**
 * The move itself, in the caller's transaction, which holds the edition's
 * row lock and read `from` under it — BTG's transition above and the
 * sweep's automatic moves (edition-automation.ts, as the system with
 * `automatic` and its reason on the audit row). Every gate is asked the same
 * way either way.
 */
export async function transitionEditionIn(
  tx: Prisma.TransactionClient,
  by: AuditActor,
  tenantId: string,
  editionId: string,
  from: EditionState,
  to: EditionState,
  opts: { automatic?: { reason: string }; now?: Date } = {},
): Promise<{ id: string; state: EditionState; cancelled?: EditionCancellation }> {
  const now = opts.now ?? new Date();
  const edition = await tx.edition.findFirstOrThrow({
    /* tenant-scope: the edition the caller found in its scope (or the sweep's) and locked, by id and tenant. */
    where: { tenantId, id: editionId },
    select: {
      id: true, label: true, contentReady: true, rightsCleared: true, revenueMet: true,
      thresholdCents: true, publishTarget: true, printDate: true, splitLockedAt: true,
    },
  });
  /* P9-BE-19 — a split Finance has locked stands on revenue that was sold;
     cancelling refunds that revenue, so BTG admin unlocks it first (with a
     reason) — a locked split is never left describing money given back. */
  if (to === "CANCELLED" && edition.splitLockedAt) {
    throw new SlotConflictError("Finance has locked this edition's split. Unlock it (BTG admin, with a reason) before cancelling the edition.");
  }

  /* P9-BE-10 — the gate asks the ledger, in one query, which assets have no
     right for this format on this date. Digital clears production and the
     digital edition; print is asked only when it is printed, so a
     digital-first edition clears while print rights are still outstanding.
     Every gate asks about the EDITION's tenant, never the caller's — a
     SUPER_ADMIN's scope crosses tenants, and asking its own would find no
     slots, no assets and so no blockers (P9-BE-16 review). */
  let rightsCleared = edition.rightsCleared;
  if (to === "IN_PRODUCTION" || to === "PUBLISHED_DIGITAL") {
    rightsCleared = (await rightsGap(tx, tenantId, editionId, "DIGITAL", edition.publishTarget)).length === 0;
  }
  if (to === "PRINTED") {
    const gap = await rightsGap(tx, tenantId, editionId, "PRINT", edition.printDate ?? now);
    if (gap.length) throw new RightsNotClearedError("print", gap.map((a) => a.title));
  }
  if (to === "PUBLISHED_DIGITAL" && !rightsCleared) {
    const gap = await rightsGap(tx, tenantId, editionId, "DIGITAL", edition.publishTarget);
    throw new RightsNotClearedError("digital", gap.map((a) => a.title));
  }
  /* P9-BE-16 — production also needs every SOLD slot's artwork approved
     on the board, asked in this transaction like the rights gap. */
  let artworkApproved = true;
  const artworkProblems: string[] = [];
  if (to === "IN_PRODUCTION") {
    const blockers = await artworkGap(tx, tenantId, editionId);
    artworkApproved = blockers.length === 0;
    if (blockers.length) {
      artworkProblems.push(`Ad artwork not approved: ${blockers.map((b) => describeBlocker(b, b.revisionOpen)).join(", ")}.`);
    }
  }
  assertEditionTransition(from, to, { ...edition, rightsCleared, artworkApproved }, artworkProblems);

  let revenueMet = edition.revenueMet;
  if (to === "CLOSED") revenueMet = (await resolveSplit(tx, by, tenantId, editionId)) >= edition.thresholdCents;
  /* P9-BE-14 — a regional edition's school pools resolve by formula when
     it publishes, from its frozen revenue and final content. */
  if (to === "PUBLISHED_DIGITAL") await resolveSchoolPools(tx, tenantId, editionId, by);
  /* P9-BE-19 — cancelling releases what sold, cancels the ad-only campaigns
     that bought only here, and puts any money received on Finance's list. */
  const cancelled = to === "CANCELLED" ? await cancelEditionIn(tx, by, tenantId, edition, now) : undefined;

  const updated = await tx.edition.update({
    /* tenant-scope: the edition loaded above by id and tenant, under its lock. */
    where: { id: editionId },
    data: { state: to as Prisma.EditionUpdateInput["state"], revenueMet, rightsCleared },
    select: { id: true, state: true },
  });
  await audit(tx, by, "edition.transition", "Edition", editionId, {
    before: { state: from },
    after: {
      state: to,
      ...(opts.automatic ? { automatic: true, reason: opts.automatic.reason } : {}),
      ...(cancelled ? { released: cancelled.released, campaignsCancelled: cancelled.campaignsCancelled, refunds: cancelled.refunds } : {}),
    },
  });
  return { id: updated.id, state: updated.state as EditionState, ...(cancelled ? { cancelled } : {}) };
}

/* ── cancellation (P9-BE-19) ────────────────────────────────────────────── */

export type EditionCancellation = {
  /** Slot codes put back on the shelf. */
  released: string[];
  /** Ad-only campaigns that bought only this edition — cancelled. */
  campaignsCancelled: string[];
  /** Ad-only campaigns that could not be cancelled from where they are (left for BTG). */
  campaignsLeft: Array<{ campaignId: string; state: CampaignState }>;
  /** Refunds to send, one per paid sale. */
  refunds: Array<{ campaignId: string; refundId: string; amountCents: number }>;
};

/**
 * In the cancellation's transaction, under the edition's lock: each sold
 * slot is released; each campaign that bought here and has nothing else — no
 * athlete order, no slot in another edition — is cancelled through the
 * normal stage move (its Zoho Deal Closed Lost, its rewards paused); and the
 * money each buyer actually paid (its Zoho invoices marked paid) becomes a
 * refund on Finance's list (refunds.ts `recordEditionRefund`). Campaigns are
 * locked in id order, after the edition — the order the sale takes them in.
 */
async function cancelEditionIn(
  tx: Prisma.TransactionClient,
  by: AuditActor,
  tenantId: string,
  edition: { id: string; label: string },
  now: Date,
): Promise<EditionCancellation> {
  const out: EditionCancellation = { released: [], campaignsCancelled: [], campaignsLeft: [], refunds: [] };
  const sold = await tx.adSlot.findMany({
    where: { tenantId, editionId: edition.id, campaignId: { not: null } },
    select: { slotCode: true, campaignId: true, soldCents: true },
    orderBy: [{ campaignId: "asc" }, { slotCode: "asc" }],
  });
  const byCampaign = new Map<string, typeof sold>();
  for (const s of sold) byCampaign.set(s.campaignId!, [...(byCampaign.get(s.campaignId!) ?? []), s]);

  for (const [campaignId, slots] of byCampaign) {
    const state = await lockCampaign(tx, campaignId, tenantId);
    if (!state) continue;
    const campaign = await tx.campaign.findFirstOrThrow({
      /* tenant-scope: a campaign holding this edition's slots, in the edition's tenant, locked above. */
      where: { tenantId, id: campaignId },
      select: { ...CAMPAIGN_FOR_MOVE, _count: { select: { orders: true, adSlots: true } } },
    });
    const soldCents = slots.reduce((n, s) => n + (s.soldCents ?? 0), 0);
    /* The record of the sale undone — what a payment arriving later is matched
       against (refunds.ts `refundPaymentAfterEditionCancel`). */
    await tx.cancelledAdSale.createMany({
      data: [{ tenantId, editionId: edition.id, campaignId, sponsorId: campaign.sponsorId, soldCents }],
      skipDuplicates: true,
    });
    /* The student who originated the sale no longer counts it (attribution-reversal.ts). */
    await reverseSaleAttributions(tx, by, { tenantId, campaignId, editionId: edition.id, reason: `The edition ${edition.label} was cancelled.` });
    const refund = await recordEditionRefund(tx, by, { tenantId, editionId: edition.id, campaignId, sponsorId: campaign.sponsorId, soldCents });
    if (refund) out.refunds.push({ campaignId, refundId: refund.id, amountCents: refund.amountCents });

    const released = await tx.adSlot.updateMany({
      where: { tenantId, editionId: edition.id, campaignId },
      data: { campaignId: null, soldCents: null, soldAt: null },
    });
    out.released.push(...slots.map((s) => s.slotCode));
    await audit(tx, by, "adSlot.release", "Campaign", campaignId, {
      before: { editionId: edition.id, slots: slots.map((s) => s.slotCode), soldCents },
      after: { editionId: edition.id, released: released.count, reason: `The edition ${edition.label} was cancelled.` },
    });

    const shape = { orders: campaign._count.orders, adSlots: campaign._count.adSlots };
    const onlyHere = shape.orders === 0 && shape.adSlots === slots.length;
    if (!onlyHere) continue;
    if (!canTransitionCampaign(state, "CANCELLED", shape)) {
      out.campaignsLeft.push({ campaignId, state });
      continue;
    }
    await applyStageMove(tx, by, campaign, state, "CANCELLED", {
      automatic: { reason: `Its only placements were in ${edition.label}, which was cancelled.` }, shape,
    });
    out.campaignsCancelled.push(campaignId);
    /* A sale still held for SALES on a campaign that no longer buys anything is settled. */
    await tx.adSaleHold.updateMany({
      where: { tenantId, campaignId, resolvedAt: null },
      data: { resolvedAt: now, resolution: "CAMPAIGN_CANCELLED" },
    });
  }
  return out;
}

/* ── revenue split (P9-BE-06) ───────────────────────────────────────────── */

/**
 * Recompute the edition's four RevenueSplit rows from its sold slots.
 * Returns the revenue in cents. Writes RevenueSplit only — never Earning.
 *
 * P9-BE-19 — a split Finance has locked is never replaced: the recompute is
 * refused (Postgres refuses the write as well — trigger
 * revenuesplit_guard_lock), the refusal is audited, and the locked revenue
 * is what is returned.
 */
export async function resolveSplit(tx: Prisma.TransactionClient, by: AuditActor, tenantId: string, editionId: string): Promise<number> {
  const edition = await tx.edition.findFirst({ where: { tenantId, id: editionId }, select: { splitLockedAt: true } });
  if (edition?.splitLockedAt) {
    const kept = await tx.revenueSplit.aggregate({ where: { tenantId, editionId }, _sum: { amountCents: true } });
    await audit(tx, by, "revenueSplit.recomputeRefused", "Edition", editionId, {
      after: { reason: "The split is locked by Finance.", lockedAt: edition.splitLockedAt.toISOString(), keptCents: kept._sum.amountCents ?? 0 },
    });
    return kept._sum.amountCents ?? 0;
  }
  const sold = await tx.adSlot.aggregate({
    where: { tenantId, editionId, campaignId: { not: null } },
    _sum: { soldCents: true },
  });
  const revenue = sold._sum.soldCents ?? 0;
  await tx.revenueSplit.deleteMany({ where: { tenantId, editionId } });
  await tx.revenueSplit.createMany({
    data: allocateSplit(revenue).map((l) => ({ tenantId, editionId, ...l })),
  });
  return revenue;
}

export async function editionSplits(actor: Actor, editionId: string) {
  assertAllowed(actor, "revenueSplit", "read");
  const edition = await prisma.edition.findFirst({
    where: { tenantId: actor.tenantId, id: editionId },
    select: { id: true },
  });
  if (!edition) throw new ForbiddenError("revenueSplit", "read");
  const rows = await prisma.revenueSplit.findMany({
    where: { ...whereFor(actor, "revenueSplit", "read"), editionId },
    select: { payeeKind: true, bps: true, amountCents: true, computedAt: true },
    orderBy: { bps: "desc" },
  });
  /* matrix §15.4 — the amount is a protected field on top of the row scope. */
  return canReadField(actor.roles, "revenueSplit.amount") ? rows : rows.map(({ amountCents: _a, ...r }) => r);
}

/* ── ad inventory (P9-BE-03) ────────────────────────────────────────────── */

/**
 * Add a sellable position. P9-BE-18 — the price comes from the masthead's
 * rate card (edition-rate-card.ts) where it has one for this kind: a slot
 * added without a price takes it, and a typed price that differs is refused
 * (422) — never quietly overridden. Where the card has no price for the
 * kind, the price must be typed, as before.
 */
export async function addSlot(
  actor: Actor,
  editionId: string,
  input: { slotCode: string; kind: AdSlotKind; priceCents?: number },
): Promise<{ id: string; priceCents: number }> {
  assertAllowed(actor, "adSlot", "write");
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.edition.findFirst({
        where: { ...whereFor(actor, "edition", "read"), id: editionId },
        select: { id: true, tenantId: true, state: true, publicationId: true },
      });
      if (!edition) throw new ForbiddenError("adSlot", "write");
      if (edition.state !== "PLANNING" && edition.state !== "SELLING") {
        throw new SlotConflictError(`An edition that is ${edition.state} takes no new positions.`);
      }
      const card = await rateCardPrice(tx, edition.tenantId, edition.publicationId, input.kind);
      const words = input.kind.replace("_", " ").toLowerCase();
      if (card !== null && input.priceCents !== undefined && input.priceCents !== card) {
        throw new RateCardPriceError(
          `The rate card prices a ${words} at $${(card / 100).toFixed(2)}. Leave the price empty to use it, or change the rate card.`,
        );
      }
      if (card === null && input.priceCents === undefined) {
        throw new RateCardPriceError(`The rate card has no price for a ${words} yet. Type the price, or set one on the rate card.`);
      }
      const priceCents = card ?? input.priceCents!;
      const slot = await tx.adSlot.create({
        data: { tenantId: edition.tenantId, editionId, slotCode: input.slotCode, kind: input.kind, priceCents },
        select: { id: true, priceCents: true },
      });
      await audit(tx, actor, "adSlot.create", "AdSlot", slot.id, {
        after: { slotCode: input.slotCode, kind: input.kind, priceCents, fromRateCard: card !== null },
      });
      return slot;
    });
  } catch (error) {
    return asSlotConflict(error);
  }
}

export async function listSlots(actor: Actor, editionId: string) {
  const edition = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "read"), id: editionId },
    select: { id: true },
  });
  if (!edition) throw new ForbiddenError("edition", "read");
  return prisma.adSlot.findMany({
    where: { ...whereFor(actor, "adSlot", "read"), editionId },
    select: { id: true, slotCode: true, kind: true, priceCents: true, campaignId: true, soldCents: true, soldAt: true },
    orderBy: { slotCode: "asc" },
  });
}

type IncludeLine = { kind: string; code: string; quantity?: number };

/** The positions a package's `includes` promises (P9-BE-01) — the entry that
 *  AdSlot makes enforceable. */
export function positionsFor(includes: IncludeLine[] | null): AdSlotKind[] {
  const kinds: AdSlotKind[] = [];
  for (const line of includes ?? []) {
    const kind: AdSlotKind | null =
      line.kind === "AD_SLOT" && ["QUARTER", "HALF", "FULL", "BACK_COVER"].includes(line.code) ? (line.code as AdSlotKind)
        : line.kind === "PRESENTING" ? "PRESENTING"
          : null;
    if (kind) for (let i = 0; i < (line.quantity ?? 1); i++) kinds.push(kind);
  }
  return kinds;
}

/** The package price, spread across the positions it bought in proportion to
 *  their rack prices, in whole cents that sum to the price exactly. */
export function spreadPrice(priceCents: number, racks: number[]): number[] {
  const total = racks.reduce((s, r) => s + r, 0);
  if (total === 0) return racks.map((_, i) => (i === 0 ? priceCents : 0));
  const raw = racks.map((r) => (priceCents * r) / total);
  const out = raw.map(Math.floor);
  let left = priceCents - out.reduce((s, v) => s + v, 0);
  for (const i of raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) {
    if (left === 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

/** "a half page", "a back cover" — a position kind in a sentence. */
export function kindWords(kind: string): string {
  return kind.replace("_", " ").toLowerCase();
}

/**
 * P9-BE-18 — the categories already held exclusively against this edition,
 * for a buyer: the presenting sponsor of any edition still in flight at the
 * school (student-moves.ts `heldCategories`, the prospect check's own rule), this
 * edition's presenting sponsor and every buyer here whose package bought
 * exclusivity — and, when the buyer is itself buying exclusivity (a
 * presenting position or an exclusive package), every category already sold
 * here. The buyer's own sponsor never clashes with itself.
 */
export async function heldAgainst(
  tx: Prisma.TransactionClient,
  tenantId: string,
  edition: { id: string; propertyId: string | null },
  buyer: { campaignId: string; sponsorId: string; exclusive: boolean },
): Promise<Set<string>> {
  const held = edition.propertyId
    ? await heldCategories(tx, tenantId, edition.propertyId, { exceptSponsorId: buyer.sponsorId })
    : new Set<string>();
  const here = await tx.adSlot.findMany({
    where: {
      tenantId, editionId: edition.id, campaignId: { not: null },
      campaign: { is: { id: { not: buyer.campaignId }, sponsorId: { not: buyer.sponsorId } } },
    },
    select: {
      kind: true,
      campaign: { select: { sponsor: { select: { categories: true } }, brief: { select: { categories: true, package: { select: { exclusivity: true } } } } } },
    },
  });
  for (const s of here) {
    const cats = saleCategories(s.campaign?.sponsor.categories ?? [], s.campaign?.brief?.categories ?? []);
    const exclusive = s.kind === "PRESENTING" || Boolean(s.campaign?.brief?.package?.exclusivity);
    if (exclusive || buyer.exclusive) for (const c of cats) held.add(c);
  }
  return held;
}

/**
 * Sell an edition's positions to a campaign — the positions its package
 * promises, no more and no fewer. P9-BE-03, -09.
 *
 * All or nothing: a Local Business Package that cannot get its full page does
 * not quietly sell the rest. The sale value is the package price, frozen onto
 * the slots at sale; it can differ from rack, and the edition's revenue (and
 * so its split) is what was actually sold.
 *
 * P9-BE-18 — the student-audience gate (ad-sale-rules.ts) refuses a sale by
 * hand too: a NOT_FOR_STUDENTS, sensitive or unknown category, or a clash.
 */
export async function sellCampaignSlots(
  actor: Actor,
  editionId: string,
  campaignId: string,
): Promise<{ slots: Array<{ id: string; slotCode: string; kind: string; soldCents: number }> }> {
  assertAllowed(actor, "adSlot", "write");
  try {
    return await prisma.$transaction(async (tx) => {
      /* Found through the sale's own reach — adSlot write, tenant-wide (BTG
         and SALES; matrix §15.3) — not edition read, which SALES does not
         hold: "SALES sells against the inventory". */
      const edition = await tx.edition.findFirst({
        where: { ...whereFor(actor, "adSlot", "write"), id: editionId },
        select: { id: true, tenantId: true },
      });
      if (!edition) throw new ForbiddenError("adSlot", "write");
      const campaign = await tx.campaign.findFirst({
        where: { ...whereFor(actor, "campaign", "read"), id: campaignId, tenantId: edition.tenantId },
        select: { id: true },
      });
      if (!campaign) throw new ForbiddenError("campaign", "read");
      return sellIn(tx, { userId: actor.userId, tenantId: edition.tenantId }, edition.tenantId, editionId, campaignId);
    });
  } catch (error) {
    return asSlotConflict(error);
  }
}

/**
 * The sale itself, in the caller's transaction — BTG's and SALES's sale
 * above, and the automatic one (ad-sale-auto.ts, as the system, with
 * `automatic` and its reason on the audit row). Takes the edition's lock
 * (shared — sales do not wait for each other, but a stage move or a
 * cancellation waits for them, and they for it) and then the campaign's, the
 * order a cancellation takes them in. Every rule is asked here, under them.
 */
export async function sellIn(
  tx: Prisma.TransactionClient,
  by: AuditActor,
  tenantId: string,
  editionId: string,
  campaignId: string,
  opts: { automatic?: { reason: string }; now?: Date } = {},
): Promise<{ slots: Array<{ id: string; slotCode: string; kind: string; soldCents: number }> }> {
  const now = opts.now ?? new Date();
  const rows = await tx.$queryRaw<Array<{ state: EditionState; closeDate: Date; label: string; propertyId: string | null }>>`
    SELECT e.state::text AS state, e."closeDate" AS "closeDate", e.label AS label, p."propertyId" AS "propertyId"
    FROM "Edition" e JOIN "Publication" p ON p.id = e."publicationId"
    WHERE e.id = ${editionId} AND e."tenantId" = ${tenantId}
    FOR SHARE OF e`;
  const edition = rows[0];
  if (!edition) throw new ForbiddenError("adSlot", "write");
  assertCanSell(edition.state, edition.closeDate, now);

  const state = await lockCampaign(tx, campaignId, tenantId);
  if (!state) throw new ForbiddenError("campaign", "read");
  const campaign = await tx.campaign.findFirstOrThrow({
    /* tenant-scope: the campaign the caller found in its scope (or the system's), locked above, by id and tenant. */
    where: { tenantId, id: campaignId },
    select: {
      id: true, sponsorId: true, sponsor: { select: { categories: true } },
      brief: { select: { studentCodeId: true, categories: true, package: { select: { code: true, priceLow: true, includes: true, exclusivity: true } } } },
    },
  });
  if (state !== "DRAFT") {
    throw new SlotConflictError(`A campaign that is ${state} cannot buy more placements.`);
  }
  const pkg = campaign.brief?.package ?? null;
  const wanted = positionsFor((pkg?.includes as IncludeLine[] | null) ?? null);
  if (!pkg || wanted.length === 0) throw new NoAdInventoryError();

  const already = await tx.adSlot.count({ where: { tenantId, editionId, campaignId } });
  if (already > 0) throw new SlotConflictError("This campaign already holds placements in this edition.");

  /* P9-BE-18 — the student-audience gate, asked of every sale. */
  const categories = saleCategories(campaign.sponsor.categories, campaign.brief?.categories ?? []);
  const reasons: SaleHold[] = categoryHolds(categories, { automatic: Boolean(opts.automatic), sponsorCategories: campaign.sponsor.categories });
  const held = await heldAgainst(tx, tenantId, { id: editionId, propertyId: edition.propertyId }, {
    campaignId, sponsorId: campaign.sponsorId, exclusive: wanted.includes("PRESENTING") || pkg.exclusivity,
  });
  const clash = clashHold(categories, held, edition.label);
  if (clash) reasons.push(clash);
  if (reasons.length) throw new AdSaleRefusedError(reasons);

  const picked: Array<{ id: string; slotCode: string; kind: string; priceCents: number }> = [];
  for (const kind of wanted) {
    const slot = await tx.adSlot.findFirst({
      where: {
        tenantId, editionId, kind, campaignId: null,
        id: { notIn: picked.map((p) => p.id) },
      },
      select: { id: true, slotCode: true, kind: true, priceCents: true },
      orderBy: { slotCode: "asc" },
    });
    if (!slot) throw new SlotConflictError(`No ${kindWords(kind)} is left in ${edition.label}.`);
    picked.push(slot);
  }

  const values = spreadPrice(pkg.priceLow * 100, picked.map((p) => p.priceCents));
  for (const [i, slot] of picked.entries()) {
    /* Conditional on still being unsold: two sales racing for the last
       back cover — one wins, the other matches nothing and stops. */
    const won = await tx.adSlot.updateMany({
      where: { id: slot.id, tenantId, campaignId: null },
      data: { campaignId, soldCents: values[i]!, soldAt: now },
    });
    if (won.count !== 1) throw new SlotConflictError(`${slot.slotCode} was sold a moment ago.`);
  }
  await audit(tx, by, "adSlot.sell", "Campaign", campaignId, {
    after: {
      editionId, package: pkg.code, slots: picked.map((p) => p.slotCode),
      ...(opts.automatic ? { automatic: true, reason: opts.automatic.reason } : {}),
    },
  });
  /* P9-BE-07 — a sponsor who arrived on a student's code: the sale is
     credited to that student in the same transaction as the sale. */
  if (campaign.brief?.studentCodeId) {
    await attributeSale(tx, by, {
      studentCodeId: campaign.brief.studentCodeId, sponsorId: campaign.sponsorId,
      campaignId, editionId, valueCents: values.reduce((sum, v) => sum + v, 0),
    });
  }
  /* A sale held for SALES (P9-BE-18) is settled by the sale, whoever made it. */
  await tx.adSaleHold.updateMany({
    where: { tenantId, campaignId, resolvedAt: null },
    data: { resolvedAt: now, resolution: "SOLD", editionId },
  });
  return {
    slots: picked.map((p, i) => ({ id: p.id, slotCode: p.slotCode, kind: p.kind, soldCents: values[i]! })),
  };
}

/* ── edition engagement (P9-BE-12) ──────────────────────────────────────── */

/**
 * A reader engaged with a published edition. PUBLIC — a reader of a free
 * digital edition, or someone scanning a printed QR, is not a SponsorX user.
 * The protection is that the edition must be published and the target must be
 * real; the route rate-limits. No fan identity is stored.
 */
export async function recordEditionEvent(
  editionId: string,
  input: { type: EngagementType; targetKind: TargetKind; targetRef: string; city?: string | null; region?: string | null },
): Promise<{ id: string; type: EngagementType }> {
  const edition = await prisma.edition.findFirst({
    /* tenant-scope: public route — no actor; the edition's own tenantId is stamped onto the event. */
    where: { id: editionId, state: { in: [...PUBLISHED_STATES] as Prisma.EnumEditionStateFilter["in"] } },
    select: { id: true, tenantId: true },
  });
  if (!edition) throw new EditionNotFoundError();
  if (input.targetKind === "AD_SLOT") {
    const slot = await prisma.adSlot.findFirst({
      where: { tenantId: edition.tenantId, editionId, id: input.targetRef },
      select: { id: true },
    });
    if (!slot) throw new EditionNotFoundError();
  }
  const event = await prisma.editionEvent.create({
    data: {
      tenantId: edition.tenantId, editionId, type: input.type,
      targetKind: input.targetKind, targetRef: input.targetRef,
      city: input.city ?? null, region: input.region ?? null,
    },
    select: { id: true, type: true },
  });
  return { id: event.id, type: event.type as EngagementType };
}

/** Print and digital, never pooled — what the sponsor report shows. */
export type EditionEngagement = {
  print: { QR_SCAN: number };
  digital: { LINK_CLICK: number; PROFILE_VIEW: number; CAMPAIGN_VIEW: number; CTA_CLICK: number };
};

export function foldEngagement(rows: Array<{ type: string; _count: number }>): EditionEngagement {
  const n = (t: EngagementType) => rows.find((r) => r.type === t)?._count ?? 0;
  return {
    print: { QR_SCAN: n("QR_SCAN") },
    digital: { LINK_CLICK: n("LINK_CLICK"), PROFILE_VIEW: n("PROFILE_VIEW"), CAMPAIGN_VIEW: n("CAMPAIGN_VIEW"), CTA_CLICK: n("CTA_CLICK") },
  };
}

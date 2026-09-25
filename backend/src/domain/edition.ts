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
import { audit } from "../db/audit";
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
import { rightsGap } from "./content-rights";
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
        thresholdCents: input.thresholdCents,
      },
      select: { id: true, state: true },
    });
    await audit(tx, actor, "edition.create", "Edition", edition.id, { after: { publicationId, label: input.label } });
    return { id: edition.id, state: edition.state as EditionState };
  });
}

export async function getEdition(actor: Actor, editionId: string) {
  const edition = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "read"), id: editionId },
    select: {
      id: true, publicationId: true, label: true, closeDate: true, publishTarget: true,
      printDate: true, pageCount: true, contentReady: true, rightsCleared: true,
      revenueMet: true, thresholdCents: true, state: true,
    },
  });
  if (!edition) throw new ForbiddenError("edition", "read");
  return edition;
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
      select: { id: true, contentReady: true },
    });
    if (!edition) throw new ForbiddenError("edition", "approve");
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
 */
export async function transitionEdition(
  actor: Actor,
  editionId: string,
  to: EditionState,
): Promise<{ id: string; state: EditionState }> {
  assertAllowed(actor, "edition", "approve");
  return prisma.$transaction(async (tx) => {
    const edition = await tx.edition.findFirst({
      where: { ...whereFor(actor, "edition", "approve"), id: editionId },
      select: {
        id: true, state: true, contentReady: true, rightsCleared: true, revenueMet: true,
        thresholdCents: true, publishTarget: true, printDate: true,
      },
    });
    if (!edition) throw new ForbiddenError("edition", "approve");
    const from = edition.state as EditionState;

    /* P9-BE-10 — the gate asks the ledger, in one query, which assets have no
       right for this format on this date. Digital clears production and the
       digital edition; print is asked only when it is printed, so a
       digital-first edition clears while print rights are still outstanding. */
    let rightsCleared = edition.rightsCleared;
    if (to === "IN_PRODUCTION" || to === "PUBLISHED_DIGITAL") {
      rightsCleared = (await rightsGap(tx, actor.tenantId, editionId, "DIGITAL", edition.publishTarget)).length === 0;
    }
    if (to === "PRINTED") {
      const gap = await rightsGap(tx, actor.tenantId, editionId, "PRINT", edition.printDate ?? new Date());
      if (gap.length) throw new RightsNotClearedError("print", gap.map((a) => a.title));
    }
    if (to === "PUBLISHED_DIGITAL" && !rightsCleared) {
      const gap = await rightsGap(tx, actor.tenantId, editionId, "DIGITAL", edition.publishTarget);
      throw new RightsNotClearedError("digital", gap.map((a) => a.title));
    }
    assertEditionTransition(from, to, { ...edition, rightsCleared });

    let revenueMet = edition.revenueMet;
    if (to === "CLOSED") revenueMet = (await resolveSplit(tx, actor.tenantId, editionId)) >= edition.thresholdCents;
    /* P9-BE-14 — a regional edition's school pools resolve by formula when
       it publishes, from its frozen revenue and final content. */
    if (to === "PUBLISHED_DIGITAL") await resolveSchoolPools(tx, actor.tenantId, editionId);

    const updated = await tx.edition.update({
      where: { id: editionId },
      data: { state: to as Prisma.EditionUpdateInput["state"], revenueMet, rightsCleared },
      select: { id: true, state: true },
    });
    await audit(tx, actor, "edition.transition", "Edition", editionId, { before: { state: from }, after: { state: to } });
    return { id: updated.id, state: updated.state as EditionState };
  });
}

/* ── revenue split (P9-BE-06) ───────────────────────────────────────────── */

/** Recompute the edition's four RevenueSplit rows from its sold slots.
 *  Returns the revenue in cents. Writes RevenueSplit only — never Earning. */
async function resolveSplit(tx: Prisma.TransactionClient, tenantId: string, editionId: string): Promise<number> {
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

export async function addSlot(
  actor: Actor,
  editionId: string,
  input: { slotCode: string; kind: AdSlotKind; priceCents: number },
): Promise<{ id: string }> {
  assertAllowed(actor, "adSlot", "write");
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.edition.findFirst({
        where: { ...whereFor(actor, "edition", "read"), id: editionId },
        select: { id: true, state: true },
      });
      if (!edition) throw new ForbiddenError("adSlot", "write");
      if (edition.state !== "PLANNING" && edition.state !== "SELLING") {
        throw new SlotConflictError(`An edition that is ${edition.state} takes no new positions.`);
      }
      const slot = await tx.adSlot.create({
        data: { tenantId: actor.tenantId, editionId, ...input },
        select: { id: true },
      });
      await audit(tx, actor, "adSlot.create", "AdSlot", slot.id, { after: input });
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

/**
 * Sell an edition's positions to a campaign — the positions its package
 * promises, no more and no fewer. P9-BE-03, -09.
 *
 * All or nothing: a Local Business Package that cannot get its full page does
 * not quietly sell the rest. The sale value is the package price, frozen onto
 * the slots at sale; it can differ from rack, and the edition's revenue (and
 * so its split) is what was actually sold.
 */
export async function sellCampaignSlots(
  actor: Actor,
  editionId: string,
  campaignId: string,
): Promise<{ slots: Array<{ id: string; slotCode: string; kind: string; soldCents: number }> }> {
  assertAllowed(actor, "adSlot", "write");
  try {
    return await prisma.$transaction(async (tx) => {
      const edition = await tx.edition.findFirst({
        where: { ...whereFor(actor, "edition", "read"), id: editionId },
        select: { id: true, state: true, closeDate: true },
      });
      if (!edition) throw new ForbiddenError("adSlot", "write");
      assertCanSell(edition.state as EditionState, edition.closeDate);

      const campaign = await tx.campaign.findFirst({
        where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
        select: {
          id: true, state: true, sponsorId: true,
          brief: { select: { studentCodeId: true, package: { select: { code: true, priceLow: true, includes: true } } } },
        },
      });
      if (!campaign) throw new ForbiddenError("campaign", "read");
      if (campaign.state !== "DRAFT") {
        throw new SlotConflictError(`A campaign that is ${campaign.state} cannot buy more placements.`);
      }
      const pkg = campaign.brief?.package ?? null;
      const wanted = positionsFor((pkg?.includes as IncludeLine[] | null) ?? null);
      if (!pkg || wanted.length === 0) throw new NoAdInventoryError();

      const already = await tx.adSlot.count({ where: { tenantId: actor.tenantId, editionId, campaignId } });
      if (already > 0) throw new SlotConflictError("This campaign already holds placements in this edition.");

      const picked: Array<{ id: string; slotCode: string; kind: string; priceCents: number }> = [];
      for (const kind of wanted) {
        const slot = await tx.adSlot.findFirst({
          where: {
            tenantId: actor.tenantId, editionId, kind, campaignId: null,
            id: { notIn: picked.map((p) => p.id) },
          },
          select: { id: true, slotCode: true, kind: true, priceCents: true },
          orderBy: { slotCode: "asc" },
        });
        if (!slot) throw new SlotConflictError(`No ${kind.replace("_", " ").toLowerCase()} is left in this edition.`);
        picked.push(slot);
      }

      const values = spreadPrice(pkg.priceLow * 100, picked.map((p) => p.priceCents));
      const soldAt = new Date();
      for (const [i, slot] of picked.entries()) {
        /* Conditional on still being unsold: two sales racing for the last
           back cover — one wins, the other matches nothing and stops. */
        const won = await tx.adSlot.updateMany({
          where: { id: slot.id, tenantId: actor.tenantId, campaignId: null },
          data: { campaignId, soldCents: values[i]!, soldAt },
        });
        if (won.count !== 1) throw new SlotConflictError(`${slot.slotCode} was sold a moment ago.`);
      }
      await audit(tx, actor, "adSlot.sell", "Campaign", campaignId, {
        after: { editionId, package: pkg.code, slots: picked.map((p) => p.slotCode) },
      });
      /* P9-BE-07 — a sponsor who arrived on a student's code: the sale is
         credited to that student in the same transaction as the sale. */
      if (campaign.brief?.studentCodeId) {
        await attributeSale(tx, actor, {
          studentCodeId: campaign.brief.studentCodeId, sponsorId: campaign.sponsorId,
          campaignId, editionId, valueCents: values.reduce((sum, v) => sum + v, 0),
        });
      }
      return {
        slots: picked.map((p, i) => ({ id: p.id, slotCode: p.slotCode, kind: p.kind, soldCents: values[i]! })),
      };
    });
  } catch (error) {
    return asSlotConflict(error);
  }
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

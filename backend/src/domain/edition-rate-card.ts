/**
 * A masthead's rate card — P9-BE-18 (programme owner, 2026-10-03, item 23).
 *
 * WHY A NEW TABLE. Nothing priced a position per masthead before: the NEXT
 * packages (sponsor-packages.ts) price what a SPONSOR buys, and every slot's
 * rack price was typed in by hand. This is the minimal card the task asks
 * for — one price per position kind, per publication — kept by BTG admin
 * (publication write, tenant-wide). The prices themselves are BTG's: the
 * shares in revenue-split.ts stay SIMULATED, and nothing here is seeded.
 *
 * HOW A SLOT USES IT (edition.ts `addSlot`). Where the card prices the
 * kind, a slot added without a price takes the card's, and a typed price
 * that differs is REFUSED (422) — not flagged and held: a wrong rack price
 * would flow into the sale's spread and the edition's revenue, so it is
 * stopped at the door. Where the card has no price for the kind, the price
 * is typed, as before.
 *
 * Changing the card does not reprice slots already added: a slot's rack
 * price is what it was listed at.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import type { AdSlotKind } from "./edition";

export const RATE_CARD_KINDS: readonly AdSlotKind[] = ["QUARTER", "HALF", "FULL", "BACK_COVER", "PRESENTING"];

/** The card's price for this kind in this masthead, in cents, or null. */
export async function rateCardPrice(
  tx: Prisma.TransactionClient,
  tenantId: string,
  publicationId: string,
  kind: AdSlotKind,
): Promise<number | null> {
  const row = await tx.editionRateCard.findFirst({ where: { tenantId, publicationId, kind }, select: { priceCents: true } });
  return row?.priceCents ?? null;
}

export type RateCardView = { publicationId: string; prices: Array<{ kind: AdSlotKind; priceCents: number; updatedAt: string }> };

/** GET /publications/{id}/rate-card — whoever reads the inventory tenant-wide: BTG and SALES. */
export async function readEditionRateCard(actor: Actor, publicationId: string): Promise<RateCardView> {
  assertTenantWide(actor, "adSlot", "read");
  const pub = await prisma.publication.findFirst({
    where: { ...whereFor(actor, "adSlot", "read"), id: publicationId },
    select: { id: true, tenantId: true },
  });
  if (!pub) throw new ForbiddenError("publication", "read");
  const rows = await prisma.editionRateCard.findMany({
    where: { tenantId: pub.tenantId, publicationId },
    select: { kind: true, priceCents: true, updatedAt: true },
  });
  return {
    publicationId,
    prices: RATE_CARD_KINDS.flatMap((kind) => {
      const r = rows.find((x) => x.kind === kind);
      return r ? [{ kind, priceCents: r.priceCents, updatedAt: r.updatedAt.toISOString() }] : [];
    }),
  };
}

/**
 * PUT /publications/{id}/rate-card — BTG admin sets (a price) or clears
 * (null) each kind it names; kinds it leaves out are untouched. Audited with
 * the card before and after, as every pricing change is (§26).
 */
export async function setEditionRateCard(
  actor: Actor,
  publicationId: string,
  prices: Partial<Record<AdSlotKind, number | null>>,
): Promise<RateCardView> {
  assertTenantWide(actor, "publication", "write");
  await prisma.$transaction(async (tx) => {
    const pub = await tx.publication.findFirst({
      where: { ...whereFor(actor, "publication", "write"), id: publicationId },
      select: { id: true, tenantId: true },
    });
    if (!pub) throw new ForbiddenError("publication", "write");
    const before = await tx.editionRateCard.findMany({
      where: { tenantId: pub.tenantId, publicationId }, select: { kind: true, priceCents: true },
    });
    for (const kind of RATE_CARD_KINDS) {
      if (!(kind in prices)) continue;
      const price = prices[kind];
      if (price === null || price === undefined) {
        await tx.editionRateCard.deleteMany({ where: { tenantId: pub.tenantId, publicationId, kind } });
      } else {
        await tx.editionRateCard.upsert({
          where: { publicationId_kind: { publicationId, kind } },
          create: { tenantId: pub.tenantId, publicationId, kind, priceCents: price, updatedBy: actor.userId },
          update: { priceCents: price, updatedBy: actor.userId },
          select: { id: true },
        });
      }
    }
    const after = await tx.editionRateCard.findMany({
      where: { tenantId: pub.tenantId, publicationId }, select: { kind: true, priceCents: true },
    });
    await audit(tx, { userId: actor.userId, tenantId: pub.tenantId }, "rateCard.set", "Publication", publicationId, {
      before: Object.fromEntries(before.map((r) => [r.kind, r.priceCents])),
      after: Object.fromEntries(after.map((r) => [r.kind, r.priceCents])),
    });
  });
  return readEditionRateCard(actor, publicationId);
}

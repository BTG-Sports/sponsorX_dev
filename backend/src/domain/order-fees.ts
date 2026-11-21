/**
 * POL-BE-119 — the sponsor's fee statement for a cart about to become an
 * order. One function for both sides of the checkout: the read that shows it
 * (reservation.ts) and the placement that checks it was the one shown
 * (marketplace-order.ts), so the two can never word or count it differently.
 */
import type { Prisma } from "../generated/prisma/client";
import { env } from "../config/env";
import { resolveFeeTerms } from "./ledger";
import { sponsorStatementFor, type FeeLine } from "./fee-statement";

export type CartFeeLine = {
  id: string;
  startsOn: Date;
  quantity: number;
  unitPriceCents: number;
  listing: { inventoryItemId: string; propertyId: string | null; sellerAthleteId: string | null };
};

/** The cart's lines in the ledger's order (fee-statement.ts FEE_LINE_ORDER), as fee lines. */
export function feeLinesOf(lines: readonly CartFeeLine[]): FeeLine[] {
  return [...lines]
    .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((l) => ({ id: l.id, lineTotalCents: l.quantity * l.unitPriceCents }));
}

/** The rates these cart lines would carry if placed now, keyed by cart line id, and the sponsor's statement. */
export async function cartFees(tx: Prisma.TransactionClient, operatorTenantId: string, sponsorId: string, lines: readonly CartFeeLine[], now: Date) {
  const terms = await resolveFeeTerms(tx, operatorTenantId, sponsorId,
    lines.map((l) => ({ key: l.id, inventoryItemId: l.listing.inventoryItemId, propertyId: l.listing.propertyId, sellerAthleteId: l.listing.sellerAthleteId })),
    now, env.MARKETPLACE_BUYER_FEE_BPS);
  return { terms, statement: sponsorStatementFor("MARKETPLACE_ORDER", terms, feeLinesOf(lines)) };
}

export const CART_FEE_LINE_SELECT = {
  id: true, startsOn: true, quantity: true, unitPriceCents: true,
  listing: { select: { inventoryItemId: true, propertyId: true, sellerAthleteId: true } },
} as const;

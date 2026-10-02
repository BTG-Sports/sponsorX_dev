/**
 * A seller's own cancellations — 2S4-BE-12.
 *
 * "Record the cancellation durably so the standing count is a query, not a
 * guess." A seller cancelling a paid line it can't deliver stamps the line
 * (OrderLineDelivery.cancelledBy = SELLER, cancelledSellerType / Id, at
 * cancelledAt); this counts them over the rolling window. The seller is the
 * line's: the property that sold it, or the independent athlete.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { SELLER_CANCELLATION_WINDOW_DAYS } from "./listing-rules";

type Db = Prisma.TransactionClient | typeof prisma;
export type SellerRef = { type: "PROPERTY" | "ATHLETE"; id: string };

const DAY = 86_400_000;

/** Who a sold line counts against: its team when it has one, else its (independent) athlete. Pure. */
export function sellerOfLine(d: { propertyId: string | null; athleteId: string | null }): SellerRef | null {
  if (d.propertyId) return { type: "PROPERTY", id: d.propertyId };
  return d.athleteId ? { type: "ATHLETE", id: d.athleteId } : null;
}

/** How many sold lines this seller cancelled itself in the last 90 days. */
export async function sellerCancellationCount(db: Db, seller: SellerRef, now = new Date()): Promise<number> {
  return db.orderLineDelivery.count({
    /* tenant-scope: a seller's own cancellations across the books it sells into, named by the seller's own id (unique). */
    where: { cancelledBy: "SELLER", cancelledSellerType: seller.type, cancelledSellerId: seller.id, cancelledAt: { gt: new Date(now.getTime() - SELLER_CANCELLATION_WINDOW_DAYS * DAY) } },
  });
}

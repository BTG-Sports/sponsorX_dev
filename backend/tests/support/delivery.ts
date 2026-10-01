import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * The delivery a real order goes through before it can be fulfilled
 * (2S4-BE-07): every paid line marked delivered by its seller and confirmed by
 * the sponsor. Suites about money, not delivery, call this before walking an
 * order to FULFILLED — a manual FULFILLED is refused over an unsettled line.
 */
export async function settleDeliveries(prisma: PrismaClient, orderId: string, at = new Date()) {
  await prisma.orderLineDelivery.updateMany({
    where: { orderId, state: { in: ["IN_DELIVERY", "DELIVERED"] } },
    data: {
      state: "CONFIRMED", deliveredAt: at, deliveredByName: "test seller", note: "Delivered as agreed.",
      confirmDueAt: at, confirmedAt: at, confirmedBy: "test sponsor", confirmedHow: "SPONSOR",
    },
  });
}

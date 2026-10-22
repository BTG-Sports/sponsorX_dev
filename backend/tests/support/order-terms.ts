import type { PrismaClient } from "../../src/generated/prisma/client";
import { agreementHash, versionInForce } from "./agreements";

/* --------------------------------------------------------------------------
   2S4-FE-02 — the checkout's contract gate, for suites that place
   marketplace orders. An order is placed only with the sponsor's acceptance
   of the tenant's MARKETPLACE_ORDER terms and a confirmed billing contact,
   so each such suite issues the real wording in force (the highest
   agreements/MARKETPLACE_ORDER.v<n>.txt) for its tenant and sends the
   acceptance with every POST /marketplace-orders.
   -------------------------------------------------------------------------- */

/** The version in force, and the fingerprint of its text as the server re-hashes it. */
export const ORDER_TERMS_VERSION = versionInForce("MARKETPLACE_ORDER");
export const ORDER_TERMS_HASH = agreementHash("MARKETPLACE_ORDER");

/** Issue the MARKETPLACE_ORDER version in force for a test tenant; returns the agreement id. */
export async function issueOrderTerms(prisma: PrismaClient, tenantId: string, id = `${tenantId}_order_terms`) {
  await prisma.agreement.create({
    data: { id, tenantId, kind: "MARKETPLACE_ORDER", version: ORDER_TERMS_VERSION, bodyHash: ORDER_TERMS_HASH, effectiveAt: new Date("2026-01-01") },
  });
  return id;
}

export const TEST_BILLING = { name: "Morgan Hale", email: "billing@sponsor-test.invalid", reference: "PO-1001" };

/** The body POST /marketplace-orders takes: the hold, the terms accepted, the billing contact. */
export function placeOrderBody(reservationId: string, agreementId: string, billing: Record<string, unknown> = TEST_BILLING) {
  return { reservationId, agreementId, bodyHashShown: ORDER_TERMS_HASH, billing };
}

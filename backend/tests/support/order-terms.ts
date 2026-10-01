import { readFileSync } from "node:fs";

import type { PrismaClient } from "../../src/generated/prisma/client";
import { hashAgreementBody } from "../../src/domain/agreement-hash";

/* --------------------------------------------------------------------------
   2S4-FE-02 — the checkout's contract gate, for suites that place
   marketplace orders. An order is placed only with the sponsor's acceptance
   of the tenant's MARKETPLACE_ORDER terms and a confirmed billing contact,
   so each such suite issues the real v1 wording for its tenant and sends
   the acceptance with every POST /marketplace-orders.
   -------------------------------------------------------------------------- */

/** The fingerprint of the real v1 text, as the server re-hashes it. */
export const ORDER_TERMS_HASH = hashAgreementBody(
  readFileSync(new URL("../../agreements/MARKETPLACE_ORDER.v1.txt", import.meta.url), "utf8"),
);

/** Issue MARKETPLACE_ORDER v1 for a test tenant; returns the agreement id. */
export async function issueOrderTerms(prisma: PrismaClient, tenantId: string, id = `${tenantId}_order_terms`) {
  await prisma.agreement.create({
    data: { id, tenantId, kind: "MARKETPLACE_ORDER", version: 1, bodyHash: ORDER_TERMS_HASH, effectiveAt: new Date("2026-01-01") },
  });
  return id;
}

export const TEST_BILLING = { name: "Morgan Hale", email: "billing@sponsor-test.invalid", reference: "PO-1001" };

/** The body POST /marketplace-orders takes: the hold, the terms accepted, the billing contact. */
export function placeOrderBody(reservationId: string, agreementId: string, billing: Record<string, unknown> = TEST_BILLING) {
  return { reservationId, agreementId, bodyHashShown: ORDER_TERMS_HASH, billing };
}

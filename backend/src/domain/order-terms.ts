/**
 * What a sponsor is shown at checkout before placing a marketplace order —
 * 2S4-FE-02, "Build checkout and contract gate".
 *
 *   - THE TERMS. The tenant's current MARKETPLACE_ORDER agreement and its
 *     body, served through `loadAgreementBody` — which re-hashes the file on
 *     the server and refuses it if it no longer matches the stored version.
 *     The checkout shows exactly these words and sends their hash back;
 *     placeOrder asks this same function again, inside its transaction, so a
 *     new version issued mid-checkout (or a file edited after issue) refuses
 *     the order rather than recording an acceptance of words nobody saw.
 *   - THE BILLING PREFILL. The sponsor's primary contact (SponsorContact),
 *     or its first one, which the sponsor confirms or corrects. Only a
 *     prefill: what the order keeps is what the sponsor confirmed.
 *
 * Shared by reservation.ts (GET /reservations/:id) and marketplace-order.ts
 * (POST /marketplace-orders), which is why it is its own module — the order
 * already imports the reservation.
 */
import type { Prisma } from "../generated/prisma/client";
import type { prisma } from "../db/client";
import { loadAgreementBody } from "./agreement-text";
import { MARKETPLACE_ORDER_TERMS_KIND } from "./marketplace-order-rules";

type Db = Prisma.TransactionClient | typeof prisma;

export type OrderTerms = { id: string; kind: string; version: number; bodyHash: string; body: string };

/** The terms in force for this tenant, or null when none is issued or its file no longer matches. */
export async function currentOrderTerms(db: Db, tenantId: string, now = new Date()): Promise<OrderTerms | null> {
  const a = await db.agreement.findFirst({
    where: { tenantId, kind: MARKETPLACE_ORDER_TERMS_KIND, effectiveAt: { lte: now } },
    orderBy: { version: "desc" },
    select: { id: true, kind: true, version: true, bodyHash: true },
  });
  if (!a) return null;
  const body = await loadAgreementBody(a);
  return body === null ? null : { ...a, body };
}

/** The sponsor's name and the contact to prefill the billing step with. */
export async function billingPrefill(db: Db, tenantId: string, sponsorId: string) {
  const sponsor = await db.sponsor.findFirst({
    where: { tenantId, id: sponsorId },
    select: {
      name: true,
      contacts: { where: { tenantId }, select: { name: true, email: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }], take: 1 },
    },
  });
  return { sponsorName: sponsor?.name ?? null, billingContact: sponsor?.contacts[0] ?? null };
}

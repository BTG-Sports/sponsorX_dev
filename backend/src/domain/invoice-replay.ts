/**
 * Refusing a replayed invoice webhook — 2S8-SEC-04.
 *
 * Shared by both mirrors (invoice.ts for campaigns, order-payment.ts for
 * marketplace orders), in its own module so neither imports the other for it.
 * The rule itself is pure, in invoice-status-rules.ts.
 */
import type { Prisma } from "../generated/prisma/client";
import { audit } from "../db/audit";
import { backwardsMove } from "./invoice-status-rules";

/**
 * 2S8-SEC-04 — refuse, and audit, a payload that would move a stored invoice
 * backwards (invoice-status-rules.ts). Returns the outcome to give, or null
 * when the payload may be applied. The audit row is written in the caller's
 * transaction, which commits: the refusal is a decision, not a failure.
 */
export async function refuseIfBackwards(
  tx: Prisma.TransactionClient,
  tenantId: string,
  entity: "CampaignInvoice" | "MarketplaceOrderInvoice",
  stored: { id: string; status: string; balance?: number | null } | null,
  payload: { invoiceId: string; status: string; balance?: number | null },
): Promise<{ applied: false; reason: string; stale: true } | null> {
  const reason = stored ? backwardsMove(stored, payload) : null;
  if (!stored || !reason) return null;
  await audit(tx, { userId: null, tenantId }, "invoice.staleRefused", entity, stored.id, {
    before: { status: stored.status, balance: stored.balance ?? null },
    after: { zohoInvoiceId: payload.invoiceId, status: payload.status, balance: payload.balance ?? null, reason },
  });
  return { applied: false, reason: `refused: ${reason}`, stale: true };
}

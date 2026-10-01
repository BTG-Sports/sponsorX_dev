/**
 * Payouts held — 2S1-BE-09 / -10 ("Reject … holds their payouts").
 *
 * A payee BTG has rejected after approval keeps the money they have earned
 * — it stays owed, in the ledger — but none of it moves while the rejection
 * stands: no new payout is requested for them, BTG cannot approve one, and
 * an approved one is not handed to the provider. Reinstate lifts the hold
 * with the rejection. One question, asked at those three points in
 * payouts.ts.
 *
 * Athletes today (Athlete.signupRejectedAt). An organisation's Reject
 * (2S1-BE-06) answers the same question for a PROPERTY payee here.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** Why this payee's payouts are held, or null when they are not. */
export async function payoutHoldReason(db: Db, payee: { payeeType: string; payeeId: string; payeeTenantId: string }): Promise<string | null> {
  if (payee.payeeType !== "ATHLETE") return null;
  const a = await db.athlete.findFirst({
    where: { tenantId: payee.payeeTenantId, id: payee.payeeId }, select: { signupRejectedAt: true },
  });
  return a?.signupRejectedAt ? "BTG has closed this athlete's account, so their payouts are on hold. Money earned stays owed to them." : null;
}

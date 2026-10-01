/**
 * Payouts held — one question for every payee BTG has rejected after approval.
 *
 * A rejected payee keeps the money they have earned — it stays owed, in the
 * ledger — but none of it moves while the rejection stands: no new payout is
 * requested for them, BTG cannot approve one, and an approved one is not
 * handed to the provider (it waits, APPROVED). Reinstate lifts the hold with
 * the rejection. Asked at those three points in payouts.ts — requestPayout,
 * decidePayout (APPROVE) and sendPayout — and nowhere else answers it.
 *
 *   - ATHLETE payees (2S1-BE-09 / -10): `Athlete.signupRejectedAt`, set by
 *     BTG's Reject of the athlete or of their guardian (signups-desk.ts).
 *   - PROPERTY payees (2S1-BE-06): `Property.payoutsHeldAt`, set by BTG's
 *     Reject of the organisation (onboarding.ts `withdraw`).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";

type Db = Prisma.TransactionClient | typeof prisma;

export const ATHLETE_PAYOUTS_HELD = "BTG has closed this athlete's account, so their payouts are on hold. Money earned stays owed to them.";
export const PROPERTY_PAYOUTS_HELD = "Payouts are on hold — BTG has rejected this organisation. Contact BTG support.";

/** Why this payee's payouts are held, or null when they are not. */
export async function payoutHoldReason(db: Db, payee: { payeeType: string; payeeId: string; payeeTenantId?: string }): Promise<string | null> {
  if (payee.payeeType === "ATHLETE") {
    const a = await db.athlete.findFirst({
      /* tenant-scope: the payee named by the payout row (or the actor's own link); its own tenant when known. */
      where: { id: payee.payeeId, ...(payee.payeeTenantId ? { tenantId: payee.payeeTenantId } : {}) },
      select: { signupRejectedAt: true },
    });
    return a?.signupRejectedAt ? ATHLETE_PAYOUTS_HELD : null;
  }
  if (payee.payeeType === "PROPERTY") {
    const p = await db.property.findFirst({
      /* tenant-scope: the payee named by the payout row (or the actor's own link). */
      where: { id: payee.payeeId }, select: { payoutsHeldAt: true },
    });
    return p?.payoutsHeldAt ? PROPERTY_PAYOUTS_HELD : null;
  }
  return null;
}

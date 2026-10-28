/**
 * The payout account follows whoever is responsible for the athlete's
 * money — POL-BE-01.
 *
 * An athlete has one payout account (`PayoutAccount`, unique per payee),
 * but the account at the provider is the PERSON who set it up: for a
 * minor, their guardian (their identity, their bank). When someone else
 * becomes responsible — a guardian handoff (guardian-handoff.ts), or the
 * athlete coming of age (coming-of-age.ts) — that account must stop
 * receiving the athlete's money, and the new holder must be able to open
 * their own.
 *
 * Decided 2026-10-28 (rcfworks, with Rodney's delegated authority), in
 * place of the 2026-10-01 rule that money already earned stays with the
 * account it was earned under: everything NOT YET SENT follows the athlete
 * to the new holder's account.
 *
 *   - The account is DETACHED: SponsorX forgets the provider's account
 *     (status NOT_SET_UP, no account id). Nothing is deleted at the
 *     provider and nothing already sent is taken back; the previous holder
 *     keeps their own account and its history.
 *   - Payouts already approved but not sent wait: none is ever sent to an
 *     account that isn't READY (payouts.ts `sendPayout`). The new
 *     holder's "Set up payouts" opens a new account in their name; when the
 *     provider says it is READY, the waiting payouts go to it.
 *   - `changedAt` is set, so the first payouts to the new account go to BTG
 *     for a check (2S5-BE-06's review window, payout-auto.ts).
 *   - A later word from the provider about the old account no longer finds
 *     the athlete (it is looked up by the account id) and changes nothing.
 *
 * Called inside the switch's own transaction, so the money stops moving at
 * the same moment control does.
 */
import type { Prisma } from "../generated/prisma/client";
import { audit, type AuditActor } from "../db/audit";
import { lockPayee } from "./payout-auto";

type Tx = Prisma.TransactionClient;

export type HolderChange = "guardian handoff" | "came of age";

/**
 * Was this provider account detached from an athlete? The provider may still
 * report on it (the previous holder updating their own account): that news is
 * not SponsorX's to act on, nor to wait for. Rare, so read from the audit
 * trail rather than kept in a table of its own.
 */
export async function wasDetached(db: Tx, accountRef: string): Promise<boolean> {
  const hit = await db.auditLog.findFirst({
    /* tenant-scope: a provider event names no tenant; the account id is the provider's own, unique across SponsorX. */
    where: { action: "payoutAccount.detached", entity: "PayoutAccount", before: { path: ["providerAccountId"], equals: accountRef } },
    select: { id: true },
  });
  return Boolean(hit);
}

/** Detach the athlete's payout account from the person who set it up. True when there was one to detach. */
export async function detachAthletePayoutAccountIn(tx: Tx, actor: AuditActor, athleteId: string, why: HolderChange, now: Date): Promise<boolean> {
  const payee = { payeeType: "ATHLETE", payeeId: athleteId };
  await lockPayee(tx, payee);
  const row = await tx.payoutAccount.findUnique({
    /* tenant-scope: the athlete's own account, by the unique payee key; the caller loaded the athlete in its tenant. */
    where: { payeeType_payeeId: payee }, select: { id: true, provider: true, providerAccountId: true, status: true },
  });
  /* Nothing set up yet: nothing to detach. */
  if (!row || (!row.providerAccountId && row.status === "NOT_SET_UP")) return false;
  await tx.payoutAccount.update({
    /* tenant-scope: the row just loaded by the athlete's unique payee key. */
    where: { id: row.id }, data: { providerAccountId: null, status: "NOT_SET_UP", changedAt: now }, select: { id: true },
  });
  await audit(tx, actor, "payoutAccount.detached", "PayoutAccount", `ATHLETE:${athleteId}`, {
    before: { provider: row.provider, providerAccountId: row.providerAccountId, status: row.status },
    after: { providerAccountId: null, status: "NOT_SET_UP", reason: why },
  });
  return true;
}

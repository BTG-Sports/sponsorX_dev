/**
 * Finance locks an edition's revenue split — P9-BE-19 (programme owner,
 * 2026-10-03, item 23).
 *
 * Finance (the `revenueSplit.approve` row of matrix §15.4, which existed
 * unused until now) locks the split once it has checked it, with a note.
 * Locked, the split and any school pools already resolved are never
 * replaced: `resolveSplit` (edition.ts) and `resolveSchoolPools`
 * (dmv-pools.ts) refuse the recompute and audit the refusal, and Postgres
 * refuses the write besides (triggers revenuesplit_guard_lock and
 * schoolpool_guard_lock). BTG admin (`edition.approve`, tenant-wide) unlocks,
 * with a reason; Finance cannot unlock its own lock.
 *
 * THE LOCK IS WHAT A PAYOUT WILL ASK FOR. Nothing pays out from a split
 * today — the shares are SIMULATED (revenue-split.ts) until BTG prices
 * edition one. Any future payout to a school, a student pool or the
 * editorial fund MUST call `assertSplitLocked` first, in its own
 * transaction, so money only ever leaves on figures Finance has signed off.
 */
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { lockEdition } from "./edition";
import { splitLockedView, type EditionAutomationView } from "./edition-automation";

export class SplitLockError extends Error {
  readonly status: number;
  readonly code = "split_lock";
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SplitLockError";
    this.status = status;
  }
}

/** Refuse unless the edition's split is locked. Every payout from a split must ask this first. */
export function assertSplitLocked(edition: { splitLockedAt: Date | null }): void {
  if (!edition.splitLockedAt) {
    throw new SplitLockError("Finance hasn't locked this edition's split, so nothing can be paid from it yet.");
  }
}

const trimmed = (text: string | undefined | null, what: string) => {
  const t = (text ?? "").trim();
  if (!t || t.length > 500) throw new SplitLockError(`Give ${what} (up to 500 characters).`, 422);
  return t;
};

/** POST /editions/{id}/splits/lock — Finance, with a note. */
export async function lockSplit(actor: Actor, editionId: string, input: { note: string }, now = new Date()): Promise<{ id: string; splitLocked: EditionAutomationView["splitLocked"] }> {
  assertTenantWide(actor, "revenueSplit", "approve");
  const note = trimmed(input.note, "a note saying what you checked");
  return prisma.$transaction(async (tx) => {
    const found = await tx.edition.findFirst({
      where: { ...whereFor(actor, "revenueSplit", "approve"), id: editionId },
      select: { id: true, tenantId: true },
    });
    if (!found) throw new ForbiddenError("revenueSplit", "approve");
    const state = await lockEdition(tx, found.id, found.tenantId);
    const e = await tx.edition.findFirstOrThrow({
      /* tenant-scope: the edition found through whereFor(revenueSplit, approve) and locked. */
      where: { id: found.id, tenantId: found.tenantId }, select: { splitLockedAt: true },
    });
    if (e.splitLockedAt) throw new SplitLockError(`This split was already locked on ${e.splitLockedAt.toISOString().slice(0, 10)}.`);
    if (state === "CANCELLED") throw new SplitLockError("This edition was cancelled; there is no split to lock.");
    const rows = await tx.revenueSplit.findMany({
      where: { tenantId: found.tenantId, editionId: found.id }, select: { payeeKind: true, bps: true, amountCents: true },
    });
    if (rows.length === 0) throw new SplitLockError("There is no split to lock yet — it is computed when the edition closes for ads.");
    await tx.edition.update({
      /* tenant-scope: the edition found through whereFor(revenueSplit, approve) and locked. */
      where: { id: found.id }, data: { splitLockedAt: now, splitLockedBy: actor.userId!, splitLockNote: note }, select: { id: true },
    });
    await audit(tx, { userId: actor.userId, tenantId: found.tenantId }, "revenueSplit.lock", "Edition", found.id, {
      before: { locked: false },
      after: { locked: true, note, splits: rows },
    });
    return { id: found.id, splitLocked: await splitLockedView(tx, found.tenantId, { splitLockedAt: now, splitLockedBy: actor.userId, splitLockNote: note }) };
  });
}

/** POST /editions/{id}/splits/unlock — BTG admin, with a reason. */
export async function unlockSplit(actor: Actor, editionId: string, input: { reason: string }): Promise<{ id: string; splitLocked: null }> {
  assertTenantWide(actor, "edition", "approve");
  const reason = trimmed(input.reason, "the reason for unlocking");
  return prisma.$transaction(async (tx) => {
    const found = await tx.edition.findFirst({
      where: { ...whereFor(actor, "edition", "approve"), id: editionId },
      select: { id: true, tenantId: true },
    });
    if (!found) throw new ForbiddenError("edition", "approve");
    await lockEdition(tx, found.id, found.tenantId);
    const e = await tx.edition.findFirstOrThrow({
      /* tenant-scope: the edition found through whereFor(edition, approve) and locked. */
      where: { id: found.id, tenantId: found.tenantId }, select: { splitLockedAt: true, splitLockedBy: true, splitLockNote: true },
    });
    if (!e.splitLockedAt) throw new SplitLockError("This split isn't locked.");
    await tx.edition.update({
      /* tenant-scope: the edition found through whereFor(edition, approve) and locked. */
      where: { id: found.id }, data: { splitLockedAt: null, splitLockedBy: null, splitLockNote: null }, select: { id: true },
    });
    await audit(tx, { userId: actor.userId, tenantId: found.tenantId }, "revenueSplit.unlock", "Edition", found.id, {
      before: { locked: true, lockedAt: e.splitLockedAt.toISOString(), lockedBy: e.splitLockedBy, note: e.splitLockNote },
      after: { locked: false, reason },
    });
    return { id: found.id, splitLocked: null };
  });
}

/** The lock as GET /editions/{id}/splits shows it — Finance's read. */
export async function splitLockOf(actor: Actor, editionId: string): Promise<EditionAutomationView["splitLocked"]> {
  const e = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "revenueSplit", "read"), id: editionId },
    select: { tenantId: true, splitLockedAt: true, splitLockedBy: true, splitLockNote: true },
  });
  if (!e) throw new ForbiddenError("revenueSplit", "read");
  return splitLockedView(prisma, e.tenantId, e);
}

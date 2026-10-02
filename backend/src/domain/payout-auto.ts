/**
 * The automatic-approval rule — 2S5-BE-06 (marketplace payouts) and
 * 2S5-BE-08 (Phase 1 earnings). The programme owner's decisions, 2026-10-02:
 *
 *   - Approve automatically when every check passes and the amount is under
 *     $2,000 (PAYOUT_AUTO_APPROVE_LIMIT_CENTS).
 *   - No special review of a payee's first payout: a payout account READY at
 *     the provider is enough.
 *   - Two safeguards send it to BTG instead: the payout account CHANGED in
 *     the last 7 days (PAYOUT_ACCOUNT_CHANGE_REVIEW_DAYS), or the payee's
 *     automatic approvals in the last 7 days (PAYOUT_AUTO_APPROVE_WINDOW_DAYS)
 *     reach $5,000 (PAYOUT_AUTO_APPROVE_WINDOW_CAP_CENTS), counting this one.
 *     For an athlete that total is Phase 2 payouts AND Phase 1 earnings.
 *   - A payee whose payouts are on hold (payout-holds.ts) is never approved
 *     automatically.
 *
 * This module holds the rule's words and its reads; it writes nothing. The
 * moves themselves are in payouts.ts (a payout) and earning.ts (an earning),
 * each audited there.
 *
 * ONE LOCK PER PAYEE. The 7-day total is read, then a row is approved on the
 * strength of it. Two approvals for the same payee at once — two payout
 * requests, or a payout request and the athlete's Phase 1 earning becoming
 * eligible — would each read the total without the other and both slip
 * under the cap. So every path that approves automatically (and every path
 * that changes the payee's payout account) first takes a transaction-scoped
 * advisory lock keyed on the payee, and reads the total after it.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { env } from "../config/env";

type Db = Prisma.TransactionClient | typeof prisma;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The rule's numbers, read from env at call time (as `limitSettings` reads the spending limit). */
export const autoApproveSettings = () => ({
  limitCents: env.PAYOUT_AUTO_APPROVE_LIMIT_CENTS ?? 200_000,
  accountChangeReviewDays: env.PAYOUT_ACCOUNT_CHANGE_REVIEW_DAYS ?? 7,
  windowDays: env.PAYOUT_AUTO_APPROVE_WINDOW_DAYS ?? 7,
  windowCapCents: env.PAYOUT_AUTO_APPROVE_WINDOW_CAP_CENTS ?? 500_000,
});
export type AutoApproveSettings = ReturnType<typeof autoApproveSettings>;

/** The system's name on a decision it made by rule. */
export const SYSTEM = "system";

/* ── who a payout waits on — 2S5-BE-07 ───────────────────────────────── */

export type WaitingOn = "SYSTEM_RETRY" | "PAYEE_ACCOUNT" | "BTG";
export const WAITING_ON: readonly WaitingOn[] = ["SYSTEM_RETRY", "PAYEE_ACCOUNT", "BTG"];
export type FailureKind = "TEMPORARY" | "ACCOUNT" | "OTHER";
export const FAILURE_KINDS: readonly FailureKind[] = ["TEMPORARY", "ACCOUNT", "OTHER"];

/**
 * Payouts that claim the payee's money: still on their way (REQUESTED,
 * APPROVED, SENDING) — or FAILED but going to be sent again without anyone
 * deciding to (an automatic retry is scheduled, or it waits for the payee's
 * account). The same money can't be requested twice, and an order can't be
 * refunded under one. A FAILED payout left for BTG no longer claims it.
 */
export const CLAIMING_STATES = ["REQUESTED", "APPROVED", "SENDING"] as const;
export const claimsMoney = {
  OR: [
    { state: { in: [...CLAIMING_STATES] } },
    { state: "FAILED", waitingOn: { in: ["SYSTEM_RETRY", "PAYEE_ACCOUNT"] } },
  ],
};

/** Who a payout waits on now: a REQUESTED one on BTG; a FAILED one as stored (BTG when unset). */
export function waitingOnOf(p: { state: string; waitingOn: string | null }): WaitingOn | null {
  if (p.state === "REQUESTED") return "BTG";
  if (p.state === "FAILED") return (WAITING_ON as readonly string[]).includes(p.waitingOn ?? "") ? (p.waitingOn as WaitingOn) : "BTG";
  return null;
}

/** The Prisma filter for "waits on …" (the BTG list's default: waitingOn BTG). */
export function waitingOnWhere(w: WaitingOn) {
  if (w === "BTG") return { OR: [{ state: "REQUESTED" }, { state: "FAILED", OR: [{ waitingOn: "BTG" }, { waitingOn: null }] }] };
  return { state: "FAILED", waitingOn: w };
}

/* ── the rule's words ─────────────────────────────────────────────────── */

/** "$2,000" for whole dollars, "$4,200.50" otherwise. */
export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/** "Oct 1" (UTC). */
export const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const ON_HOLD = "Payouts on hold";

export type RuleInput = {
  amountCents: number;
  /** The payee's payouts are on hold (payout-holds.ts). */
  held: boolean;
  /** Labels of the existing checks that are not met (a payout's four; none for an earning). */
  unmetChecks?: string[];
  /** When the payout account last changed — undefined where there is no account check (Phase 1). */
  accountChangedAt?: Date | null;
  /** Approved automatically for this payee in the window, NOT counting this one — in every tenant's books. */
  windowCents: number;
  /** Some of `windowCents` was approved in another tenant's books: the reason names no figure. */
  windowIncludesOtherTenants?: boolean;
  now: Date;
};

/**
 * Why this can't be approved automatically, in words — empty when it can.
 * Pure. The words are BTG's and Finance's; the payee never reads them.
 */
export function autoApprovalReasons(i: RuleInput, s: AutoApproveSettings = autoApproveSettings()): string[] {
  const out: string[] = [];
  for (const c of i.unmetChecks ?? []) out.push(`Not met: ${c}`);
  if (i.held) out.push(ON_HOLD);
  if (i.amountCents > s.limitCents) out.push(`Over ${dollars(s.limitCents)}`);
  else if (i.amountCents === s.limitCents) out.push(`At the ${dollars(s.limitCents)} limit`);
  if (i.accountChangedAt && i.accountChangedAt.getTime() > i.now.getTime() - s.accountChangeReviewDays * DAY_MS) {
    out.push(`Payout account changed on ${dayLabel(i.accountChangedAt)}`);
  }
  if (i.windowCents + i.amountCents >= s.windowCapCents) {
    /* The cap is the payee's across every tenant, but a tenant's BTG never
       reads a figure that includes another tenant's approvals. */
    out.push(i.windowIncludesOtherTenants
      ? `Automatic payouts in the last ${s.windowDays} days would reach the ${dollars(s.windowCapCents)} limit`
      : `${dollars(i.windowCents)} approved automatically in the last ${s.windowDays} days`);
  }
  return out;
}

/* ── the reads ────────────────────────────────────────────────────────── */

/**
 * The per-payee lock, held to the end of the caller's transaction. Every
 * automatic approval for this payee, every payout request and every change
 * of its payout account takes it first. An athlete's Phase 1 earnings and
 * Phase 2 payouts share it (the same key), as they share the 7-day total.
 */
export async function lockPayee(tx: Prisma.TransactionClient, payee: { payeeType: string; payeeId: string }): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `payee:${payee.payeeType}:${payee.payeeId}`);
}

/**
 * What was approved automatically for this payee since `since`: its
 * automatic payouts, and for an athlete also their automatic Phase 1
 * earnings (net). Call it after `lockPayee`.
 */
export async function autoApprovedSince(db: Db, payee: { payeeType: string; payeeId: string }, since: Date): Promise<number> {
  return autoWindowFor(await autoApprovedByTenant(db, payee, since), "").totalCents;
}

/** The same total, by the tenant whose books (or earnings) each approval is in. */
export async function autoApprovedByTenant(db: Db, payee: { payeeType: string; payeeId: string }, since: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const add = (tenantId: string, cents: number) => { if (cents) out.set(tenantId, (out.get(tenantId) ?? 0) + cents); };
  const payouts = await db.payout.groupBy({
    by: ["tenantId"],
    /* tenant-scope: the payee's own payouts in every set of books, by its payee key — the cap is the payee's, not a tenant's. */
    where: { payeeType: payee.payeeType, payeeId: payee.payeeId, approvedAutomatically: true, decidedAt: { gte: since } },
    _sum: { amountCents: true },
  });
  for (const g of payouts) add(g.tenantId, g._sum.amountCents ?? 0);
  if (payee.payeeType === "ATHLETE") {
    const earnings = await db.earning.groupBy({
      by: ["tenantId"],
      /* tenant-scope: the athlete's own Phase 1 earnings, by athlete id — the same person's 7-day total. */
      where: { athleteId: payee.payeeId, autoApprovedAt: { gte: since } },
      _sum: { gross: true, adjustment: true },
    });
    for (const g of earnings) add(g.tenantId, (g._sum.gross ?? 0) + (g._sum.adjustment ?? 0));
  }
  return out;
}

/**
 * The window as a reader in `readerTenantId` may see it: the payee's whole
 * total (the cap counts every tenant), and whether any of it is another
 * tenant's — in which case the reason names no figure. Pure.
 */
export function autoWindowFor(byTenant: Map<string, number>, readerTenantId: string): { totalCents: number; includesOtherTenants: boolean } {
  let totalCents = 0;
  let includesOtherTenants = false;
  for (const [tenantId, cents] of byTenant) {
    totalCents += cents;
    if (tenantId !== readerTenantId && cents !== 0) includesOtherTenants = true;
  }
  return { totalCents, includesOtherTenants };
}

/** The start of the rule's window. */
export const windowStart = (now: Date, s: AutoApproveSettings = autoApproveSettings()) => new Date(now.getTime() - s.windowDays * DAY_MS);

/* ── the payout account's "changed" — 2S5-BE-06 ───────────────────────── */

/**
 * The account's `changedAt` after a status report from the provider. Pure.
 *   - the provider's account id replaced by another → changed now;
 *   - the account leaving READY → changed now (where it is paid is in
 *     question until it returns);
 *   - returning to READY after having left it (changedAt already set) →
 *     changed now, a re-onboarding;
 *   - otherwise unchanged — an account set up once stays null.
 */
export function nextChangedAt(
  before: { status: string; providerAccountId: string | null; changedAt: Date | null } | null,
  after: { status: string; providerAccountId: string | null },
  now: Date,
): Date | null {
  if (!before) return null;
  if (before.providerAccountId && after.providerAccountId && before.providerAccountId !== after.providerAccountId) return now;
  if (before.status === "READY" && after.status !== "READY") return now;
  if (before.status !== "READY" && after.status === "READY" && before.changedAt) return now;
  return before.changedAt;
}

/* ── automatic retries — 2S5-BE-07 ────────────────────────────────────── */

/** Hours after each failure that the next automatic retry is due: 1, 6, 24. */
export const RETRY_AFTER_HOURS = [1, 6, 24] as const;
export const MAX_AUTO_RETRIES = RETRY_AFTER_HOURS.length;
export const GAVE_UP = `Couldn't be sent after ${MAX_AUTO_RETRIES} tries`;
export const WAITING_FOR_PAYEE = "Waiting for the payee to fix their payout account";
export const ACCOUNT_STILL_FAILING = "Couldn't be sent after the payee fixed their payout account";

export type FailurePlan = {
  waitingOn: WaitingOn;
  nextRetryAt: Date | null;
  reviewReasons: string[];
  /** Email the payee to fix their payout account. */
  tellPayee: boolean;
};

/**
 * What happens to a payout the provider couldn't send. Pure.
 *   TEMPORARY — retried automatically, up to 3 times, about 1, 6 and 24
 *     hours after each failure; the failure after the third retry is BTG's.
 *   ACCOUNT — the payee is emailed to fix their payout account; it is retried
 *     once, when the account is next READY; failing again, it is BTG's.
 *   OTHER — BTG's at once.
 */
export function planFailure(kind: FailureKind, p: { retryCount: number; accountRetryUsed: boolean }, now: Date): FailurePlan {
  if (kind === "TEMPORARY") {
    if (p.retryCount < MAX_AUTO_RETRIES) {
      return { waitingOn: "SYSTEM_RETRY", nextRetryAt: new Date(now.getTime() + RETRY_AFTER_HOURS[p.retryCount]! * 3_600_000), reviewReasons: [], tellPayee: false };
    }
    return { waitingOn: "BTG", nextRetryAt: null, reviewReasons: [GAVE_UP], tellPayee: false };
  }
  if (kind === "ACCOUNT") {
    if (!p.accountRetryUsed) return { waitingOn: "PAYEE_ACCOUNT", nextRetryAt: null, reviewReasons: [WAITING_FOR_PAYEE], tellPayee: true };
    return { waitingOn: "BTG", nextRetryAt: null, reviewReasons: [ACCOUNT_STILL_FAILING], tellPayee: false };
  }
  return { waitingOn: "BTG", nextRetryAt: null, reviewReasons: [], tellPayee: false };
}

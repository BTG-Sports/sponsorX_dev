/**
 * The books' shared rules, used by GET /earnings/* and GET /finance/overview
 * (P1-ART-25), so the Treasury and the Finance tables cannot disagree.
 *
 * Moved verbatim out of routes/v1/earnings.ts — a pure refactor, Task 1 of
 * the Finance Vault plan. Behaviour is unchanged; only the address is new.
 */
import type { Actor } from "../auth/actor";
import { can, scopeOf, whereFor } from "../auth/scope";
import { canReadField } from "../auth/fields";
import { ForbiddenError } from "../auth/errors";
import { prisma } from "../db/client";

export const EARNING_STATES = ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED"] as const;
export type EarningStateName = (typeof EARNING_STATES)[number];

export type Rights = { seeAmount: boolean; seeSell: boolean; seeInvoices: boolean; seeReasons: boolean };

export function rightsOf(actor: Actor): Rights {
  const seeAmount = canReadField(actor.roles, "earning.amount");
  const seeSell = seeAmount && canReadField(actor.roles, "campaignOrder.sellPrice");
  const seeInvoices = seeSell && can(actor, "invoice", "read");
  /* 2S5-BE-08 — why an earning was left for Finance: BTG's own words, and
     they name amounts. Tenant-wide readers who see amounts only (Finance,
     BTG admin) — never the athlete, never a role denied the amount. */
  const readScope = scopeOf(actor, "earning", "read");
  const seeReasons = seeAmount && (readScope === "own-tenant" || readScope === "any");
  return { seeAmount, seeSell, seeInvoices, seeReasons };
}

/* --- reconciliation (2026-09-29) --------------------------------------------

   GET /earnings/reconciliation — Finance's per-campaign reconciliation, one
   page at a time (?page= ?size=, default 12), computed per campaign from the
   database. It used to be derived from the 500-capped earnings list, so a
   campaign whose earnings fell past the cap silently dropped out of the
   books; now the campaign set is "every campaign the caller reads that has
   an earning the caller reads", counted and paged in SQL.

   Same gate as the list's `campaigns` block — `earning.amount`, sponsor
   price AND `invoice` read (BTG admin; not FINANCE, the 2026-09-24 matrix
   decision) — anyone else gets a 403, as they never got the block before.

   `totals` is over the whole set, not the page: invoiced / collected
   (void excluded, Zoho status compared case-insensitively), the collection
   rate, and invoice aging in cents — outstanding (not paid, not void) by
   days past due: not yet due (or no due date) / 1–30 / 31–60 / > 60, the
   same cut lib/earnings-live.ts's agingBuckets makes. */

export function reconciliationSet(actor: Actor) {
  return {
    AND: [
      whereFor(actor, "campaign", "read"),
      { orders: { some: { earning: { is: whereFor(actor, "earning", "read") } } } },
    ],
  };
}

export function requireInvoiceRights(actor: Actor) {
  if (!rightsOf(actor).seeInvoices) throw new ForbiddenError("invoice", "read");
}

export const NOT_SETTLED = {
  NOT: [
    { status: { equals: "paid", mode: "insensitive" as const } },
    { status: { equals: "void", mode: "insensitive" as const } },
  ],
};

const DAY = 86_400_000;

export async function reconciliationTotals(actor: Actor, now: Date) {
  const inSet = { campaign: { is: reconciliationSet(actor) } };
  const byStatus = await prisma.campaignInvoice.groupBy({
    by: ["status"],
    /* tenant-scope: through the campaign — whereFor(campaign) ∧ whereFor(earning). */
    where: inSet,
    _sum: { amount: true },
  } as never) as unknown as { status: string; _sum: { amount: number | null } }[];
  let invoiced = 0;
  let collected = 0;
  for (const g of byStatus) {
    const st = g.status.toLowerCase();
    if (st === "void") continue;
    invoiced += g._sum.amount ?? 0;
    if (st === "paid") collected += g._sum.amount ?? 0;
  }
  /* late = floor((now − due) / day): ≤0 not yet due, ≤30, ≤60, >60. */
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const cuts = [
    { OR: [{ dueAt: null }, { dueAt: { gt: ago(1) } }] },
    { dueAt: { gt: ago(31), lte: ago(1) } },
    { dueAt: { gt: ago(61), lte: ago(31) } },
    { dueAt: { lte: ago(61) } },
  ];
  const aging = await Promise.all(
    cuts.map((cut) =>
      prisma.campaignInvoice.aggregate({
        /* tenant-scope: through the campaign — whereFor(campaign) ∧ whereFor(earning). */
        where: { AND: [inSet, NOT_SETTLED, cut] },
        _sum: { amount: true },
      }),
    ),
  );
  return {
    invoiced,
    collected,
    rate: invoiced ? Math.round((100 * collected) / invoiced) : null,
    aging: aging.map((a) => a._sum.amount ?? 0),
  };
}

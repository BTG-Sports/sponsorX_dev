/**
 * The Treasury — Finance's home (P1-ART-25). One read for everything the
 * page shows over a window (7 / 30 / 90 days, or all time): money in and
 * out by day, what is owed, what BTG kept, where marketplace money went,
 * athlete pay by step, and what waits on BTG at each money desk.
 *
 * Built only from rules that already exist, so the Treasury and each desk
 * cannot disagree: rightsOf / reconciliationTotals (earning-books.ts), the
 * payout "waits on BTG" filter (payout-auto.ts waitingOnWhere), the payment
 * events' "waiting on BTG" rule (HELD | FAILED, not resolved). Every read is
 * scoped by whereFor(actor, <its own resource>, "read"). A hidden figure is
 * ABSENT, never 0 — invoices only with rightsOf().seeInvoices (BTG admin;
 * not FINANCE, the 2026-09-24 matrix decision), campaign commission only
 * with seeSell.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { scopeOf, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { EARNING_STATES, rightsOf, reconciliationTotals, type EarningStateName } from "./earning-books";
import { iso, startOfDay, windowFor, type RangeKey, type Window } from "./overview-window";
import { waitingOnWhere } from "./payout-auto";

const TENANT_WIDE = new Set(["own-tenant", "any"]);
const DAY = 86_400_000;
const OWED_EARNING: EarningStateName[] = ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT"];
const PAYABLE = ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE"];
const SPLIT_ACCOUNTS = {
  athletes: "ATHLETE_PAYABLE", properties: "PROPERTY_PAYABLE", platform: "PLATFORM_REVENUE",
  management: "MANAGEMENT_REVENUE", processing: "PROCESSING_PAYABLE", referral: "REFERRAL_PAYABLE", reserve: "RESERVE_HELD",
} as const;

export type FinanceOverview = {
  readAt: string;
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "week" };
  moneyIn: { cents: number; prev: number | null };
  paidOut: { cents: number; prev: number | null };
  owed: { cents: number };
  kept: { cents: number; prev: number | null; campaignCommission?: number };
  series: { day: string; inCents: number; outCents: number }[];
  split: Record<keyof typeof SPLIT_ACCOUNTS, number>;
  settled: { paidCents: number; owedCents: number; rate: number | null };
  earningsByState: Record<EarningStateName, { count: number; amount: number }>;
  needsYou: {
    payouts: { count: number; cents: number; oldestAt: string | null };
    refunds: { count: number; cents: number; oldestAt: string | null };
    disputes: { count: number; cents: number };
    events: { count: number };
  };
  invoices?: { invoicedCents: number; collectedCents: number; rate: number | null; aging: number[] };
};

export async function financeOverview(actor: Actor, opts: { range: RangeKey }, now = new Date()): Promise<FinanceOverview> {
  if (!TENANT_WIDE.has(scopeOf(actor, "ledgerEntry", "read")) || !TENANT_WIDE.has(scopeOf(actor, "earning", "read"))) {
    throw new ForbiddenError("ledgerEntry", "read");
  }
  const rights = rightsOf(actor);
  const s = {
    order: whereFor(actor, "marketplaceOrder", "read"),
    ledger: whereFor(actor, "ledgerEntry", "read"),
    earning: whereFor(actor, "earning", "read"),
    payout: whereFor(actor, "payout", "read"),
    refund: whereFor(actor, "refundDue", "read"),
    dispute: whereFor(actor, "paymentDispute", "read"),
    event: whereFor(actor, "paymentEvent", "read"),
  };
  /* PaymentRefund has no policy resource of its own and no `order` relation
     (a scalar `orderId`, unenforced) — it carries its own tenantId, the same
     operator tenant whereFor(marketplaceOrder) resolves to for every caller
     this route admits (own-tenant or any). */
  const refundTenant = scopeOf(actor, "marketplaceOrder", "read") === "any" ? {} : { tenantId: actor.tenantId };

  /* "All time" starts at the first paid order, paid payout or paid earning. */
  const earliest = opts.range === "all" ? await firstMoneyDay(s) : null;
  const w = windowFor(opts.range, now, earliest);
  const since = w.prevFrom ?? w.from;

  /* Rows since the previous window opened, bucketed in JS: a few hundred a
     month at Phase 2 volume. Switch to SQL date_trunc if that changes. */
  const [orders, refunds, payouts, earningsPaid, ledgerKept] = await Promise.all([
    prisma.marketplaceOrder.findMany({ /* tenant-scope: whereFor(marketplaceOrder) first. */ where: { AND: [s.order, { paidAt: { gte: since, lt: w.to } }] }, select: { paidAt: true, totalCents: true } }),
    prisma.paymentRefund.findMany({ /* tenant-scope: PaymentRefund has no `order` relation; scoped by its own tenantId. */ where: { AND: [refundTenant, { createdAt: { gte: since, lt: w.to } }] }, select: { createdAt: true, amountCents: true } }),
    prisma.payout.findMany({ /* tenant-scope: whereFor(payout) first. */ where: { AND: [s.payout, { state: "PAID", paidAt: { gte: since, lt: w.to } }] }, select: { paidAt: true, amountCents: true } }),
    prisma.earning.findMany({ /* tenant-scope: whereFor(earning) first. */ where: { AND: [s.earning, { state: "PAID", paidAt: { gte: since, lt: w.to } }] }, select: { paidAt: true, gross: true, adjustment: true } }),
    prisma.ledgerEntry.findMany({ /* tenant-scope: whereFor(ledgerEntry) first. */ where: { AND: [s.ledger, { account: { in: ["PLATFORM_REVENUE", "MANAGEMENT_REVENUE"] }, createdAt: { gte: since, lt: w.to } }] }, select: { createdAt: true, creditCents: true, debitCents: true } }),
  ]);

  const ins = [
    ...orders.map((o) => ({ at: o.paidAt!, c: o.totalCents })),
    ...refunds.map((r) => ({ at: r.createdAt, c: -r.amountCents })),
  ];
  const outs = [
    ...payouts.map((p) => ({ at: p.paidAt!, c: p.amountCents })),
    ...earningsPaid.map((e) => ({ at: e.paidAt!, c: e.gross + e.adjustment })),
  ];
  const kept = ledgerKept.map((l) => ({ at: l.createdAt, c: l.creditCents - l.debitCents }));
  const inWin = (xs: { at: Date; c: number }[]) => xs.filter((x) => x.at >= w.from).reduce((n, x) => n + x.c, 0);
  const inPrev = (xs: { at: Date; c: number }[]) => (w.prevFrom ? xs.filter((x) => x.at < w.from).reduce((n, x) => n + x.c, 0) : null);

  const [earnGroups, payableAgg, splitGroups, waitingPayouts, openRefunds, disputes, events, sell] = await Promise.all([
    prisma.earning.groupBy({ /* tenant-scope: whereFor(earning). */ by: ["state"], where: s.earning, _count: { _all: true }, _sum: { gross: true, adjustment: true } } as never) as unknown as Promise<{ state: string; _count: { _all: number }; _sum: { gross: number | null; adjustment: number | null } }[]>,
    prisma.ledgerEntry.aggregate({ /* tenant-scope: whereFor(ledgerEntry) first. */ where: { AND: [s.ledger, { account: { in: PAYABLE }, status: { in: ["PENDING", "AVAILABLE"] } }] }, _sum: { creditCents: true, debitCents: true } }),
    prisma.ledgerEntry.groupBy({ /* tenant-scope: whereFor(ledgerEntry). */ by: ["account"], where: { AND: [s.ledger, { createdAt: { gte: w.from, lt: w.to } }] }, _sum: { creditCents: true, debitCents: true } } as never) as unknown as Promise<{ account: string; _sum: { creditCents: number | null; debitCents: number | null } }[]>,
    prisma.payout.findMany({ /* tenant-scope: whereFor(payout) first; the BTG list's own "waits on BTG" rule. */ where: { AND: [s.payout, waitingOnWhere("BTG")] }, select: { amountCents: true, requestedAt: true } }),
    prisma.refundDue.aggregate({ /* tenant-scope: whereFor(refundDue) first. */ where: { AND: [s.refund, { state: "OPEN" }] }, _count: { _all: true }, _sum: { amountCents: true }, _min: { createdAt: true } }),
    prisma.paymentDispute.aggregate({ /* tenant-scope: whereFor(paymentDispute) first. */ where: { AND: [s.dispute, { state: { in: ["OPEN", "UNDER_REVIEW"] } }] }, _count: { _all: true }, _sum: { amountCents: true } }),
    prisma.paymentEvent.count({ /* tenant-scope: whereFor(paymentEvent); the desk's waitingOnBtg rule. */ where: { AND: [s.event, { status: { in: ["HELD", "FAILED"] }, resolvedAt: null }] } }),
    rights.seeSell ? prisma.campaignOrder.aggregate({ /* tenant-scope: orders whose earning whereFor(earning) admits. */ where: { earning: { is: s.earning } }, _sum: { sellPrice: true } }) : null,
  ]);

  const earningsByState = Object.fromEntries(EARNING_STATES.map((st) => {
    const g = earnGroups.find((x) => x.state === st);
    return [st, { count: g?._count._all ?? 0, amount: (g?._sum.gross ?? 0) + (g?._sum.adjustment ?? 0) }];
  })) as FinanceOverview["earningsByState"];
  const owedEarnings = OWED_EARNING.reduce((n, st) => n + earningsByState[st].amount, 0);
  const owed = owedEarnings + (payableAgg._sum.creditCents ?? 0) - (payableAgg._sum.debitCents ?? 0);
  const paidOut = inWin(outs);
  const net = (acct: string) => { const g = splitGroups.find((x) => x.account === acct); return (g?._sum.creditCents ?? 0) - (g?._sum.debitCents ?? 0); };
  const allEarned = EARNING_STATES.reduce((n, st) => n + earningsByState[st].amount, 0);

  return {
    readAt: now.toISOString(),
    range: { key: w.key, from: iso(w.from), to: iso(w.to), days: w.days, bucket: w.bucket },
    moneyIn: { cents: inWin(ins), prev: inPrev(ins) },
    paidOut: { cents: paidOut, prev: inPrev(outs) },
    owed: { cents: owed },
    kept: {
      cents: inWin(kept),
      prev: inPrev(kept),
      ...(sell ? { campaignCommission: (sell._sum.sellPrice ?? 0) - allEarned } : {}),
    },
    series: bucketSeries(w, ins, outs),
    split: Object.fromEntries(Object.entries(SPLIT_ACCOUNTS).map(([k, acct]) => [k, net(acct)])) as FinanceOverview["split"],
    settled: { paidCents: paidOut, owedCents: owed, rate: paidOut + owed > 0 ? paidOut / (paidOut + owed) : null },
    earningsByState,
    needsYou: {
      payouts: {
        count: waitingPayouts.length,
        cents: waitingPayouts.reduce((n, p) => n + p.amountCents, 0),
        oldestAt: waitingPayouts.reduce<Date | null>((m, p) => (!m || p.requestedAt < m ? p.requestedAt : m), null)?.toISOString() ?? null,
      },
      refunds: { count: openRefunds._count._all, cents: openRefunds._sum.amountCents ?? 0, oldestAt: openRefunds._min.createdAt?.toISOString() ?? null },
      disputes: { count: disputes._count._all, cents: disputes._sum.amountCents ?? 0 },
      events: { count: events },
    },
    ...(rights.seeInvoices ? { invoices: await invoiceTotals(actor, now) } : {}),
  };
}

async function invoiceTotals(actor: Actor, now: Date) {
  const t = await reconciliationTotals(actor, now);
  return { invoicedCents: t.invoiced, collectedCents: t.collected, rate: t.rate, aging: t.aging };
}

/** Zero-filled buckets over the window (weeks past 120 days), in and out. */
export function bucketSeries(w: Window, ins: { at: Date; c: number }[], outs: { at: Date; c: number }[]) {
  const step = w.bucket === "week" ? 7 : 1;
  const n = Math.ceil(w.days / step);
  const out = Array.from({ length: n }, (_, i) => ({ day: iso(new Date(w.from.getTime() + i * step * DAY)), inCents: 0, outCents: 0 }));
  const put = (xs: { at: Date; c: number }[], key: "inCents" | "outCents") => {
    for (const x of xs) {
      const i = Math.floor((startOfDay(x.at).getTime() - w.from.getTime()) / (step * DAY));
      if (i >= 0 && i < n) out[i]![key] += x.c;
    }
  };
  put(ins, "inCents");
  put(outs, "outCents");
  return out;
}

async function firstMoneyDay(s: { order: object; payout: object; earning: object }): Promise<Date | null> {
  const [o, p, e] = await Promise.all([
    prisma.marketplaceOrder.aggregate({ /* tenant-scope: whereFor(marketplaceOrder). */ where: { AND: [s.order, { paidAt: { not: null } }] }, _min: { paidAt: true } }),
    prisma.payout.aggregate({ /* tenant-scope: whereFor(payout). */ where: { AND: [s.payout, { paidAt: { not: null } }] }, _min: { paidAt: true } }),
    prisma.earning.aggregate({ /* tenant-scope: whereFor(earning). */ where: { AND: [s.earning, { paidAt: { not: null } }] }, _min: { paidAt: true } }),
  ]);
  const ds = [o._min.paidAt, p._min.paidAt, e._min.paidAt].filter((d): d is Date => !!d);
  return ds.length ? new Date(Math.min(...ds.map((d) => d.getTime()))) : null;
}

/**
 * The Treasury — Finance's home (P1-ART-25). One read for everything the
 * page shows over a window (7 / 30 / 90 days, or all time): money in and
 * out by day, what is owed, what BTG kept, where marketplace money went,
 * athlete pay by step, and what waits on BTG at each money desk.
 *
 * Built only from rules that already exist, so the Treasury and each desk
 * cannot disagree: rightsOf / earningTotalsByState / campaignSell /
 * campaignCommission / reconciliationTotals (earning-books.ts), the payout
 * "waits on BTG" filter (payout-auto.ts waitingOnWhere), the payment events'
 * WAITING_ON_BTG (payment-events.ts) and the disputes' OPEN_DISPUTE
 * (payment-exceptions.ts). Every read is scoped by
 * whereFor(actor, <its own resource>, "read"). A hidden figure is ABSENT,
 * never 0 — invoices only with rightsOf().seeInvoices (BTG admin; not
 * FINANCE, the 2026-09-24 matrix decision), campaign commission only with
 * seeSell.
 *
 * "Owed" nets the payee payables over every status, as the payee's own
 * balance does (payouts.ts balanceOf): a booking's credit (PENDING until the
 * sponsor pays, then AVAILABLE — earned either way, not yet paid), a
 * released reserve's credit, less the PAID debit each PAYOUT journal posts
 * (plus the AVAILABLE credit a returned payout posts back). A reversed
 * booking and its REVERSAL mirror are both REVERSED and net to zero.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { MATCHES_NOTHING, scopeOf, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  campaignCommission, campaignSell, earningTotalsByState, reconciliationTotals, rightsOf, type EarningStateName,
} from "./earning-books";
import { DAY, iso, startOfDay, windowFor, type RangeKey, type Window } from "./overview-window";
import { waitingOnWhere } from "./payout-auto";
import { WAITING_ON_BTG } from "./payment-events";
import { OPEN_DISPUTE } from "./payment-exceptions";

const TENANT_WIDE = new Set(["own-tenant", "any"]);
const OWED_EARNING: EarningStateName[] = ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT"];
const PAYABLE = ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE"];
/* The journals that are sales: a booking and its reversal. PAYOUT and
   RESERVE_RELEASE journals move money between accounts after the sale. */
const SALES_JOURNALS = ["BOOKING", "REVERSAL"];
const SPLIT_ACCOUNTS = {
  athletes: "ATHLETE_PAYABLE", properties: "PROPERTY_PAYABLE", platform: "PLATFORM_REVENUE",
  management: "MANAGEMENT_REVENUE", processing: "PROCESSING_PAYABLE", referral: "REFERRAL_PAYABLE", reserve: "RESERVE_HELD",
} as const;

export type FinanceOverview = {
  readAt: string;
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "week" };
  moneyIn: { cents: number; prev: number | null };
  paidOut: { cents: number; prev: number | null };
  /** Now, not windowed: earnings not yet paid plus the payee payables' net balance. */
  owed: { cents: number };
  /** `campaignCommission` is LIFETIME (sell price − every earning raised), not windowed; only with seeSell. */
  kept: { cents: number; prev: number | null; campaignCommission?: number };
  series: { day: string; inCents: number; outCents: number }[];
  /** The window's sales only (BOOKING and REVERSAL journals), credit − debit by account. */
  split: Record<keyof typeof SPLIT_ACCOUNTS, number>;
  /** `rate` is a 0..1 FRACTION: windowed paid-out ÷ (windowed paid-out + owed now); null when both are 0. */
  settled: { paidCents: number; owedCents: number; rate: number | null };
  earningsByState: Record<EarningStateName, { count: number; amount: number }>;
  needsYou: {
    payouts: { count: number; cents: number; oldestAt: string | null };
    refunds: { count: number; cents: number; oldestAt: string | null };
    disputes: { count: number; cents: number };
    events: { count: number };
  };
  /** Only with seeInvoices; exactly reconciliationTotals(). `rate` is a WHOLE PERCENT (0..100), unlike settled.rate. */
  invoices?: { invoicedCents: number; collectedCents: number; rate: number | null; aging: number[] };
};

export async function financeOverview(actor: Actor, opts: { range: RangeKey }, now = new Date()): Promise<FinanceOverview> {
  if (!TENANT_WIDE.has(scopeOf(actor, "ledgerEntry", "read")) || !TENANT_WIDE.has(scopeOf(actor, "earning", "read"))) {
    throw new ForbiddenError("ledgerEntry", "read");
  }
  const rights = rightsOf(actor);
  /* Every role the gate admits reads earning amounts today; were one not to,
     it must not get a page of zeros in their place. */
  if (!rights.seeAmount) throw new ForbiddenError("earning", "read");
  const s = {
    order: whereFor(actor, "marketplaceOrder", "read"),
    ledger: whereFor(actor, "ledgerEntry", "read"),
    earning: whereFor(actor, "earning", "read"),
    payout: whereFor(actor, "payout", "read"),
    refund: whereFor(actor, "refundDue", "read"),
    dispute: whereFor(actor, "paymentDispute", "read"),
    event: whereFor(actor, "paymentEvent", "read"),
    providerRefund: providerRefundScope(actor),
  };

  /* "All time" starts at the first money row in scope: see firstMoneyDay. */
  const earliest = opts.range === "all" ? await firstMoneyDay(s) : null;
  const w = windowFor(opts.range, now, earliest);
  const since = w.prevFrom ?? w.from;

  /* Rows since the previous window opened, bucketed in JS: a few hundred a
     month at Phase 2 volume. For "all" that is every paid row in scope, so
     it grows with the books' age — switch to SQL date_trunc buckets before
     it gets heavy. */
  const [
    orders, refunds, payouts, earningsPaid, ledgerKept,
    earningsByState, payableAgg, splitGroups, waitingPayouts, openRefunds, disputes, events, sellPrice, invoices,
  ] = await Promise.all([
    prisma.marketplaceOrder.findMany({ /* tenant-scope: whereFor(marketplaceOrder) first. */ where: { AND: [s.order, { paidAt: { gte: since, lt: w.to } }] }, select: { paidAt: true, totalCents: true } }),
    prisma.paymentRefund.findMany({ /* tenant-scope: providerRefundScope — the marketplaceOrder read scope on its own tenantId. */ where: { AND: [s.providerRefund, { createdAt: { gte: since, lt: w.to } }] }, select: { createdAt: true, amountCents: true } }),
    prisma.payout.findMany({ /* tenant-scope: whereFor(payout) first. */ where: { AND: [s.payout, { state: "PAID", paidAt: { gte: since, lt: w.to } }] }, select: { paidAt: true, amountCents: true } }),
    prisma.earning.findMany({ /* tenant-scope: whereFor(earning) first. */ where: { AND: [s.earning, { state: "PAID", paidAt: { gte: since, lt: w.to } }] }, select: { paidAt: true, gross: true, adjustment: true } }),
    prisma.ledgerEntry.findMany({ /* tenant-scope: whereFor(ledgerEntry) first. */ where: { AND: [s.ledger, { account: { in: ["PLATFORM_REVENUE", "MANAGEMENT_REVENUE"] }, createdAt: { gte: since, lt: w.to } }] }, select: { createdAt: true, creditCents: true, debitCents: true } }),
    earningTotalsByState(actor, true),
    /* Every status: see "Owed" in the header. */
    prisma.ledgerEntry.aggregate({ /* tenant-scope: whereFor(ledgerEntry) first. */ where: { AND: [s.ledger, { account: { in: PAYABLE } }] }, _sum: { creditCents: true, debitCents: true } }),
    prisma.ledgerEntry.groupBy({ /* tenant-scope: whereFor(ledgerEntry). */ by: ["account"], where: { AND: [s.ledger, { entryType: { in: SALES_JOURNALS }, createdAt: { gte: w.from, lt: w.to } }] }, _sum: { creditCents: true, debitCents: true } } as never) as unknown as Promise<{ account: string; _sum: { creditCents: number | null; debitCents: number | null } }[]>,
    prisma.payout.findMany({ /* tenant-scope: whereFor(payout) first; the BTG list's own "waits on BTG" rule. */ where: { AND: [s.payout, waitingOnWhere("BTG")] }, select: { amountCents: true, requestedAt: true } }),
    prisma.refundDue.aggregate({ /* tenant-scope: whereFor(refundDue) first. */ where: { AND: [s.refund, { state: "OPEN" }] }, _count: { _all: true }, _sum: { amountCents: true }, _min: { createdAt: true } }),
    prisma.paymentDispute.aggregate({ /* tenant-scope: whereFor(paymentDispute) first. */ where: { AND: [s.dispute, { state: { in: [...OPEN_DISPUTE] } }] }, _count: { _all: true }, _sum: { amountCents: true } }),
    prisma.paymentEvent.count({ /* tenant-scope: whereFor(paymentEvent); the desk's waitingOnBtg rule. */ where: { AND: [s.event, WAITING_ON_BTG] } }),
    rights.seeSell ? campaignSell(actor) : null,
    rights.seeInvoices ? invoiceTotals(actor, now) : null,
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

  const owedEarnings = OWED_EARNING.reduce((n, st) => n + earningsByState[st].amount, 0);
  const owed = owedEarnings + (payableAgg._sum.creditCents ?? 0) - (payableAgg._sum.debitCents ?? 0);
  const paidOut = inWin(outs);
  const net = (acct: string) => { const g = splitGroups.find((x) => x.account === acct); return (g?._sum.creditCents ?? 0) - (g?._sum.debitCents ?? 0); };

  return {
    readAt: now.toISOString(),
    range: { key: w.key, from: iso(w.from), to: iso(w.to), days: w.days, bucket: w.bucket },
    moneyIn: { cents: inWin(ins), prev: inPrev(ins) },
    paidOut: { cents: paidOut, prev: inPrev(outs) },
    owed: { cents: owed },
    kept: {
      cents: inWin(kept),
      prev: inPrev(kept),
      ...(sellPrice !== null ? { campaignCommission: campaignCommission(sellPrice, earningsByState) } : {}),
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
    ...(invoices ? { invoices } : {}),
  };
}

/**
 * PaymentRefund has no policy resource of its own and no `order` relation (a
 * scalar `orderId`, unenforced) — it carries its own tenantId, the operator's
 * books, as MarketplaceOrder does. So it is read at the marketplaceOrder read
 * scope: "any" → every tenant, "own-tenant" → the actor's, anything else →
 * nothing. Derived, not assumed, so a policy change can't leave it behind.
 */
function providerRefundScope(actor: Actor): Record<string, unknown> {
  switch (scopeOf(actor, "marketplaceOrder", "read")) {
    case "any": return {};
    case "own-tenant": return { tenantId: actor.tenantId };
    default: return MATCHES_NOTHING;
  }
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

/**
 * "All time" opens on the first money row in scope: a paid order, payout or
 * earning, a provider refund, or a ledger entry — a BOOKING is written at
 * contract time, before the sponsor pays, so it can be the oldest of all.
 */
async function firstMoneyDay(s: { order: object; payout: object; earning: object; ledger: object; providerRefund: object }): Promise<Date | null> {
  const [o, p, e, l, r] = await Promise.all([
    prisma.marketplaceOrder.aggregate({ /* tenant-scope: whereFor(marketplaceOrder). */ where: { AND: [s.order, { paidAt: { not: null } }] }, _min: { paidAt: true } }),
    prisma.payout.aggregate({ /* tenant-scope: whereFor(payout). */ where: { AND: [s.payout, { paidAt: { not: null } }] }, _min: { paidAt: true } }),
    prisma.earning.aggregate({ /* tenant-scope: whereFor(earning). */ where: { AND: [s.earning, { paidAt: { not: null } }] }, _min: { paidAt: true } }),
    prisma.ledgerEntry.aggregate({ /* tenant-scope: whereFor(ledgerEntry). */ where: { AND: [s.ledger] }, _min: { createdAt: true } }),
    prisma.paymentRefund.aggregate({ /* tenant-scope: providerRefundScope. */ where: { AND: [s.providerRefund] }, _min: { createdAt: true } }),
  ]);
  const ds = [o._min.paidAt, p._min.paidAt, e._min.paidAt, l._min.createdAt, r._min.createdAt].filter((d): d is Date => !!d);
  return ds.length ? new Date(Math.min(...ds.map((d) => d.getTime()))) : null;
}

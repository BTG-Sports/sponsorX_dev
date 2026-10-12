# Finance "Vault" (P1-ART-25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Finance its own home (Treasury) and look (the Vault) inside the admin portal: a stats-first dashboard backed by a new `GET /finance/overview`, with every money desk restyled and server-paged.

**Architecture:**
- **Backend:** a new domain read, `domain/finance-overview.ts`, built only from rules that already exist, which move into `domain/earning-books.ts` and `domain/overview-window.ts`. A thin route serves it.
- **Frontend:** a fourth stage skin, `.sx-vault`, layered on the admin `.sx-ops` shell. A client island switches it on by pathname.
- **Kit:** `components/vault-stage.tsx` mirrors the Stadium kit's API.
- **Pages:** each money page swaps its presentation to the Vault kit, and keeps its reads, writes and URL keys.

**Tech stack:**
- Next 16 app router (read `frontend/node_modules/next/dist/docs/` before using an unfamiliar API) and Tailwind v4 classes.
- Express, Prisma and vitest on the backend; vitest on the frontend.

**Spec:** `docs/superpowers/specs/2026-10-12-finance-vault-design.md`. Read it first; this plan does not repeat its rationale.

---

## Ground rules for every task

- **Branch:** `feature/P1-ART-25-finance-vault`. Other people's uncommitted files sit in the working tree (athlete settings, inventory, globals.css, filter-kit.tsx …). **Never `git add -A` or `git add .`.**
  - Commit by pathspec only: `git add -- <your files>`, then `git commit -m … -- <your files>`.
  - `frontend/src/components/filter-kit.tsx` **already has someone else's uncommitted edits.** Before touching it, run `git diff -- frontend/src/components/filter-kit.tsx`. Keep their hunk out of your commit: `git add -p` is unavailable (non-interactive), so stash your change to that file as a patch and apply it only to the index, or ask the controller.
- **Commit messages:** `<type>(P1-ART-25): …`, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Frontend checks:** run from `frontend/`:
  - `npx tsc --noEmit -p .` (six phantom `LayoutProps` errors are expected on a fresh checkout; ignore them);
  - `npx eslint <files>`;
  - `npx vitest run <tests>`.
- **Backend checks:** run from `backend/`: `npx tsc --noEmit -p .`, `npx eslint <files>` and `npx vitest run <tests>`.
  - DB tests need Postgres. If Docker isn't up, use embedded-postgres in the scratchpad, initdb'd in UTF8 (auto-memory `test-db-without-docker`).
  - Prefix every fixture id in a test file (tenant, user, row, slug) with a file-unique prefix, e.g. `fov-`.
- **Never run `next build` in `frontend/`.** The owner's `next dev` is live; building into it 500s every route. The build check is Task 13's worktree build.
- **Data rules:** every number has a real source, and a hidden figure is *absent*, never 0. Plain words only: no § numbers, no enum names in UI text.
- **Pagination:** the house kit, unchanged in behaviour (`PagedTable` / `PagerRow` / `ServerList` / `ListSearch` / `ListFilter`), with `tone="vault"`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `backend/src/domain/earning-books.ts` | new | `rightsOf`, `reconciliationSet`, `reconciliationTotals`, `EARNING_STATES`, moved out of `routes/v1/earnings.ts` |
| `backend/src/routes/v1/earnings.ts` | modify | import the above (pure move) |
| `backend/src/domain/overview-window.ts` | new | `RANGES`, `RangeKey`, `windowFor`, `startOfDay`, `iso`, moved out of `sponsor-overview.ts`, which re-exports them |
| `backend/src/domain/finance-overview.ts` | new | `financeOverview(actor, {range}, now)` |
| `backend/src/routes/v1/finance-overview.ts` | new | `GET /finance/overview` |
| `backend/src/routes/v1/index.ts` | modify | mount it |
| `backend/src/contracts/registry.ts` | modify | contract row |
| `backend/tests/finance-overview.test.ts` | new | DB tests |
| `frontend/src/lib/vault-routes.ts` | new | `isVaultPath` |
| `frontend/src/lib/admin-access.ts` | modify | `isFinanceOnly` |
| `frontend/src/lib/finance-overview-live.ts` | new | API types and helpers |
| `frontend/src/components/stage-root.tsx` | new | client island that toggles `.sx-vault` |
| `frontend/src/components/portal-shell.tsx` | modify | `vault` prop, `StageRoot`, both grounds |
| `frontend/src/components/mobile-nav.tsx`, `mobile-dock.tsx` | modify (only if needed) | `[data-vault]` hook for the dock/sheet skin |
| `frontend/src/app/(app)/admin/vault.css` | new | the whole skin |
| `frontend/src/app/(app)/admin/layout.tsx` | modify | nav, dock, Finance-only variants, `vault` prop, CSS import |
| `frontend/src/app/(app)/admin/(board)/page.tsx` | modify | redirect a Finance-only viewer |
| `frontend/src/components/vault-stage.tsx`, `vault-flow.tsx` | new | the kit |
| `frontend/src/components/stadium-hint.tsx` | modify | `skin` prop |
| `frontend/src/components/filter-kit.tsx`, `pagination.tsx`, `stage-table.tsx` | modify | the `"vault"` tone |
| `frontend/src/app/(app)/admin/finance/page.tsx` (+ `loading.tsx`) | rewrite | Treasury |
| money desk pages (+ `loading.tsx`) | modify | the Vault presentation |
| `frontend/tests/vault-routes.test.ts`, `finance-overview-live.test.ts`, `admin-access.test.ts`, `nav-groups.test.ts`, `mobile-dock.test.ts` | new/modify | unit tests |

---

## Task 1: Backend: move the shared rules (pure refactor)

**Files:**
- Create: `backend/src/domain/earning-books.ts`
- Create: `backend/src/domain/overview-window.ts`
- Modify: `backend/src/routes/v1/earnings.ts` (currently lines ~62–80 `EARNING_STATES`/`Rights`/`rightsOf`, and ~400–465 `reconciliationSet`/`requireInvoiceRights`/`NOT_SETTLED`/`DAY`/`reconciliationTotals`)
- Modify: `backend/src/domain/sponsor-overview.ts` (`RANGES`, `RangeKey`, `DAY`, `startOfDay`, `iso`, `windowFor`, the `Window` type)

- [ ] **Step 1: Create `domain/earning-books.ts`.** Cut the definitions *verbatim* from `routes/v1/earnings.ts` and paste them here with their comments: `EARNING_STATES`, `EarningStateName`, `Rights`, `rightsOf`, `reconciliationSet`, `requireInvoiceRights`, `NOT_SETTLED`, `reconciliationTotals`. Export each one. Bring over the imports they use (`prisma`, `Actor`, `whereFor`, `can`, `scopeOf`, `canReadField`, `ForbiddenError`).
  - Add a file header: "The books' shared rules, used by GET /earnings/* and GET /finance/overview (P1-ART-25), so the Treasury and the Finance tables cannot disagree."
- [ ] **Step 2: In `routes/v1/earnings.ts`,** delete the moved code and `import { EARNING_STATES, rightsOf, reconciliationSet, requireInvoiceRights, reconciliationTotals, type EarningStateName } from "../../domain/earning-books";`. Keep `DAY` locally only if something else in the file still uses it.
- [ ] **Step 3: Create `domain/overview-window.ts`.** Move `RANGES`, `RangeKey`, `Window`, `DAY`, `startOfDay`, `iso` and `windowFor` out of `sponsor-overview.ts` and export them. In `sponsor-overview.ts`, import them and add `export { RANGES, windowFor, type RangeKey, type Window } from "./overview-window";`, so `routes/v1/sponsor-overview.ts` and `tests/sponsor-overview.test.ts` keep compiling unchanged. Leave `zeroFill` where it is; it is shaped for the sponsor's series.
- [ ] **Step 4: Verify.** `cd backend && npx tsc --noEmit -p . && npx eslint src/domain/earning-books.ts src/domain/overview-window.ts src/domain/sponsor-overview.ts src/routes/v1/earnings.ts`. Expected: clean. Run `npx vitest run tests/sponsor-overview.test.ts` and the earnings tests (`ls tests | grep -i earning`), with the DB if it's available. Expected: the same results as before the move.
- [ ] **Step 5: Commit.** `refactor(P1-ART-25): the books' rules and the overview window as shared domain modules`.

## Task 2: Backend: `GET /finance/overview`

**Files:**
- Create: `backend/src/domain/finance-overview.ts`, `backend/src/routes/v1/finance-overview.ts`
- Modify: `backend/src/routes/v1/index.ts` (mount beside `sponsorOverviewRouter`, around line 118), `backend/src/contracts/registry.ts` (beside the `/sponsor/overview` row, around line 440)
- Test: `backend/tests/finance-overview.test.ts` (copy the harness and seeding style of `tests/sponsor-overview.test.ts`)

- [ ] **Step 1: Write the failing tests** in `tests/finance-overview.test.ts`. Seed two tenants (`fov-t1`, `fov-t2`) and actors for FINANCE, BTG_ADMIN, SALES, CAMPAIGN_MGR, NETWORK_MGR, an ATHLETE and a SPONSOR_ADMIN, the way `sponsor-overview.test.ts` builds actors. In tenant 1, inside the last 30 days, seed:
  - two `MarketplaceOrder`s with `paidAt` (`totalCents` 10_000 and 5_000) and one `PaymentRefund` of 1_000;
  - a `Payout` PAID with `paidAt` (3_000);
  - a REQUESTED `Payout` (2_000, `requestedAt` 2 days ago) and a FAILED one with `waitingOn` null (500);
  - an `Earning` PAID with `paidAt` (gross 4_000, adjustment 0) and one APPROVED_FOR_PAYOUT (gross 1_500);
  - `LedgerEntry` rows: PLATFORM_REVENUE credit 1_200, ATHLETE_PAYABLE credit 6_000 status AVAILABLE, PROPERTY_PAYABLE credit 2_000 status PENDING;
  - a `RefundDue` OPEN (700);
  - a `PaymentDispute` OPEN (900);
  - a `PaymentEvent` HELD with `resolvedAt` null.

  Seed the same set in tenant 2, which must never be counted. Then assert:

```ts
it("refuses roles that aren't tenant-wide money readers", async () => {
  for (const a of [sales, campaignMgr, networkMgr, athlete, sponsorAdmin]) {
    await expect(financeOverview(a, { range: "30d" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  }
});

it("FINANCE gets the books of its own tenant, without invoices", async () => {
  const o = await financeOverview(finance, { range: "30d" }, NOW);
  expect(o.moneyIn.cents).toBe(14_000);              // 10_000 + 5_000 − 1_000
  expect(o.paidOut.cents).toBe(7_000);               // payout 3_000 + earning 4_000
  expect(o.owed.cents).toBe(1_500 + 6_000 + 2_000);  // earning APPROVED_FOR_PAYOUT + payables
  expect(o.kept.cents).toBe(1_200);
  expect(o.needsYou.payouts).toMatchObject({ count: 2, cents: 2_500 });
  expect(o.needsYou.refunds).toMatchObject({ count: 1, cents: 700 });
  expect(o.needsYou.disputes).toEqual({ count: 1, cents: 900 });
  expect(o.needsYou.events).toEqual({ count: 1 });
  expect(o).not.toHaveProperty("invoices");
  expect(o.settled.rate).toBeCloseTo(7_000 / (7_000 + 9_500));
});

it("BTG admin also gets the invoice totals", async () => {
  const o = await financeOverview(btgAdmin, { range: "30d" }, NOW);
  expect(o.invoices).toBeDefined();
});

it("compares with the previous window, and not for all time", async () => {
  expect((await financeOverview(finance, { range: "30d" }, NOW)).moneyIn.prev).toBe(0);
  expect((await financeOverview(finance, { range: "all" }, NOW)).moneyIn.prev).toBeNull();
});

it("the series is zero-filled and sums to the window's totals", async () => {
  const o = await financeOverview(finance, { range: "30d" }, NOW);
  expect(o.series).toHaveLength(30);
  expect(o.series.reduce((n, p) => n + p.inCents, 0)).toBe(o.moneyIn.cents);
  expect(o.series.reduce((n, p) => n + p.outCents, 0)).toBe(o.paidOut.cents);
});
```

  Adjust the expected numbers if a model's required fields force different seeds. `kept.campaignCommission` is asserted only for a role whose `rightsOf(actor).seeSell` is true; check `auth/fields.ts` for FINANCE before asserting either way.
- [ ] **Step 2: Run them and confirm they fail** (module not found). Command: `npx vitest run tests/finance-overview.test.ts`.
- [ ] **Step 3: Implement `domain/finance-overview.ts`.**

```ts
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

  /* "All time" starts at the first paid order, paid payout or paid earning. */
  const earliest = opts.range === "all" ? await firstMoneyDay(s) : null;
  const w = windowFor(opts.range, now, earliest);
  const since = w.prevFrom ?? w.from;

  /* Rows since the previous window opened, bucketed in JS: a few hundred a
     month at Phase 2 volume. Switch to SQL date_trunc if that changes. */
  const [orders, refunds, payouts, earningsPaid, ledgerKept] = await Promise.all([
    prisma.marketplaceOrder.findMany({ /* tenant-scope: whereFor(marketplaceOrder) first. */ where: { AND: [s.order, { paidAt: { gte: since, lt: w.to } }] }, select: { paidAt: true, totalCents: true } }),
    prisma.paymentRefund.findMany({ /* tenant-scope: through the order — whereFor(marketplaceOrder). */ where: { createdAt: { gte: since, lt: w.to }, order: { is: s.order } }, select: { createdAt: true, amountCents: true } }),
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
```

  Notes for the implementer:
  - Verify each relation name against `prisma/schema.prisma`, for example `PaymentRefund.order` and `CampaignOrder.earning`. If `PaymentRefund` has no `order` relation, scope it with `orderId: { in: <ids of orders whereFor admits> }`.
  - If a `where` with `AND: [scope, …]` fails to type because a `whereFor` return isn't assignable, cast as `sponsor-overview.ts` does.
  - Keep the `tenant-scope:` comments: a repo test greps for them.
  - If the window's money-in starts before `w.from` (the prev window), `inWin` filters it out. That is intended.
- [ ] **Step 4: Add the route** `routes/v1/finance-overview.ts`, mirroring `routes/v1/sponsor-overview.ts`:

```ts
/**
 * /api/v1/finance/overview — the Treasury, Finance's home (P1-ART-25). No
 * business rule lives here; see domain/finance-overview.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { financeOverview } from "../../domain/finance-overview";
import { RANGES, type RangeKey } from "../../domain/overview-window";

export const financeOverviewRouter = Router();

/** GET /finance/overview?range=7d|30d|90d|all — default 30d. */
const overview: RequestHandler = async (req, res) => {
  const range = (RANGES as readonly string[]).includes(String(req.query.range)) ? (req.query.range as RangeKey) : "30d";
  res.json({ overview: await financeOverview(req.actor!, { range }) });
};

financeOverviewRouter.get("/finance/overview", requireActor, overview);
```

  - Mount it in `routes/v1/index.ts` next to `sponsorOverviewRouter`.
  - Add the registry row beside `/sponsor/overview`: `{ method: "get", path: "/finance/overview", tag: "Finance", summary: "The Treasury (P1-ART-25): money in and out over a window (?range=7d|30d|90d|all, default 30d) with the previous equal window, what is owed, what BTG kept, the marketplace split, earnings by state and what waits on BTG at each money desk. SUPER_ADMIN, BTG_ADMIN and FINANCE only (tenant-wide ledgerEntry and earning read); invoices only for invoice readers; a hidden figure is absent.", query: z.object({ range: z.enum(["7d", "30d", "90d", "all"]).optional() }) }`. Use a tag that already exists in the registry if "Finance" isn't one; check the tag list.
  - Run any OpenAPI or registry test (`ls tests | grep -i "openapi\|registry\|contract"`).
  - If `tests/financial-audit-coverage.test.ts` lists financial reads, add `GET /finance/overview` to its read-only list.
- [ ] **Step 5: Run the tests.** `npx vitest run tests/finance-overview.test.ts`, plus the registry, OpenAPI and audit-coverage tests. Expected: PASS. Then `npx tsc --noEmit -p .` and `npx eslint` on the new files. Expected: clean.
- [ ] **Step 6: Commit.** `feat(P1-ART-25): GET /finance/overview — the Treasury's one read`.

## Task 3: Frontend: route and role helpers

**Files:**
- Create: `frontend/src/lib/vault-routes.ts`
- Modify: `frontend/src/lib/admin-access.ts`
- Test: `frontend/tests/vault-routes.test.ts`, `frontend/tests/admin-access.test.ts` (append)

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/vault-routes.test.ts
import { describe, expect, it } from "vitest";
import { isVaultPath, VAULT_PREFIXES } from "@/lib/vault-routes";

describe("isVaultPath", () => {
  it("is true on every money desk and below it", () => {
    for (const p of ["/admin/finance", "/admin/payouts", "/admin/payouts/po_1", "/admin/refunds", "/admin/payments/events", "/admin/payments/disputes", "/admin/payments/disputes/d_1", "/admin/commission"]) {
      expect(isVaultPath(p)).toBe(true);
    }
  });
  it("is false elsewhere, including look-alike prefixes", () => {
    for (const p of ["/admin", "/admin/campaigns", "/admin/financex", "/admin/payoutsx", "/sponsor/payouts", "/athlete/earnings"]) {
      expect(isVaultPath(p)).toBe(false);
    }
  });
  it("lists the five prefixes", () => expect(VAULT_PREFIXES).toHaveLength(5));
});
```

```ts
// append to tests/admin-access.test.ts
import { isFinanceOnly } from "@/lib/admin-access";
describe("isFinanceOnly", () => {
  it("only when FINANCE is the sole admin-portal role", () => {
    expect(isFinanceOnly(["FINANCE"])).toBe(true);
    expect(isFinanceOnly(["FINANCE", "BTG_ADMIN"])).toBe(false);
    expect(isFinanceOnly(["FINANCE", "SALES"])).toBe(false);
    expect(isFinanceOnly(["BTG_ADMIN"])).toBe(false);
    expect(isFinanceOnly([])).toBe(false);
  });
  it("ignores roles that are not admin-portal roles", () => expect(isFinanceOnly(["FINANCE", "ATHLETE"])).toBe(true));
});
```

- [ ] **Step 2: Run them and confirm they fail.** `cd frontend && npx vitest run tests/vault-routes.test.ts tests/admin-access.test.ts`.
- [ ] **Step 3: Implement.**

```ts
// src/lib/vault-routes.ts
/* The Vault (P1-ART-25): the money desks, where the admin shell switches to
   Finance's look. A whole screen switches, never part of one (spec §2). */
export const VAULT_PREFIXES = ["/admin/finance", "/admin/payouts", "/admin/refunds", "/admin/payments", "/admin/commission"] as const;

export function isVaultPath(path: string): boolean {
  return VAULT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
```

```ts
// append to src/lib/admin-access.ts
/** P1-ART-25 — a viewer whose only admin-portal role is FINANCE: they land
 *  on the Treasury, and their nav and dock lead with it. */
export function isFinanceOnly(roles: readonly string[]): boolean {
  const mine = roles.filter((r) => ADMIN_PORTAL_ROLES.includes(r));
  return mine.length === 1 && mine[0] === "FINANCE";
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** `feat(P1-ART-25): which paths are the Vault, and who is Finance-only`.

## Task 4: Frontend: the overview read

**Files:**
- Create: `frontend/src/lib/finance-overview-live.ts`
- Test: `frontend/tests/finance-overview-live.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import { delta, needsYouTotal, rangeParam, splitRows, waitedFor } from "@/lib/finance-overview-live";

describe("finance overview helpers", () => {
  it("delta is a fraction, null without a previous window or from zero", () => {
    expect(delta(120, 100)).toBeCloseTo(0.2);
    expect(delta(5, null)).toBeNull();
    expect(delta(5, 0)).toBeNull();
  });
  it("rangeParam keeps known ranges and defaults to 30d", () => {
    expect(rangeParam({ range: "7d" })).toBe("7d");
    expect(rangeParam({ range: "x" })).toBe("30d");
    expect(rangeParam({})).toBe("30d");
  });
  it("needsYouTotal adds the four desks", () => {
    expect(needsYouTotal({ payouts: { count: 7, cents: 1, oldestAt: null }, refunds: { count: 3, cents: 1, oldestAt: null }, disputes: { count: 2, cents: 1 }, events: { count: 1 } })).toBe(13);
  });
  it("splitRows drops empty accounts, sorts by size and gives shares", () => {
    const rows = splitRows({ athletes: 600, properties: 0, platform: 200, management: 0, processing: 100, referral: 0, reserve: 100 });
    expect(rows.map((r) => r.key)).toEqual(["athletes", "platform", "processing", "reserve"]);
    expect(rows[0]).toMatchObject({ label: "Athletes", cents: 600, share: 0.6 });
  });
  it("waitedFor reads in plain words", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(waitedFor("2026-10-10T11:00:00Z", now)).toBe("waited 2 days");
    expect(waitedFor("2026-10-12T09:00:00Z", now)).toBe("waited 3 hours");
    expect(waitedFor(null, now)).toBe("");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.**

```ts
/* The Treasury's read (P1-ART-25): GET /finance/overview's shape and the
   small pure helpers the page draws with. Server-side fetch lives in the
   page (apiFetch); nothing here touches the network. */
export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGES)[number];
export type EarningState = "PENDING" | "ELIGIBLE" | "APPROVED_FOR_PAYOUT" | "PAID" | "HELD" | "DISPUTED";
type Split = { athletes: number; properties: number; platform: number; management: number; processing: number; referral: number; reserve: number };
export type NeedsYou = {
  payouts: { count: number; cents: number; oldestAt: string | null };
  refunds: { count: number; cents: number; oldestAt: string | null };
  disputes: { count: number; cents: number };
  events: { count: number };
};

export type ApiFinanceOverview = {
  readAt: string;
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "week" };
  moneyIn: { cents: number; prev: number | null };
  paidOut: { cents: number; prev: number | null };
  owed: { cents: number };
  kept: { cents: number; prev: number | null; campaignCommission?: number };
  series: { day: string; inCents: number; outCents: number }[];
  split: Split;
  settled: { paidCents: number; owedCents: number; rate: number | null };
  earningsByState: Record<EarningState, { count: number; amount: number }>;
  needsYou: NeedsYou;
  invoices?: { invoicedCents: number; collectedCents: number; rate: number | null; aging: number[] };
};

export function rangeParam(sp: Record<string, string | string[] | undefined>): RangeKey {
  const v = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  return (RANGES as readonly string[]).includes(v ?? "") ? (v as RangeKey) : "30d";
}

/** Change vs the previous window as a fraction; null when there is nothing to compare. */
export function delta(now: number, prev: number | null): number | null {
  return prev === null || prev === 0 ? null : (now - prev) / prev;
}

export const needsYouTotal = (n: NeedsYou) => n.payouts.count + n.refunds.count + n.disputes.count + n.events.count;

const SPLIT_LABEL: Record<keyof Split, string> = {
  athletes: "Athletes", properties: "Properties", platform: "BTG platform fee", management: "BTG management fee",
  processing: "Card processing", referral: "Referrals", reserve: "Held in reserve",
};
export function splitRows(s: Split) {
  const total = Object.values(s).reduce((n, v) => n + Math.max(0, v), 0);
  return (Object.keys(SPLIT_LABEL) as (keyof Split)[])
    .map((key) => ({ key, label: SPLIT_LABEL[key], cents: s[key], share: total ? Math.max(0, s[key]) / total : 0 }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents);
}

/** "waited 2 days" / "waited 3 hours" / "waited 5 minutes"; "" without a time. */
export function waitedFor(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins >= 2 * 1440) return `waited ${Math.floor(mins / 1440)} days`;
  if (mins >= 1440) return "waited 1 day";
  if (mins >= 120) return `waited ${Math.floor(mins / 60)} hours`;
  if (mins >= 60) return "waited 1 hour";
  return `waited ${mins} minute${mins === 1 ? "" : "s"}`;
}

/** The steps athlete pay goes through, in order, in plain words; Held / Disputed set apart. */
export const PAY_STEPS: { state: EarningState; label: string; off?: boolean }[] = [
  { state: "PENDING", label: "Pending" },
  { state: "ELIGIBLE", label: "Eligible" },
  { state: "APPROVED_FOR_PAYOUT", label: "Ready to pay" },
  { state: "PAID", label: "Paid" },
  { state: "HELD", label: "Held", off: true },
  { state: "DISPUTED", label: "Disputed", off: true },
];
```

  Before using these labels, check that they match `EARNING_COPY` in `lib/fixtures` / `lib/earnings-live.ts`. If the house already has plain words for these states, import those instead of `PAY_STEPS`' labels.
- [ ] **Step 4: Run the test and confirm it passes.** Then `npx tsc --noEmit -p .`.
- [ ] **Step 5: Commit.** `feat(P1-ART-25): the Treasury's read and helpers`.

## Task 5: Frontend: the Vault skin (`vault.css`)

**Files:**
- Create: `frontend/src/app/(app)/admin/vault.css`
- Reference (read, don't edit): `frontend/src/app/(app)/sponsor/stadium.css` (the structure to mirror), the `.sx-ops` rules in `globals.css` (what the sidebar and header use, so you know what to re-tint), `frontend/src/app/mobile-nav.css` (the dock and sheet skins by `data-stage`).

- [ ] **Step 1: Write `vault.css`.** All rules are scoped under `.sx-vault` (the shell root also carries `.sx-ops`). The required content follows; the tokens and class names are the contract the kit (Task 7) uses.

```css
/* The Vault — Finance's look on the admin shell (P1-ART-25). Always dark.
   Bank green ground, brushed-gold hairlines, banknote guilloché, a
   double-rule frame, engraved serif numerals. Never chamfers, brackets,
   scan-lines, lanes or speed bars here (memory portal-stage-identities). */
.sx-vault {
  --vault-ground: #06100c;
  --vault-ground-2: #0a1812;
  --vault-gold: #d4b062;
  --vault-gold-hi: #f1dfa6;
  --vault-gold-lo: #c49a45;
  --vault-ink: #e9e2cc;
  --vault-muted: #a99b74;
  --vault-good: #3ddc97;
  --vault-late: #e36a5a;
  --vault-line: rgb(212 176 98 / 0.28);
  --vault-line-soft: rgb(212 176 98 / 0.13);
}

/* ground: swap the ops ground for the vault ground (both are rendered) */
.sx-vault .sx-ops-ground { display: none; }
.sx-ops:not(.sx-vault) .sx-vault-ground { display: none; }
.sx-vault-ground {
  background:
    radial-gradient(1200px 520px at 88% -8%, rgb(212 176 98 / 0.14), transparent 60%),
    radial-gradient(900px 640px at -10% 108%, rgb(16 120 80 / 0.32), transparent 62%),
    var(--vault-ground);
}
.sx-vault-ground .sx-vault-rosette { position: absolute; opacity: 0.14; color: var(--vault-gold); }
.sx-vault-ground .sx-vault-light {
  background: radial-gradient(600px circle at var(--spot-x, 50%) var(--spot-y, 0%), rgb(212 176 98 / 0.07), transparent 60%);
}

/* chrome: sidebar, header, page title */
.sx-vault .sx-shell-aside { background: linear-gradient(180deg, #08140f, var(--vault-ground)); border-color: var(--vault-line-soft); }
.sx-vault .sx-page-title { font-family: var(--font-source-serif), Georgia, serif; font-weight: 600; letter-spacing: 0.005em; color: var(--vault-gold-hi); }
.sx-vault .sx-section-title { font-family: var(--font-source-serif), Georgia, serif; font-weight: 600; color: var(--vault-gold-hi); }
/* Re-tint the active nav item, the accent bloom and the edge line. The
   implementer finds their selectors in portal-shell.tsx / globals.css (the
   ops rules) and overrides them here with var(--vault-gold). */

/* the double-rule frame */
.sx-vault-frame {
  position: relative;
  border: 1px solid rgb(212 176 98 / 0.35);
  outline: 1px solid rgb(212 176 98 / 0.14);
  outline-offset: 3px;
  background: linear-gradient(180deg, rgb(20 40 30 / 0.72), rgb(8 18 13 / 0.86));
}
.sx-vault-frame::before {
  content: ""; position: absolute; inset: 4px; pointer-events: none;
  border: 1px dashed rgb(212 176 98 / 0.12);
}
.sx-vault-frame[data-tone="you"] { border-color: var(--vault-gold); }
.sx-vault-frame[data-tone="late"] { border-color: rgb(227 106 90 / 0.6); }
.sx-vault-panel { border: 1px solid var(--vault-line); background: rgb(8 20 14 / 0.72); }

/* numerals */
.sx-vault-num {
  font-family: var(--font-source-serif), Georgia, serif; font-weight: 700;
  font-variant-numeric: tabular-nums lining-nums;
  background: linear-gradient(180deg, #f6e6b4, var(--vault-gold-lo));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

/* pill, chip, badge */
.sx-vault-pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgb(212 176 98 / 0.45); border-radius: 999px; padding: 2px 10px; font-size: 11px; color: #d9c48f; }
.sx-vault-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--vault-good); box-shadow: 0 0 8px var(--vault-good); }
.sx-vault-badge {
  display: inline-flex; min-width: 1.4rem; justify-content: center; border-radius: 999px; padding: 0 7px;
  font-size: 10.5px; font-weight: 700; color: var(--vault-ground); background: var(--vault-gold);
  animation: sx-vault-pulse 2.4s ease-out infinite;
}
.sx-vault-badge[data-zero] { animation: none; background: rgb(212 176 98 / 0.2); color: var(--vault-muted); }
@keyframes sx-vault-pulse { 0% { box-shadow: 0 0 0 0 rgb(212 176 98 / 0.55); } 70%, 100% { box-shadow: 0 0 0 8px rgb(212 176 98 / 0); } }

/* entrance: unlock — the hairline draws round the frame, then the content rises */
.sx-vault-in { opacity: 0; transform: translateY(6px); animation: sx-vault-in 0.7s cubic-bezier(.2,.7,.2,1) forwards; animation-delay: var(--sx-reveal-delay, 0s); }
@keyframes sx-vault-in { to { opacity: 1; transform: none; } }
.sx-vault-frame.sx-vault-in::after {
  content: ""; position: absolute; inset: -1px; pointer-events: none;
  border: 1px solid var(--vault-gold-hi);
  clip-path: inset(0 100% 100% 0);
  animation: sx-vault-draw 0.9s ease-out forwards; animation-delay: var(--sx-reveal-delay, 0s);
}
@keyframes sx-vault-draw { 50% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 0; } }

/* the dial's bezel */
.sx-vault-bezel { transform-origin: 50% 50%; animation: sx-vault-turn 80s linear infinite; }
@keyframes sx-vault-turn { to { transform: rotate(360deg); } }
.sx-vault-sweep { transition: stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1); }

/* share bars, steps, tables, range, ghost */
.sx-vault-bar { display: block; height: 8px; background: rgb(212 176 98 / 0.12); }
.sx-vault-bar > span { display: block; height: 100%; background: linear-gradient(90deg, var(--vault-gold-lo), #f6e6b4); transform-origin: left; animation: sx-vault-grow 1s ease-out both; animation-delay: var(--sx-reveal-delay, 0s); }
@keyframes sx-vault-grow { from { transform: scaleX(0); } }
.sx-vault table tr { border-color: var(--vault-line-soft); }
.sx-vault-range a[aria-current="true"] { background: var(--vault-gold); color: var(--vault-ground); font-weight: 600; }
.sx-vault-ghost { background: linear-gradient(90deg, rgb(212 176 98 / 0.05), rgb(212 176 98 / 0.12), rgb(212 176 98 / 0.05)); background-size: 200% 100%; animation: sx-vault-shimmer 1.6s linear infinite; }
@keyframes sx-vault-shimmer { to { background-position: -200% 0; } }

/* the "?" hint in the vault skin (stadium-hint.tsx skin="vault") */
.sx-vault-q { display: inline-grid; place-items: center; width: 15px; height: 15px; border-radius: 50%; border: 1px solid rgb(212 176 98 / 0.5); color: var(--vault-gold); font-size: 10px; }
.sx-vault-tip { position: absolute; left: 50%; top: calc(100% + 6px); z-index: 30; width: max-content; max-width: 16rem; transform: translateX(-50%); border: 1px solid var(--vault-line); background: #0b1a13; padding: 8px 10px; font-size: 12px; color: var(--vault-ink); }

@media (prefers-reduced-motion: reduce) {
  .sx-vault-in, .sx-vault-bar > span { animation: none; opacity: 1; transform: none; }
  .sx-vault-frame.sx-vault-in::after, .sx-vault-bezel, .sx-vault-badge, .sx-vault-ghost { animation: none; }
  .sx-vault-sweep { transition: none; }
}
```

- [ ] **Step 2: Add the dock and sheet skin** to `vault.css`. Read `mobile-nav.css`'s `[data-stage="ops"]` block and mirror it as `.sx-vault .sx-dock, .sx-vault .sx-sheet { … }` (or `[data-vault]` if the sheet renders in a portal outside the shell root). Use gold for the active item and the bank-green surfaces. If the sheet is portalled outside `.sx-vault`, Task 6 sets `data-vault` on it.
- [ ] **Step 3: Verify.** Run `npx postcss --version`. If it's available, parse-check the file with `node -e "require('postcss').parse(require('fs').readFileSync('src/app/(app)/admin/vault.css','utf8'))"` from `frontend/`; expect no output. Otherwise rely on Task 13's build. The file is imported only in Task 6, so nothing renders it yet.
- [ ] **Step 4: Commit.** `feat(P1-ART-25): the Vault skin`.

## Task 6: Frontend: shell switch, nav, dock, landing

**Files:**
- Create: `frontend/src/components/stage-root.tsx`
- Modify: `frontend/src/components/portal-shell.tsx` (root div around line 166; the ops branch around lines 309–316), `frontend/src/app/(app)/admin/layout.tsx`, `frontend/src/app/(app)/admin/(board)/page.tsx`, and `mobile-dock.tsx`/`mobile-nav.tsx` only if the sheet is portalled
- Test: `frontend/tests/nav-groups.test.ts`, `frontend/tests/mobile-dock.test.ts` (update the "Finance" label to "Treasury" where they pin the real NAV; leave their own local fixtures alone if they define their own)

- [ ] **Step 1: Write `stage-root.tsx`.**

```tsx
"use client";

/* P1-ART-25 — the shell root. On a Vault route (lib/vault-routes) the whole
   admin screen switches to Finance's look: `sx-vault` beside `sx-ops`, so
   the chrome keeps its structure and vault.css re-tints it. Client-side
   because a layout does not re-render between sibling routes. */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isVaultPath } from "@/lib/vault-routes";

export function StageRoot({ className, vault, children }: { className: string; vault: boolean; children: ReactNode }) {
  const path = usePathname() ?? "";
  const on = vault && isVaultPath(path);
  return (
    <div className={`${className}${on ? " sx-vault" : ""}`} data-vault={on ? "" : undefined}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Wire `PortalShell`.**
  - Add the prop `vault?: boolean` (doc comment: "P1-ART-25 — on the admin stage, switch to the Vault on money routes").
  - Replace the root `<div className={\`flex min-h-screen ${stageCls}\`}>` with `<StageRoot className={\`flex min-h-screen ${stageCls}\`} vault={kind === "ops" && vault}>`, and close it with `</StageRoot>`.
  - In the `kind === "ops"` branch, render `<VaultGround />` (from `./vault-stage`, Task 7) right after `<OpsGround word="" />`, and give `OpsGround`'s root element the class `sx-ops-ground` if it lacks one. Check `ops-stage.tsx` line 63.
  - **Until Task 7 lands**, import a temporary `VaultGround` stub from `vault-stage.tsx` that returns `<div aria-hidden className="sx-vault-ground pointer-events-none absolute inset-0 -z-10" />`. Task 7 replaces it.
  - If `StagePortals` or the sheet render into a portal outside the root, pass `data-vault` through so the Task 5 CSS can reach them. Read `stage-portals.tsx` and `mobile-dock.tsx` to see whether they need it.
- [ ] **Step 3: Admin layout.**

```tsx
import { isFinanceOnly, mayUse } from "@/lib/admin-access";
import "./vault.css";
// NAV: change the Money item's label to "Treasury":
//   { href: "/admin/finance", label: "Treasury", icon: "wallet", group: "Money" },

/* P1-ART-25 — a Finance-only viewer's home is the Treasury: it leads the nav
   in Dashboard's place (and leaves the Money group), and leads the dock. */
const FINANCE_DOCK = ["/admin/finance", "/admin/payouts", "/admin/refunds", "/admin/payments/disputes"];

function navFor(roles: readonly string[]): NavItem[] {
  const allowed = NAV.filter((n) => mayUse(n.href, roles) && (n.href !== "/admin/commission" || isCommissionAdmin(roles)));
  if (!isFinanceOnly(roles)) return allowed;
  return [
    { href: "/admin/finance", label: "Treasury", icon: "wallet" },
    ...allowed.filter((n) => n.href !== "/admin" && n.href !== "/admin/finance"),
  ];
}
// in AdminLayout:
//   const financeOnly = isFinanceOnly(actor.roles);
//   nav={navFor(actor.roles)}
//   rootHref={financeOnly ? "/admin/finance" : "/admin"}
//   dock={financeOnly ? FINANCE_DOCK : DOCK}
//   stage
//   vault
```

  Check how `rootHref` is used (the logo link and `isActiveHref`). If making it `/admin/finance` breaks the active state for the other desks, keep `rootHref="/admin"` and rely on the `/admin` redirect instead. Note which choice you made in the commit body.
- [ ] **Step 4: Landing redirect** in `app/(app)/admin/(board)/page.tsx`. After the actor is known, and before any board read:

```tsx
import { redirect } from "next/navigation";
import { isFinanceOnly } from "@/lib/admin-access";
// …
/* P1-ART-25 — Finance's home is the Treasury. */
if (isFinanceOnly(actor.roles)) redirect("/admin/finance");
```

  Find where the board page resolves the actor (it calls `fetchActor` or `requirePortalAccess`) and put the redirect right there.
- [ ] **Step 5: Tests.** In `tests/nav-groups.test.ts` / `tests/mobile-dock.test.ts`, update only the assertions that import the real admin NAV. If both tests use their own local fixtures, leave them. Add a small test for `navFor` only if you export it, which is optional.
  - Run `npx vitest run tests/nav-groups.test.ts tests/mobile-dock.test.ts tests/admin-access.test.ts tests/vault-routes.test.ts`, then `npx tsc --noEmit -p .` and `npx eslint` on the touched files.
- [ ] **Step 6: Commit.** `feat(P1-ART-25): the shell switches to the Vault on money desks; Finance lands on Treasury`.

## Task 7: Frontend: the Vault kit

**Files:**
- Create: `frontend/src/components/vault-stage.tsx`, `frontend/src/components/vault-flow.tsx`
- Modify: `frontend/src/components/stadium-hint.tsx` (add `skin`)

- [ ] **Step 1: `stadium-hint.tsx` gets a skin.** Add `skin = "stadium"` to the props (`skin?: "stadium" | "vault"`), and use `className={\`sx-${skin}-q\`}` and `className={\`sx-pop sx-${skin}-tip\`}`. The sponsor side is unchanged by default.
- [ ] **Step 2: Write `vault-stage.tsx`.** Mirror the stadium kit's structure (`components/stadium-stage.tsx`; copy its patterns for `at()`, the covering link, `ArenaCount`, the range links and the ghost). Exports and markup:

```tsx
/* --------------------------------------------------------------------------
   The Vault — Finance's stage (P1-ART-25, 2026-10-12). The admin desks'
   dashboard anatomy (memory admin-desks-are-dashboards) drawn as a bank
   vault: bank green, brushed gold, banknote guilloché, double-rule frames,
   engraved serif numerals (vault.css). Every figure is the page's own read
   (memory stats-must-be-retrievable). Exports mirror the stadium kit.
   -------------------------------------------------------------------------- */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaCount, type CountFormat } from "./arena-fx";
import { StadiumHint } from "./stadium-hint";
import type { RangeKey } from "@/lib/finance-overview-live";

export { StadiumUpdated as VaultUpdated, StadiumDate as VaultDate } from "./stadium-time";

export const at = (seconds: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

/** Banknote rosette: 12 rotated ellipses. */
function Rosette({ className, size }: { className: string; size: number }) {
  return (
    <svg aria-hidden="true" viewBox="-210 -210 420 420" width={size} height={size} className={`sx-vault-rosette ${className}`}>
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse key={i} cx="0" cy="0" rx="200" ry="72" fill="none" stroke="currentColor" strokeWidth="0.6" transform={`rotate(${i * 15})`} />
      ))}
    </svg>
  );
}

export function VaultGround() {
  return (
    <div aria-hidden="true" className="sx-vault-ground pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Rosette className="-right-40 -top-40" size={720} />
      <Rosette className="-bottom-56 -left-48" size={520} />
      <div className="sx-vault-light absolute inset-0" />
    </div>
  );
}

export function VaultHead({ title, pill, actions, children }: { title: string; pill?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header>
      <div className="sx-vault-in flex flex-wrap items-center gap-3" style={at(0.04)}>
        <h1 className="sx-page-title">{title}</h1>
        {pill && <span className="sx-vault-pill">{pill}</span>}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function VaultTiles({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "lg:grid-cols-4", 5: "sm:grid-cols-3 xl:grid-cols-5" }[cols];
  return <dl className={`mt-5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 ${grid}`}>{children}</dl>;
}

export function VaultTile({
  label, value, format = "usd0", caption, delta, deltaLabel = "vs the period before", href, hint, tone, badge, delay = 0.1,
}: {
  label: string; value: number; format?: CountFormat; caption?: ReactNode; delta?: number | null; deltaLabel?: string;
  href?: string; hint?: string; tone?: "you" | "late"; badge?: number; delay?: number;
}) {
  const up = delta != null && delta >= 0;
  const flat = delta != null && Math.round(delta * 100) === 0;
  return (
    <div data-spot="" data-tone={tone} className="sx-vault-frame sx-vault-in group px-4 pb-3.5 pt-3.5" style={at(delay)}>
      <dt className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">
        {label}
        {badge !== undefined && <VaultBadge count={badge} />}
        {hint && <StadiumHint label={label} text={hint} skin="vault" />}
      </dt>
      <dd className="mt-1.5">
        {href && <Link href={href} className="absolute inset-0 z-[1]" aria-label={`${label} — open`} />}
        <ArenaCount value={value} format={format} delay={delay} className="sx-vault-num block text-[28px] leading-tight" />
        {delta != null && (
          <span className="mt-1 block text-[11.5px] text-[color:var(--vault-muted)]">
            {flat ? <span>— 0%</span> : <span className={up ? "text-[color:var(--vault-good)]" : "text-[color:var(--vault-late)]"}>{up ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}%</span>} {deltaLabel}
          </span>
        )}
        {caption && <span className="mt-1 block text-[11.5px] text-[color:var(--vault-muted)]">{caption}</span>}
      </dd>
    </div>
  );
}

/** A Needs-you deposit box: count · amount, the oldest wait, "Open …". The whole box links. */
export function VaultBox({ label, count, cents, sub, href, open, delay = 0.2 }: { label: string; count: number; cents?: number; sub?: ReactNode; href: string; open: string; delay?: number }) {
  const clear = count === 0;
  return (
    <Link href={href} data-spot="" data-tone={clear ? undefined : "you"} className="sx-vault-frame sx-vault-in group block px-4 py-3.5 transition-colors hover:bg-[rgb(212_176_98/0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vault-gold)]" style={at(delay)}>
      <span aria-hidden="true" className="absolute right-3 top-3 grid size-6 place-items-center rounded-full border border-[color:var(--vault-line)] text-[11px] text-[color:var(--vault-gold)] transition-transform duration-300 group-hover:rotate-90">⟳</span>
      <span className="block text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">{label}</span>
      {clear ? (
        <span className="mt-1.5 block font-[family-name:var(--font-source-serif)] text-[20px] font-semibold text-[color:var(--vault-good)]">All clear</span>
      ) : (
        <span className="sx-vault-num mt-1.5 block text-[22px] leading-tight">
          {count}
          {cents !== undefined && <> · {formatUsd0(cents)}</>}
        </span>
      )}
      {sub && !clear && <span className="mt-0.5 block text-[11.5px] text-[color:var(--vault-muted)]">{sub}</span>}
      <span className="mt-2 block text-[11.5px] text-[color:var(--vault-gold)]">{open} →</span>
    </Link>
  );
}

export function VaultPanel({ children, flush = false, delay, tone, className = "" }: { children: ReactNode; flush?: boolean; delay?: number; tone?: "you" | "late"; className?: string }) {
  return (
    <div data-spot="" data-tone={tone} className={`sx-vault-panel relative ${tone ? "sx-vault-frame" : ""} ${delay !== undefined ? "sx-vault-in" : ""} ${flush ? "" : "p-5"} ${className}`} style={at(delay ?? 0)}>
      {children}
    </div>
  );
}

export function VaultSection({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="sx-section-title min-w-0 text-[15px]">{title}</h2>
      {hint && <p className="text-xs text-[color:var(--vault-muted)]">{hint}</p>}
      {action}
    </div>
  );
}

/** The vault dial: `value` 0..1 (null shows "—"). The ticked bezel turns; the sweep fills to the value. */
export function VaultDial({ value, label, caption, size = 148 }: { value: number | null; label: string; caption?: ReactNode; size?: number }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const pct = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <figure className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={`${label}: ${pct === null ? "no figure yet" : `${pct}%`}`}>
        <defs>
          <linearGradient id="sx-vault-dial" x1="0" x2="1"><stop offset="0" stopColor="#f6e6b4" /><stop offset="1" stopColor="#c49a45" /></linearGradient>
        </defs>
        <g className="sx-vault-bezel" style={{ transformBox: "fill-box" }}>
          <circle cx="70" cy="70" r="65" fill="none" stroke="rgb(212 176 98 / 0.25)" />
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} x1="70" y1="5" x2="70" y2={i % 6 === 0 ? 14 : 10} stroke="#d4b062" strokeWidth={i % 6 === 0 ? 1.4 : 0.7} transform={`rotate(${i * 15} 70 70)`} />
          ))}
        </g>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(212 176 98 / 0.14)" strokeWidth="8" />
        {pct !== null && (
          <circle className="sx-vault-sweep" cx="70" cy="70" r={r} fill="none" stroke="url(#sx-vault-dial)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 70 70)" />
        )}
        <text x="70" y="74" textAnchor="middle" className="sx-vault-num" style={{ fontSize: 26, fill: "#f1dfa6" }}>{pct === null ? "—" : `${pct}%`}</text>
        <text x="70" y="92" textAnchor="middle" style={{ fontSize: 8.5, letterSpacing: 1.4, fill: "#a99b74" }}>{label.toUpperCase()}</text>
      </svg>
      {caption && <figcaption className="max-w-[16rem] text-[12px] leading-relaxed text-[color:var(--vault-muted)]">{caption}</figcaption>}
    </figure>
  );
}

export function VaultSplit({ rows, delay = 0.3 }: { rows: { key: string; label: string; cents: number; share: number }[]; delay?: number }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.key} className="text-[12.5px]">
          <span className="flex justify-between gap-3">
            <span className="text-[color:var(--vault-ink)]">{r.label}</span>
            <span className="font-[family-name:var(--font-source-serif)] font-semibold tabular-nums text-[color:var(--vault-gold-hi)]">{formatUsd0(r.cents)} · {Math.round(r.share * 100)}%</span>
          </span>
          <span aria-hidden="true" className="sx-vault-bar mt-1"><span style={at(delay + i * 0.06, { width: `${Math.round(r.share * 100)}%` })} /></span>
        </li>
      ))}
    </ul>
  );
}

/** Athlete pay by step: the main steps in a row, held/disputed set apart in red. */
export function VaultSteps({ steps }: { steps: { label: string; count: number; cents: number; off?: boolean }[] }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {steps.map((s) => (
        <li key={s.label} className={`sx-vault-frame px-3 py-2.5 text-center ${s.off ? "opacity-90" : ""}`} data-tone={s.off && s.count > 0 ? "late" : undefined}>
          <span className={`block text-[10px] uppercase tracking-[0.16em] ${s.off ? "text-[color:var(--vault-late)]" : "text-[color:var(--vault-muted)]"}`}>{s.label}</span>
          <span className="sx-vault-num mt-1 block text-[18px]">{formatUsd0(s.cents)}</span>
          <span className="block text-[11px] text-[color:var(--vault-muted)]">{s.count} {s.count === 1 ? "earning" : "earnings"}</span>
        </li>
      ))}
    </ol>
  );
}

const CHIP = {
  good: "border-[color:var(--vault-good)]/40 text-[color:var(--vault-good)]",
  you: "border-[color:var(--vault-gold)] bg-[color:var(--vault-gold)] text-[color:var(--vault-ground)] font-semibold",
  late: "border-[color:var(--vault-late)]/50 text-[color:var(--vault-late)]",
  info: "border-[color:var(--vault-gold)]/40 text-[color:var(--vault-gold-hi)]",
  done: "border-[color:var(--vault-line)] text-[color:var(--vault-muted)]",
} as const;
export type VaultTone = keyof typeof CHIP;
export function VaultChip({ tone = "info", children }: { tone?: VaultTone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-[11px] ${CHIP[tone]}`}>{children}</span>;
}

export function VaultBadge({ count }: { count: number }) {
  return <span className="sx-vault-badge tabular-nums" data-zero={count === 0 ? "" : undefined}>{count}</span>;
}

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "90d", label: "90 days" }, { key: "all", label: "All time" },
];

export function VaultRange({ current, path, params }: { current: RangeKey; path: string; params: Record<string, string | string[] | undefined> }) {
  const href = (key: RangeKey) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "range" || /page$/.test(k)) continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (typeof val === "string" && val) u.set(k, val);
    }
    if (key !== "30d") u.set("range", key);
    const s = u.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <nav aria-label="Time period" className="sx-vault-range flex overflow-hidden border border-[color:var(--vault-line)] text-[12px]">
      {RANGE_OPTIONS.map((r) => (
        <Link key={r.key} href={href(r.key)} scroll={false} aria-current={current === r.key ? "true" : undefined}
          className="px-2.5 py-1.5 text-[color:var(--vault-muted)] transition-colors hover:text-[color:var(--vault-gold-hi)]">
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

export function VaultGhost({ label = "Loading", tiles = 4, rows = 2 }: { label?: string; tiles?: number; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="sx-vault-ghost h-7 w-48" />
          <div className="sx-vault-ghost h-5 w-28 rounded-full" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => <div key={i} className="sx-vault-frame sx-vault-ghost min-h-[110px]" />)}
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: rows }, (_, i) => <div key={i} className="sx-vault-panel sx-vault-ghost min-h-[13rem]" />)}
        </div>
      </div>
    </div>
  );
}

function formatUsd0(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
```

  Use the house formatter instead of the local `formatUsd0` if `lib/format-count.ts` exports one (`formatCount(v, "usd0")`).
- [ ] **Step 3: Write `vault-flow.tsx`,** the money in vs out chart as a client island. Base it on `components/stadium-trend.tsx`; read it first and reuse its monotone-curve path builder, exporting the builder from `stadium-trend.tsx` if it's private.

```tsx
"use client";

/* Money in vs money out (P1-ART-25): in = a gold area + line, out = a
   dashed green line, by day (weeks past 120 days). Hover/focus a column for
   the read-out. A visually hidden table carries the same numbers. */
import { useId, useState } from "react";
// import { monotonePath } from "./stadium-trend"; // export it there if it is private

export function VaultFlow({ series, bucket }: { series: { day: string; inCents: number; outCents: number }[]; bucket: "day" | "week" }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const W = 640, H = 180, pad = 8;
  const max = Math.max(1, ...series.map((p) => Math.max(p.inCents, p.outCents)));
  const x = (i: number) => pad + (series.length < 2 ? 0 : (i / (series.length - 1)) * (W - pad * 2));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2 - 16);
  const pIn = series.map((p, i) => [x(i), y(p.inCents)] as const);
  const pOut = series.map((p, i) => [x(i), y(p.outCents)] as const);
  const inLine = monotonePath(pIn);
  const outLine = monotonePath(pOut);
  const area = `${inLine} L${x(series.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;
  const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const totalIn = series.reduce((n, p) => n + p.inCents, 0);
  const totalOut = series.reduce((n, p) => n + p.outCents, 0);
  const h = hover === null ? null : series[hover];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[190px] w-full" role="img" aria-label={`Money in ${usd(totalIn)}, money out ${usd(totalOut)} over ${series.length} ${bucket === "week" ? "weeks" : "days"}`}
        onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d4b062" stopOpacity="0.42" /><stop offset="1" stopColor="#d4b062" stopOpacity="0" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgb(212 176 98 / 0.1)" />)}
        <path d={area} fill={`url(#${id}-g)`} />
        <path d={inLine} fill="none" stroke="#e8cf86" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        <path d={outLine} fill="none" stroke="#3ddc97" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        {series.map((p, i) => (
          <rect key={p.day} x={x(i) - (W / series.length) / 2} y="0" width={W / series.length} height={H} fill="transparent"
            tabIndex={0} aria-label={`${p.day}: in ${usd(p.inCents)}, out ${usd(p.outCents)}`}
            onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
        ))}
        {h && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="rgb(212 176 98 / 0.45)" strokeDasharray="2 3" />
            <circle cx={x(hover)} cy={y(h.inCents)} r="3.5" fill="#f1dfa6" />
            <circle cx={x(hover)} cy={y(h.outCents)} r="3" fill="#3ddc97" />
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[color:var(--vault-muted)]">
        <span><span className="text-[#e8cf86]">━</span> In, from sponsors</span>
        <span><span className="text-[#3ddc97]">┅</span> Out, to athletes and properties</span>
        {h && <span className="ml-auto tabular-nums text-[color:var(--vault-gold-hi)]">{new Date(`${h.day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}{bucket === "week" ? " (week)" : ""} · In {usd(h.inCents)} · Out {usd(h.outCents)}</span>}
      </figcaption>
      <table className="sr-only">
        <caption>Money in and out by {bucket}</caption>
        <thead><tr><th>{bucket === "week" ? "Week of" : "Day"}</th><th>In</th><th>Out</th></tr></thead>
        <tbody>{series.map((p) => <tr key={p.day}><td>{p.day}</td><td>{usd(p.inCents)}</td><td>{usd(p.outCents)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
```

  Replace the commented import with the real one. If `stadium-trend.tsx` has no reusable builder, write `monotonePath(points)` (Fritsch–Carlson monotone cubic, which never overshoots) in `vault-flow.tsx` with a unit test in `tests/vault-flow.test.ts`: the curve passes through every point, and no control point leaves the y-range of its neighbours.
- [ ] **Step 4: Replace the Task 6 stub `VaultGround`** with the real one (already in Step 2 above).
- [ ] **Step 5: Verify.** `npx tsc --noEmit -p . && npx eslint src/components/vault-stage.tsx src/components/vault-flow.tsx src/components/stadium-hint.tsx`, then `npx vitest run` for any new test and `tests/arena-fx.test.ts` (sanity).
- [ ] **Step 6: Commit.** `feat(P1-ART-25): the Vault kit — tiles, deposit boxes, dial, flow, split, steps, range, ghost`.

## Task 8: Frontend: the `"vault"` tone for the house pager and filters

**Files:**
- Modify: `frontend/src/components/filter-kit.tsx` (**someone else's uncommitted hunk is in this file; read the ground rules**), `frontend/src/components/pagination.tsx` (`ACTIVE_TONE`, around line 15), `frontend/src/components/stage-table.tsx`, and `frontend/src/components/date-range-picker.tsx` if it maps tones
- Test: the existing pagination or filter-kit test if there is one (`ls frontend/tests | grep -i "pagin\|filter"`)

- [ ] **Step 1:** `export type FilterTone = "athlete" | "admin" | "sponsor" | "property" | "next" | "vault";`
- [ ] **Step 2:** Add a `vault` entry to every `Record<FilterTone, …>` in these files; tsc lists any you miss. Styles:
  - active page: `bg-[#d4b062] text-[#06100c] border-[#d4b062]`;
  - focus ring: `focus-visible:ring-[#d4b062]/60`;
  - selected dropdown option check: `text-[#f1dfa6]`;
  - search border on focus: `focus-within:border-[#d4b062]/70`.
  - Square corners for the vault: where the tone map holds radius classes, use `rounded-none`; otherwise leave the radius.
- [ ] **Step 3:** If a test pins the tone list, add `"vault"` to it. Run `npx tsc --noEmit -p .` (it must be exhaustive and clean), `npx eslint` on the touched files, and `npx vitest run` on the pagination and filter tests.
- [ ] **Step 4: Commit** only your hunks:

```bash
cd "d:/iCARRe Solutions/sponsorX_dev"
git diff -- frontend/src/components/filter-kit.tsx > "$SCRATCH/filter-kit.full.patch"   # theirs + yours
# Build the index version = HEAD + your hunk only:
git show HEAD:frontend/src/components/filter-kit.tsx > "$SCRATCH/fk.head.tsx"
# apply ONLY the FilterTone/vault edits to fk.head.tsx with the Edit tool, then:
git hash-object -w "$SCRATCH/fk.head.tsx"            # → <blob>
git update-index --cacheinfo 100644,<blob>,frontend/src/components/filter-kit.tsx
git add -- frontend/src/components/pagination.tsx frontend/src/components/stage-table.tsx
git commit -m "feat(P1-ART-25): the vault tone for the pager, filters and stage tables" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git diff -- frontend/src/components/filter-kit.tsx   # must still show THEIR hunk, uncommitted
```

  (`$SCRATCH` is the session scratchpad directory.) Do not use `git commit -- <filter-kit path>`, which would commit the working-tree file including their hunk.

## Task 9: Frontend: Treasury (`/admin/finance`)

**Files:**
- Rewrite: `frontend/src/app/(app)/admin/finance/page.tsx` (681 lines today: `LiveFinance`, the demo variant and `liveBooks`)
- Create: `frontend/src/app/(app)/admin/finance/loading.tsx`

- [ ] **Step 1: Read the current page whole.** Keep these and change only presentation:
  - `staffWithoutAccess` / `NotInRole`;
  - `FINANCE_ROLES`;
  - the `RECON_KEYS` / `INVOICE_KEYS` and earnings keys;
  - `readJson` with `allow403`;
  - the demo branch (`demoState`, fixtures);
  - every table's columns and wording.
- [ ] **Step 2: Reads.** Replace `liveBooks` with:

```ts
type Tab = "earnings" | "campaigns" | "invoices";
const tabOf = (sp: SearchParams, canInvoices: boolean): Tab => {
  const t = textParam(sp, "tab");
  return t === "campaigns" || t === "invoices" ? (canInvoices ? t : "earnings") : "earnings";
};

async function liveTreasury(sp: SearchParams) {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => FINANCE_ROLES.includes(r))) return null;
  const range = rangeParam(sp);
  const ov = (await readJson<{ overview: ApiFinanceOverview }>(`/finance/overview?range=${range}`))!.overview;
  const canInvoices = !!ov.invoices;           // the overview omits invoices for roles that can't read them
  const tab = tabOf(sp, canInvoices);
  const q = textParam(sp, "q");
  const state = textParam(sp, "state", STATES);
  const list =
    tab === "earnings" ? { tab, earnings: (await readJson<{ earnings: ApiEarning[]; page: ApiPage }>(`/earnings${pagedQuery(pageParams(sp), { q, state })}`))! }
    : tab === "campaigns" ? { tab, recon: (await readJson<ApiReconciliationPage>(`/earnings/reconciliation${pagedQuery(pageParamsFor(sp, RECON_KEYS))}`))! }
    : { tab, invoices: (await readJson<{ invoices: ApiInvoiceRow[]; page: ApiPage }>(`/earnings/invoices${pagedQuery(pageParamsFor(sp, INVOICE_KEYS))}`))! };
  return { ov, range, list, q, state, canInvoices };
}
```

  Fetch the overview and the active list in parallel where you can: the list only needs `canInvoices` to pick the tab. A simple approach is to start the earnings read optimistically when `tab` would be `earnings` regardless. Keep it simple if that's awkward.
- [ ] **Step 3: Layout,** in the spec's order (spec §6.1, ① to ⑥):

```tsx
<ServerList>
  <VaultHead title="Treasury" pill={<VaultUpdated at={ov.readAt} />} actions={<VaultRange current={range} path="/admin/finance" params={sp} />}>
    <VaultTiles cols={5}>
      <VaultTile label="Money in" value={ov.moneyIn.cents} delta={delta(ov.moneyIn.cents, ov.moneyIn.prev)} deltaLabel={prevLabel(range)} hint="Card payments taken for marketplace orders in this period, less card refunds." delay={0.08} />
      <VaultTile label="Paid out" value={ov.paidOut.cents} delta={delta(ov.paidOut.cents, ov.paidOut.prev)} deltaLabel={prevLabel(range)} caption="to athletes and properties" delay={0.12} />
      <VaultTile label="Owed to payees" value={ov.owed.cents} caption="earned, not paid yet" hint="Athlete earnings not yet paid, plus what the marketplace owes athletes and properties." delay={0.16} />
      <VaultTile label="BTG kept" value={ov.kept.cents + (ov.kept.campaignCommission ?? 0)} delta={delta(ov.kept.cents, ov.kept.prev)} deltaLabel={prevLabel(range)} caption={ov.kept.campaignCommission === undefined ? "marketplace fees only" : "fees and campaign commission"} delay={0.2} />
      <VaultTile label="Needs you" value={needsYouTotal(ov.needsYou)} format="int" tone={needsYouTotal(ov.needsYou) ? "you" : undefined} badge={needsYouTotal(ov.needsYou)} caption="items waiting on BTG" delay={0.24} />
    </VaultTiles>
  </VaultHead>
  {/* ③ */}
  <section aria-label="Needs you" className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <VaultBox label="Payouts to approve" count={ov.needsYou.payouts.count} cents={ov.needsYou.payouts.cents} sub={waitedFor(ov.needsYou.payouts.oldestAt)} href="/admin/payouts" open="Open Payouts" delay={0.28} />
    <VaultBox label="Refunds to send" count={ov.needsYou.refunds.count} cents={ov.needsYou.refunds.cents} sub={waitedFor(ov.needsYou.refunds.oldestAt)} href="/admin/refunds" open="Open Refunds" delay={0.32} />
    <VaultBox label="Disputes open" count={ov.needsYou.disputes.count} cents={ov.needsYou.disputes.cents} sub="money frozen" href="/admin/payments/disputes" open="Open Disputes" delay={0.36} />
    <VaultBox label="Payment events held" count={ov.needsYou.events.count} sub="the payment provider sent something we couldn't apply" href="/admin/payments/events" open="Open Payment events" delay={0.4} />
  </section>
  {/* ④ */}
  <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
    <VaultPanel delay={0.44}><VaultSection title="Money in vs. money out" /><VaultFlow series={ov.series} bucket={ov.range.bucket} /></VaultPanel>
    <VaultPanel delay={0.48} className="flex flex-col justify-center gap-5">
      <VaultDial value={ov.settled.rate} label="Settled" caption="Of what athletes and properties are owed or were paid in this period, the share already paid." />
      {ov.invoices && (
        <>
          <VaultDial value={ov.invoices.rate === null ? null : ov.invoices.rate / 100} label="Collected" caption="Sponsor invoices paid, from Zoho Books." />
          <Aging aging={ov.invoices.aging} />
        </>
      )}
    </VaultPanel>
  </div>
  {/* ⑤ */}
  <div className="mt-4 grid gap-4 lg:grid-cols-2">
    <VaultPanel delay={0.52}><VaultSection title="Where the money went" hint="Marketplace sales" />{rows.length ? <VaultSplit rows={rows} /> : <EmptyState … "No marketplace sales in this period." />}</VaultPanel>
    <VaultPanel delay={0.56}><VaultSection title="Athlete pay, step by step" /><VaultSteps steps={PAY_STEPS.map((s) => ({ label: s.label, off: s.off, count: ov.earningsByState[s.state].count, cents: ov.earningsByState[s.state].amount }))} /></VaultPanel>
  </div>
  {/* ⑥ */}
  <VaultPanel flush delay={0.6} className="mt-4">
    <TabStrip label="The books">
      <TabLink … tab=earnings>Athlete earnings</TabLink>
      {canInvoices && <TabLink … tab=campaigns>By campaign</TabLink>}
      {canInvoices && <TabLink … tab=invoices>Sponsor invoices</TabLink>}
    </TabStrip>
    {/* the active tab: the existing table, re-skinned, inside PagedTable tone="vault" / PagerRow tone="vault" with that list's keys */}
  </VaultPanel>
</ServerList>
```

  Notes:
  - `prevLabel(range)` returns "vs the 7 days before" / "vs the 30 days before" / "vs the 90 days before"; for "all" there is no delta.
  - `Aging` is a small local component: four rows (Not yet due / 1–30 days late / 31–60 / Over 60), with amounts in the serif and the last row in `--vault-late`.
  - Read `stage-table.tsx`'s `TabStrip`/`TabLink` signatures and use them as the payouts page does. A `TabLink` href sets `?tab=` and drops every `*page` param.
  - The earnings tab keeps `ListSearch` and `ListFilter` (the step filter), now with `tone="vault"`.
- [ ] **Step 4: Demo branch.** Render the same layout from the existing fixtures (`adminOps`, `earningItems`, `sponsorInvoices`) with a "Sample" pill instead of the updated time. Build a fake `ApiFinanceOverview` in a small `demoOverview()` from those fixtures. Values may be illustrative, but they must be derived from the fixtures, not new literals.
- [ ] **Step 5: `loading.tsx`.** `export default function Loading() { return <VaultGhost label="Loading the Treasury" tiles={5} rows={3} />; }`
- [ ] **Step 6: Verify.** `npx tsc --noEmit -p .`, then `npx eslint "src/app/(app)/admin/finance"`, then `npx vitest run` on the finance and earnings tests (`ls tests | grep -i "earning\|finance"`).
- [ ] **Step 7: Commit.** `feat(P1-ART-25): Treasury — Finance's home on the Vault`.

## Tasks 10–12: Frontend: the money desks on the Vault

The same treatment for each page. **Keep every read, write, server action, tab, URL key, test hook, empty state and access check.** Replace only the presentation:
- `PageHeader` / `OpsHeader` / StageHeading → `VaultHead` (+ `VaultUpdated` pill);
- count tiles → `VaultTiles` / `VaultTile` (`format="int"` for counts, `"usd0"` for money);
- `Card` / ops panels → `VaultPanel`;
- `Badge` / `StageChip` → `VaultChip` (map tones: waiting on BTG → `you`, done/paid → `good`, failed/lost → `late`, other → `info`);
- `PagedTable`, `PagerRow`, `ListSearch` and `ListFilter` → `tone="vault"`.

Remove any `ops-stage`/`ops-live` class or chamfer component from these pages. Add a `loading.tsx` with `VaultGhost` where one is missing. The tile counts come only from the page's existing read (spec §6.2 table). After each page, run `npx tsc --noEmit -p .`, `npx eslint <dir>` and the page's live-lib tests (`payouts`, `refunds-live`, `payment-events-live`, `disputes-live`, `commission-live`). Then commit (`feat(P1-ART-25): <desk> on the Vault`).

### Task 10: Payouts and one payout
- **`/admin/payouts`:**
  - Head: "Payout approvals".
  - Tiles from the list read's per-state counts (`tabCount`): Waiting on BTG (`tone="you"` with the badge when > 0, href to that tab), Approved, Sending, Paid, Failed (`tone="late"` when > 0).
  - Then the existing `TabStrip` and the paged table, keeping `PayoutRetry`, `retryPayoutAction`, the waiting reasons and "Approved automatically".
- **`/admin/payouts/[id]`:**
  - A summary strip of tiles: Amount (usd), Payee, State chip, Requested and Decided (`VaultDate`).
  - The rule checks as a checklist inside a `VaultPanel` (✓ in green, ✕ in red).
  - The order lines as a `StageTable` with vault styling (bounded, not paged).
  - The Approve / Send back form in `VaultPanel tone="you"` while it waits on BTG.
  - Keep the actions exactly as they are.

### Task 11: Refunds and Payment events
- **`/admin/refunds`:**
  - Tiles: To send (count, plus `openCents` as the caption in usd, `tone="you"`) and Sent.
  - Then the tabs and the paged table with the "Mark sent" action unchanged.
- **`/admin/payments/events`:**
  - Tiles: Waiting on BTG (`waitingOnBtg`, `tone="you"`), Applied, Held, Failed, and "Ignored or deferred" (the sum of those two counts).
  - Tabs and the paged table as today, with the resolve action unchanged.

### Task 12: Disputes, one dispute, Commission
- **`/admin/payments/disputes`:** tiles Open (`tone="you"`), Under review, Won and Lost from `counts`; then the tabs and the paged table.
- **`/admin/payments/disputes/[id]`:**
  - A summary strip: Amount, Order, Opened, State.
  - The provider's decision in a `VaultPanel`.
  - The resolve form in `VaultPanel tone="you"` while open.
- **`/admin/commission`** (BTG admin only, unchanged access):
  - Head "Commission".
  - Tiles: "Rules in force" (rules whose `effectiveTo` is null or in the future) and "Kinds covered" (distinct `kind` among them, out of `KINDS.length`).
  - The rule editor restyled: panels become `VaultPanel` and inputs keep their components with the vault tone.
  - Read `commission/page.tsx` and its components first; the page is 54 lines and delegates.

## Task 13: Verify, review, record

- [ ] **Step 1: Full checks.**
  - Frontend: `npx tsc --noEmit -p .`, `npx eslint src tests`, `npx vitest run`. Expected: all clean or pass, except failures already present on the base branch; compare against `git stash`-free runs on `feature/P1-ART-24-mobile-dock` if unsure.
  - Backend: `npx tsc --noEmit -p .`, `npx eslint src tests`, `npx vitest run`, with the DB if it's available.
- [ ] **Step 2: Production build in a detached worktree,** per auto-memory `build-in-detached-worktree`:
  1. `git worktree add --detach <scratch>/wt HEAD`;
  2. node_modules junctions via PowerShell `New-Item -ItemType Junction`;
  3. `turbopack.root` one level up;
  4. `npm run build` in the worktree;
  5. then `rmdir` the junctions **before** `git worktree remove`.
- [ ] **Step 3: Browser walk** on the live dev servers (auto-memory `local-qa-walk-setup`, `dev-api-no-watch`: restart the :4000 API with its same command so `/finance/overview` exists, and `backend-errors-after-pull` if it 500s).
  - **As the QA finance user:**
    - `/admin` redirects to Treasury;
    - the nav starts with Treasury;
    - every Vault route works at 1440 and 390;
    - no console errors and no horizontal scroll;
    - the tiles match `GET /finance/overview`;
    - the pager works top and bottom;
    - the books tabs: one tab for Finance.
  - **As the QA admin:**
    - `/admin` is Mission Control;
    - moving to Payouts switches the whole screen to the Vault, sidebar and dock included;
    - moving back switches it back;
    - three books tabs.
  - **Reduced motion** (DevTools emulation): the bezel doesn't turn, there are no draw-ins, and the numbers are final.
- [ ] **Step 4: Final code review** of the whole branch (superpowers:requesting-code-review). Fix every finding.
- [ ] **Step 5: Record.**
  - **Team log** `Memory/2026-10-12/finance-vault.md`, in the style of `Memory/2026-10-12/sponsor-stadium.md`: the ask, the decisions, the kit, the pages, the API, what was verified.
  - **Tracker:** add the P1-ART-25 row (Order 301.5 or the next fractional after P1-ART-24's row) to `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`. Status `Code review`, Owner `HeckerCreatives`, with Date Started and Date Done.
    - Use a scratchpad venv with openpyxl, and back up the workbook first.
    - Extend the Dashboard's `COUNTIF`/`COUNTA`/`SUMIF` ranges, the autofilter, the conditional-formatting ranges and the Status validation by one row.
    - Append today's `Stage Progress` snapshot row as literal numbers.
  - **Auto-memory:** update `portal-stage-identities.md` with the fourth look.
  - Commit the log and the tracker by pathspec. Use `Memory/` with a capital M (auto-memory `memory-folder-case`).

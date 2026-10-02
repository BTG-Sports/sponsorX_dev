/**
 * /api/v1 — earnings (P7-BE-01, P7-BE-03).
 *
 * The Finance surface. Every route is authenticated and tenant-scoped; there
 * is deliberately no public one, unlike the fan funnel.
 *
 * THERE IS NO CREATE ENDPOINT, ON PURPOSE. An earning is raised by
 * `acceptOrder`, inside the transaction that creates the contract it belongs
 * to — one earning per order, and the order is what says how much. An
 * endpoint that let someone mint an earning by hand would be a way to owe an
 * athlete money with no contract behind it.
 *
 * Nor is there an endpoint that moves one to ELIGIBLE by hand-waving: that
 * happens in `P7-BE-02` when the last deliverable is verified. `/transition`
 * can still reach ELIGIBLE — Finance must be able to release an earning that
 * was HELD — but the ordinary path is automatic and audited.
 */
import { Router, type RequestHandler } from "express";

import { requireActor, type Actor } from "../../auth/actor";
import { ForbiddenError } from "../../auth/errors";
import { can, scopeOf, whereFor } from "../../auth/scope";
import { canReadField } from "../../auth/fields";
import { prisma } from "../../db/client";
import { allowedList, pageRequest, readPage, searchTerm } from "../../lib/paging";
import {
  EarningAdjustmentInput,
  EarningTransitionInput,
} from "../../contracts/earning";
import {
  adjustEarning,
  readEarning,
  transitionEarning,
} from "../../domain/earning";

export const earningsRouter = Router();

/* --- the list (P7-FE-01 / P7-FE-02) ---------------------------------------

   GET /earnings — every earning the caller may read: the athlete their own,
   Finance the tenant's. Status only — no money moves through SponsorX in
   Phase 1, and nothing here is a bank detail or a tax ID (§26, Addendum A6).

   Column rights, from §7.1 and decided once per call:
     amount / gross / adjustment — `earning.amount` (denied to sponsors,
       campaign managers and sales)
     sellPrice / commission      — also `campaignOrder.sellPrice` (the athlete
       never sees what the sponsor paid for their work, so never the cut)
     campaigns reconciliation    — also `invoice` read (the Zoho Books mirror,
       §18): contracted sell vs invoiced vs paid, beside earnings raised and
       paid out — Finance's reconciliation view.
   A denied column is ABSENT, never zero.

   TWO MODES (2026-09-29, server-paged lists). Without `?page=` the list is
   exactly what it always was — the newest 500 plus, for invoice readers, the
   `campaigns` block — because the admin board and the athlete home read it.
   With `?page=` it is one page of the filtered list (`?state=` comma list,
   `?type=` job name, `?jobId=`, `?from=`/`?to=` YYYY-MM-DD on the earning's
   last change — paidAt, else the order's acceptedAt — and `?q=`), and no
   `campaigns` block: reconciliation has its own paged route now, computed
   per campaign rather than from a capped earnings list. */

const EARNING_STATES = ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED"] as const;
type EarningStateName = (typeof EARNING_STATES)[number];

type Rights = { seeAmount: boolean; seeSell: boolean; seeInvoices: boolean; seeReasons: boolean };

function rightsOf(actor: Actor): Rights {
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

const EARNING_SELECT = {
  id: true, state: true, gross: true, adjustment: true, taxYear: true, paidAt: true, reference: true,
  approvedAutomatically: true, reviewReasons: true,
  athlete: { select: { id: true, displayName: true } },
  order: {
    select: {
      id: true, jobId: true, acceptedAt: true, sellPrice: true,
      job: { select: { name: true } },
      campaign: { select: { id: true, name: true, sponsor: { select: { name: true } } } },
      deliverables: { select: { state: true } },
    },
  },
} as const;

type EarningRow = {
  id: string; state: string; gross: number; adjustment: number; taxYear: number;
  paidAt: Date | null; reference: string | null;
  approvedAutomatically?: boolean; reviewReasons?: string[];
  athlete: { id: string; displayName: string };
  order: {
    id: string; jobId: string; acceptedAt: Date | null; sellPrice: number;
    job: { name: string };
    campaign: { id: string; name: string; sponsor: { name: string } };
    deliverables: { state: string }[];
  };
};

function earningOut(e: EarningRow, r: Rights) {
  const amount = e.gross + e.adjustment;
  return {
    id: e.id,
    state: e.state,
    taxYear: e.taxYear,
    paidAt: e.paidAt?.toISOString() ?? null,
    reference: e.reference,
    /* 2S5-BE-08 — approved for payout by the rule, not by Finance. */
    approvedAutomatically: Boolean(e.approvedAutomatically),
    ...(r.seeReasons ? { reviewReasons: e.reviewReasons ?? [] } : {}),
    athlete: e.athlete,
    order: {
      id: e.order.id,
      jobId: e.order.jobId,
      jobName: e.order.job.name,
      acceptedAt: e.order.acceptedAt?.toISOString() ?? null,
      campaignId: e.order.campaign.id,
      campaignName: e.order.campaign.name,
      sponsorName: e.order.campaign.sponsor.name,
      deliverables: {
        verified: e.order.deliverables.filter((d) => d.state === "VERIFIED").length,
        total: e.order.deliverables.length,
      },
    },
    ...(r.seeAmount ? { amount, gross: e.gross, adjustment: e.adjustment } : {}),
    ...(r.seeSell ? { sellPrice: e.order.sellPrice, commission: e.order.sellPrice - amount } : {}),
  };
}

/** `YYYY-MM-DD` → that UTC midnight, or undefined for anything else. */
function dayParam(v: unknown): Date | undefined {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : d;
}

const oneText = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().replace(/\0/g, "").slice(0, 100) : undefined);

/** The paged list's WHERE — the caller's scope first, every filter a
 *  further conjunct that can only narrow it. Exported for the tests. */
export function pagedEarningsWhere(actor: Actor, query: Record<string, unknown>) {
  const insensitive = "insensitive" as const;
  const q = searchTerm(query);
  const states = allowedList(query.state, EARNING_STATES);
  const type = oneText(query.type);
  const jobId = oneText(query.jobId);
  const from = dayParam(query.from);
  const toDay = dayParam(query.to);
  /* `to` is inclusive: everything before the next UTC midnight. */
  const to = toDay ? new Date(toDay.getTime() + 86_400_000) : undefined;
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;
  return {
    AND: [
      whereFor(actor, "earning", "read"),
      ...(states.length ? [{ state: { in: [...states] } }] : []),
      ...(jobId ? [{ order: { is: { jobId } } }] : []),
      ...(type ? [{ order: { is: { job: { is: { name: type } } } } }] : []),
      ...(range
        ? [{ OR: [{ paidAt: range }, { paidAt: null, order: { is: { acceptedAt: range } } }] }]
        : []),
      ...(q
        ? [{
            OR: [
              { reference: { contains: q, mode: insensitive } },
              { athlete: { is: { displayName: { contains: q, mode: insensitive } } } },
              { order: { is: { jobId: { contains: q, mode: insensitive } } } },
              { order: { is: { job: { is: { name: { contains: q, mode: insensitive } } } } } },
              { order: { is: { campaign: { is: { name: { contains: q, mode: insensitive } } } } } },
              { order: { is: { campaign: { is: { sponsor: { is: { name: { contains: q, mode: insensitive } } } } } } } },
            ],
          }]
        : []),
    ],
  };
}

/* Most recent change first. The explorer's "last change" is paidAt, else the
   order's acceptedAt; Prisma cannot order by that COALESCE, so this is the
   nearest keyset it can: everything still in motion (no paidAt) first,
   newest accepted on top, then paid earnings newest paid first. */
const PAGED_ORDER = [
  { paidAt: { sort: "desc", nulls: "first" } },
  { order: { acceptedAt: { sort: "desc", nulls: "last" } } },
  { id: "desc" },
] as const;

const listEarnings: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const rights = rightsOf(actor);
  const query = req.query as Record<string, unknown>;

  const paged = pageRequest(query);
  if (paged) {
    const where = pagedEarningsWhere(actor, query);
    const { rows, page } = await readPage(
      paged,
      () => prisma.earning.count({ /* tenant-scope: `where` is pagedEarningsWhere — whereFor(earning) first. */ where }),
      (skip, take) =>
        prisma.earning.findMany({
          /* tenant-scope: `where` is pagedEarningsWhere — whereFor(earning) first. */
          where,
          select: EARNING_SELECT,
          orderBy: PAGED_ORDER as never,
          skip,
          take,
        }) as unknown as Promise<EarningRow[]>,
    );
    res.json({ earnings: rows.map((e) => earningOut(e, rights)), page });
    return;
  }

  const { seeInvoices } = rights;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;

  const rows = (await prisma.earning.findMany({
    where: {
      ...whereFor(actor, "earning", "read"),
      ...(state && (EARNING_STATES as readonly string[]).includes(state) ? { state: state as never } : {}),
    },
    select: EARNING_SELECT,
    orderBy: [{ paidAt: { sort: "desc", nulls: "first" } }, { id: "desc" }],
    take: 500,
  })) as unknown as EarningRow[];

  const earnings = rows.map((e) => earningOut(e, rights));

  let campaigns: unknown[] | undefined;
  if (seeInvoices) {
    const ids = [...new Set(rows.map((r) => r.order.campaign.id))];
    const inv = ids.length
      ? await prisma.campaignInvoice.findMany({
          /* Scoped through the campaign, as invoicesForCampaign does — the
             invoice mirror has no scope builder of its own; `seeInvoices`
             already required the matrix's invoice read. */
          where: { campaignId: { in: ids }, campaign: whereFor(actor, "campaign", "read") },
          select: {
            campaignId: true, number: true, status: true, amount: true, paidAt: true, zohoInvoiceId: true,
            issuedAt: true, dueAt: true,
          },
        })
      : [];
    campaigns = ids.map((id) => {
      const mine = rows.filter((r) => r.order.campaign.id === id);
      const live = inv.filter((i) => i.campaignId === id && i.status.toLowerCase() !== "void");
      return {
        campaignId: id,
        name: mine[0].order.campaign.name,
        sponsorName: mine[0].order.campaign.sponsor.name,
        contracted: mine.reduce((n, r) => n + r.order.sellPrice, 0),
        invoiced: live.reduce((n, i) => n + i.amount, 0),
        invoicePaid: live.filter((i) => i.status.toLowerCase() === "paid").reduce((n, i) => n + i.amount, 0),
        earningsRaised: mine.reduce((n, r) => n + r.gross + r.adjustment, 0),
        earningsPaid: mine.filter((r) => r.state === "PAID").reduce((n, r) => n + r.gross + r.adjustment, 0),
        invoices: inv
          .filter((i) => i.campaignId === id)
          .map(invoiceOut),
      };
    });
  }

  res.json({ earnings, ...(campaigns ? { campaigns } : {}) });
};

type InvoiceRow = {
  number: string | null; zohoInvoiceId: string; status: string; amount: number;
  paidAt: Date | null; issuedAt: Date | null; dueAt: Date | null;
};

function invoiceOut(i: InvoiceRow) {
  return {
    number: i.number, zohoInvoiceId: i.zohoInvoiceId, status: i.status, amount: i.amount,
    paidAt: i.paidAt?.toISOString() ?? null,
    issuedAt: i.issuedAt?.toISOString() ?? null,
    dueAt: i.dueAt?.toISOString() ?? null,
  };
}

const INVOICE_SELECT = {
  campaignId: true, number: true, status: true, amount: true, paidAt: true, zohoInvoiceId: true,
  issuedAt: true, dueAt: true,
} as const;

/* --- the summary (2026-09-29) ----------------------------------------------

   GET /earnings/summary — the figures the athlete page and the Finance
   workspace draw, aggregated in the database over the caller's WHOLE scope
   (the same whereFor the list uses), so a paged list never has to fetch
   every row to total it. Same column rights as the list: a withheld figure
   is ABSENT, never 0 — a role without `earning.amount` gets counts only;
   the sponsor price / commission totals need `campaignOrder.sellPrice`.

   Career is lib/earnings-live.ts's definition: raised = every state but
   DISPUTED, paid = PAID, onTheWay = APPROVED_FOR_PAYOUT. `?year=` picks the
   paid-by-month year (default: this UTC year). */

const earningsSummary: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const { seeAmount, seeSell } = rightsOf(actor);
  const scope = whereFor(actor, "earning", "read");
  const asked = Number(req.query.year);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : new Date().getUTCFullYear();

  const groups = (await prisma.earning.groupBy({
    by: ["state"],
    /* tenant-scope: whereFor(earning). */
    where: scope,
    _count: { _all: true },
    ...(seeAmount ? { _sum: { gross: true, adjustment: true } } : {}),
  } as never)) as unknown as { state: string; _count: { _all: number }; _sum?: { gross: number | null; adjustment: number | null } }[];

  const byState = Object.fromEntries(
    EARNING_STATES.map((s) => {
      const g = groups.find((x) => x.state === s);
      const count = g?._count._all ?? 0;
      const amount = (g?._sum?.gross ?? 0) + (g?._sum?.adjustment ?? 0);
      return [s, seeAmount ? { count, amount } : { count }];
    }),
  ) as Record<EarningStateName, { count: number; amount?: number }>;
  const count = EARNING_STATES.reduce((n, s) => n + byState[s].count, 0);
  const sum = (states: readonly EarningStateName[]) => states.reduce((n, s) => n + (byState[s].amount ?? 0), 0);

  const onOrder = { order: { is: { earning: { is: scope } } } };
  const [verified, total, jobs] = await Promise.all([
    prisma.deliverable.count({ /* tenant-scope: through the order's earning — whereFor(earning). */ where: { ...onOrder, state: "VERIFIED" } }),
    prisma.deliverable.count({ /* tenant-scope: through the order's earning — whereFor(earning). */ where: onOrder }),
    prisma.nilJob.findMany({
      /* tenant-scope: only jobs with an order whose earning whereFor(earning) admits. */
      where: { orders: { some: { earning: { is: scope } } } },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  let money: Record<string, unknown> = {};
  if (seeAmount) {
    const paid = (await prisma.earning.groupBy({
      by: ["paidAt"],
      /* tenant-scope: whereFor(earning) first. */
      where: {
        AND: [
          scope,
          { state: "PAID", paidAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
        ],
      },
      _sum: { gross: true, adjustment: true },
    } as never)) as unknown as { paidAt: Date | null; _sum: { gross: number | null; adjustment: number | null } }[];
    const months = Array.from({ length: 12 }, () => 0);
    for (const p of paid) if (p.paidAt) months[p.paidAt.getUTCMonth()] += (p._sum.gross ?? 0) + (p._sum.adjustment ?? 0);
    money = {
      career: {
        raised: sum(EARNING_STATES.filter((s) => s !== "DISPUTED")),
        paid: sum(["PAID"]),
        onTheWay: sum(["APPROVED_FOR_PAYOUT"]),
      },
      paidByMonth: { year, months },
    };
    if (seeSell) {
      const sell = await prisma.campaignOrder.aggregate({
        /* tenant-scope: orders whose earning whereFor(earning) admits. */
        where: { earning: { is: scope } },
        _sum: { sellPrice: true },
      });
      const sellPrice = sell._sum.sellPrice ?? 0;
      money.sell = { sellPrice, commission: sellPrice - sum(EARNING_STATES) };
    }
  }

  res.json({
    count,
    byState,
    deliverables: { verified, total },
    jobNames: [...new Set(jobs.map((j) => j.name))],
    ...money,
  });
};

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

function reconciliationSet(actor: Actor) {
  return {
    AND: [
      whereFor(actor, "campaign", "read"),
      { orders: { some: { earning: { is: whereFor(actor, "earning", "read") } } } },
    ],
  };
}

function requireInvoiceRights(actor: Actor) {
  if (!rightsOf(actor).seeInvoices) throw new ForbiddenError("invoice", "read");
}

const NOT_SETTLED = {
  NOT: [
    { status: { equals: "paid", mode: "insensitive" as const } },
    { status: { equals: "void", mode: "insensitive" as const } },
  ],
};

const DAY = 86_400_000;

async function reconciliationTotals(actor: Actor, now: Date) {
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

const listReconciliation: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  requireInvoiceRights(actor);
  const query = req.query as Record<string, unknown>;
  const paged = pageRequest({ ...query, page: query.page ?? 1 })!;
  const set = reconciliationSet(actor);
  const earningScope = whereFor(actor, "earning", "read");

  const { rows, page } = await readPage(
    paged,
    () => prisma.campaign.count({ /* tenant-scope: reconciliationSet — whereFor(campaign) ∧ whereFor(earning). */ where: set }),
    (skip, take) =>
      prisma.campaign.findMany({
        /* tenant-scope: reconciliationSet — whereFor(campaign) ∧ whereFor(earning). */
        where: set,
        select: {
          id: true, name: true, sponsor: { select: { name: true } },
          invoices: { select: INVOICE_SELECT, orderBy: [{ issuedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }] },
        },
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
        skip,
        take,
      }) as unknown as Promise<{ id: string; name: string; sponsor: { name: string }; invoices: (InvoiceRow & { campaignId: string })[] }[]>,
  );

  const ids = rows.map((c) => c.id);
  /* The page's orders that carry a visible earning — bounded by the page's
     campaigns, never by a global cap. */
  const orders = ids.length
    ? ((await prisma.campaignOrder.findMany({
        /* tenant-scope: the page's campaigns (already scoped) ∧ whereFor(earning). */
        where: { campaignId: { in: ids }, earning: { is: earningScope } },
        select: { campaignId: true, sellPrice: true, earning: { select: { gross: true, adjustment: true, state: true } } },
      })) as unknown as { campaignId: string; sellPrice: number; earning: { gross: number; adjustment: number; state: string } | null }[])
    : [];

  const campaigns = rows.map((c) => {
    const mine = orders.filter((o) => o.campaignId === c.id && o.earning);
    const live = c.invoices.filter((i) => i.status.toLowerCase() !== "void");
    const net = (o: (typeof mine)[number]) => o.earning!.gross + o.earning!.adjustment;
    return {
      campaignId: c.id,
      name: c.name,
      sponsorName: c.sponsor.name,
      contracted: mine.reduce((n, o) => n + o.sellPrice, 0),
      invoiced: live.reduce((n, i) => n + i.amount, 0),
      invoicePaid: live.filter((i) => i.status.toLowerCase() === "paid").reduce((n, i) => n + i.amount, 0),
      earningsRaised: mine.reduce((n, o) => n + net(o), 0),
      earningsPaid: mine.filter((o) => o.earning!.state === "PAID").reduce((n, o) => n + net(o), 0),
      invoices: c.invoices.map(invoiceOut),
    };
  });

  res.json({ campaigns, page, totals: await reconciliationTotals(actor, new Date()) });
};

/* GET /earnings/invoices — the sponsor-invoices table: every invoice on the
   reconciliation's campaign set, flat, newest issued first, one page at a
   time (?page= ?size=). Same gate as /earnings/reconciliation. */
const listInvoices: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  requireInvoiceRights(actor);
  const query = req.query as Record<string, unknown>;
  const paged = pageRequest({ ...query, page: query.page ?? 1 })!;
  const where = { campaign: { is: reconciliationSet(actor) } };

  const { rows, page } = await readPage(
    paged,
    () => prisma.campaignInvoice.count({ /* tenant-scope: through the campaign — whereFor(campaign) ∧ whereFor(earning). */ where }),
    (skip, take) =>
      prisma.campaignInvoice.findMany({
        /* tenant-scope: through the campaign — whereFor(campaign) ∧ whereFor(earning). */
        where,
        select: { ...INVOICE_SELECT, campaign: { select: { name: true, sponsor: { select: { name: true } } } } },
        orderBy: [{ issuedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        skip,
        take,
      }) as unknown as Promise<(InvoiceRow & { campaignId: string; campaign: { name: string; sponsor: { name: string } } })[]>,
  );

  res.json({
    invoices: rows.map((i) => ({
      ...invoiceOut(i),
      campaignId: i.campaignId,
      campaign: i.campaign.name,
      sponsor: i.campaign.sponsor.name,
    })),
    page,
  });
};

/** GET /earnings/:id — the record with its money broken out. */
const read: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await readEarning(req.actor!, req.params.id));
};

/** POST /earnings/:id/transition — Finance moves it through §21. */
const move: RequestHandler<{ id: string }> = async (req, res) => {
  const body = EarningTransitionInput.parse(req.body ?? {});
  res.json(
    await transitionEarning(req.actor!, req.params.id, body.to, {
      reference: body.reference ?? null,
    }),
  );
};

/** POST /earnings/:id/adjustment — a correction, with its reason audited. */
const adjust: RequestHandler<{ id: string }> = async (req, res) => {
  const body = EarningAdjustmentInput.parse(req.body ?? {});
  res.json(
    await adjustEarning(req.actor!, req.params.id, body.adjustment, body.reason),
  );
};

earningsRouter.get("/earnings", requireActor, listEarnings);
/* The fixed paths before `/earnings/:id`, or ":id" would swallow them. */
earningsRouter.get("/earnings/summary", requireActor, earningsSummary);
earningsRouter.get("/earnings/reconciliation", requireActor, listReconciliation);
earningsRouter.get("/earnings/invoices", requireActor, listInvoices);
earningsRouter.get("/earnings/:id", requireActor, read);
earningsRouter.post("/earnings/:id/transition", requireActor, move);
earningsRouter.post("/earnings/:id/adjustment", requireActor, adjust);

export { earningsSummary, listEarnings, listInvoices, listReconciliation };

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

import { requireActor } from "../../auth/actor";
import { can, whereFor } from "../../auth/scope";
import { canReadField } from "../../auth/fields";
import { prisma } from "../../db/client";
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
   A denied column is ABSENT, never zero. */

const listEarnings: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const seeAmount = canReadField(actor.roles, "earning.amount");
  const seeSell = seeAmount && canReadField(actor.roles, "campaignOrder.sellPrice");
  const seeInvoices = seeSell && can(actor, "invoice", "read");
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const STATES = ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED"];

  const rows = await prisma.earning.findMany({
    where: {
      ...whereFor(actor, "earning", "read"),
      ...(state && STATES.includes(state) ? { state: state as never } : {}),
    },
    select: {
      id: true, state: true, gross: true, adjustment: true, taxYear: true, paidAt: true, reference: true,
      athlete: { select: { id: true, displayName: true } },
      order: {
        select: {
          id: true, jobId: true, acceptedAt: true, sellPrice: true,
          job: { select: { name: true } },
          campaign: { select: { id: true, name: true, sponsor: { select: { name: true } } } },
          deliverables: { select: { state: true } },
        },
      },
    },
    orderBy: [{ paidAt: { sort: "desc", nulls: "first" } }, { id: "desc" }],
    take: 500,
  });

  const earnings = rows.map((e) => {
    const amount = e.gross + e.adjustment;
    return {
      id: e.id,
      state: e.state,
      taxYear: e.taxYear,
      paidAt: e.paidAt?.toISOString() ?? null,
      reference: e.reference,
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
      ...(seeAmount ? { amount, gross: e.gross, adjustment: e.adjustment } : {}),
      ...(seeSell ? { sellPrice: e.order.sellPrice, commission: e.order.sellPrice - amount } : {}),
    };
  });

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
          .map((i) => ({
            number: i.number, zohoInvoiceId: i.zohoInvoiceId, status: i.status, amount: i.amount,
            paidAt: i.paidAt?.toISOString() ?? null,
            issuedAt: i.issuedAt?.toISOString() ?? null,
            dueAt: i.dueAt?.toISOString() ?? null,
          })),
      };
    });
  }

  res.json({ earnings, ...(campaigns ? { campaigns } : {}) });
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
earningsRouter.get("/earnings/:id", requireActor, read);
earningsRouter.post("/earnings/:id/transition", requireActor, move);
earningsRouter.post("/earnings/:id/adjustment", requireActor, adjust);

export { listEarnings };

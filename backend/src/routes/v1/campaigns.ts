/**
 * /api/v1 — briefs, campaigns, matching and invitations (P4-BE-02…06).
 *
 * The B3 domain functions had no endpoints when they were written, which is
 * the same defect this codebase already found three times in B1: a task
 * closes against its acceptance, the acceptance names a domain function, and
 * the capability stays unreachable. These are the routes.
 *
 * No business rule lives here. The conflict check, §37's guardian gate and
 * every state guard are in the domain, so §8's service account and any
 * internal caller meet the same rules as a browser.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { can, whereFor } from "../../auth/scope";
import { canReadField } from "../../auth/fields";
import { ForbiddenError } from "../../auth/errors";
import { clientIp, clientUserAgent } from "../../lib/client-ip";
import { prisma } from "../../db/client";
import {
  BriefTransitionInput,
  CampaignBriefInput,
  CampaignFromBriefInput,
  CampaignTransitionInput,
  InvitationInput,
  InvitationResponseInput,
} from "../../contracts/campaign";
import { createBrief, transitionBrief } from "../../domain/brief";
import { createCampaignFromBrief, launchCampaign, transitionCampaign } from "../../domain/campaign";
import { eligibleForBrief } from "../../domain/matching";
import { loadAgreementBody } from "../../domain/agreement-text";
import { guardianReadiness } from "../../domain/guardian-rules";
import { assessDelivery } from "../../domain/delivery-health";
import { isVerified, type MetricSource } from "../../domain/metric-source";
import { inviteAthlete, transitionInvite } from "../../domain/invitation";
import { setAthleteRate, setAthleteTier, readRateCard } from "../../domain/athlete-rate";
import { acceptOrder, createOrder, transitionOrder, updateOrderTerms } from "../../domain/campaign-order";
import {
  AthleteRateInput, AthleteTierInput, CampaignOrderInput,
  OrderAcceptanceInput, OrderTransitionInput,
} from "../../contracts/campaign";

export const campaignsRouter = Router();

/** POST /briefs — a sponsor asks. Always lands in DRAFT: qualification is
 *  BTG's act, so nothing a sponsor sends can arrive already qualified. */
const submitBrief: RequestHandler = async (req, res) => {
  const body = CampaignBriefInput.parse(req.body ?? {});
  res.status(201).json(
    await createBrief(req.actor!, {
      ...body,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    }),
  );
};

/** POST /briefs/:id/transition — qualify, approve or close. */
const moveBrief: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = BriefTransitionInput.parse(req.body ?? {});
  res.json(await transitionBrief(req.actor!, req.params.id, to));
};

/* --- brief reads (P4-FE-02) --------------------------------------------

   The matching desk starts from a brief, and until now nothing could READ
   one: the Studio had a submit, a transition and a shortlist, and no way to
   show what it was matching against. Scoped by the matrix — a sponsor reads
   their own briefs, BTG the tenant's. No rule lives here. */

const BRIEF_SELECT = {
  id: true, objective: true, state: true, budget: true,
  startDate: true, endDate: true, sports: true, stateCodes: true, categories: true,
  createdAt: true,
  sponsor: { select: { name: true } },
  package: {
    select: { code: true, name: true, lineItems: true, athleteCountMin: true, athleteCountMax: true },
  },
  campaign: { select: { id: true, name: true, state: true } },
} as const;

type BriefRow = {
  id: string; objective: string; state: string; budget: number;
  startDate: Date; endDate: Date; sports: string[]; stateCodes: string[]; categories: string[];
  createdAt: Date;
  sponsor: { name: string };
  package: {
    code: string; name: string; lineItems: unknown;
    athleteCountMin: number; athleteCountMax: number;
  } | null;
  campaign: { id: string; name: string; state: string } | null;
};

function briefOut(b: BriefRow) {
  return {
    id: b.id,
    objective: b.objective,
    state: b.state,
    budget: b.budget,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate.toISOString(),
    sports: b.sports,
    stateCodes: b.stateCodes,
    categories: b.categories,
    createdAt: b.createdAt.toISOString(),
    sponsorName: b.sponsor.name,
    package: b.package,
    campaign: b.campaign,
  };
}

/** GET /briefs — newest first; `?state=` narrows to one §21 brief state. */
const listBriefs: RequestHandler = async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const STATES = ["DRAFT", "QUALIFIED", "APPROVED", "CAMPAIGN_CREATED", "CLOSED"];
  const rows = await prisma.campaignBrief.findMany({
    where: {
      ...whereFor(req.actor!, "campaignBrief", "read"),
      ...(state && STATES.includes(state) ? { state: state as never } : {}),
    },
    select: BRIEF_SELECT,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ briefs: (rows as BriefRow[]).map(briefOut) });
};

/**
 * GET /briefs/:id — one brief, and (for a caller who reads invitations) the
 * invites its campaign has sent, so the roster can say who is SENT and who
 * has answered (P4-FE-03). `offered` is athlete pay: it rides only for a
 * role §7.1 lets read `athleteRate.amount`.
 */
const readBrief: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const brief = (await prisma.campaignBrief.findFirst({
    where: { ...whereFor(actor, "campaignBrief", "read"), id: req.params.id },
    select: BRIEF_SELECT,
  })) as BriefRow | null;
  /* Out of scope and nonexistent answer alike — no existence oracle. */
  if (!brief) throw new ForbiddenError("campaignBrief", "read");

  let invites: {
    id: string; athleteId: string; jobId: string; state: string;
    offered?: number; expiresAt: string;
  }[] | undefined;
  if (brief.campaign && can(actor, "invitation", "read")) {
    const seePay = canReadField(actor.roles, "athleteRate.amount");
    const rows = await prisma.campaignInvite.findMany({
      where: { ...whereFor(actor, "invitation", "read"), campaignId: brief.campaign.id },
      select: { id: true, athleteId: true, jobId: true, state: true, offered: true, expiresAt: true },
      orderBy: { sentAt: "asc" },
    });
    invites = rows.map((r) => ({
      id: r.id, athleteId: r.athleteId, jobId: r.jobId, state: r.state,
      ...(seePay ? { offered: r.offered } : {}),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  /* The package's line items, resolved to the job catalogue — sell side
     only (band and per-tier floors are what the SPONSOR pays; base pay is
     never selected here). The desk prices a line from these. */
  const lines = Array.isArray(brief.package?.lineItems)
    ? (brief.package!.lineItems as { jobCode?: unknown; quantityPerAthlete?: unknown }[])
        .filter((l) => typeof l.jobCode === "string")
        .map((l) => ({
          jobId: l.jobCode as string,
          quantity: typeof l.quantityPerAthlete === "number" ? l.quantityPerAthlete : 1,
        }))
    : [];
  const catalogue = lines.length
    ? await prisma.nilJob.findMany({
        where: { ...whereFor(actor, "nilJob", "read"), id: { in: lines.map((l) => l.jobId) } },
        select: {
          id: true, name: true, sellLow: true, sellHigh: true,
          sellFloorEmerging: true, sellFloorCreator: true, sellFloorPremium: true,
        },
      })
    : [];
  const jobs = lines.flatMap((l) => {
    const j = catalogue.find((c) => c.id === l.jobId);
    return j
      ? [{
          jobId: j.id, name: j.name, quantity: l.quantity,
          sellLow: j.sellLow, sellHigh: j.sellHigh,
          sellFloors: { EMERGING: j.sellFloorEmerging, CREATOR: j.sellFloorCreator, PREMIUM: j.sellFloorPremium },
        }]
      : [];
  });

  res.json({ ...briefOut(brief), jobs, ...(invites ? { invites } : {}) });
};

/* --- the campaign portfolio (P4-FE-05) ----------------------------------

   GET /campaigns — what a sponsor's dashboard (§9 screen 3) lists: each
   campaign's state, package, window, how many athletes are on it and how far
   delivery has got. Counts are for everyone the matrix lets read the
   campaign. MONEY is not: the contracted sell total needs both §7.1's
   `campaign.value` and `campaignOrder.sellPrice`; the budget needs
   `campaign.budget`; the invoiced / paid figures (the Zoho Books mirror,
   §18) additionally need `invoice` read. A role denied a column gets the
   key ABSENT, never a zero that reads as "nothing spent". */

const DELIVERED = new Set(["PUBLISHED", "VERIFIED"]);
const LIVE_ORDER = { state: { notIn: ["CANCELLED", "REJECTED"] } } as const;

const listCampaigns: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const seeValue =
    canReadField(actor.roles, "campaign.value") && canReadField(actor.roles, "campaignOrder.sellPrice");
  const seeBudget = canReadField(actor.roles, "campaign.budget");
  const seeInvoices = seeValue && can(actor, "invoice", "read");

  const rows = await prisma.campaign.findMany({
    where: whereFor(actor, "campaign", "read"),
    select: {
      id: true, name: true, state: true, budget: true, startDate: true, endDate: true, briefId: true,
      sponsor: { select: { name: true } },
      brief: { select: { package: { select: { code: true, name: true } } } },
      orders: {
        where: LIVE_ORDER as never,
        select: { athleteId: true, sellPrice: true, deliverables: { select: { state: true } } },
      },
      ...(seeInvoices ? { invoices: { select: { status: true, amount: true } } } : {}),
    },
    orderBy: { startDate: "desc" },
    take: 100,
  });

  res.json({
    campaigns: rows.map((c) => {
      const r = c as typeof c & { invoices?: { status: string; amount: number }[] };
      const deliverables = c.orders.flatMap((o) => o.deliverables);
      const liveInvoices = (r.invoices ?? []).filter((i) => i.status.toLowerCase() !== "void");
      return {
        id: c.id,
        name: c.name,
        state: c.state,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        sponsorName: c.sponsor.name,
        /* The brief it came from — a STAFFING campaign's desk is its brief's
           Matching Studio (P5-FE-05's list links there). */
        briefId: c.briefId,
        package: c.brief?.package ?? null,
        athletes: new Set(c.orders.map((o) => o.athleteId)).size,
        deliverables: {
          done: deliverables.filter((d) => DELIVERED.has(d.state)).length,
          total: deliverables.length,
        },
        ...(seeBudget ? { budget: c.budget } : {}),
        ...(seeValue ? { contracted: c.orders.reduce((n, o) => n + o.sellPrice, 0) } : {}),
        ...(seeInvoices
          ? {
              invoiced: liveInvoices.reduce((n, i) => n + i.amount, 0),
              paid: liveInvoices
                .filter((i) => i.status.toLowerCase() === "paid")
                .reduce((n, i) => n + i.amount, 0),
            }
          : {}),
      };
    }),
  });
};

/**
 * GET /briefs/:id/eligible-athletes — the shortlist.
 *
 * Advisory by design. It applies the same conflict rule the invitation
 * enforces, but the invitation asks again: a desk working from a stale list
 * must not be able to make an offer the rule forbids.
 */
const shortlist: RequestHandler<{ id: string }> = async (req, res) => {
  const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
  res.json({ athletes: await eligibleForBrief(req.actor!, req.params.id, limit) });
};

/** POST /briefs/:id/campaign — the campaign an APPROVED brief becomes. */
const createCampaign: RequestHandler<{ id: string }> = async (req, res) => {
  const { name } = CampaignFromBriefInput.parse(req.body ?? {});
  res.status(201).json(await createCampaignFromBrief(req.actor!, req.params.id, name));
};

/** POST /campaigns/:id/transition — §21. Reaching ACTIVE queues the Zoho
 *  push; it never calls Zoho on the request path (§18). */
const moveCampaign: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = CampaignTransitionInput.parse(req.body ?? {});
  res.json(await transitionCampaign(req.actor!, req.params.id, to));
};

/**
 * POST /campaigns/:id/launch — go live (P5-BE-04).
 *
 * Separate from /transition because ACTIVE is not reachable there: launching
 * also activates every accepted order and queues the Zoho push and the launch
 * notification, all in one transaction.
 */
const launch: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await launchCampaign(req.actor!, req.params.id));
};

/** POST /campaigns/:id/invitations — offer one job to one athlete. */
const invite: RequestHandler<{ id: string }> = async (req, res) => {
  const body = InvitationInput.parse(req.body ?? {});
  res.status(201).json(
    await inviteAthlete(req.actor!, {
      campaignId: req.params.id,
      athleteId: body.athleteId,
      jobId: body.jobId,
      offered: body.offered,
      ...(body.expiresAt ? { expiresAt: new Date(body.expiresAt) } : {}),
    }),
  );
};

/** POST /invitations/:id/respond — the athlete opens, accepts or declines. */
const respond: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = InvitationResponseInput.parse(req.body ?? {});
  res.json(await transitionInvite(req.actor!, req.params.id, to));
};

/**
 * GET /invitations — the inbox (P4-FE-04, §24).
 *
 * The athlete's `own` scope makes this THEIR invitations; the same read
 * serves BTG tenant-wide, which is oversight for free. `offered` is the
 * athlete's own pay and belongs in their inbox — §7.1 keeps it from the
 * sponsor side, and no sponsor role holds an `invitation` read scope at
 * all. Newest first: an inbox is read from the top.
 */
const listInvitations: RequestHandler = async (req, res) => {
  const rows = await prisma.campaignInvite.findMany({
    where: whereFor(req.actor!, "invitation", "read"),
    select: {
      id: true, state: true, offered: true, sentAt: true, viewedAt: true,
      respondedAt: true, expiresAt: true, jobId: true, campaignId: true, athleteId: true,
      job: { select: { name: true } },
      /* The sponsor's NAME is who is asking — §7.1 denies athletes the pay
         and margin columns, never the counterparty's identity. */
      campaign: { select: { name: true, sponsor: { select: { name: true } } } },
    },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
  /* The order an accepted invite became, if BTG has drafted one (P5-FE-01)
     — so the inbox can hand the athlete straight to what they sign. Read
     under the caller's own campaignOrder scope; DRAFT orders are BTG's
     working copy and stay invisible until sent. */
  const accepted = rows.filter((r) => r.state === "ACCEPTED");
  const orders = accepted.length
    ? await prisma.campaignOrder.findMany({
        where: {
          ...whereFor(req.actor!, "campaignOrder", "read"),
          state: { not: "DRAFT" },
          OR: accepted.map((r) => ({ campaignId: r.campaignId, athleteId: r.athleteId, jobId: r.jobId })),
        },
        select: { id: true, campaignId: true, athleteId: true, jobId: true, state: true },
      })
    : [];
  const orderFor = (r: { campaignId: string; athleteId: string; jobId: string }) =>
    orders.find((o) => o.campaignId === r.campaignId && o.athleteId === r.athleteId && o.jobId === r.jobId);
  res.json({
    invitations: rows.map((r) => ({
      id: r.id,
      state: r.state,
      offered: r.offered,
      /* NilJob's id IS the §7 job code ("SX-03") — what the card badges. */
      jobId: r.jobId,
      jobName: r.job.name,
      campaignName: r.campaign.name,
      sponsorName: r.campaign.sponsor?.name ?? null,
      sentAt: r.sentAt.toISOString(),
      viewedAt: r.viewedAt?.toISOString() ?? null,
      respondedAt: r.respondedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt.toISOString(),
      order: (() => {
        const o = orderFor(r);
        return o ? { id: o.id, state: o.state } : null;
      })(),
    })),
  });
};

/**
 * GET /campaigns/:id/ops — §9 screen 9, one campaign's operations board
 * (P5-FE-05): who accepted, what is due, what is late, what is
 * under-delivering.
 *
 * One row per athlete on the campaign: their Campaign Order (non-DRAFT —
 * a draft is BTG's working copy) or, before an order exists, their
 * invitation. Per row: delivered (PUBLISHED or VERIFIED) of planned,
 * overdue (past due and not VERIFIED — delivery-health's own rule), what is
 * waiting on review, the next due date, and VERIFIED views only (a
 * self-reported figure can't evidence delivery). The campaign's health uses
 * `assessDelivery` itself, so this board and the delivery-health endpoint can
 * never disagree about what "under-delivering" means.
 */
const campaignOps: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const now = new Date();
  const c = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: req.params.id },
    select: {
      id: true, name: true, state: true, startDate: true, endDate: true,
      sponsor: { select: { name: true } },
      orders: {
        where: { ...whereFor(actor, "campaignOrder", "read"), state: { not: "DRAFT" } },
        select: {
          id: true, state: true, jobId: true, dueDate: true, projectedImpressions: true,
          athlete: { select: { id: true, displayName: true, slug: true } },
          deliverables: {
            select: {
              state: true, dueDate: true,
              metrics: { select: { source: true, views: true } },
            },
          },
        },
      },
      /* Only for a caller who reads invitations — whereFor throws on a
         denied resource, and a sponsor's board has no business with them. */
      ...(can(actor, "invitation", "read")
        ? {
      invites: {
        where: whereFor(actor, "invitation", "read"),
        select: {
          id: true, state: true, jobId: true, offered: true,
          athlete: { select: { id: true, displayName: true, slug: true } },
        },
        orderBy: { sentAt: "asc" as const },
      },
          }
        : {}),
    },
  });
  if (!c) throw new ForbiddenError("campaign", "read");

  const DONE = new Set(["PUBLISHED", "VERIFIED"]);
  const REVIEW = new Set(["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"]);
  type Row = {
    athleteId: string; name: string; slug: string;
    order: { id: string; state: string; jobIds: string[] } | null;
    /** Before an order exists: the latest invite, so BTG can draft the order
     *  from it. `offered` is athlete pay — only where §7.1 allows. */
    invite: { id: string; state: string; jobId: string; offered?: number } | null;
    delivered: number; planned: number; overdue: number; inReview: number;
    nextDue: string | null; verifiedViews: number;
  };
  const rows = new Map<string, Row>();
  const rowFor = (a: { id: string; displayName: string; slug: string }): Row => {
    let r = rows.get(a.id);
    if (!r) {
      r = {
        athleteId: a.id, name: a.displayName, slug: a.slug, order: null, invite: null,
        delivered: 0, planned: 0, overdue: 0, inReview: 0, nextDue: null, verifiedViews: 0,
      };
      rows.set(a.id, r);
    }
    return r;
  };

  let total = 0, verified = 0, overdue = 0, verifiedImpressions = 0;
  let projected: number | null = null;
  for (const o of c.orders) {
    const r = rowFor(o.athlete);
    /* One athlete may hold several lines; the row reads the least-settled
       order state, so a pending line is never hidden behind an accepted one. */
    const rank = ["SENT", "REJECTED", "CANCELLED", "ACCEPTED", "ACTIVE", "COMPLETED"];
    if (!r.order || rank.indexOf(o.state) < rank.indexOf(r.order.state)) {
      r.order = { id: o.id, state: o.state, jobIds: [...(r.order?.jobIds ?? []), o.jobId] };
    } else {
      r.order.jobIds.push(o.jobId);
    }
    if (o.projectedImpressions !== null) projected = (projected ?? 0) + o.projectedImpressions;
    for (const d of o.deliverables) {
      total += 1;
      r.planned += 1;
      if (DONE.has(d.state)) r.delivered += 1;
      if (REVIEW.has(d.state)) r.inReview += 1;
      if (d.state === "VERIFIED") verified += 1;
      else if (d.dueDate.getTime() < now.getTime()) {
        overdue += 1;
        r.overdue += 1;
      }
      if (!DONE.has(d.state)) {
        const iso = d.dueDate.toISOString();
        if (!r.nextDue || iso < r.nextDue) r.nextDue = iso;
      }
      for (const m of d.metrics) {
        if (isVerified(m.source as MetricSource)) {
          verifiedImpressions += m.views;
          r.verifiedViews += m.views;
        }
      }
    }
  }
  /* Athletes invited but not yet on an order — acceptance is the question. */
  const seePay = canReadField(actor.roles, "athleteRate.amount");
  const invites = (c as typeof c & {
    invites?: { id: string; state: string; jobId: string; offered: number; athlete: { id: string; displayName: string; slug: string } }[];
  }).invites ?? [];
  for (const i of invites) {
    const r = rowFor(i.athlete);
    if (!r.order) {
      r.invite = { id: i.id, state: i.state, jobId: i.jobId, ...(seePay ? { offered: i.offered } : {}) };
    }
  }

  res.json({
    campaign: {
      id: c.id, name: c.name, state: c.state, sponsorName: c.sponsor.name,
      startDate: c.startDate.toISOString(), endDate: c.endDate.toISOString(),
    },
    health: {
      deliverablesTotal: total,
      deliverablesVerified: verified,
      deliverablesOverdue: overdue,
      projectedImpressions: projected,
      verifiedImpressions,
      ...assessDelivery({
        deliverablesTotal: total, deliverablesVerified: verified, deliverablesOverdue: overdue,
        projectedImpressions: projected, verifiedImpressions,
      }),
    },
    roster: [...rows.values()],
  });
};

/**
 * GET /orders/:id — one Campaign Order, as the person who signs it reads it
 * (P5-FE-01, §24, §12).
 *
 * The frozen terms, and the CURRENT Campaign Order agreement with its body —
 * served only if the file still hashes to the issued version (see
 * agreement-text.ts), so the page can never show words the acceptance would
 * refuse. `compensation` is the athlete's own pay and rides only where §7.1
 * allows it; `sellPrice` likewise. Guardian readiness is computed here, per
 * request, from the same rule acceptOrder enforces.
 */
const readOrder: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const order = await prisma.campaignOrder.findFirst({
    where: { ...whereFor(actor, "campaignOrder", "read"), id: req.params.id },
    select: {
      id: true, state: true, compensation: true, sellPrice: true, usageRights: true,
      exclusivity: true, dueDate: true, acceptedAt: true, jobId: true, tenantId: true,
      job: { select: { name: true } },
      campaign: { select: { id: true, name: true, startDate: true, endDate: true, sponsor: { select: { name: true } } } },
      athlete: {
        select: {
          id: true, displayName: true, birthDate: true, ageBand: true, guardianId: true,
          guardian: { select: { legalName: true, verifiedAt: true } },
        },
      },
      acceptance: { select: { acceptedAt: true, bodyHash: true, agreement: { select: { version: true } } } },
    },
  });
  if (!order) throw new ForbiddenError("campaignOrder", "read");

  const agreement = await prisma.agreement.findFirst({
    where: { tenantId: order.tenantId, kind: "CAMPAIGN_ORDER", effectiveAt: { lte: new Date() } },
    orderBy: { version: "desc" },
    select: { id: true, kind: true, version: true, bodyHash: true },
  });
  const body = agreement ? await loadAgreementBody(agreement) : null;

  const readiness = guardianReadiness({
    birthDate: order.athlete.birthDate,
    ageBand: order.athlete.ageBand,
    guardianId: order.athlete.guardianId,
    guardianVerifiedAt: order.athlete.guardian?.verifiedAt ?? null,
  });

  res.json({
    id: order.id,
    state: order.state,
    jobId: order.jobId,
    jobName: order.job.name,
    campaign: {
      id: order.campaign.id,
      name: order.campaign.name,
      sponsorName: order.campaign.sponsor.name,
      startDate: order.campaign.startDate.toISOString(),
      endDate: order.campaign.endDate.toISOString(),
    },
    athlete: { id: order.athlete.id, displayName: order.athlete.displayName },
    usageRights: order.usageRights,
    exclusivity: order.exclusivity,
    dueDate: order.dueDate.toISOString(),
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    ...(canReadField(actor.roles, "campaignOrder.compensation") ? { compensation: order.compensation } : {}),
    ...(canReadField(actor.roles, "campaignOrder.sellPrice") ? { sellPrice: order.sellPrice } : {}),
    guardian: {
      status: readiness.status,
      /* The guardian's name is shown to the athlete and to BTG — it's their
         own family's record — never beyond the order's own readers. */
      name: order.athlete.guardian?.legalName ?? null,
    },
    agreement: agreement
      ? { id: agreement.id, kind: agreement.kind, version: agreement.version, bodyHash: agreement.bodyHash, body }
      : null,
    acceptance: order.acceptance
      ? {
          acceptedAt: order.acceptance.acceptedAt.toISOString(),
          bodyHash: order.acceptance.bodyHash,
          version: order.acceptance.agreement.version,
        }
      : null,
  });
};

/* --- rate cards (P3-BE-09) ------------------------------------------- */

/** PUT /athletes/:id/tier — a network manager's judgement, recorded. */
const setTier: RequestHandler<{ id: string }> = async (req, res) => {
  const { tier } = AthleteTierInput.parse(req.body ?? {});
  res.json(await setAthleteTier(req.actor!, req.params.id, tier));
};

/** POST /athletes/:id/rates — a NEW VERSION, never an update. The response
 *  carries the minimum sell price the rate implies, so the floor is seen when
 *  the rate is set rather than discovered by a refused order. */
const setRate: RequestHandler<{ id: string }> = async (req, res) => {
  const body = AthleteRateInput.parse(req.body ?? {});
  res.status(201).json(await setAthleteRate(req.actor!, req.params.id, body.jobId, body.amount));
};

/** GET /athletes/:id/rates — the current card: newest version per job. */
const rateCard: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ rates: await readRateCard(req.actor!, req.params.id) });
};

/* --- campaign orders (P5-BE-01, P5-BE-02) ----------------------------- */

/** POST /campaigns/:id/orders — starts in DRAFT; sending freezes the terms. */
const addOrder: RequestHandler<{ id: string }> = async (req, res) => {
  const body = CampaignOrderInput.parse(req.body ?? {});
  res.status(201).json(
    await createOrder(req.actor!, {
      campaignId: req.params.id,
      athleteId: body.athleteId,
      jobId: body.jobId,
      compensation: body.compensation,
      sellPrice: body.sellPrice,
      usageRights: body.usageRights,
      exclusivity: body.exclusivity ?? null,
      dueDate: new Date(body.dueDate),
    }),
  );
};

/** PATCH /orders/:id — change the terms, refused once the order is sent. */
const editOrder: RequestHandler<{ id: string }> = async (req, res) => {
  const body = CampaignOrderInput.partial().parse(req.body ?? {});
  res.json(
    await updateOrderTerms(req.actor!, req.params.id, {
      ...(body.compensation !== undefined ? { compensation: body.compensation } : {}),
      ...(body.sellPrice !== undefined ? { sellPrice: body.sellPrice } : {}),
      ...(body.usageRights !== undefined ? { usageRights: body.usageRights } : {}),
      ...(body.exclusivity !== undefined ? { exclusivity: body.exclusivity } : {}),
      ...(body.dueDate !== undefined ? { dueDate: new Date(body.dueDate) } : {}),
    }),
  );
};

/** POST /orders/:id/transition — send, activate, complete, cancel. */
const moveOrder: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = OrderTransitionInput.parse(req.body ?? {});
  res.json(await transitionOrder(req.actor!, req.params.id, to));
};

/**
 * POST /orders/:id/accept — the athlete signs.
 *
 * Refused unless the order is SENT and, for a minor, the guardian is
 * verified. The evidence comes from the request, not the body.
 */
const accept: RequestHandler<{ id: string }> = async (req, res) => {
  const body = OrderAcceptanceInput.parse(req.body ?? {});
  res.status(201).json(
    await acceptOrder(req.actor!, req.params.id, {
      agreementId: body.agreementId,
      bodyHashShown: body.bodyHashShown,
      /* The signer's, forwarded by the web server — not the web server's. */
      ip: clientIp(req) ?? "",
      userAgent: clientUserAgent(req) ?? "",
    }),
  );
};

campaignsRouter.put("/athletes/:id/tier", requireActor, setTier);
campaignsRouter.post("/athletes/:id/rates", requireActor, setRate);
campaignsRouter.get("/athletes/:id/rates", requireActor, rateCard);
campaignsRouter.post("/campaigns/:id/orders", requireActor, addOrder);
campaignsRouter.patch("/orders/:id", requireActor, editOrder);
campaignsRouter.post("/orders/:id/transition", requireActor, moveOrder);
campaignsRouter.post("/orders/:id/accept", requireActor, accept);

campaignsRouter.post("/briefs", requireActor, submitBrief);
campaignsRouter.get("/briefs", requireActor, listBriefs);
campaignsRouter.get("/campaigns", requireActor, listCampaigns);
campaignsRouter.get("/campaigns/:id/ops", requireActor, campaignOps);
campaignsRouter.get("/orders/:id", requireActor, readOrder);
campaignsRouter.get("/briefs/:id", requireActor, readBrief);
campaignsRouter.post("/briefs/:id/transition", requireActor, moveBrief);
campaignsRouter.get("/briefs/:id/eligible-athletes", requireActor, shortlist);
campaignsRouter.post("/briefs/:id/campaign", requireActor, createCampaign);
campaignsRouter.post("/campaigns/:id/transition", requireActor, moveCampaign);
campaignsRouter.post("/campaigns/:id/launch", requireActor, launch);
campaignsRouter.post("/campaigns/:id/invitations", requireActor, invite);
campaignsRouter.post("/invitations/:id/respond", requireActor, respond);
campaignsRouter.get("/invitations", requireActor, listInvitations);

export {
  listBriefs, readBrief, listCampaigns, readOrder, campaignOps,
  submitBrief, moveBrief, shortlist, createCampaign, moveCampaign, launch, invite, respond,
  listInvitations, setTier, setRate, rateCard, addOrder, editOrder, moveOrder, accept,
};

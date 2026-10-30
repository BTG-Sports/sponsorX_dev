/**
 * P7-FE-06 — the Operations Board's "Needs BTG action" queues, as live reads.
 *
 * The board was sample data behind a demo banner. Its campaigns and
 * integration health already have endpoints (`/operations/delivery-health`,
 * `/operations/integration-health`); what had none is the four queue counts,
 * so this answers them in one round trip.
 *
 * POL-BE-15 — every queue that waits on BTG, not four: sign-ups, organisations,
 * sponsor requests, guardian handoffs, held listings and orders, delivery
 * issues, offers, deal disputes, refunds, closures, payment disputes and
 * events, and sensitive profile changes. Each says how many wait and since
 * when the oldest has, so the board can put the oldest first. Support
 * messages have no countable queue: they are answered in the mailbox (no
 * list).
 *
 * Some items sit on two desks — a held sponsor sign-up is also a sponsor
 * request, a waiting organisation is under sign-ups and onboarding — so each
 * card is right on its own, and the counts must not be summed into one total.
 *
 * P8-BE-12 added `campaignRequests` — campaign cancels and changes held for
 * BTG — so campaign requests now have a count too.
 *
 * EACH QUEUE IS THE CALLER'S OWN. A queue is counted only when the caller
 * reads that resource tenant-wide — the network manager sees applications,
 * finance sees earnings — and is `null` otherwise, so the board shows what a
 * role may act on and nothing it could not open. Each count runs through
 * `whereFor`, the same scope as the page the card links to, so a card never
 * disagrees with its page. A caller who reads none of them tenant-wide (a
 * sponsor, an athlete, a property manager) is refused.
 */

import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { scopeFor, type Action, type Resource } from "../auth/policy";
import { whereFor } from "../auth/scope";
import { prisma } from "../db/client";
import { sensitiveEditsAwaitingBtg } from "./athlete-profile-change";
import { WAITING_ON_BTG } from "./payment-events";
import { waitingOnWhere } from "./payout-auto";
import { signupsHeld } from "./signups-stream";

/** The Applications page's own aging rule (frontend `AGING_HOURS`). */
export const AGING_HOURS = 48;

/** A queue that waits on BTG: how many, and when the oldest started waiting. */
export type WaitingQueue = { waiting: number; oldestSince: string | null };

export type OperationsQueues = {
  applications: { waiting: number; over48h: number; oldestSince: string | null } | null;
  /** No "since": a deliverable records no time it reached review. */
  approvals: { waiting: number } | null;
  briefs: { toQualify: number; toMatch: number; oldestSince: string | null } | null;
  /** No "since": an earning records no time it was held or disputed. */
  finance: { held: number; disputed: number } | null;
  /** POL-BE-12 — payouts waiting for BTG (held at request, or failed and handed to BTG), and since when the oldest has waited. */
  payouts: WaitingQueue | null;
  /** POL-BE-14 — make-goods waiting for a person (OPEN), and since when the oldest has waited. */
  makeGoods: WaitingQueue | null;
  /** POL-BE-15 — New sign-ups' "Needs review": athletes, sponsors and organisations held for a person. */
  signups: WaitingQueue | null;
  /** Organisations waiting for review (Onboarding, PENDING_REVIEW). */
  organisations: WaitingQueue | null;
  /** Sponsor requests not yet answered (NEW). */
  sponsorRequests: WaitingQueue | null;
  /** Guardian handoffs handed to BTG, or escalated after 7 days ("Waiting for BTG"). */
  guardianHandoffs: WaitingQueue | null;
  /** Marketplace listings waiting for approval. */
  heldListings: WaitingQueue | null;
  /** Marketplace orders waiting for BTG's approval (not those waiting on the seller). */
  heldOrders: WaitingQueue | null;
  /** Delivery problems escalated to BTG. */
  deliveryIssues: WaitingQueue | null;
  /** Offers that need BTG: drafts, and sent offers with a change request nobody answered. */
  offers: WaitingQueue | null;
  /** Deal disputes whose documents are in, for BTG to decide. */
  dealDisputes: WaitingQueue | null;
  /** Refunds to send. */
  refunds: WaitingQueue | null;
  /** Account closures held for a person. */
  heldClosures: WaitingQueue | null;
  /** Closed accounts asking to be reactivated, undecided. */
  reactivations: WaitingQueue | null;
  /** Payment disputes open. */
  paymentDisputes: WaitingQueue | null;
  /** Payment events held or failed, unresolved ("Needs BTG"). */
  paymentEvents: WaitingQueue | null;
  /** Sensitive profile changes BTG must answer (not those waiting for the athlete's ID). */
  profileChanges: WaitingQueue | null;
  /** P8-BE-12 — campaign cancels and changes held for BTG. */
  campaignRequests: WaitingQueue | null;
};

/**
 * Deliverables awaiting a decision — the same set the Approvals page counts
 * in its headline and Review tab (frontend lib/approvals-live.ts
 * deskHeadline), so the card and the page it links to show one number
 * (P7-FE-06). Sponsor review is included: BTG chases it from that desk.
 */
export const REVIEW_STATES = ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"] as const;

/** Reads every row of the tenant — its own, or (a listing) those of the tenants it operates too. */
function tenantWide(actor: Actor, resource: Resource, action: Action = "read"): boolean {
  const scope = scopeFor(actor.roles, resource, action);
  return scope === "own-tenant" || scope === "any" || scope === "operated";
}

const since = (d: Date | null | undefined) => d?.toISOString() ?? null;
const earliest = (...ds: (Date | null | undefined)[]) =>
  ds.reduce<Date | null>((min, d) => (d && (!min || d < min) ? d : min), null);

async function queue(count: Promise<number>, oldest: Promise<Date | null | undefined>): Promise<WaitingQueue> {
  const [waiting, first] = await Promise.all([count, oldest]);
  return { waiting, oldestSince: since(first) };
}

export async function operationsQueues(actor: Actor, now = new Date()): Promise<OperationsQueues> {
  const may = {
    applications: tenantWide(actor, "athleteApplication"),
    approvals: tenantWide(actor, "deliverable"),
    briefs: tenantWide(actor, "campaignBrief"),
    finance: tenantWide(actor, "earning"),
    payouts: tenantWide(actor, "payout"),
    makeGoods: tenantWide(actor, "makeGood"),
    /* Each desk's own gate: New sign-ups needs approve and guardian write (signups-stream kindsFor). */
    signups: tenantWide(actor, "athleteApplication", "approve") && tenantWide(actor, "guardian", "write"),
    organisations: tenantWide(actor, "propertyOnboarding"),
    sponsorRequests: tenantWide(actor, "inquiry"),
    guardianHandoffs: tenantWide(actor, "guardianHandoff"),
    heldListings: tenantWide(actor, "listing"),
    heldOrders: tenantWide(actor, "marketplaceOrder"),
    deliveryIssues: tenantWide(actor, "orderDelivery", "approve"),
    offers: tenantWide(actor, "offer"),
    dealDisputes: tenantWide(actor, "dealDispute"),
    refunds: tenantWide(actor, "refundDue"),
    closures: tenantWide(actor, "accountClosure"),
    paymentDisputes: tenantWide(actor, "paymentDispute"),
    paymentEvents: tenantWide(actor, "paymentEvent"),
    profileChanges: tenantWide(actor, "athleteProfileChange", "approve"),
    campaignRequests: tenantWide(actor, "campaignChange", "approve"),
  };
  if (!Object.values(may).some(Boolean)) throw new ForbiddenError("metricAggregate", "read");

  const agedBefore = new Date(now.getTime() - AGING_HOURS * 3_600_000);
  const waitingStates = { state: { in: ["SUBMITTED", "UNDER_REVIEW"] as ("SUBMITTED" | "UNDER_REVIEW")[] } };
  /* guardian-handoff.ts listHandoffs, WAITING_FOR_BTG: handed off, or a WAITING request escalated after 7 days. */
  const handoffForBtg = { OR: [{ state: "HANDED_OFF" as const }, { state: "WAITING" as const, escalatedAt: { not: null } }] };
  const reactivationAsked = { state: "CLOSED" as const, cause: { not: "TERMINATED" as const }, reactivationRequestedAt: { not: null }, reactivationDecision: null };

  const [applications, approvals, briefs, finance, payouts, makeGoods] = await Promise.all([
    may.applications
      ? Promise.all([
          prisma.athlete.count({ where: { ...whereFor(actor, "athleteApplication", "read"), ...waitingStates } }),
          prisma.athlete.count({ where: { ...whereFor(actor, "athleteApplication", "read"), ...waitingStates, createdAt: { lt: agedBefore } } }),
          prisma.athlete.findFirst({ where: { ...whereFor(actor, "athleteApplication", "read"), ...waitingStates }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        ]).then(([waiting, over48h, oldest]) => ({ waiting, over48h, oldestSince: since(oldest?.createdAt) }))
      : null,
    may.approvals
      ? prisma.deliverable
          .count({
            where: {
              AND: [
                whereFor(actor, "deliverable", "read"),
                { state: { in: [...REVIEW_STATES] } },
                /* P5-BE-09 — a draft the automatic checks sent back is the athlete's, not BTG's. */
                { OR: [{ state: { not: "DRAFT_SUBMITTED" } }, { checksPassed: null }, { checksPassed: true }] },
              ],
            },
          })
          .then((waiting) => ({ waiting }))
      : null,
    may.briefs
      ? Promise.all([
          prisma.campaignBrief.count({ where: { ...whereFor(actor, "campaignBrief", "read"), state: "DRAFT" } }),
          prisma.campaignBrief.count({ where: { ...whereFor(actor, "campaignBrief", "read"), state: { in: ["QUALIFIED", "APPROVED"] } } }),
          prisma.campaignBrief.findFirst({ where: { ...whereFor(actor, "campaignBrief", "read"), state: { in: ["DRAFT", "QUALIFIED", "APPROVED"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        ]).then(([toQualify, toMatch, oldest]) => ({ toQualify, toMatch, oldestSince: since(oldest?.createdAt) }))
      : null,
    may.finance
      ? Promise.all([
          prisma.earning.count({ where: { ...whereFor(actor, "earning", "read"), state: "HELD" } }),
          prisma.earning.count({ where: { ...whereFor(actor, "earning", "read"), state: "DISPUTED" } }),
        ]).then(([held, disputed]) => ({ held, disputed }))
      : null,
    may.payouts
      ? queue(
          prisma.payout.count({ where: { AND: [whereFor(actor, "payout", "read"), waitingOnWhere("BTG")] } }),
          prisma.payout.findFirst({ where: { AND: [whereFor(actor, "payout", "read"), waitingOnWhere("BTG")] }, orderBy: { requestedAt: "asc" }, select: { requestedAt: true } }).then((r) => r?.requestedAt),
        )
      : null,
    may.makeGoods
      ? queue(
          prisma.makeGoodShortfall.count({ where: { ...whereFor(actor, "makeGood", "read"), status: "OPEN" } }),
          prisma.makeGoodShortfall.findFirst({ where: { ...whereFor(actor, "makeGood", "read"), status: "OPEN" }, orderBy: { openedAt: "asc" }, select: { openedAt: true } }).then((r) => r?.openedAt),
        )
      : null,
  ]);

  const [signups, organisations, sponsorRequests, guardianHandoffs, heldListings, heldOrders, deliveryIssues] = await Promise.all([
    may.signups ? signupsHeld(actor) : null,
    may.organisations
      ? queue(
          prisma.propertyOnboarding.count({ where: { ...whereFor(actor, "propertyOnboarding", "read"), state: "PENDING_REVIEW" } }),
          prisma.propertyOnboarding.findFirst({ where: { ...whereFor(actor, "propertyOnboarding", "read"), state: "PENDING_REVIEW" }, orderBy: { submittedAt: "asc" }, select: { submittedAt: true, createdAt: true } }).then((r) => r && (r.submittedAt ?? r.createdAt)),
        )
      : null,
    may.sponsorRequests
      ? queue(
          prisma.inquiry.count({ where: { ...whereFor(actor, "inquiry", "read"), state: "NEW" } }),
          prisma.inquiry.findFirst({ where: { ...whereFor(actor, "inquiry", "read"), state: "NEW" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }).then((r) => r?.createdAt),
        )
      : null,
    may.guardianHandoffs
      ? prisma.guardianHandoff
          .findMany({ where: { ...whereFor(actor, "guardianHandoff", "read"), ...handoffForBtg }, select: { state: true, decidedAt: true, escalatedAt: true, createdAt: true } })
          /* BTG's since it was handed off (decidedAt, as the desk shows it) or escalated. */
          .then((rows) => ({ waiting: rows.length, oldestSince: since(earliest(...rows.map((r) => (r.state === "HANDED_OFF" ? r.decidedAt ?? r.createdAt : r.escalatedAt)))) }))
      : null,
    may.heldListings
      ? queue(
          prisma.listing.count({ where: { ...whereFor(actor, "listing", "read"), state: "PENDING_APPROVAL" } }),
          prisma.listing.findFirst({ where: { ...whereFor(actor, "listing", "read"), state: "PENDING_APPROVAL" }, orderBy: { createdAt: "asc" }, select: { submittedAt: true, createdAt: true } }).then((r) => r && (r.submittedAt ?? r.createdAt)),
        )
      : null,
    may.heldOrders
      ? queue(
          prisma.marketplaceOrder.count({ where: { ...whereFor(actor, "marketplaceOrder", "read"), state: "PENDING_APPROVAL" } }),
          prisma.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "read"), state: "PENDING_APPROVAL" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }).then((r) => r?.createdAt),
        )
      : null,
    may.deliveryIssues
      ? queue(
          prisma.deliveryIssue.count({ where: { stage: "ESCALATED", delivery: { ...whereFor(actor, "orderDelivery", "approve") } } }),
          prisma.deliveryIssue.findFirst({ where: { stage: "ESCALATED", delivery: { ...whereFor(actor, "orderDelivery", "approve") } }, orderBy: { escalatedAt: "asc" }, select: { escalatedAt: true, createdAt: true } }).then((r) => r && (r.escalatedAt ?? r.createdAt)),
        )
      : null,
  ]);

  const [offers, dealDisputes, refunds, heldClosures, reactivations, paymentDisputes, paymentEvents, profileChanges] = await Promise.all([
    may.offers
      ? Promise.all([
          /* offer.ts deskTabWhere("needs"). */
          prisma.offer.count({ where: { AND: [whereFor(actor, "offer", "read"), { OR: [{ state: "DRAFT" }, { state: "SENT", changeRequests: { some: { answeredAt: null } } }] }] } }),
          prisma.offer.findFirst({ where: { AND: [whereFor(actor, "offer", "read"), { state: "DRAFT" }] }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
          /* A sent offer waits from the change request nobody answered. */
          prisma.offerChangeRequest.findFirst({ where: { answeredAt: null, offer: { AND: [whereFor(actor, "offer", "read"), { state: "SENT" }] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        ]).then(([waiting, draft, request]) => ({ waiting, oldestSince: since(earliest(draft?.createdAt, request?.createdAt)) }))
      : null,
    may.dealDisputes
      ? queue(
          prisma.dealDispute.count({ where: { ...whereFor(actor, "dealDispute", "read"), state: "DOCUMENTS_IN" } }),
          prisma.dealDispute.findFirst({ where: { ...whereFor(actor, "dealDispute", "read"), state: "DOCUMENTS_IN" }, orderBy: { documentsInAt: "asc" }, select: { documentsInAt: true, openedAt: true } }).then((r) => r && (r.documentsInAt ?? r.openedAt)),
        )
      : null,
    may.refunds
      ? queue(
          prisma.refundDue.count({ where: { ...whereFor(actor, "refundDue", "read"), state: "OPEN" } }),
          prisma.refundDue.findFirst({ where: { ...whereFor(actor, "refundDue", "read"), state: "OPEN" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }).then((r) => r?.createdAt),
        )
      : null,
    may.closures
      ? queue(
          prisma.closureRequest.count({ where: { ...whereFor(actor, "accountClosure", "read"), state: "HELD" } }),
          prisma.closureRequest.findFirst({ where: { ...whereFor(actor, "accountClosure", "read"), state: "HELD" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }).then((r) => r?.createdAt),
        )
      : null,
    may.closures
      ? queue(
          prisma.accountClosure.count({ where: { ...whereFor(actor, "accountClosure", "read"), ...reactivationAsked } }),
          prisma.accountClosure.findFirst({ where: { ...whereFor(actor, "accountClosure", "read"), ...reactivationAsked }, orderBy: { reactivationRequestedAt: "asc" }, select: { reactivationRequestedAt: true } }).then((r) => r?.reactivationRequestedAt),
        )
      : null,
    may.paymentDisputes
      ? queue(
          prisma.paymentDispute.count({ where: { ...whereFor(actor, "paymentDispute", "read"), state: "OPEN" } }),
          prisma.paymentDispute.findFirst({ where: { ...whereFor(actor, "paymentDispute", "read"), state: "OPEN" }, orderBy: { openedAt: "asc" }, select: { openedAt: true } }).then((r) => r?.openedAt),
        )
      : null,
    may.paymentEvents
      ? queue(
          prisma.paymentEvent.count({ where: { AND: [whereFor(actor, "paymentEvent", "read"), WAITING_ON_BTG] } }),
          prisma.paymentEvent.findFirst({ where: { AND: [whereFor(actor, "paymentEvent", "read"), WAITING_ON_BTG] }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }).then((r) => r?.receivedAt),
        )
      : null,
    may.profileChanges ? sensitiveEditsAwaitingBtg(actor) : null,
  ]);
  const campaignRequests = may.campaignRequests
    ? await queue(
        prisma.campaignChangeRequest.count({ where: { tenantId: actor.tenantId, state: "HELD" } }),
        prisma.campaignChangeRequest.findFirst({ where: { tenantId: actor.tenantId, state: "HELD" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }).then((r) => r?.createdAt),
      )
    : null;

  return {
    applications, approvals, briefs, finance, payouts, makeGoods,
    signups, organisations, sponsorRequests, guardianHandoffs, heldListings, heldOrders, deliveryIssues,
    offers, dealDisputes, refunds, heldClosures, reactivations, paymentDisputes, paymentEvents, profileChanges, campaignRequests,
  };
}

/**
 * P7-FE-06 — the Operations Board's "Needs BTG action" queues, as live reads.
 *
 * The board was sample data behind a demo banner. Its campaigns and
 * integration health already have endpoints (`/operations/delivery-health`,
 * `/operations/integration-health`); what had none is the four queue counts,
 * so this answers them in one round trip.
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
import { scopeFor, type Resource } from "../auth/policy";
import { whereFor } from "../auth/scope";
import { prisma } from "../db/client";

/** The Applications page's own aging rule (frontend `AGING_HOURS`). */
export const AGING_HOURS = 48;

export type OperationsQueues = {
  applications: { waiting: number; over48h: number } | null;
  approvals: { waiting: number } | null;
  briefs: { toQualify: number; toMatch: number } | null;
  finance: { held: number; disputed: number } | null;
};

/** Deliverables that wait on BTG, not the athlete or the sponsor. */
const BTG_REVIEW_STATES = ["DRAFT_SUBMITTED", "BTG_REVIEW"] as const;

function tenantWide(actor: Actor, resource: Resource): boolean {
  const scope = scopeFor(actor.roles, resource, "read");
  return scope === "own-tenant" || scope === "any";
}

export async function operationsQueues(actor: Actor, now = new Date()): Promise<OperationsQueues> {
  const may = {
    applications: tenantWide(actor, "athleteApplication"),
    approvals: tenantWide(actor, "deliverable"),
    briefs: tenantWide(actor, "campaignBrief"),
    finance: tenantWide(actor, "earning"),
  };
  if (!Object.values(may).some(Boolean)) throw new ForbiddenError("metricAggregate", "read");

  const agedBefore = new Date(now.getTime() - AGING_HOURS * 3_600_000);
  const waitingStates = { state: { in: ["SUBMITTED", "UNDER_REVIEW"] as ("SUBMITTED" | "UNDER_REVIEW")[] } };

  const [applications, approvals, briefs, finance] = await Promise.all([
    may.applications
      ? Promise.all([
          prisma.athlete.count({ where: { ...whereFor(actor, "athleteApplication", "read"), ...waitingStates } }),
          prisma.athlete.count({ where: { ...whereFor(actor, "athleteApplication", "read"), ...waitingStates, createdAt: { lt: agedBefore } } }),
        ]).then(([waiting, over48h]) => ({ waiting, over48h }))
      : null,
    may.approvals
      ? prisma.deliverable
          .count({ where: { ...whereFor(actor, "deliverable", "read"), state: { in: [...BTG_REVIEW_STATES] } } })
          .then((waiting) => ({ waiting }))
      : null,
    may.briefs
      ? Promise.all([
          prisma.campaignBrief.count({ where: { ...whereFor(actor, "campaignBrief", "read"), state: "DRAFT" } }),
          prisma.campaignBrief.count({ where: { ...whereFor(actor, "campaignBrief", "read"), state: { in: ["QUALIFIED", "APPROVED"] } } }),
        ]).then(([toQualify, toMatch]) => ({ toQualify, toMatch }))
      : null,
    may.finance
      ? Promise.all([
          prisma.earning.count({ where: { ...whereFor(actor, "earning", "read"), state: "HELD" } }),
          prisma.earning.count({ where: { ...whereFor(actor, "earning", "read"), state: "DISPUTED" } }),
        ]).then(([held, disputed]) => ({ held, disputed }))
      : null,
  ]);

  return { applications, approvals, briefs, finance };
}

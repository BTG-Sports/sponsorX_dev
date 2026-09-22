/**
 * Campaign briefs — P4-BE-02, §21, §26.
 *
 * What a sponsor asks for, before BTG turns it into a campaign. The brief is
 * the sponsor's object; the campaign is BTG's. Keeping them apart is what
 * lets a brief be qualified, reworked and closed without any of that
 * appearing in campaign reporting.
 *
 * `categories` IS THE CONFLICT INPUT. It is drawn from the same closed
 * vocabulary as an athlete's `restrictedCategories` (P3-BE-05), because a
 * conflict check compares the two and free text on either side makes the
 * comparison guesswork.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  canTransitionBrief,
  IllegalBriefTransitionError,
  type BriefState,
} from "./brief-state";
import type { BrandCategory } from "./brand-categories";

export type BriefInput = {
  sponsorId: string;
  objective: string;
  /** Cents. The schema is explicit and so is this — a budget in dollars that
   *  reaches a cents column is a hundredfold error nobody notices until
   *  invoicing. */
  budget: number;
  packageId?: string | null;
  startDate: Date;
  endDate: Date;
  sports: readonly string[];
  stateCodes: readonly string[];
  categories: readonly BrandCategory[];
};

export class InvalidBriefWindowError extends Error {
  readonly status = 422;
  constructor() {
    super("A brief's end date must be after its start date.");
    this.name = "InvalidBriefWindowError";
  }
}

/** Submit a brief. Starts in DRAFT — qualification is BTG's act, not the
 *  sponsor's, so nothing a sponsor sends can arrive already qualified. */
export async function createBrief(
  actor: Actor,
  input: BriefInput,
): Promise<{ id: string; state: BriefState }> {
  assertAllowed(actor, "campaignBrief", "write");
  if (input.endDate <= input.startDate) throw new InvalidBriefWindowError();

  return prisma.$transaction(async (tx) => {
    /* The sponsor must be one this actor may reach. A SPONSOR_ADMIN filing a
       brief against another company's id is the obvious abuse, and the scope
       filter is what refuses it rather than a hand-written check. */
    const sponsor = await tx.sponsor.findFirst({
      where: { ...whereFor(actor, "sponsor", "read"), id: input.sponsorId },
      select: { id: true },
    });
    if (!sponsor) throw new ForbiddenError("campaignBrief", "write");

    const brief = await tx.campaignBrief.create({
      data: {
        tenantId: actor.tenantId,
        sponsorId: input.sponsorId,
        objective: input.objective,
        budget: input.budget,
        packageId: input.packageId ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        sports: [...input.sports],
        stateCodes: [...input.stateCodes],
        categories: [...input.categories],
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, "brief.create", "CampaignBrief", brief.id, {
      after: { state: "DRAFT", sponsorId: input.sponsorId, budget: input.budget },
    });

    return { id: brief.id, state: brief.state as BriefState };
  });
}

/**
 * Move a brief through §21, or refuse.
 *
 * Qualification and approval are BTG acts — the matrix gives
 * `campaignBrief.approve` to BTG_ADMIN, CAMPAIGN_MGR and SUPER_ADMIN, and a
 * sponsor holds write on their own brief but not approve.
 */
export async function transitionBrief(
  actor: Actor,
  briefId: string,
  to: BriefState,
): Promise<{ id: string; state: BriefState }> {
  assertAllowed(actor, "campaignBrief", to === "CLOSED" ? "write" : "approve");

  return prisma.$transaction(async (tx) => {
    const brief = await tx.campaignBrief.findFirst({
      where: { id: briefId, tenantId: actor.tenantId },
      select: { id: true, state: true },
    });
    if (!brief) throw new ForbiddenError("campaignBrief", "write");

    const from = brief.state as BriefState;
    if (!canTransitionBrief(from, to)) throw new IllegalBriefTransitionError(from, to);

    const updated = await tx.campaignBrief.update({
      where: { id: briefId },
      data: { state: to as Prisma.CampaignBriefUpdateInput["state"] },
      select: { id: true, state: true },
    });

    await audit(tx, actor, BRIEF_AUDIT_ACTIONS[to], "CampaignBrief", briefId, {
      before: { state: from },
      after: { state: to },
    });

    return { id: updated.id, state: updated.state as BriefState };
  });
}

/** One action per destination, so "who approved this brief" is a filter on a
 *  column rather than a search through JSON (§26). */
const BRIEF_AUDIT_ACTIONS: Record<BriefState, `${string}.${string}`> = {
  DRAFT: "brief.draft",
  QUALIFIED: "brief.qualify",
  APPROVED: "brief.approve",
  CAMPAIGN_CREATED: "brief.campaignCreated",
  CLOSED: "brief.close",
};

export { BRIEF_AUDIT_ACTIONS };
export * from "./brief-state";

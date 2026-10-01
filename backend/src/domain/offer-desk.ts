/**
 * BTG's Offers desk — 2S2-FE-03 (Claude Design Offers.dc.html, the new-offer
 * form). Two reads the form needs that nothing else answers:
 *
 * CHECKS (GET /campaigns/:id/offer-checks) — the questions a draft will be
 *   asked, answered as the form is filled in instead of refused on save:
 *     - the athlete's floor: the price of the inventory item the offer buys
 *       (the API refuses pay below it — availability.ts SUB_FLOOR), else the
 *       athlete's current rate for the job (their rate card, P3-BE-09). No
 *       rate on file, no floor. athleteFloor / floorProblem answer it here
 *       and in drafting and sending (offer.ts) alike;
 *     - the margin floor: sell price ≥ pay × 1.4 (assertLineClearsFloor);
 *     - the campaign's budget: what is left once its live orders are counted
 *       at their floor, and whether this line fits (assertBudgetCarriesLine).
 *   The two floor rules are asked through the very functions drafting calls,
 *   caught rather than thrown, so the form and the save cannot disagree.
 *   Restrictions, availability dates and the terms themselves are asked on
 *   save (assertDraftTerms) — they need the deliverables' dates.
 *
 * ATHLETES (GET /offers/athletes) — the tenant's active athletes, by name,
 *   with whether a guardian answers offers for them.
 *
 * Both are BTG's: the caller must be able to write offers tenant-wide.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { canReadField } from "../auth/fields";
import { assertBudgetCarriesLine, assertLineClearsFloor, lineFloor } from "./margin-floor";
import { guardianControls, requiresGuardian } from "./guardian-rules";

/** The athlete fields offerParty reads — selected by the offer read and here. */
export const PARTY_SELECT = {
  displayName: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
  comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
  guardian: { select: { legalName: true } },
} as const;

type PartyRow = {
  displayName: string; birthDate: Date | null; ageBand: string | null; majorityAge: number; guardianId: string | null;
  comingOfAgeStartedAt: Date | null; comingOfAgeCompletedAt: Date | null; comingOfAgeTerminatedAt: Date | null;
  guardian: { legalName: string } | null;
};

/** Whole years on `on` (UTC). */
export function ageOn(birthDate: Date, on: Date = new Date()): number {
  let years = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = on.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birthDate.getUTCDate())) years -= 1;
  return years;
}

/**
 * Who answers an offer to this athlete: their name, whether they are a minor,
 * whether their guardian answers for them (a minor, or the coming-of-age
 * allowance — the rule tellAthlete emails by), and the guardian's name when so. The age is a
 * date of birth by another name, so it is given only to a role that may read
 * one (§7.2 — denied to Sales and campaign managers, who get null).
 */
export function offerParty(actor: Actor, a: PartyRow, now: Date = new Date()) {
  const guardianAnswers = guardianControls(a);
  return {
    name: a.displayName,
    minor: requiresGuardian(a),
    guardianAnswers,
    age: a.birthDate && canReadField(actor.roles, "athlete.dateOfBirth") ? ageOn(a.birthDate, now) : null,
    guardianName: guardianAnswers ? a.guardian?.legalName ?? null : null,
  };
}

export type ProblemCode = "UNKNOWN_JOB" | "NOT_THEIR_ITEM" | "ITEM_FLOOR" | "RATE_FLOOR" | "MARGIN_FLOOR" | "BUDGET";

type Db = Prisma.TransactionClient | typeof prisma;

/** The athlete's floor for a line: what the pay may not go below, and where it comes from. */
export type AthleteFloor = { floorCents: number | null; floorSource: "ITEM" | "RATE" | null };

/**
 * The athlete's floor — the price of the inventory item the offer buys, else
 * their current rate for the job (the highest version on their rate card),
 * else none. The one answer the form's checks, drafting and sending all read
 * (found in review of 2S2-FE-03: the form held a rate floor the API never
 * asked). `item` is the item already loaded and known to be this athlete's,
 * or null when the offer buys none.
 */
export async function athleteFloor(
  db: Db, tenantId: string, athleteId: string, jobId: string | null, item: { priceCents: number } | null,
): Promise<AthleteFloor> {
  if (item) return { floorCents: item.priceCents, floorSource: "ITEM" };
  if (!jobId) return { floorCents: null, floorSource: null };
  const rate = await db.athleteRate.findFirst({
    where: { tenantId, athleteId, jobId }, select: { amount: true }, orderBy: { version: "desc" },
  });
  return rate ? { floorCents: rate.amount, floorSource: "RATE" } : { floorCents: null, floorSource: null };
}

/** What the floor says of this pay: null when it clears (or there is no floor). */
export function floorProblem(floor: AthleteFloor, pay: number): { code: "ITEM_FLOOR" | "RATE_FLOOR"; message: string } | null {
  if (floor.floorCents === null || pay >= floor.floorCents) return null;
  const amount = `$${(floor.floorCents / 100).toFixed(2)}`;
  return floor.floorSource === "ITEM"
    ? { code: "ITEM_FLOOR", message: `Pay is below the item's price of ${amount}.` }
    : { code: "RATE_FLOOR", message: `Pay is below the athlete's rate for this job of ${amount}.` };
}

export type OfferChecksInput = {
  athleteId?: string; jobId?: string; inventoryItemId?: string; compensation?: number; sellPrice?: number;
};

/** The draft-so-far's checks. Nothing here refuses but the scope. */
export async function offerChecks(actor: Actor, campaignId: string, q: OfferChecksInput) {
  assertTenantWide(actor, "offer", "write");
  /* The campaign must be one the caller may write — as drafting asks. */
  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "write"), id: campaignId }, select: { id: true, budget: true },
  });
  if (!campaign) throw new ForbiddenError("offer", "write");
  /* What saving would refuse, each with a code the form can place. */
  const problems: Array<{ code: ProblemCode; message: string }> = [];

  const athlete = q.athleteId
    ? await prisma.athlete.findFirst({ where: { tenantId: actor.tenantId, id: q.athleteId }, select: { id: true, tier: true } })
    : null;
  if (q.athleteId && !athlete) throw new ForbiddenError("offer", "write");
  const job = q.jobId ? await prisma.nilJob.findFirst({ where: { tenantId: actor.tenantId, id: q.jobId }, select: { id: true } }) : null;
  if (q.jobId && !job) problems.push({ code: "UNKNOWN_JOB", message: `No catalogue job ${q.jobId}.` });

  const item = q.inventoryItemId && athlete
    ? await prisma.inventoryItem.findFirst({
        where: { tenantId: actor.tenantId, id: q.inventoryItemId, athleteId: athlete.id }, select: { id: true, priceCents: true },
      })
    : null;
  if (q.inventoryItemId && athlete && !item) problems.push({ code: "NOT_THEIR_ITEM", message: "That inventory item is not this athlete's." });
  /* The athlete's floor: the item's price, else their rate for the job —
     asked through athleteFloor / floorProblem, as drafting and sending ask. */
  const { floorCents, floorSource }: AthleteFloor = athlete
    ? await athleteFloor(prisma, actor.tenantId, athlete.id, job?.id ?? null, item)
    : { floorCents: null, floorSource: null };
  const pay = q.compensation ?? null;
  const clearsFloor = floorCents !== null && pay !== null ? pay >= floorCents : null;
  const below = pay !== null ? floorProblem({ floorCents, floorSource }, pay) : null;
  if (below) problems.push(below);

  /* The margin floor, asked by the function drafting calls. */
  const jobId = q.jobId ?? "this job";
  const tier = athlete?.tier ?? null;
  let clearsMarginFloor: boolean | null = null;
  if (pay !== null && q.sellPrice !== undefined) {
    try {
      assertLineClearsFloor(jobId, tier, pay, q.sellPrice);
      clearsMarginFloor = true;
    } catch (error) {
      clearsMarginFloor = false;
      problems.push({ code: "MARGIN_FLOOR", message: (error as Error).message });
    }
  }

  /* The budget, counted as drafting counts it: live orders at their floor. */
  const committed = await prisma.campaignOrder.aggregate({
    /* tenant-scope: keyed by the campaign loaded above through whereFor. */
    where: { campaignId: campaign.id, state: { not: "CANCELLED" } }, _sum: { compensation: true },
  });
  const committedCents = lineFloor(committed._sum.compensation ?? 0);
  let fitsBudget: boolean | null = null;
  if (pay !== null) {
    try {
      assertBudgetCarriesLine(jobId, tier, pay, committed._sum.compensation ?? 0, campaign.budget);
      fitsBudget = true;
    } catch (error) {
      fitsBudget = false;
      problems.push({ code: "BUDGET", message: (error as Error).message });
    }
  }

  return {
    campaignId: campaign.id,
    floorCents, floorSource, clearsFloor,
    minSellPriceCents: pay !== null ? lineFloor(pay) : null, clearsMarginFloor,
    budgetCents: campaign.budget, committedCents, remainingBudgetCents: Math.max(0, campaign.budget - committedCents),
    neededCents: pay !== null ? lineFloor(pay) : null, fitsBudget,
    marginCents: pay !== null && q.sellPrice !== undefined ? q.sellPrice - pay : null,
    problems,
  };
}

/** The athletes an offer can be made to: this tenant's active ones, by name. */
export async function offerAthletes(actor: Actor, q: string | undefined) {
  assertTenantWide(actor, "offer", "write");
  const term = (q ?? "").trim();
  const rows = await prisma.athlete.findMany({
    where: {
      AND: [
        whereFor(actor, "athlete", "read"),
        { tenantId: actor.tenantId, state: "ACTIVE", accountClosedAt: null, signupRejectedAt: null },
        ...(term ? [{ OR: [{ displayName: { contains: term, mode: "insensitive" as const } }, { legalName: { contains: term, mode: "insensitive" as const } }] }] : []),
      ],
    },
    select: { id: true, sport: true, tier: true, ...PARTY_SELECT },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: 20,
  });
  const now = new Date();
  return rows.map((r) => ({ id: r.id, sport: r.sport, tier: r.tier, ...offerParty(actor, r, now) }));
}

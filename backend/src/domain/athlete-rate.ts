/**
 * Athlete rate cards — P3-BE-09, §6, P0-PMO-13.
 *
 * What one athlete is paid for one job. Phase 1 sets these **manually**: a
 * network manager decides the tier and the rate, and nothing computes them.
 * §6 is explicit that the tier multiplier is guidance for that person, not a
 * formula the system applies — which is why `Athlete.tier` is nullable and a
 * rate is stored as a number rather than derived from one.
 *
 * RATES ARE VERSIONED, NEVER UPDATED. `@@unique([athleteId, jobId, version])`
 * makes that structural. A rate is the basis of an offer that may already
 * have been made; overwriting it would silently rewrite the terms of orders
 * that quoted it, and leave nobody able to say what an athlete was promised
 * in March.
 *
 * SPONSORS MUST NEVER SEE `amount`. The row scope keeps a sponsor away from
 * the table entirely — the matrix gives `athleteRate` no sponsor role at all
 * — and §7.1's field rule is the belt to this braces, owned by P2-SEC-02.
 */

import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { minimumSellPrice, TIER_MULTIPLIERS, type PricedTier } from "./pricing";

export class UnknownJobError extends Error {
  readonly status = 404;
  constructor(jobId: string) {
    super(`No NIL job ${jobId}. Rates are set against the SX catalogue (§5).`);
    this.name = "UnknownJobError";
  }
}

export class ConcurrentRateEditError extends Error {
  readonly status = 409;
  constructor(jobId: string, version: number) {
    super(
      `Version ${version} of the ${jobId} rate was created by someone else ` +
        `just now. Reload the rate card and set it again — rates are versioned, ` +
        `so nothing was overwritten.`,
    );
    this.name = "ConcurrentRateEditError";
  }
}

/** Prisma's unique-constraint code. Checked structurally rather than by
 *  message, which changes between versions. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

export class TierRequiredError extends Error {
  readonly status = 422;
  constructor() {
    super(
      "This athlete has no tier. Set one before setting a rate: the tier is " +
        "what the minimum sell price is derived from, and a rate without one " +
        "cannot be checked against the margin floor (§6, P0-PMO-13).",
    );
    this.name = "TierRequiredError";
  }
}

/** Set the tier. A network manager's judgement, recorded — never computed. */
export async function setAthleteTier(
  actor: Actor,
  athleteId: string,
  tier: PricedTier | "ANCHOR",
): Promise<{ athleteId: string; tier: string }> {
  assertTenantWide(actor, "athlete", "write");

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athlete", "write"), id: athleteId },
      select: { id: true, tier: true },
    });
    if (!athlete) throw new ForbiddenError("athlete", "write");

    await tx.athlete.update({
      where: { id: athleteId },
      data: { tier: tier as never },
      select: { id: true },
    });

    await audit(tx, actor, "athlete.tierSet", "Athlete", athleteId, {
      before: { tier: athlete.tier },
      after: { tier },
    });

    return { athleteId, tier };
  });
}

/**
 * Set a rate, as a new version.
 *
 * Returns the minimum sell price the rate implies, because the acceptance
 * asks for it and because a network manager setting a rate is exactly the
 * person who needs to know what it does to the sponsor price. Showing it here
 * is what stops the floor being discovered later by a refused order.
 */
export async function setAthleteRate(
  actor: Actor,
  athleteId: string,
  jobId: string,
  amount: number,
): Promise<{
  athleteId: string;
  jobId: string;
  amount: number;
  version: number;
  tier: PricedTier | "ANCHOR";
  /** null for ANCHOR — a negotiated multiplier has no derived floor. */
  impliedMinimumSellPrice: number | null;
}> {
  assertTenantWide(actor, "athleteRate", "write");

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athlete", "read"), id: athleteId },
      select: { id: true, tier: true },
    });
    if (!athlete) throw new ForbiddenError("athleteRate", "write");
    if (!athlete.tier) throw new TierRequiredError();

    const job = await tx.nilJob.findFirst({
      where: { id: jobId, tenantId: actor.tenantId },
      select: { id: true, baseHigh: true },
    });
    if (!job) throw new UnknownJobError(jobId);

    /* The next version, read inside the transaction. The unique index is
       what actually prevents two managers creating version 2 at once; this
       just picks the number. */
    const latest = await tx.athleteRate.findFirst({
      where: { athleteId, jobId },
      select: { version: true },
      orderBy: { version: "desc" },
    });
    const version = (latest?.version ?? 0) + 1;

    /* The unique index is what actually decides the race; this turns its
       refusal into an answer. Two managers setting a rate at the same moment
       previously got a raw P2002 and a 500, which reads as a broken system
       rather than "someone else just did that — look again". */
    let rate;
    try {
      rate = await tx.athleteRate.create({
        data: { tenantId: actor.tenantId, athleteId, jobId, amount, version },
        select: { id: true, version: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConcurrentRateEditError(jobId, version);
      throw error;
    }

    await audit(tx, actor, AUDIT_ACTIONS.pricing.rateSet, "AthleteRate", rate.id, {
      after: { athleteId, jobId, amount, version, tier: athlete.tier },
    });

    const tier = athlete.tier as PricedTier | "ANCHOR";
    return {
      athleteId,
      jobId,
      amount,
      version: rate.version,
      tier,
      impliedMinimumSellPrice:
        tier === "ANCHOR" ? null : minimumSellPrice(job.baseHigh, tier),
    };
  });
}

/** The current rate card — the newest version per job, not every version. */
export async function readRateCard(actor: Actor, athleteId: string) {
  /* NOT assertTenantWide. The matrix gives athleteRate read at `own` to
     ATHLETE and `ward` to GUARDIAN — an athlete seeing their own rate card is
     the point of P3-FE-04, and over-restricting it here would have 403'd that
     screen the day someone built it. Setting a rate is the BTG act; reading
     one is not. The row scope keeps everyone to their own. */
  assertAllowed(actor, "athleteRate", "read");

  const rates = await prisma.athleteRate.findMany({
    where: { ...whereFor(actor, "athleteRate", "read"), athleteId },
    select: { jobId: true, amount: true, version: true },
    orderBy: [{ jobId: "asc" }, { version: "desc" }],
  });

  const current = new Map<string, { jobId: string; amount: number; version: number }>();
  for (const rate of rates) if (!current.has(rate.jobId)) current.set(rate.jobId, rate);
  return [...current.values()];
}

export { TIER_MULTIPLIERS };

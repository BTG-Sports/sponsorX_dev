/**
 * Campaigns that staff themselves — P4-BE-12 (BTG admin review, item 19;
 * programme owner, 2026-10-03). The rules are in auto-staffing-rules.ts;
 * this is where they meet the database.
 *
 * WHICH CAMPAIGNS. `Campaign.autoStaffing`: on for a campaign created from a
 * brief whose package staffs athletes (createCampaignFromBrief), off
 * otherwise. BTG (campaign managers and admins — campaign approve, tenant-wide)
 * turns it off and on with a reason, audited (`setAutoStaffing`). Off,
 * nothing here runs and BTG staffs by hand as before.
 *
 * WHAT IT DOES, as the system (`userId: null`, `automatic: true` on every
 * audit row), in `autoStaffIn`:
 *
 *   1. Takes the campaign's row lock and reads its state under it. A DRAFT
 *      campaign moves to STAFFING (a stage move like any other, audited with
 *      the reason); anything but DRAFT or STAFFING is left alone.
 *   2. Tallies the campaign by athlete (tallyStaffing) and asks
 *      athletesToAsk: the package's maximum less the athletes signed or
 *      still being asked.
 *   3. Walks the ranked shortlist (matching.ts eligibleForBrief — ACTIVE
 *      athletes, conflicts excluded, best match first), skipping everyone
 *      the campaign has already approached in any way: any offer, order or
 *      invitation, or a recorded skip. So nobody is offered twice.
 *   4. For each athlete, one offer per package line — exactly as BTG's
 *      Matching Studio sends them (one job, one offer) — built by the
 *      pre-filled draft (offer-draft.ts) with a 3-day window
 *      (AUTO_OFFER_WINDOW_DAYS), then created and sent through offer.ts's own
 *      createOfferIn / sendOfferIn, which ask every rule a person's offer is
 *      asked and take lockCampaignForStaffing; a minor's guardian is emailed
 *      by the same send. The athlete's state and guardian are asked again
 *      first, at send time.
 *   5. Budget: the athlete's offers' sponsor price must fit what the budget
 *      has left after the committed spend. If not, it stops.
 *   6. A refusal (any 4xx the offer path raises for that athlete) rolls back
 *      that athlete's offers to a savepoint, records the athlete and the
 *      reason (CampaignStaffingSkip, audited), and moves to the next one.
 *   7. The list runs out while the minimum can no longer be reached → stop.
 *
 * A STOP sets `staffingStopReason` / `staffingStoppedAt`, is audited, and
 * emails the tenant's campaign managers (BTG's admins when it has none)
 * once per stop. A stopped campaign is left to BTG until BTG turns automatic
 * staffing back on, which clears the stop.
 *
 * WHEN IT RUNS. When the campaign is created; when BTG turns it on; inside
 * the athlete's decline (respondToOffer), behind a savepoint so a failure
 * never undoes the decline; and every ten minutes by `sweepAutoStaffing`, the
 * safety net — which is also what replaces an offer that expired, since an
 * expiry is a time passing rather than an event. Reaching the maximum moves
 * the campaign to APPROVAL through P4-BE-09's advanceCampaign, unchanged.
 *
 * ONE REPLACEMENT PER DECLINE. Every run takes the campaign's row lock first
 * and counts under it. A decline and a sweep racing each other therefore run
 * one after the other, and the second counts the first's offer.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import type { CampaignState } from "./campaign-state";
import {
  applyStageMove, CAMPAIGN_FOR_MOVE, CampaignNotStaffingError, CampaignStateConflictError, lockCampaign, staffingRows,
} from "./campaign-stages";
import { eligibleForBrief } from "./matching";
import { packageLines } from "./match-score";
import { draftOfferIn, OfferDraftNotFoundError } from "./offer-draft";
import { createOfferIn, sendOfferIn, type DraftInput } from "./offer";
import { CampaignBudgetFloorError } from "./margin-floor";
import { AthleteNotActiveError, GuardianNotVerifiedError } from "./invitation";
import { guardianReadiness } from "./guardian-rules";
import {
  AUTO_OFFER_WINDOW_DAYS,
  AUTO_STAFFING_SHORTLIST,
  athletesToAsk,
  autoOfferExpiry,
  exhaustedBelowMinimum,
  fitsBudget,
  STOP_REASONS,
  staffsAthletes,
  tallyStaffing,
} from "./auto-staffing-rules";

type Tx = Prisma.TransactionClient;

export const AUTO_STAFFING_AUDIT = {
  toggle: "campaign.autoStaffing",
  stop: "campaign.staffingStop",
  skip: "campaign.staffingSkip",
} as const;

/** Long enough for a shortlist walk; a sweep's campaign is its own transaction. */
export const AUTO_STAFFING_TX = { timeout: 60_000, maxWait: 15_000 } as const;

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

/**
 * The scope the system staffs through: a campaign manager of the tenant,
 * with no user. Only ever used to ASK the offer path's checks (whereFor,
 * assertTenantWide, field rights); every row and audit it writes names
 * `SYSTEM(tenantId)` instead, so no person is ever recorded for the system's act.
 */
function staffer(tenantId: string): Actor {
  return {
    userId: `system:auto-staffing:${tenantId}`, tenantId, roles: ["CAMPAIGN_MGR"],
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
  };
}

export class AutoStaffingUnavailableError extends Error {
  readonly status = 409;
  readonly code = "auto_staffing_unavailable";
  constructor() {
    super("This campaign has no package with athlete job lines, so there is nothing to staff automatically. BTG staffs it by hand.");
    this.name = "AutoStaffingUnavailableError";
  }
}

export class AutoStaffingReasonError extends Error {
  readonly status = 422;
  constructor() {
    super("Say why — turning automatic staffing off or on needs a reason (up to 500 characters).");
    this.name = "AutoStaffingReasonError";
  }
}

export type AutoStaffResult = {
  /** The campaign's state after the run; null when it was not found. */
  state: CampaignState | null;
  sent: string[];
  skipped: Array<{ athleteId: string; reason: string }>;
  stopped: string | null;
};

const NOTHING = (state: CampaignState | null): AutoStaffResult => ({ state, sent: [], skipped: [], stopped: null });

/* ------------------------------------------------------------------ sends */

/** A refusal the offer path raised for this athlete — skip them, carry on. */
function refusal(error: unknown): string | null {
  if (error instanceof CampaignNotStaffingError || error instanceof CampaignStateConflictError) return null;
  /* A 403 is the system's own scope failing, not this athlete: never skip
     everyone for it — rethrown, logged, retried by the sweep. */
  if (error instanceof ForbiddenError) return null;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500 && error instanceof Error) return error.message;
  return null;
}

let savepoints = 0;

/**
 * Staff one campaign as far as the rules allow, in the caller's transaction.
 * Takes the campaign's row lock first. `maxAthletes` and `maxTries` bound
 * one run (the decline's hook asks for its one replacement, trying at most
 * three athletes inside the athlete's request, and leaves anything more to
 * the sweep); the sweep and the routes run unbounded.
 */
export async function autoStaffIn(
  tx: Tx,
  tenantId: string,
  campaignId: string,
  now = new Date(),
  opts: { maxAthletes?: number; maxTries?: number } = {},
): Promise<AutoStaffResult> {
  let state = await lockCampaign(tx, campaignId, tenantId);
  if (state !== "DRAFT" && state !== "STAFFING") return NOTHING(state);

  const c = await tx.campaign.findFirst({
    /* tenant-scope: explicit — the campaign locked above, in its own tenant. */
    where: { id: campaignId, tenantId },
    select: {
      ...CAMPAIGN_FOR_MOVE, autoStaffing: true, staffingStoppedAt: true, budget: true,
      brief: { select: { id: true, package: { select: { athleteCountMin: true, athleteCountMax: true, lineItems: true } } } },
      _count: { select: { orders: true, adSlots: true } },
    },
  });
  if (!c || !c.autoStaffing || c.staffingStoppedAt || !c.brief?.package) return NOTHING(state);
  const pkg = c.brief.package;
  const lines = packageLines(pkg.lineItems);
  if (!lines.length || pkg.athleteCountMax <= 0) return NOTHING(state);

  if (state === "DRAFT") {
    await applyStageMove(tx, SYSTEM(tenantId), c, "DRAFT", "STAFFING", {
      automatic: { reason: "Automatic staffing started: offers go to the best-matched athletes until the package is full." },
      shape: c._count,
    });
    state = "STAFFING";
  }

  const rows = (await staffingRows(tx, [campaignId])).get(campaignId)!;
  const tally = tallyStaffing(rows, now);
  const signed = tally.signed;
  let outstanding = tally.outstanding;
  let committed = tally.committed;
  const out: AutoStaffResult = { state, sent: [], skipped: [], stopped: null };
  const want = Math.min(athletesToAsk({ signed, outstanding, max: pkg.athleteCountMax }), opts.maxAthletes ?? Number.MAX_SAFE_INTEGER);
  if (want === 0) return out;

  const system = staffer(tenantId);
  const by = SYSTEM(tenantId);
  /* Best match first; conflicts and inactive athletes never arrive (§26). */
  const ranked = (await eligibleForBrief(system, c.brief.id, AUTO_STAFFING_SHORTLIST)).filter((a) => !tally.approached.has(a.id));
  const expiresAt = autoOfferExpiry(now);

  let tries = 0;
  let cutShort = false;
  for (const athlete of ranked) {
    if (out.sent.length >= want) break;
    if (opts.maxTries !== undefined && tries >= opts.maxTries) { cutShort = true; break; }
    tries++;
    const point = `auto_staff_${++savepoints}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
    try {
      await assertStillOfferable(tx, tenantId, athlete.id);
      const drafts = [];
      for (const line of lines) {
        drafts.push(await draftOfferIn(tx, system, campaignId, { athleteId: athlete.id, jobId: line.jobId }, {
          now, expiresAt, expiresWhy: `Automatic offers expire ${AUTO_OFFER_WINDOW_DAYS} days after they are sent`,
        }));
      }
      const price = drafts.reduce((n, d) => n + d.offer.sellPrice, 0);
      if (!fitsBudget(committed, price, c.budget)) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
        out.stopped = await stopStaffing(tx, c, STOP_REASONS.budget({ athlete: athlete.displayName, next: price, committed, budget: c.budget }), now);
        return out;
      }
      for (const d of drafts) {
        const created = await createOfferIn(tx, system, draftInput(d.offer), by);
        await sendOfferIn(tx, system, created.id as string, by);
      }
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
      committed += price;
      outstanding += 1;
      out.sent.push(athlete.id);
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
      if (error instanceof CampaignBudgetFloorError) {
        /* The offer path's own budget rule (athlete pay at the margin floor) refused it. */
        out.stopped = await stopStaffing(tx, c, `The budget can't cover the next athlete: ${athlete.displayName}. ${error.message}`, now);
        return out;
      }
      if (error instanceof OfferDraftNotFoundError && !/athlete/.test(error.message)) {
        /* The package names a job the catalogue doesn't have (or the campaign
           went): true of every athlete, so it is a stop, not a skip. */
        out.stopped = await stopStaffing(tx, c, `An offer can't be drafted for this campaign's package: ${error.message}`, now);
        return out;
      }
      const why = refusal(error);
      if (why === null) throw error;
      await recordSkip(tx, tenantId, campaignId, athlete.id, why);
      out.skipped.push({ athleteId: athlete.id, reason: why });
    }
  }

  if (!cutShort && out.sent.length < want && exhaustedBelowMinimum({ signed, outstanding, min: pkg.athleteCountMin })) {
    out.stopped = await stopStaffing(tx, c, STOP_REASONS.exhausted({ signed, outstanding, min: pkg.athleteCountMin }), now);
  }
  return out;
}

/** Asked again at send time: the shortlist was read a moment ago, outside the lock. */
async function assertStillOfferable(tx: Tx, tenantId: string, athleteId: string) {
  const a = await tx.athlete.findFirst({
    /* tenant-scope: explicit — the campaign's tenant. */
    where: { tenantId, id: athleteId },
    select: { state: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true, guardian: { select: { verifiedAt: true } } },
  });
  if (!a) throw new ForbiddenError("offer", "write");
  if (a.state !== "ACTIVE") throw new AthleteNotActiveError(a.state);
  const readiness = guardianReadiness({
    birthDate: a.birthDate, ageBand: a.ageBand, majorityAge: a.majorityAge,
    guardianId: a.guardianId, guardianVerifiedAt: a.guardian?.verifiedAt ?? null,
  });
  if (readiness.status === "missing" || readiness.status === "unverified") throw new GuardianNotVerifiedError();
}

/** The pre-filled draft, as createOffer takes it. */
function draftInput(o: Awaited<ReturnType<typeof draftOfferIn>>["offer"]): DraftInput {
  return {
    campaignId: o.campaignId, athleteId: o.athleteId, jobId: o.jobId, inventoryItemId: o.inventoryItemId,
    brief: o.brief, compensation: o.compensation, sellPrice: o.sellPrice,
    deliverables: o.deliverables.map((d) => ({ title: d.title, dueDate: new Date(d.dueDate) })),
    usageRights: o.usageRights, exclusivityDays: o.exclusivityDays, disclosures: o.disclosures,
    expiresAt: new Date(o.expiresAt),
  };
}

async function recordSkip(tx: Tx, tenantId: string, campaignId: string, athleteId: string, reason: string) {
  const text = reason.trim().slice(0, 1000) || "The offer could not be made.";
  const skip = await tx.campaignStaffingSkip.upsert({
    /* tenant-scope: the campaign locked by the caller, in its own tenant; one row per athlete. */
    where: { campaignId_athleteId: { campaignId, athleteId } },
    create: { tenantId, campaignId, athleteId, reason: text },
    update: {},
    select: { id: true },
  });
  await audit(tx, SYSTEM(tenantId), AUTO_STAFFING_AUDIT.skip, "Campaign", campaignId, {
    after: { athleteId, reason: text, skipId: skip.id, automatic: true },
  });
}

/** BTG's detail read: the athletes skipped on a campaign the caller already loaded through its own scope, newest first. */
export async function staffingSkips(campaignId: string): Promise<Array<{ athleteId: string; displayName: string | null; reason: string; at: string }>> {
  const skips = await prisma.campaignStaffingSkip.findMany({
    /* tenant-scope: keyed by a campaign the route loaded through whereFor(campaign, read). */
    where: { campaignId }, select: { tenantId: true, athleteId: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" },
  });
  if (!skips.length) return [];
  const names = await prisma.athlete.findMany({
    /* tenant-scope: explicit — the skips' own tenant (the campaign's). */
    where: { tenantId: skips[0]!.tenantId, id: { in: skips.map((s) => s.athleteId) } }, select: { id: true, displayName: true },
  });
  const nameOf = new Map(names.map((a) => [a.id, a.displayName]));
  return skips.map((s) => ({ athleteId: s.athleteId, displayName: nameOf.get(s.athleteId) ?? null, reason: s.reason, at: s.createdAt.toISOString() }));
}

/* ------------------------------------------------------------------ stops */

const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;

/** Stop and hand the campaign to BTG, once: set the stop, audit, email the campaign managers. */
async function stopStaffing(
  tx: Tx, c: { id: string; tenantId: string; name: string; sponsor: { name: string } }, reason: string, now: Date,
): Promise<string> {
  const set = await tx.campaign.updateMany({
    /* tenant-scope: explicit — the campaign locked by the caller, in its own tenant; only a running one stops. */
    where: { id: c.id, tenantId: c.tenantId, staffingStoppedAt: null },
    data: { staffingStopReason: reason, staffingStoppedAt: now },
  });
  if (!set.count) return reason;
  await audit(tx, SYSTEM(c.tenantId), AUTO_STAFFING_AUDIT.stop, "Campaign", c.id, {
    before: { staffingStopReason: null }, after: { staffingStopReason: reason, automatic: true },
  });
  const occurrence = await tx.auditLog.count({
    where: { tenantId: c.tenantId, entity: "Campaign", entityId: c.id, action: AUTO_STAFFING_AUDIT.stop },
  });
  const active = { tenantId: c.tenantId, disabledAt: null };
  let staff = await tx.user.findMany({
    /* tenant-scope: explicit — `active` is the campaign's own tenant. */
    where: { ...active, roles: { has: "CAMPAIGN_MGR" } }, select: { id: true, email: true }, orderBy: { id: "asc" },
  });
  if (!staff.length) {
    staff = await tx.user.findMany({
      /* tenant-scope: explicit — `active` is the campaign's own tenant. */
      where: { ...active, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true }, orderBy: { id: "asc" },
    });
  }
  for (const u of staff) {
    await send(tx, c.tenantId, {
      template: "campaign.staffingStopped",
      to: u.email,
      idempotencyKey: `campaign.staffingStopped:${c.id}:${occurrence}:${u.id}`,
      data: { campaignName: c.name, sponsorName: c.sponsor.name, reason, campaignUrl: appUrl(`/admin/campaigns/${c.id}`) },
    });
  }
  return reason;
}

/* ------------------------------------------------------------- entry points */

/** One campaign, in its own transaction — creation's kick-off. */
export async function autoStaffCampaign(tenantId: string, campaignId: string, now = new Date()): Promise<AutoStaffResult> {
  return prisma.$transaction((tx) => autoStaffIn(tx, tenantId, campaignId, now), AUTO_STAFFING_TX);
}

/**
 * Start a new campaign's staffing straight after the transaction that created
 * it has committed — from BTG's approval, a brief approved automatically, or
 * the held-brief re-check. Never throws: a failure leaves the campaign for
 * the staffing sweep, within ten minutes. The campaign's state after the run.
 */
export async function startAutoStaffing(tenantId: string, campaignId: string): Promise<CampaignState | null> {
  try {
    return (await autoStaffCampaign(tenantId, campaignId)).state;
  } catch (error) {
    console.error(`[auto-staffing] starting ${campaignId} failed, the sweep will retry:`, error);
    return null;
  }
}

/**
 * The decline's hook (respondToOffer): the replacement, in the decline's own
 * transaction, behind a savepoint — whatever goes wrong here rolls back to
 * it and leaves the decline standing; the sweep tries again.
 */
export async function replaceAfterDecline(tx: Tx, tenantId: string, campaignId: string, now = new Date()): Promise<AutoStaffResult | null> {
  const point = `auto_replace_${++savepoints}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
  try {
    const run = await autoStaffIn(tx, tenantId, campaignId, now, { maxAthletes: 1, maxTries: 3 });
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
    return run;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
    console.error(`[auto-staffing] replacing on ${campaignId} failed, the sweep will retry:`, error);
    return null;
  }
}

/**
 * The safety net (worker, every ten minutes): every campaign staffing itself
 * — DRAFT or STAFFING, on, not stopped — staffed as far as the rules allow.
 * It sends what a missed event left owed, and replaces expired offers.
 * Platform-wide, or only `opts.tenantIds` (tests). Each campaign in its own
 * transaction, so one failure is retried next run and stops nothing else.
 * Idempotent: a full campaign sends nothing.
 */
export async function sweepAutoStaffing(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { checked: 0, sent: 0, skipped: 0, stopped: 0, failed: 0 };
  const books = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  let after: string | undefined;
  for (;;) {
    const batch = await prisma.campaign.findMany({
      /* tenant-scope: the system sweep — every tenant's (or opts.tenantIds') campaigns staffing themselves; each is staffed in its own books. */
      where: {
        ...books, autoStaffing: true, staffingStoppedAt: null, state: { in: ["DRAFT", "STAFFING"] },
        ...(after ? { id: { gt: after } } : {}),
      },
      select: { id: true, tenantId: true },
      orderBy: { id: "asc" },
      take: 200,
    });
    if (batch.length === 0) break;
    after = batch[batch.length - 1]!.id;
    for (const c of batch) {
      out.checked++;
      try {
        const run = await prisma.$transaction((tx) => autoStaffIn(tx, c.tenantId, c.id, now), AUTO_STAFFING_TX);
        out.sent += run.sent.length;
        out.skipped += run.skipped.length;
        if (run.stopped) out.stopped++;
      } catch (error) {
        out.failed++;
        console.error(`[auto-staffing] staffing ${c.id} failed, will retry:`, error);
      }
    }
  }
  return out;
}

/**
 * BTG turns automatic staffing off or on, with a reason — campaign managers
 * and admins: `campaign.approve`, tenant-wide, the gate BTG's launch uses
 * (a sponsor's `own` approve scope and the service account's write are
 * refused, as neither is BTG's staffing call). Audited with the before and
 * after. Either way the stop is cleared: off, BTG has taken the campaign;
 * on, the system carries on — at once, in this transaction.
 */
export async function setAutoStaffing(actor: Actor, campaignId: string, input: { on: boolean; reason: string }, now = new Date()) {
  assertTenantWide(actor, "campaign", "approve");
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) throw new AutoStaffingReasonError();
  return prisma.$transaction(async (tx) => {
    const c = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "approve"), id: campaignId },
      select: {
        id: true, tenantId: true, autoStaffing: true, staffingStopReason: true,
        brief: { select: { package: { select: { athleteCountMax: true, lineItems: true } } } },
      },
    });
    if (!c) throw new ForbiddenError("campaign", "approve");
    const locked = await lockCampaign(tx, c.id, c.tenantId);
    if (!locked) throw new ForbiddenError("campaign", "approve");
    if (input.on && !staffsAthletes(c.brief?.package)) throw new AutoStaffingUnavailableError();
    await tx.campaign.update({
      /* tenant-scope: the campaign loaded above through whereFor and locked. */
      where: { id: c.id },
      data: { autoStaffing: input.on, staffingStopReason: null, staffingStoppedAt: null },
      select: { id: true },
    });
    await audit(tx, actor, AUTO_STAFFING_AUDIT.toggle, "Campaign", c.id, {
      before: { autoStaffing: c.autoStaffing, staffingStopReason: c.staffingStopReason },
      after: { autoStaffing: input.on, reason },
    });
    const run = input.on ? await autoStaffIn(tx, c.tenantId, c.id, now) : null;
    return {
      id: c.id,
      autoStaffing: input.on,
      state: run?.state ?? locked,
      sent: run?.sent.length ?? 0,
      skipped: run?.skipped.length ?? 0,
      stop: run?.stopped ? { reason: run.stopped, at: now.toISOString() } : null,
    };
  }, AUTO_STAFFING_TX);
}

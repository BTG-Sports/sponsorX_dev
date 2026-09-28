/**
 * Rewards, tokens and the fan funnel — P6-BE-02, P6-BE-03, P6-BE-04.
 *
 * §39's loop reaches its public end here: *tracking/reward*. A fan scans a QR
 * at an event, lands on a page with no login (§16), claims the offer, and a
 * merchant redeems it at the till.
 *
 * TWO FUNNELS, KEPT APART. A TrackingLink measures AN ATHLETE'S DELIVERABLE
 * and writes LinkEvent; a RewardToken measures A FAN'S JOURNEY and writes
 * RewardEvent. V1 of the guide collapsed them and wrote a TrackingLink id into
 * a column that foreign-keys RewardToken — an insert that could only fail.
 * `tracking.ts` owns the other one and they share no code on purpose.
 *
 * THE FAN HAS NO ACTOR. Everything from `recordScan` down is reached by
 * someone with no account, so these functions take a token string rather than
 * an `Actor` and derive the tenant from the token's own row. That is the whole
 * §16 design — a fan must never be asked to log in to use a QR code — and it
 * is why the write path here is deliberately narrow: four event types, no
 * updates, no deletes, nothing that reads across tenants.
 */

import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  CONSENT_TEXT,
  CURRENT_CONSENT_VERSION,
  consentFor,
  sponsorContactFor,
  CURRENT_SPONSOR_CONTACT_VERSION,
  SPONSOR_CONTACT_TEXT,
  mayContact,
  type ConsentPurpose,
} from "./fan-consent";
import { readUnsubscribeToken, unsubscribeUrl } from "../lib/unsubscribe-token";
import { isOpaqueToken } from "../lib/opaque-token";
import {
  canTransitionReward,
  cleanCopy,
  IllegalRewardTransitionError,
  isRewardLive,
  RESERVE_MINUTES,
  REWARD_EVENT_TYPES,
  type RewardEligibility,
  type RewardEventType,
  type RewardState,
} from "./reward-state";

/** Re-exported so callers of the funnel need only one import. */
export { REWARD_EVENT_TYPES, type RewardEventType };

/* ────────────────────────────────────────────────────────────────────────────
   Errors
   ──────────────────────────────────────────────────────────────────────────── */

/* QA pass 6 (P6-BE-05): every refusal a fan-facing client must tell apart
   carries a stable `code` — the fan page maps by it (never by status alone:
   409 is "not live", "expired" AND "already used"). */

export class UnknownTokenError extends Error {
  readonly status = 404;
  readonly code = "unknown_token";
  constructor() {
    /* Deliberately says nothing about whether the token ever existed. A
       fan-facing endpoint with no login is enumerable; "no such token" and
       "expired token" must look identical from outside. */
    super("That code is not valid.");
    this.name = "UnknownTokenError";
  }
}

export class RewardNotLiveError extends Error {
  readonly status = 409;
  readonly code = "reward_not_live";
  constructor(state: RewardState) {
    super(
      `This offer is not currently available (${state.toLowerCase()}). ` +
        `Only an ACTIVE reward can be scanned, claimed or redeemed.`,
    );
    this.name = "RewardNotLiveError";
  }
}

export class RewardExpiredError extends Error {
  readonly status = 409;
  readonly code = "reward_expired";
  constructor() {
    super("This offer has expired.");
    this.name = "RewardExpiredError";
  }
}

export class AlreadyRedeemedError extends Error {
  readonly status = 409;
  readonly code = "already_redeemed";
  constructor() {
    super("This code has already been redeemed.");
    this.name = "AlreadyRedeemedError";
  }
}

/**
 * The reward's redemption cap is used up — P6-BE-08.
 *
 * 410, not 409: a 409 on redeem already means "this code was used", and the
 * fan page words the two differently. This one is about the offer, not the
 * code — every token on the reward is now spent, whoever holds it.
 */
export class RewardExhaustedError extends Error {
  readonly status = 410;
  readonly code = "reward_exhausted";
  /** rcfworks' P6-BE-08 named this refusal; the merged design keeps the name
   *  (a client may branch on `kind`) and the distinct 410 status. */
  readonly kind = "REDEMPTION_CAP";
  constructor() {
    super("This reward has run out — every redemption it offered has been used.");
    this.name = "RewardExhaustedError";
  }
}

/**
 * A token may only be attributed to an athlete signed onto the reward's
 * campaign, in the reward's own tenant — QA pass 6, P6-BE-02. The desk only
 * ever offers those (the campaign roster's ACCEPTED / ACTIVE / COMPLETED
 * orders); the API now holds the same line, so a token can no longer carry a
 * foreign tenant's athlete (whom the reward read would then disclose), and a
 * made-up id is a 422 instead of a foreign-key 500.
 *
 * ONE ANSWER for "another tenant's athlete", "not on this campaign" and "no
 * such athlete": telling them apart would let staff of one tenant probe for
 * athlete ids in another.
 */
export class AthleteNotOnCampaignError extends Error {
  readonly status = 422;
  readonly code = "athlete_not_on_campaign";
  constructor() {
    super("That athlete isn't signed onto this reward's campaign, so a code can't be issued for them.");
    this.name = "AthleteNotOnCampaignError";
  }
}

/** Order states in which an athlete is signed onto a campaign — the same set
 *  the reward creator offers (`campaignAthletesAction`). */
const SIGNED_ORDER_STATES = ["ACCEPTED", "ACTIVE", "COMPLETED"] as const;

/** F-09 — a reward whose expiry has already passed could never be used. */
export class RewardExpiryInPastError extends Error {
  readonly status = 400;
  readonly code = "expiry_in_past";
  constructor() {
    super("The expiry is in the past — pick a date and time that hasn't happened yet.");
    this.name = "RewardExpiryInPastError";
  }
}

/** F-09 — going live after the expiry would put up an offer that is over. */
export class RewardExpiredCannotGoLiveError extends Error {
  readonly status = 409;
  readonly code = "reward_expired";
  constructor() {
    super("This reward's expiry has passed, so it can't go live. End it, or create a new reward with a later expiry.");
    this.name = "RewardExpiredCannotGoLiveError";
  }
}

/**
 * The database is saturated — QA-01's fail-fast. A public fan endpoint that
 * cannot get a connection answers 503 "try again" (the fan page shows its
 * retry screen) rather than a bare 500, and never hangs.
 */
export class RewardServiceBusyError extends Error {
  readonly status = 503;
  readonly code = "busy";
  readonly retryAfter = 2;
  constructor() {
    super("The reward service is busy — try again in a moment.");
    this.name = "RewardServiceBusyError";
  }
}

/** The Postgres SQLSTATE behind a Prisma error, where there is one — a raw
 *  query through the pg driver adapter reports it as P2010 with the
 *  original code nested in `meta.driverAdapterError.cause`. */
function sqlState(error: unknown): string | undefined {
  const e = error as { meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } }; cause?: { code?: unknown } };
  const c = e?.meta?.driverAdapterError?.cause?.originalCode ?? e?.meta?.code ?? e?.cause?.code;
  return typeof c === "string" ? c : undefined;
}

function prismaCode(error: unknown): unknown {
  return typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
}

/** A unique violation — Prisma's P2002 from a model call, or Postgres'
 *  23505 surfacing through a raw query. Checked structurally rather than by
 *  message, which changes between versions. */
function isUniqueViolation(error: unknown): boolean {
  return prismaCode(error) === "P2002" || sqlState(error) === "23505";
}

/** Busy, not broken: the pool is exhausted (P2024), an interactive
 *  transaction could not start in time (P2028), or a reward function gave
 *  up waiting on the row lock (55P03, its `lock_timeout`). */
function isBusy(error: unknown): boolean {
  const code = prismaCode(error);
  return code === "P2024" || code === "P2028" || sqlState(error) === "55P03";
}

async function failFast<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isBusy(error)) throw new RewardServiceBusyError();
    throw error;
  }
}

/** A JS instant as the `timestamp(3)` (UTC wall time) Prisma stores — the
 *  literal's `Z` is ignored by a `timestamp without time zone` cast. */
const sqlTs = (d: Date) => d.toISOString();

/* ────────────────────────────────────────────────────────────────────────────
   P6-BE-02 · Rewards and tokens
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * An opaque, URL-safe token.
 *
 * NOT the record id, and not sequential. These are printed on things fans
 * carry and handed to merchants, so a guessable token is a free drink for
 * whoever can count. 20 bytes of `randomBytes` in base64url is ~160 bits.
 */
export function generateToken(): string {
  return randomBytes(20).toString("base64url");
}

/** Blank optional copy is "not set": stored null, so the page falls back to
 *  its default wording rather than rendering an empty headline. Blank
 *  includes invisible-only — zero-width characters survive `.trim()` (QA-07). */
const copyOrNull = cleanCopy;

export async function createReward(
  actor: Actor,
  input: {
    campaignId: string;
    offerText: string;
    terms: string;
    expiresAt: Date;
    singleUse?: boolean;
    /* P6-BE-08 */
    eligibility?: RewardEligibility;
    eligibilityNote?: string | null;
    redemptionCap?: number | null;
    landingHeadline?: string | null;
    landingSubhead?: string | null;
    /* QA-09 */
    reserveMinutes?: number;
  },
  now = new Date(),
): Promise<{ id: string; state: RewardState }> {
  assertTenantWide(actor, "reward", "write");
  /* F-09 — refused before anything is written: an offer that is already
     over could only ever show fans "expired", yet the desk would offer to
     put it live. */
  if (input.expiresAt.getTime() <= now.getTime()) throw new RewardExpiryInPastError();
  const offerText = cleanCopy(input.offerText);
  const terms = cleanCopy(input.terms);
  /* The contract refuses these first; this is the rule for every caller. */
  if (!offerText || !terms) {
    throw Object.assign(new Error("The offer and the terms can't be blank."), { status: 400, code: "blank_copy" });
  }

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "write"), id: input.campaignId },
      select: { id: true, tenantId: true },
    });
    if (!campaign) throw new ForbiddenError("reward", "write");

    const reward = await tx.reward.create({
      data: {
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        offerText,
        terms,
        expiresAt: input.expiresAt,
        reserveMinutes: input.reserveMinutes ?? RESERVE_MINUTES.default,
        singleUse: input.singleUse ?? true,
        eligibility: input.eligibility ?? "ANYONE",
        eligibilityNote: copyOrNull(input.eligibilityNote),
        redemptionCap: input.redemptionCap ?? null,
        landingHeadline: copyOrNull(input.landingHeadline),
        landingSubhead: copyOrNull(input.landingSubhead),
        /* Always DRAFT. A reward that arrived already ACTIVE would be live
           before anyone read the terms it commits a merchant to. */
        state: "DRAFT",
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.reward.create, "Reward", reward.id, {
      after: {
        campaignId: campaign.id,
        expiresAt: input.expiresAt.toISOString(),
        eligibility: input.eligibility ?? "ANYONE",
        redemptionCap: input.redemptionCap ?? null,
        reserveMinutes: input.reserveMinutes ?? RESERVE_MINUTES.default,
      },
    });

    return { id: reward.id, state: reward.state as RewardState };
  });
}

export async function transitionReward(
  actor: Actor,
  rewardId: string,
  to: RewardState,
  now = new Date(),
): Promise<{ id: string; state: RewardState }> {
  assertTenantWide(actor, "reward", "write");

  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findFirst({
      where: { ...whereFor(actor, "reward", "write"), id: rewardId },
      select: { id: true, state: true, expiresAt: true },
    });
    if (!reward) throw new ForbiddenError("reward", "write");

    const from = reward.state as RewardState;
    if (!canTransitionReward(from, to)) throw new IllegalRewardTransitionError(from, to);
    /* F-09 — "Go live" / "Resume" on an offer whose date has passed. */
    if (to === "ACTIVE" && reward.expiresAt.getTime() <= now.getTime()) {
      throw new RewardExpiredCannotGoLiveError();
    }

    const updated = await tx.reward.update({
      where: { id: rewardId },
      data: { state: to as Prisma.RewardUpdateInput["state"] },
      select: { id: true, state: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.reward.transition, "Reward", rewardId, {
      before: { state: from },
      after: { state: to },
    });

    return { id: updated.id, state: updated.state as RewardState };
  });
}

/**
 * Issue one token for a reward, optionally attributed to an athlete.
 *
 * `athleteId` is what makes the funnel answer "whose QR produced this?" —
 * P6-BE-07's question on the reward side. One reward has many tokens; each
 * athlete promoting it gets their own.
 */
export async function issueRewardToken(
  actor: Actor,
  rewardId: string,
  athleteId?: string | null,
): Promise<{ id: string; token: string }> {
  assertTenantWide(actor, "reward", "write");
  /* "" is "no athlete", as the desk sends it — never a foreign key to "". */
  const who = athleteId || null;

  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findFirst({
      where: { ...whereFor(actor, "reward", "write"), id: rewardId },
      select: { id: true, tenantId: true, campaignId: true },
    });
    if (!reward) throw new ForbiddenError("reward", "write");

    /* P6-BE-02 — same tenant AND signed onto this campaign, or one 422. */
    if (who) {
      const signed = await tx.athlete.findFirst({
        where: {
          id: who,
          tenantId: reward.tenantId,
          orders: { some: { campaignId: reward.campaignId, state: { in: [...SIGNED_ORDER_STATES] } } },
        },
        select: { id: true },
      });
      if (!signed) throw new AthleteNotOnCampaignError();
    }

    const created = await tx.rewardToken.create({
      data: {
        tenantId: reward.tenantId,
        rewardId: reward.id,
        athleteId: who,
        token: generateToken(),
      },
      select: { id: true, token: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.reward.tokenIssue, "RewardToken", created.id, {
      after: { rewardId: reward.id, athleteId: who },
    });

    /* P6-BE-06 — the image is generated off the request path. Issuing tokens
       is a bulk operation; a campaign hands out hundreds at once and the desk
       must not wait on object storage several hundred times. */
    await enqueue(tx, reward.tenantId, "reward.generateQr", { tokenId: created.id });

    return created;
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   P6-BE-03 · Four-event separation
   ──────────────────────────────────────────────────────────────────────────── */

type TokenContext = {
  tokenId: string;
  tenantId: string;
  /* The opaque token itself, and the offer wording — both needed by
     P6-INT-02's email, and read in the same lookup rather than a second
     query on the path of a fan standing at a stall. */
  token: string;
  offerText: string;
  terms: string;
  rewardState: RewardState;
  expiresAt: Date;
  singleUse: boolean;
  rewardId: string;
};

/**
 * Resolve a fan-supplied token to its reward, or refuse.
 *
 * Reads `RewardToken` by its unique `token` column — one indexed lookup, no
 * scan, because this sits on the path of someone standing at a stall.
 */
async function contextFor(
  tx: Prisma.TransactionClient,
  token: string,
): Promise<TokenContext> {
  /* P6-BE-03 — a value that cannot be a token is unknown before Postgres is
     asked (a NUL byte in `text` was a 500). */
  if (!isOpaqueToken(token)) throw new UnknownTokenError();
  const row = await tx.rewardToken.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      token: true,
      reward: {
        select: {
          id: true, state: true, expiresAt: true, singleUse: true,
          offerText: true, terms: true,
        },
      },
    },
  });
  if (!row) throw new UnknownTokenError();

  return {
    tokenId: row.id,
    tenantId: row.tenantId,
    token: row.token,
    offerText: row.reward.offerText,
    terms: row.reward.terms,
    rewardState: row.reward.state as RewardState,
    expiresAt: row.reward.expiresAt,
    singleUse: row.reward.singleUse,
    rewardId: row.reward.id,
  };
}

function assertUsable(ctx: TokenContext, now: Date): void {
  if (!isRewardLive(ctx.rewardState)) throw new RewardNotLiveError(ctx.rewardState);
  if (ctx.expiresAt.getTime() <= now.getTime()) throw new RewardExpiredError();
}

/**
 * The shared outcomes of `reward_redeem` / `reward_reserve` that are
 * refusals, as the domain's errors.
 */
function refusal(outcome: string, state: string | null): Error | null {
  switch (outcome) {
    case "UNKNOWN": return new UnknownTokenError();
    case "NOT_LIVE": return new RewardNotLiveError((state ?? "PAUSED") as RewardState);
    case "EXPIRED": return new RewardExpiredError();
    case "EXHAUSTED": return new RewardExhaustedError();
    case "ALREADY_USED": return new AlreadyRedeemedError();
    default: return null;
  }
}

/**
 * QA-09 — a claim on a capped reward reserves one unit for this token
 * (`reward_reserve`, one database call, the Reward row lock held only inside
 * it). Returns the hold's deadline, `fresh` when this call made it; null for
 * an uncapped reward, which has nothing to hold.
 */
async function reserveUnit(token: string, now: Date): Promise<{ until: Date; fresh: boolean } | null> {
  if (!isOpaqueToken(token)) throw new UnknownTokenError();
  const [row] = await prisma.$queryRaw<{ outcome: string; held_until: Date | string | null; reward_state: string | null }[]>`
    SELECT outcome, to_char(held_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS held_until, reward_state
    FROM reward_reserve(${token}, ${sqlTs(now)}::timestamp)`;
  if (!row) throw new Error("reward_reserve returned no row");
  const refused = refusal(row.outcome, row.reward_state);
  if (refused) throw refused;
  if (row.outcome === "HELD" || row.outcome === "HELD_NEW") {
    return { until: new Date(String(row.held_until)), fresh: row.outcome === "HELD_NEW" };
  }
  return null; /* UNCAPPED, or NONE (a used single-use code) */
}

/**
 * Write one event of one type.
 *
 * ONE ROW PER MOMENT — never an incremented counter. §16's funnel is
 * SCAN → LANDING → CLAIM → REDEEM, and the drop-off between any two of those
 * is the number the whole feature exists to produce. A counter can say how
 * many scans happened; only rows can say how many of *those* scans became
 * claims, or when, or where.
 */
async function writeEvent(
  tx: Prisma.TransactionClient,
  ctx: TokenContext,
  type: RewardEventType,
  extra: {
    fanEmail?: string | null;
    city?: string | null;
    region?: string | null;
    consentVersion?: string | null;
    consentAt?: Date | null;
    consentPurpose?: string | null;
    sponsorContactVersion?: string | null;
    sponsorContactAt?: Date | null;
  } = {},
): Promise<{ id: string; type: RewardEventType }> {
  const created = await tx.rewardEvent.create({
    data: {
      tenantId: ctx.tenantId,
      tokenId: ctx.tokenId,
      type: type as Prisma.RewardEventCreateInput["type"],
      fanEmail: extra.fanEmail ?? null,
      city: extra.city ?? null,
      region: extra.region ?? null,
      consentVersion: extra.consentVersion ?? null,
      consentAt: extra.consentAt ?? null,
      consentPurpose: extra.consentPurpose ?? null,
      sponsorContactVersion: extra.sponsorContactVersion ?? null,
      sponsorContactAt: extra.sponsorContactAt ?? null,
    },
    select: { id: true, type: true },
  });
  return { id: created.id, type: created.type as RewardEventType };
}

/** The QR resolved. First moment of the funnel. */
export async function recordScan(token: string, now = new Date()) {
  return failFast(() => prisma.$transaction(async (tx) => {
    const ctx = await contextFor(tx, token);
    assertUsable(ctx, now);
    return writeEvent(tx, ctx, "SCAN");
  }));
}

/** The fan's page actually rendered. Distinct from SCAN: a scan that never
 *  reaches the page is a broken link, and collapsing the two hides that. */
export async function recordLanding(token: string, now = new Date()) {
  return failFast(() => prisma.$transaction(async (tx) => {
    const ctx = await contextFor(tx, token);
    assertUsable(ctx, now);
    return writeEvent(tx, ctx, "LANDING");
  }));
}

/**
 * The fan accepted the offer.
 *
 * P6-SEC-01 — AN ADDRESS CANNOT BE STORED WITHOUT CONSENT, and the consent
 * cannot be stored without the version of the text the fan actually saw.
 * `consentFor` refuses an address that arrives without one, so there is no
 * path through this function that writes fan PII unevidenced.
 *
 * P6-INT-02 — a claim that carries a contactable address enqueues exactly one
 * send. The email goes out from the worker, so a fan standing at a stall is
 * not waiting on an SMTP call.
 */
export async function recordClaim(
  token: string,
  fanEmail?: string | null,
  now = new Date(),
  consent?: { version?: string | null; purpose?: string | null } | null,
  /** 2S6-BE-03 — the optional second box: the sponsor may contact me. */
  sponsorContact?: { version?: string | null } | null,
) {
  /* Validated BEFORE the transaction opens: a refusal here is about the
     request, not about the reward, and it should not hold a transaction
     open to say so. */
  const agreed = consentFor(fanEmail, consent, now);
  const sponsorOk = sponsorContactFor(agreed, sponsorContact, now);
  const email = agreed ? fanEmail!.trim() : null;

  /* QA-09 — on a capped reward the claim first RESERVES a unit, in its own
     single database call, so the Reward row lock is never held across the
     transaction below (QA-01). A reward with no unit left to set aside takes
     no new claims (410) — the fan would be promised something the booth can
     no longer give. */
  const hold = await failFast(() => reserveUnit(token, now));

  try {
    return await failFast(() => prisma.$transaction(async (tx) => {
      const ctx = await contextFor(tx, token);
      assertUsable(ctx, now);
      const heldUntil = hold ? hold.until.toISOString() : null;

      /* ONE CLAIM PER TOKEN (QA pass 6). A token is one fan's code: the page
         shows it "claimed" after the first, the hold is per token, and the
         voucher email is keyed on the token. So a re-tap — or 20 parallel
         posts — answers with the claim already made instead of writing
         another row that inflates the funnel's CLAIM count.

         Serialised on THIS token's row (NO KEY UPDATE, so a REDEEM's
         foreign-key check on the same row is not blocked) for the few
         milliseconds of this transaction; the 3 s lock timeout answers 503,
         as elsewhere. */
      await tx.$queryRaw`SELECT set_config('lock_timeout', '3s', true)`;
      await tx.$queryRaw`SELECT id FROM "RewardToken" WHERE id = ${ctx.tokenId} FOR NO KEY UPDATE`;

      /* A used single-use code has nothing left to claim — 409, and no CLAIM
         row (it used to be 201 and a row). */
      if (ctx.singleUse) {
        const used = await tx.rewardEvent.findFirst({
          /* tenant-scope: the public bearer token resolved above. */
          where: { tokenId: ctx.tokenId, type: "REDEEM" },
          select: { id: true },
        });
        if (used) throw new AlreadyRedeemedError();
      }
      const prior = await tx.rewardEvent.findFirst({
        /* tenant-scope: the public bearer token resolved above. */
        where: { tokenId: ctx.tokenId, type: "CLAIM" },
        orderBy: { at: "asc" },
        select: { id: true },
      });
      if (prior) return { id: prior.id, type: "CLAIM" as RewardEventType, heldUntil };

      const event = await claimInTx(tx, ctx, email, agreed, sponsorOk);
      return { ...event, heldUntil };
    }));
  } catch (error) {
    /* A hold this call made, for a claim that was never recorded, is handed
       back at once rather than blocking a unit until it lapses. */
    if (hold?.fresh) {
      await prisma.rewardToken
        .updateMany({
          /* tenant-scope: the public bearer token is the key, as above. */
          where: { token, reservedUntil: hold.until },
          data: { reservedUntil: null },
        })
        .catch(() => {});
    }
    throw error;
  }
}

async function claimInTx(
  tx: Prisma.TransactionClient,
  ctx: TokenContext,
  email: string | null,
  agreed: ReturnType<typeof consentFor>,
  sponsorOk: ReturnType<typeof sponsorContactFor>,
): Promise<{ id: string; type: RewardEventType }> {
  const event = await writeEvent(tx, ctx, "CLAIM", {
    fanEmail: email,
    consentVersion: agreed?.version ?? null,
    consentAt: agreed?.at ?? null,
    consentPurpose: agreed?.purpose ?? null,
    sponsorContactVersion: sponsorOk?.version ?? null,
    sponsorContactAt: sponsorOk?.at ?? null,
  });

  /* 2S6-INT-03 — a fan who ticked "the sponsor may contact me" becomes a
     Zoho Lead, queued in this transaction and pushed by the worker, which
     re-reads the claim through the consent filter (fan-leads.ts) — so a
     withdrawal before the push means nothing is sent. No tick, no job. */
  if (sponsorOk) {
    await enqueue(tx, ctx.tenantId, "zoho.pushLead", { fanEventId: event.id });
  }

  /* P6-INT-02. Idempotent through EmailSendLog's unique idempotencyKey:
     the key is the TOKEN, not the event, so a fan who claims twice on one
     token gets one email rather than two. */
  if (agreed && mayContact(
    { fanEmail: email, consentVersion: agreed.version, consentPurpose: agreed.purpose },
    "reward-delivery" as ConsentPurpose,
  )) {
    await enqueue(tx, ctx.tenantId, "notify.email", {
      tenantId: ctx.tenantId,
      template: "reward.claimed",
      to: email,
      idempotencyKey: `reward.claimed:${ctx.tokenId}`,
      /* P6-SEC-03. The consent record this email relies on — the worker
         re-checks it for a withdrawal immediately before sending — and the
         link that withdraws it, printed in the body and sent as the
         List-Unsubscribe header. */
      fanEventId: event.id,
      data: {
        code: ctx.token,
        offerText: ctx.offerText,
        terms: ctx.terms,
        /* F-08 (QA pass 5): the fan page's convention — US Eastern, labelled —
           not a bare UTC date that can be a day off in the evening. */
        expiresOn: `${new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit",
        }).format(ctx.expiresAt)} ET`,
        unsubscribeUrl: unsubscribeUrl(event.id),
      },
    });
  }

  return event;
}

/**
 * The fan taps "unsubscribe" — P6-SEC-03.
 *
 * "Withdrawal is recorded against the same consent record with a timestamp."
 * The token names the CLAIM event whose consent is withdrawn; the timestamp
 * goes on that row. Idempotent: a second tap (or a mail client's one-click
 * POST after the fan already tapped) keeps the FIRST timestamp, because that
 * is when they withdrew.
 *
 * An invalid or unknown token answers exactly like a valid one that has
 * nothing to withdraw — `{ withdrawn: false }` — so the endpoint cannot be
 * used to test which claim ids exist.
 */
export async function withdrawFanConsent(
  token: string,
  now = new Date(),
): Promise<{ withdrawn: boolean }> {
  const eventId = readUnsubscribeToken(token);
  if (!eventId) return { withdrawn: false };

  return prisma.$transaction(async (tx) => {
    const row = await tx.rewardEvent.findFirst({
      where: { id: eventId, type: "CLAIM", fanEmail: { not: null } },
      select: { id: true, tenantId: true, consentWithdrawnAt: true, sponsorContactVersion: true, sponsorContactWithdrawnAt: true },
    });
    if (!row) return { withdrawn: false };
    if (row.consentWithdrawnAt) return { withdrawn: true };

    /* One tap withdraws BOTH: the fan unsubscribing from the voucher mail has
       not thereby agreed to keep hearing from the sponsor (2S6-BE-03). */
    await tx.rewardEvent.update({
      where: { id: row.id },
      data: {
        consentWithdrawnAt: now,
        ...(row.sponsorContactVersion && !row.sponsorContactWithdrawnAt ? { sponsorContactWithdrawnAt: now } : {}),
      },
    });
    /* The fan has no user id; the audit row says so honestly rather than
       borrowing one. */
    await audit(tx, { userId: null, tenantId: row.tenantId }, "fan.consentWithdraw", "RewardEvent", row.id, {
      after: { consentWithdrawnAt: now.toISOString() },
    });
    return { withdrawn: true };
  });
}

/**
 * What the fan's page should show for a token — P6-FE-02.
 *
 * READ ONLY: no event is written, so the page can ask as often as it renders
 * without inventing scans. Every state the page must be able to render has a
 * name here — unknown, not live, expired, already used, claimable, claimed —
 * and the consent wording comes with it, so the words next to the checkbox
 * are the words the stored version stands for.
 */
export type TokenView =
  | { state: "UNKNOWN" }
  | {
      /** EXHAUSTED (P6-BE-08): the reward's redemption cap is used up. */
      state: "LIVE" | "NOT_LIVE" | "EXPIRED" | "EXHAUSTED" | "REDEEMED";
      offerText: string;
      terms: string;
      expiresAt: string;
      claimed: boolean;
      /** P6-BE-08 — who it is for, stated (never checked: no login, §16). */
      eligibility: RewardEligibility;
      eligibilityNote: string | null;
      /** P6-BE-08 — the page's own words; null = the page's default copy. */
      landing: { headline: string | null; subhead: string | null };
      /** P6-BE-08 (rcfworks) — the redemption cap is used up, or every unit
       *  left is held by another code's claim. */
      capReached: boolean;
      consent: { version: string; purpose: string; text: string };
      /** 2S6-BE-03 — the optional second box's wording. The page renders it
       *  UNTICKED; the version it sends back is this one. */
      sponsorContact: { version: string; purpose: "sponsor-contact"; text: string };
      /** QA-04 — false: the code redeems more than once (up to any cap). */
      singleUse: boolean;
      /** How many times THIS code has been redeemed. */
      timesRedeemed: number;
      /** When this code was last redeemed — the page honours its one-off
       *  "Redeemed ✓" confirmation only right after it (F-07). */
      lastRedeemedAt: string | null;
      /** QA-09 — the unit this code's claim holds on a capped reward; `active`
       *  false once it has lapsed. null when nothing is (or was) held. */
      hold: { until: string; active: boolean } | null;
    };

export async function viewToken(token: string, now = new Date()): Promise<TokenView> {
  if (!isOpaqueToken(token)) return { state: "UNKNOWN" };
  const row = await prisma.rewardToken.findUnique({
    /* tenant-scope: a public bearer token, unique across tenants — the
       ~160-bit token IS the authorisation, as for scan/claim/redeem. */
    where: { token },
    select: {
      id: true,
      tenantId: true,
      rewardId: true,
      reservedUntil: true,
      reward: {
        select: {
          state: true, expiresAt: true, singleUse: true, offerText: true, terms: true,
          eligibility: true, eligibilityNote: true, redemptionCap: true, redemptionCount: true,
          landingHeadline: true, landingSubhead: true,
        },
      },
      /* Types and times only — never the address (P6-SEC-02). */
      events: { where: { type: { in: ["CLAIM", "REDEEM"] } }, select: { type: true, at: true } },
    },
  });
  if (!row) return { state: "UNKNOWN" };
  const r = row.reward;
  const redemptions = row.events.filter((e) => e.type === "REDEEM");
  const lastRedeemedAt = redemptions.reduce<Date | null>((m, e) => (!m || e.at > m ? e.at : m), null);
  const redeemed = r.singleUse && redemptions.length > 0;
  const live = isRewardLive(r.state as RewardState);
  const expired = r.expiresAt.getTime() <= now.getTime();
  const held = row.reservedUntil !== null && row.reservedUntil.getTime() > now.getTime();
  /* Mirrors `reward_redeem`: a code holding a unit can always use it;
     otherwise it needs a unit that is neither redeemed nor held by another
     code. Only counted where it could change the answer — a capped reward
     that is otherwise live. This fan's own "Redeemed ✓" outranks "run out". */
  const exhausted =
    !redeemed && live && !expired && r.redemptionCap !== null && !held &&
    r.redemptionCount + (await prisma.rewardToken.count({
      /* tenant-scope: the reward of the bearer token read above. */
      where: { rewardId: row.rewardId, id: { not: row.id }, reservedUntil: { gt: now } },
    })) >= r.redemptionCap;
  const state = redeemed
    ? "REDEEMED"
    : !live
      ? "NOT_LIVE"
      : expired
        ? "EXPIRED"
        : exhausted
          ? "EXHAUSTED"
          : "LIVE";
  return {
    state,
    offerText: r.offerText,
    terms: r.terms,
    expiresAt: r.expiresAt.toISOString(),
    claimed: row.events.some((e) => e.type === "CLAIM"),
    eligibility: r.eligibility as RewardEligibility,
    eligibilityNote: r.eligibilityNote,
    landing: { headline: r.landingHeadline, subhead: r.landingSubhead },
    capReached: r.redemptionCap !== null && (r.redemptionCount >= r.redemptionCap || exhausted),
    consent: {
      version: CURRENT_CONSENT_VERSION,
      purpose: "reward-delivery",
      text: CONSENT_TEXT[CURRENT_CONSENT_VERSION]!,
    },
    sponsorContact: {
      version: CURRENT_SPONSOR_CONTACT_VERSION,
      purpose: "sponsor-contact",
      text: SPONSOR_CONTACT_TEXT[CURRENT_SPONSOR_CONTACT_VERSION]!,
    },
    singleUse: r.singleUse,
    timesRedeemed: redemptions.length,
    lastRedeemedAt: lastRedeemedAt?.toISOString() ?? null,
    hold: r.redemptionCap !== null && row.reservedUntil
      ? { until: row.reservedUntil.toISOString(), active: held }
      : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   P6-BE-04 · Race-safe single-use redemption
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Redeem a token at the till.
 *
 * ONE DATABASE CALL DECIDES EVERYTHING — `reward_redeem(token, now)`,
 * migration 20260928190000 (QA pass 5, merged with P6-BE-08). It locks the Reward row, then reads
 * the state, the expiry, this code's use, the redemptions and the other codes'
 * holds as they are NOW, and inserts the REDEEM — all inside Postgres.
 *
 * Why not an interactive transaction (the P6-BE-08 design): a
 * `SELECT … FOR UPDATE` there holds a pooled connection — and the lock —
 * across several client round trips, so a burst of redeems on one capped
 * reward queued every pooled connection on one row and the whole API answered
 * 500 (QA-01). And it checked state and expiry before the lock, so a redeem
 * that waited while the reward was paused still went through (QA-02). Inside
 * the function the lock lasts microseconds and every read follows it.
 *
 * The rules, in the order they answer:
 *   - unknown code 404; not ACTIVE 409; expired 409
 *   - a used single-use code 409 "already used" — per code FIRST, so a
 *     re-scan says what happened to it even once the cap is spent (QA-06).
 *     Multi-use codes redeem repeatedly (QA-04)
 *   - on a capped reward (QA-09): a code whose claim holds an unexpired unit
 *     always redeems — the unit is its own; any other code needs
 *     redeemed + other codes' live holds < cap, else 410 "run out"
 *
 * THE INDEX STAYS THE LAST WORD on single use: `reward_single_redeem` (now
 * partial on single-use REDEEMs) rejects a duplicate from any path, and its
 * violation is translated to 409 here.
 */
export async function redeemToken(
  token: string,
  now = new Date(),
): Promise<{ id: string; type: RewardEventType }> {
  if (!isOpaqueToken(token)) throw new UnknownTokenError();
  type Out = { outcome: string; event_id: string | null; reward_state: string | null };
  let row: Out | undefined;
  try {
    [row] = await failFast(() => prisma.$queryRaw<Out[]>`
      SELECT outcome, event_id, reward_state FROM reward_redeem(${token}, ${sqlTs(now)}::timestamp)`);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AlreadyRedeemedError();
    throw error;
  }
  if (!row) throw new Error("reward_redeem returned no row");
  const refused = refusal(row.outcome, row.reward_state);
  if (refused) throw refused;
  return { id: row.event_id!, type: "REDEEM" };
}

/* ────────────────────────────────────────────────────────────────────────────
   Reading the funnel
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The four counts for one reward, as four separate numbers.
 *
 * Returned as a shape that cannot be collapsed by accident: every caller sees
 * all four or none.
 */
export async function rewardFunnel(
  actor: Actor,
  rewardId: string,
): Promise<Record<RewardEventType, number>> {
  assertAllowed(actor, "rewardEvent", "read");

  const reward = await prisma.reward.findFirst({
    where: { ...whereFor(actor, "reward", "read"), id: rewardId },
    select: { id: true },
  });
  if (!reward) throw new ForbiddenError("rewardEvent", "read");

  const grouped = await prisma.rewardEvent.groupBy({
    by: ["type"],
    /* The caller's own EVENT scope too (P6-BE-01): an athlete counts only
       their own token's events on a reward they share with others. */
    where: { ...whereFor(actor, "rewardEvent", "read"), token: { is: { rewardId } } },
    _count: { _all: true },
  });

  const counts = { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 } as Record<
    RewardEventType,
    number
  >;
  for (const row of grouped) {
    counts[row.type as RewardEventType] = row._count._all;
  }
  return counts;
}

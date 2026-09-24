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
  mayContact,
  type ConsentPurpose,
} from "./fan-consent";
import { readUnsubscribeToken, unsubscribeUrl } from "../lib/unsubscribe-token";
import {
  canTransitionReward,
  IllegalRewardTransitionError,
  isRewardLive,
  REWARD_EVENT_TYPES,
  type RewardEventType,
  type RewardState,
} from "./reward-state";

/** Re-exported so callers of the funnel need only one import. */
export { REWARD_EVENT_TYPES, type RewardEventType };

/* ────────────────────────────────────────────────────────────────────────────
   Errors
   ──────────────────────────────────────────────────────────────────────────── */

export class UnknownTokenError extends Error {
  readonly status = 404;
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
  constructor() {
    super("This offer has expired.");
    this.name = "RewardExpiredError";
  }
}

export class AlreadyRedeemedError extends Error {
  readonly status = 409;
  constructor() {
    super("This code has already been redeemed.");
    this.name = "AlreadyRedeemedError";
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

export async function createReward(
  actor: Actor,
  input: {
    campaignId: string;
    offerText: string;
    terms: string;
    expiresAt: Date;
    singleUse?: boolean;
  },
): Promise<{ id: string; state: RewardState }> {
  assertTenantWide(actor, "reward", "write");

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
        offerText: input.offerText,
        terms: input.terms,
        expiresAt: input.expiresAt,
        singleUse: input.singleUse ?? true,
        /* Always DRAFT. A reward that arrived already ACTIVE would be live
           before anyone read the terms it commits a merchant to. */
        state: "DRAFT",
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.reward.create, "Reward", reward.id, {
      after: { campaignId: campaign.id, expiresAt: input.expiresAt.toISOString() },
    });

    return { id: reward.id, state: reward.state as RewardState };
  });
}

export async function transitionReward(
  actor: Actor,
  rewardId: string,
  to: RewardState,
): Promise<{ id: string; state: RewardState }> {
  assertTenantWide(actor, "reward", "write");

  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findFirst({
      where: { ...whereFor(actor, "reward", "write"), id: rewardId },
      select: { id: true, state: true },
    });
    if (!reward) throw new ForbiddenError("reward", "write");

    const from = reward.state as RewardState;
    if (!canTransitionReward(from, to)) throw new IllegalRewardTransitionError(from, to);

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

  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findFirst({
      where: { ...whereFor(actor, "reward", "write"), id: rewardId },
      select: { id: true, tenantId: true },
    });
    if (!reward) throw new ForbiddenError("reward", "write");

    const created = await tx.rewardToken.create({
      data: {
        tenantId: reward.tenantId,
        rewardId: reward.id,
        athleteId: athleteId ?? null,
        token: generateToken(),
      },
      select: { id: true, token: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.reward.tokenIssue, "RewardToken", created.id, {
      after: { rewardId: reward.id, athleteId: athleteId ?? null },
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
  const row = await tx.rewardToken.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      token: true,
      reward: {
        select: {
          state: true, expiresAt: true, singleUse: true,
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
  };
}

function assertUsable(ctx: TokenContext, now: Date): void {
  if (!isRewardLive(ctx.rewardState)) throw new RewardNotLiveError(ctx.rewardState);
  if (ctx.expiresAt.getTime() <= now.getTime()) throw new RewardExpiredError();
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
    },
    select: { id: true, type: true },
  });
  return { id: created.id, type: created.type as RewardEventType };
}

/** The QR resolved. First moment of the funnel. */
export async function recordScan(token: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const ctx = await contextFor(tx, token);
    assertUsable(ctx, now);
    return writeEvent(tx, ctx, "SCAN");
  });
}

/** The fan's page actually rendered. Distinct from SCAN: a scan that never
 *  reaches the page is a broken link, and collapsing the two hides that. */
export async function recordLanding(token: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const ctx = await contextFor(tx, token);
    assertUsable(ctx, now);
    return writeEvent(tx, ctx, "LANDING");
  });
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
) {
  /* Validated BEFORE the transaction opens: a refusal here is about the
     request, not about the reward, and it should not hold a transaction
     open to say so. */
  const agreed = consentFor(fanEmail, consent, now);
  const email = agreed ? fanEmail!.trim() : null;

  return prisma.$transaction(async (tx) => {
    const ctx = await contextFor(tx, token);
    assertUsable(ctx, now);

    const event = await writeEvent(tx, ctx, "CLAIM", {
      fanEmail: email,
      consentVersion: agreed?.version ?? null,
      consentAt: agreed?.at ?? null,
      consentPurpose: agreed?.purpose ?? null,
    });

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
          expiresOn: ctx.expiresAt.toISOString().slice(0, 10),
          unsubscribeUrl: unsubscribeUrl(event.id),
        },
      });
    }

    return event;
  });
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
      select: { id: true, tenantId: true, consentWithdrawnAt: true },
    });
    if (!row) return { withdrawn: false };
    if (row.consentWithdrawnAt) return { withdrawn: true };

    await tx.rewardEvent.update({
      where: { id: row.id },
      data: { consentWithdrawnAt: now },
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
      state: "LIVE" | "NOT_LIVE" | "EXPIRED" | "REDEEMED";
      offerText: string;
      terms: string;
      expiresAt: string;
      claimed: boolean;
      consent: { version: string; purpose: string; text: string };
    };

export async function viewToken(token: string, now = new Date()): Promise<TokenView> {
  const row = await prisma.rewardToken.findUnique({
    /* tenant-scope: a public bearer token, unique across tenants — the
       ~160-bit token IS the authorisation, as for scan/claim/redeem. */
    where: { token },
    select: {
      id: true,
      reward: { select: { state: true, expiresAt: true, singleUse: true, offerText: true, terms: true } },
      /* Types only — never the address (P6-SEC-02). */
      events: { where: { type: { in: ["CLAIM", "REDEEM"] } }, select: { type: true } },
    },
  });
  if (!row) return { state: "UNKNOWN" };
  const redeemed = row.reward.singleUse && row.events.some((e) => e.type === "REDEEM");
  const state = redeemed
    ? "REDEEMED"
    : !isRewardLive(row.reward.state as RewardState)
      ? "NOT_LIVE"
      : row.reward.expiresAt.getTime() <= now.getTime()
        ? "EXPIRED"
        : "LIVE";
  return {
    state,
    offerText: row.reward.offerText,
    terms: row.reward.terms,
    expiresAt: row.reward.expiresAt.toISOString(),
    claimed: row.events.some((e) => e.type === "CLAIM"),
    consent: {
      version: CURRENT_CONSENT_VERSION,
      purpose: "reward-delivery",
      text: CONSENT_TEXT[CURRENT_CONSENT_VERSION]!,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   P6-BE-04 · Race-safe single-use redemption
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Redeem a token at the till.
 *
 * THE RULE IS AN INDEX, NOT AN `IF`. `reward_single_redeem` is a partial
 * unique index on `RewardEvent (tokenId) WHERE type = 'REDEEM'`
 * (P2-BE-03's migration). This function ATTEMPTS the insert and catches the
 * unique violation — it deliberately does not check first.
 *
 * A read-then-write check is the obvious implementation and it is wrong: two
 * merchants scanning the same code in the same second both read "not yet
 * redeemed", both write, and the offer is honoured twice. That is not a
 * hypothetical at a busy event; it is the normal case for a popular code. The
 * database can decide this atomically and application code cannot.
 *
 * Note the order: usability is checked first so an expired or paused offer
 * gives its own message, but the single-use decision is left entirely to the
 * index.
 */
export async function redeemToken(
  token: string,
  now = new Date(),
): Promise<{ id: string; type: RewardEventType }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const ctx = await contextFor(tx, token);
      assertUsable(ctx, now);

      /* A reward explicitly marked multi-use has no single-use rule to
         enforce; the index still guards the single-use ones. */
      return writeEvent(tx, ctx, "REDEEM");
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AlreadyRedeemedError();
    throw error;
  }
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
    /* tenant-scope: keyed by the reward loaded above through whereFor. */
    by: ["type"],
    where: { token: { is: { rewardId } } },
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

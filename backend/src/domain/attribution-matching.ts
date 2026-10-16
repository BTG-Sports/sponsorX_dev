/**
 * Matching partner sales to campaigns — 3S6-BE-03, and the reasons a sale
 * waits in the queue — 3S6-BE-04 (documentation/SponsorX-Attribution-Matching.md).
 *
 * "Try the exact match first — reward token, order ID, partner click ID.
 * Only fall back to probabilistic matching, and mark it explicitly when you do."
 *
 *   EXACT, in this order:
 *     token     a SponsorX reward token → its reward's campaign and athlete;
 *     click_id  an athlete's tracking-link code → its deliverable's campaign
 *               and athlete;
 *     order_id  an order this partner already sent, matched → that sale's
 *               campaign (how a refund finds its sale).
 *   A token or click counts only inside the adapter's lookback: the sale
 *   happened after the fan's last scan or click, and no more than
 *   `lookbackDays` after it. Keys that point at different campaigns are
 *   ambiguous; nothing is guessed.
 *   An exact match is VERIFIED_TRANSACTION: deterministic, the key named,
 *   confidence 1.
 *
 *   MODELLED, only when no key matched (none given, an unknown token, no
 *   match) AND the adapter declares probabilistic AND the partner says where
 *   the sale happened: the campaigns whose rewards were redeemed in that US
 *   state inside the window, at least `minRedemptions` times (model
 *   `attribution`, attr-geo-time). Exactly one: MODELLED, with the model's
 *   version and a confidence below 1. More than one: ambiguous, queued.
 *
 * The database holds the line too: a modelled row labelled verified is
 * refused (CHECK "PartnerSaleAttribution_class_check").
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { adapterFor, type AttributionAdapter, type MatchKey, type PartnerEvent } from "./attribution-adapters";
import { activeModel, tenantsWithout, type ActiveModel } from "./model-registry";

type Db = PrismaClient | Prisma.TransactionClient;
const DAY_MS = 86_400_000;

export const UNMATCHED_REASONS = ["no_match", "ambiguous", "outside_window", "unknown_token"] as const;
export type UnmatchedReason = (typeof UNMATCHED_REASONS)[number];

/** The order the exact keys are tried in. */
export const KEY_ORDER: readonly MatchKey[] = ["token", "click_id", "order_id"];

/** How a match was made — the only two shapes a matched sale can take. */
export type Basis =
  | { class: "VERIFIED_TRANSACTION"; method: "deterministic"; matchKey: MatchKey; confidence: 1; modelVersion: null }
  | { class: "MODELLED"; method: "probabilistic"; matchKey: null; confidence: number; modelVersion: string };

export type Outcome =
  | ({ status: "matched"; campaignId: string; athleteId: string | null } & Basis)
  | { status: "unmatched"; reason: UnmatchedReason; candidates: number | null };

/** What one exact key found. An order id carries the basis of the sale it found. */
export type KeyHit =
  | { key: MatchKey; found: false }
  | { key: MatchKey; found: true; campaignId: string; athleteId: string | null; inWindow: boolean; basis?: Basis };

type Found = Extract<KeyHit, { found: true }>;

/** The sale happened after the exposure, and inside the lookback. */
export const inWindow = (occurredAt: Date, exposure: Date | null | undefined, lookbackDays: number): boolean =>
  !!exposure && exposure.getTime() <= occurredAt.getTime() && occurredAt.getTime() - exposure.getTime() <= lookbackDays * DAY_MS;

/** The exact keys' verdict. */
export function exactOutcome(hits: KeyHit[]): Outcome {
  const found = hits.filter((h): h is Found => h.found);
  const usable = found.filter((h) => h.inWindow).sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key));
  const campaigns = new Set(usable.map((h) => h.campaignId));
  if (campaigns.size > 1) return { status: "unmatched", reason: "ambiguous", candidates: campaigns.size };
  const h = usable[0];
  if (h) {
    /* A refund found by its order id is what its sale was: modelled stays modelled. */
    const basis: Basis = h.basis?.method === "probabilistic"
      ? h.basis
      : { class: "VERIFIED_TRANSACTION", method: "deterministic", matchKey: h.key, confidence: 1, modelVersion: null };
    return { status: "matched", campaignId: h.campaignId, athleteId: h.athleteId, ...basis };
  }
  if (found.length) return { status: "unmatched", reason: "outside_window", candidates: null };
  if (hits.some((x) => x.key === "token")) return { status: "unmatched", reason: "unknown_token", candidates: null };
  return { status: "unmatched", reason: "no_match", candidates: null };
}

/** The modelled fallback's verdict, or null when no campaign fits. */
export function modelledOutcome(candidates: Array<{ campaignId: string; redemptions: number }>, model: Pick<ActiveModel, "stamp" | "t">): Outcome | null {
  const fit = candidates.filter((c) => c.redemptions >= (model.t.minRedemptions ?? 1));
  if (!fit.length) return null;
  if (fit.length > 1) return { status: "unmatched", reason: "ambiguous", candidates: fit.length };
  /* Never 1: a modelled match is never certain, whatever the settings say. */
  const confidence = Math.min(0.99, Math.max(0.01, model.t.confidence ?? 0.5));
  return { status: "matched", campaignId: fit[0]!.campaignId, athleteId: null, class: "MODELLED", method: "probabilistic", matchKey: null, confidence, modelVersion: model.stamp };
}

/** Exact first; the model only where the keys found nothing at all. */
export function decide(exact: Outcome, modelled: Outcome | null): Outcome {
  if (exact.status === "matched" || exact.reason === "ambiguous" || exact.reason === "outside_window") return exact;
  return modelled ?? exact;
}

/** A matched outcome's basis — what a refund in the same delivery inherits. */
export const basisOf = (o: Extract<Outcome, { status: "matched" }>): Basis =>
  (o.method === "probabilistic"
    ? { class: "MODELLED", method: "probabilistic", matchKey: null, confidence: o.confidence, modelVersion: o.modelVersion }
    : { class: "VERIFIED_TRANSACTION", method: "deterministic", matchKey: o.matchKey, confidence: 1, modelVersion: null });

/** The row's columns for an outcome. */
export function columnsOf(o: Outcome, now: Date) {
  return o.status === "matched"
    ? { status: "matched", class: o.class, method: o.method, matchKey: o.matchKey, confidence: o.confidence, modelVersion: o.modelVersion, campaignId: o.campaignId, athleteId: o.athleteId, matchedAt: now, reason: null, candidates: null }
    : { status: "unmatched", class: null, method: null, matchKey: null, confidence: null, modelVersion: null, campaignId: null, athleteId: null, matchedAt: null, reason: o.reason, candidates: o.candidates };
}

/* ───────────────────────────── the lookups ───────────────────────────── */

export type MatchContext = {
  tenantId: string;
  partnerId: string;
  adapter: AttributionAdapter;
  /** The tenant's active `attribution` model — only for an adapter that declares probabilistic. */
  model: ActiveModel | null;
  /** This delivery's sales already matched, by order id: a refund in the same delivery finds its sale. */
  batchOrders?: Map<string, { campaignId: string; athleteId: string | null; basis: Basis }>;
  /** Re-matching a stored row: it is not its own sale. */
  selfId?: string;
};

async function tokenHit(db: Db, tenantId: string, token: string, at: Date, lookbackDays: number): Promise<KeyHit> {
  const t = await db.rewardToken.findFirst({
    where: { tenantId, token },
    select: { id: true, athleteId: true, reward: { select: { campaignId: true } } },
  });
  if (!t) return { key: "token", found: false };
  const last = await db.rewardEvent.findFirst({ where: { tenantId, tokenId: t.id, at: { lte: at } }, orderBy: { at: "desc" }, select: { at: true } });
  return { key: "token", found: true, campaignId: t.reward.campaignId, athleteId: t.athleteId, inWindow: inWindow(at, last?.at, lookbackDays) };
}

async function clickHit(db: Db, tenantId: string, code: string, at: Date, lookbackDays: number): Promise<KeyHit> {
  const l = await db.trackingLink.findFirst({
    where: { tenantId, code },
    select: { id: true, deliverable: { select: { order: { select: { campaignId: true, athleteId: true } } } } },
  });
  if (!l) return { key: "click_id", found: false };
  const last = await db.linkEvent.findFirst({ where: { tenantId, linkId: l.id, at: { lte: at } }, orderBy: { at: "desc" }, select: { at: true } });
  return { key: "click_id", found: true, campaignId: l.deliverable.order.campaignId, athleteId: l.deliverable.order.athleteId, inWindow: inWindow(at, last?.at, lookbackDays) };
}

async function orderHit(db: Db, ctx: MatchContext, orderId: string): Promise<KeyHit> {
  const inBatch = ctx.batchOrders?.get(orderId);
  if (inBatch) return { key: "order_id", found: true, campaignId: inBatch.campaignId, athleteId: inBatch.athleteId, inWindow: true, basis: inBatch.basis };
  const s = await db.partnerSaleAttribution.findFirst({
    where: { tenantId: ctx.tenantId, partnerId: ctx.partnerId, orderId, kind: "sale", status: "matched", ...(ctx.selfId ? { id: { not: ctx.selfId } } : {}) },
    orderBy: { occurredAt: "asc" },
    select: { campaignId: true, athleteId: true, method: true, confidence: true, modelVersion: true },
  });
  if (!s?.campaignId) return { key: "order_id", found: false };
  return { key: "order_id", found: true, campaignId: s.campaignId, athleteId: s.athleteId, inWindow: true, basis: basisOfRow(s) };
}

function basisOfRow(s: { method: string | null; confidence: number | null; modelVersion: string | null }): Basis {
  return s.method === "probabilistic" && s.modelVersion && s.confidence !== null
    ? { class: "MODELLED", method: "probabilistic", matchKey: null, confidence: s.confidence, modelVersion: s.modelVersion }
    : { class: "VERIFIED_TRANSACTION", method: "deterministic", matchKey: "order_id", confidence: 1, modelVersion: null };
}

/** Campaigns whose rewards were redeemed in this US state inside the window, with how often. */
async function stateCandidates(db: Db, tenantId: string, stateCode: string, at: Date, lookbackDays: number) {
  const rows = await db.$queryRawUnsafe<Array<{ campaignId: string; n: bigint }>>(
    /* tenant-scope: explicit — this tenant's redemptions of rewards handed out in one state. */
    `SELECT r."campaignId", count(*) AS n
       FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId" JOIN "Reward" r ON r.id = t."rewardId"
      WHERE e."tenantId" = $1 AND e.type = 'REDEEM' AND r."venueStateCode" = $2 AND e.at > $3 AND e.at <= $4
      GROUP BY 1`,
    tenantId, stateCode, new Date(at.getTime() - lookbackDays * DAY_MS), at,
  );
  return rows.map((r) => ({ campaignId: r.campaignId, redemptions: Number(r.n) }));
}

/** Match one partner event: exact keys first, then — only if allowed and nothing matched — the model. */
export async function matchEvent(db: Db, ctx: MatchContext, ev: Pick<PartnerEvent, "occurredAt" | "keys" | "stateCode">): Promise<Outcome> {
  const at = new Date(ev.occurredAt);
  const lookback = ctx.adapter.lookbackDays;
  const hits: KeyHit[] = [];
  if (ev.keys.token) hits.push(await tokenHit(db, ctx.tenantId, ev.keys.token, at, lookback));
  if (ev.keys.click_id) hits.push(await clickHit(db, ctx.tenantId, ev.keys.click_id, at, lookback));
  if (ev.keys.order_id) hits.push(await orderHit(db, ctx, ev.keys.order_id));
  const exact = exactOutcome(hits);
  const mayModel = ctx.adapter.methods.includes("probabilistic") && !!ctx.model && !!ev.stateCode
    && exact.status === "unmatched" && (exact.reason === "no_match" || exact.reason === "unknown_token");
  const modelled = mayModel ? modelledOutcome(await stateCandidates(db, ctx.tenantId, ev.stateCode!, at, lookback), ctx.model!) : null;
  return decide(exact, modelled);
}

/** The `attribution` model, loaded only for an adapter that may use it. */
export const modelFor = (db: Db, tenantId: string, adapter: AttributionAdapter) =>
  adapter.methods.includes("probabilistic") ? activeModel(db, tenantId, "attribution") : Promise.resolve(null);

/* ───────────────────────────── the nightly retry ───────────────────────────── */

/** How far back the nightly retry looks. Older unmatched sales stay in the queue, untouched. */
export const REMATCH_DAYS = 90;

/**
 * Retry the queue: a refund that arrived before its sale, a click recorded
 * late. Oldest sale first, so a sale is matched before the refunds that
 * follow it. Tenants with `attribution` switched off are skipped.
 */
export async function rematchQueue(db: PrismaClient, now = new Date()) {
  const skip = await tenantsWithout(db, "attribution");
  const rows = await db.partnerSaleAttribution.findMany({
    /* tenant-scope: every tenant's queue — the worker's nightly retry, never a request; each row is matched within its own tenant. */
    where: { status: "unmatched", receivedAt: { gte: new Date(now.getTime() - REMATCH_DAYS * DAY_MS) }, ...(skip.length ? { tenantId: { notIn: skip } } : {}) },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: 5000,
    select: { id: true, tenantId: true, partnerId: true, adapter: true, occurredAt: true, keys: true, stateCode: true, reason: true, candidates: true },
  });
  const models = new Map<string, ActiveModel | null>();
  let matched = 0;
  for (const r of rows) {
    const adapter = adapterFor(r.adapter);
    if (!adapter) continue;
    const mk = `${r.tenantId}|${adapter.key}`;
    if (!models.has(mk)) models.set(mk, await modelFor(db, r.tenantId, adapter));
    const o = await matchEvent(db, { tenantId: r.tenantId, partnerId: r.partnerId, adapter, model: models.get(mk)!, selfId: r.id }, {
      occurredAt: r.occurredAt.toISOString(), keys: r.keys as PartnerEvent["keys"], stateCode: r.stateCode,
    });
    if (o.status === "unmatched" && o.reason === r.reason && o.candidates === r.candidates) continue;
    /* Only a row still in the queue: one dismissed meanwhile is left as it is. */
    const n = await db.partnerSaleAttribution.updateMany({ where: { id: r.id, tenantId: r.tenantId, status: "unmatched" }, data: columnsOf(o, now) });
    if (o.status === "matched") matched += n.count;
  }
  return { checked: rows.length, matched, skipped: skip };
}

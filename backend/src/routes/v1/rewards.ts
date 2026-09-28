/**
 * /api/v1 — the fan funnel and tracking links (P6-BE-01…04, P6-BE-07).
 *
 * TWO SURFACES IN ONE FILE, AND THE SPLIT IS THE POINT.
 *
 * The **staff** routes below carry `requireActor` and are scoped by §15 as
 * usual. The **public** routes carry no auth at all, because §16's whole
 * design is that a fan scans a QR at a stall and is never asked to log in.
 * They are declared together and grouped explicitly so that the unauthenticated
 * set is a short, readable list rather than something you discover by noticing
 * a missing middleware — a public route buried among protected ones is how one
 * accidentally loses its auth.
 *
 * WHY REDEMPTION IS PUBLIC TOO. There is no MERCHANT role in §15, and there
 * should not be: the person at the till is not a SponsorX user. Possession of
 * the token IS the entitlement, exactly as with a paper voucher — which is why
 * tokens are 160 bits of randomness and never the record id. The protection
 * against abuse is unguessability plus rate limiting, not a login.
 *
 * No business rule lives here. The state guards, the expiry check and the
 * single-use index are all in `domain/reward.ts`.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { can, whereFor } from "../../auth/scope";
import { ForbiddenError } from "../../auth/errors";
import { prisma } from "../../db/client";
import { presignPrivateDownload } from "../../lib/storage";
import { CONSENT_TEXT, CURRENT_CONSENT_VERSION } from "../../domain/fan-consent";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import {
  RewardClaimInput,
  RewardInput,
  RewardTokenInput,
  RewardTransitionInput,
  TrackingLinkInput,
} from "../../contracts/reward";
import {
  createReward,
  issueRewardToken,
  recordClaim,
  recordLanding,
  recordScan,
  redeemToken,
  rewardFunnel,
  transitionReward,
  viewToken,
  withdrawFanConsent,
} from "../../domain/reward";
import {
  clicksForLink,
  codesForCampaign,
  createTrackingLink,
  recordClick,
  resolveCode,
} from "../../domain/tracking";
import { campaignLeads } from "../../domain/fan-leads";

export const rewardsRouter = Router();

/* ── staff ──────────────────────────────────────────────────────────────── */

/** GET /campaigns/:id/leads — fans who ticked "the sponsor may contact me"
 *  (2S6-BE-03). The only route that returns a fan's address, and only those. */
const leads: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ leads: await campaignLeads(req.actor!, req.params.id) });
};

/** POST /campaigns/:id/rewards — create the offer. Always lands in DRAFT. */
const addReward: RequestHandler<{ id: string }> = async (req, res) => {
  const body = RewardInput.parse(req.body ?? {});
  res.status(201).json(
    await createReward(req.actor!, {
      campaignId: req.params.id,
      offerText: body.offerText,
      terms: body.terms,
      expiresAt: new Date(body.expiresAt),
      singleUse: body.singleUse,
      eligibility: body.eligibility,
      redemptionCap: body.redemptionCap,
      landingHeadline: body.landingHeadline,
      landingSubhead: body.landingSubhead,
    }),
  );
};

/** POST /rewards/:id/transition — activate, pause, expire, archive. */
const moveReward: RequestHandler<{ id: string }> = async (req, res) => {
  const { to } = RewardTransitionInput.parse(req.body ?? {});
  res.json(await transitionReward(req.actor!, req.params.id, to));
};

/** POST /rewards/:id/tokens — issue one QR token, optionally per athlete. */
const addToken: RequestHandler<{ id: string }> = async (req, res) => {
  const body = RewardTokenInput.parse(req.body ?? {});
  res.status(201).json(
    await issueRewardToken(req.actor!, req.params.id, body.athleteId ?? null),
  );
};

/** GET /rewards/:id/funnel — all four counts, never one. */
const funnel: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await rewardFunnel(req.actor!, req.params.id));
};

/** POST /deliverables/:id/tracking-link — one link per deliverable. */
const addTrackingLink: RequestHandler<{ id: string }> = async (req, res) => {
  const { destinationUrl } = TrackingLinkInput.parse(req.body ?? {});
  res.status(201).json(
    await createTrackingLink(req.actor!, req.params.id, destinationUrl),
  );
};

/** GET /campaigns/:id/tracking-codes — every athlete's code and clicks. */
const campaignCodes: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ codes: await codesForCampaign(req.actor!, req.params.id) });
};

/** GET /tracking-links/:id/clicks — one link's count. */
const linkClicks: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await clicksForLink(req.actor!, req.params.id));
};

/* ── public · no login, §16 ─────────────────────────────────────────────── */

/**
 * GET /public/tracking/:code — resolve a short code to its destination.
 *
 * READ ONLY. The click is recorded by the separate endpoint below, called
 * after the redirect has already gone out, so the fan never waits on a write.
 * The response deliberately carries the destination and nothing else.
 */
const resolveTracking: RequestHandler<{ code: string }> = async (req, res) => {
  await limit("track:resolve", clientIp(req), 120, 60);
  const link = await resolveCode(req.params.code);
  /* Belt and braces for rows written before the input was restricted to
     http(s): a stored `javascript:` or `data:` destination is never handed
     to a public redirect (P8-SEC-03). */
  if (!/^https?:\/\//i.test(link.destinationUrl)) {
    res.status(404).json({ error: { code: "not_found" } });
    return;
  }
  res.json({ destinationUrl: link.destinationUrl });
};

/**
 * POST /public/tracking/:code/click — record a click.
 *
 * The caller here is normally the Next server, not the fan, because the
 * redirect route calls this from its after-response hook. So `req.ip` is that
 * server and the fan's address arrives on `x-sponsorx-client-ip`.
 *
 * THAT HEADER IS ANALYTICS-GRADE, NOT TRUST-GRADE. This endpoint is publicly
 * reachable, so anyone can set it and claim to be clicking from anywhere. The
 * consequence is a wrong city on a click event — a polluted chart, not a
 * crossed permission boundary — and no authorisation decision anywhere reads
 * it. P6-BE-05 owns geo resolution and can tighten this if the number ever
 * needs to be defensible. Recorded here rather than left implicit so the
 * choice is visible to whoever picks that task up.
 *
 * Either way the address goes into the job payload and into no column: the
 * worker turns it into city and region and discards it (§26).
 */
const trackClick: RequestHandler<{ code: string }> = async (req, res) => {
  await limit("track:click", clientIp(req), 120, 60);
  const link = await resolveCode(req.params.code);
  /* The fan's address only when the web server vouches for it with the edge
     key (P8-SEC-03) — anyone can SET the header, so on its own it no longer
     decides anything, not even a city on a chart. */
  await recordClick(link.linkId, link.tenantId, clientIp(req) ?? null);
  res.status(202).json({ recorded: true });
};

/**
 * GET /public/rewards/:token — what the fan's page shows (P6-FE-02).
 *
 * Read only: writes no event. An unknown token answers 404 with a state the
 * page can render, rather than an error body it would have to interpret.
 */
const view: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:view", clientIp(req), 120, 60);
  const out = await viewToken(req.params.token);
  res.status(out.state === "UNKNOWN" ? 404 : 200).json(out);
};

/** POST /public/rewards/:token/scan — the QR resolved. */
const scan: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:scan", clientIp(req), 60, 60);
  res.status(201).json(await recordScan(req.params.token));
};

/** POST /public/rewards/:token/landing — the page rendered. */
const landing: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:landing", clientIp(req), 60, 60);
  res.status(201).json(await recordLanding(req.params.token));
};

/** POST /public/rewards/:token/claim — the fan accepted the offer. */
const claim: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:claim", clientIp(req), 20, 60);
  const body = RewardClaimInput.parse(req.body ?? {});
  res.status(201).json(
    await recordClaim(
      req.params.token,
      body.fanEmail ?? null,
      new Date(),
      body.consent ?? null,
      body.sponsorContact ?? null,
    ),
  );
};

/**
 * POST /public/rewards/:token/redeem — the merchant redeems at the till.
 *
 * A second concurrent call on the same token loses the unique-index race and
 * comes back 409 `AlreadyRedeemedError`. That is the intended behaviour, not
 * an error path to smooth over.
 */
const redeem: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:redeem", clientIp(req), 20, 60);
  res.status(201).json(await redeemToken(req.params.token));
};

/**
 * POST /public/unsubscribe/:token — the fan withdraws consent (P6-SEC-03).
 *
 * No login, by design: the signed token IS the authorisation. Reached from
 * the web app's /u/:token page and from mail clients' one-click
 * List-Unsubscribe POST, both of which land here through the web server.
 */
const unsubscribe: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("fan:unsubscribe", clientIp(req), 30, 60);
  res.status(200).json(await withdrawFanConsent(req.params.token));
};

/* Staff — authenticated. */
/* --- reads (P6-FE-01 / P6-FE-03) ------------------------------------------

   The reward desk had create, transition, token and a per-reward funnel —
   and no way to list what exists. These are the reads, scoped by the matrix.

   Funnel counts come from RewardEvent grouped by token and type: four
   separate event kinds (P6-BE-03), never one counter. They ride only for a
   caller who may read reward events. A token's STRING is the fan's link to
   claim and redeem, so it is returned only to roles that write rewards
   (BTG) — they print it; nobody else needs it. */

type EventType = "SCAN" | "LANDING" | "CLAIM" | "REDEEM";

async function funnelsFor(actor: Parameters<typeof can>[0], tokenToReward: Map<string, string>) {
  const out = new Map<string, Record<EventType, number>>();
  if (!can(actor, "rewardEvent", "read") || tokenToReward.size === 0) return out;
  const grouped = await prisma.rewardEvent.groupBy({
    by: ["tokenId", "type"],
    /* The caller's OWN event scope, not just the reward's: an athlete may
       read their own token's events, never another athlete's on the same
       reward. */
    where: { ...whereFor(actor, "rewardEvent", "read"), tokenId: { in: [...tokenToReward.keys()] } },
    _count: { _all: true },
  });
  for (const g of grouped) {
    const rewardId = tokenToReward.get(g.tokenId)!;
    const c = out.get(rewardId) ?? { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 };
    c[g.type as EventType] += g._count._all;
    out.set(rewardId, c);
  }
  return out;
}

const REWARD_SELECT = {
  id: true, offerText: true, terms: true, singleUse: true, expiresAt: true, state: true,
  campaign: { select: { id: true, name: true, endDate: true, sponsor: { select: { name: true } } } },
  tokens: {
    select: {
      id: true, token: true, qrKey: true,
      athlete: { select: { id: true, displayName: true } },
    },
  },
} as const;

type RewardRow = {
  id: string; offerText: string; terms: string; singleUse: boolean; expiresAt: Date; state: string;
  campaign: { id: string; name: string; endDate: Date; sponsor: { name: string } };
  tokens: { id: string; token: string; qrKey: string | null; athlete: { id: string; displayName: string } | null }[];
};

function rewardOut(r: RewardRow, funnel: Record<string, number> | undefined, withTokens: boolean, printable: boolean) {
  return {
    id: r.id,
    offerText: r.offerText,
    terms: r.terms,
    singleUse: r.singleUse,
    expiresAt: r.expiresAt.toISOString(),
    state: r.state,
    campaign: { id: r.campaign.id, name: r.campaign.name, sponsorName: r.campaign.sponsor.name, endDate: r.campaign.endDate.toISOString() },
    athletes: new Set(r.tokens.map((t) => t.athlete?.id).filter(Boolean)).size,
    tokenCount: r.tokens.length,
    ...(funnel ? { funnel } : {}),
    ...(withTokens
      ? {
          tokens: r.tokens.map((t) => ({
            id: t.id,
            athlete: t.athlete,
            qrReady: t.qrKey !== null,
            ...(printable ? { token: t.token } : {}),
          })),
        }
      : {}),
  };
}

/** GET /rewards — `?campaignId=` narrows; newest expiry last. */
const listRewards: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const rows = (await prisma.reward.findMany({
    where: { ...whereFor(actor, "reward", "read"), ...(campaignId ? { campaignId } : {}) },
    select: REWARD_SELECT,
    orderBy: { expiresAt: "desc" },
    take: 200,
  })) as RewardRow[];
  const tokenToReward = new Map(rows.flatMap((r) => r.tokens.map((t) => [t.id, r.id] as const)));
  const funnels = await funnelsFor(actor, tokenToReward);
  res.json({
    rewards: rows.map((r) => rewardOut(r, funnels.get(r.id) ?? (can(actor, "rewardEvent", "read") ? { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 } : undefined), false, false)),
    /* The one consent line every fan page shows — versioned centrally
       (fan-consent.ts, P6-SEC-01), deliberately not per reward. */
    consent: { version: CURRENT_CONSENT_VERSION, text: CONSENT_TEXT[CURRENT_CONSENT_VERSION] },
  });
};

/** GET /rewards/:id — one reward, with its tokens (strings for BTG only). */
const readReward: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const r = (await prisma.reward.findFirst({
    where: { ...whereFor(actor, "reward", "read"), id: req.params.id },
    select: REWARD_SELECT,
  })) as RewardRow | null;
  if (!r) throw new ForbiddenError("reward", "read");
  const funnels = await funnelsFor(actor, new Map(r.tokens.map((t) => [t.id, r.id])));
  res.json({
    ...rewardOut(r, funnels.get(r.id) ?? { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 }, true, can(actor, "reward", "write")),
    consent: { version: CURRENT_CONSENT_VERSION, text: CONSENT_TEXT[CURRENT_CONSENT_VERSION] },
  });
};

/**
 * GET /reward-tokens/:id/qr-url — a short-lived signed read of the token's
 * QR PNG (P6-BE-06 wrote it to the private bucket). Audited by
 * presignPrivateDownload. 404-shaped refusal until the worker has made it.
 */
const tokenQrUrl: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  if (!can(actor, "reward", "write")) throw new ForbiddenError("reward", "write");
  const t = await prisma.rewardToken.findFirst({
    where: { id: req.params.id, reward: whereFor(actor, "reward", "write") },
    select: { id: true, qrKey: true },
  });
  if (!t || !t.qrKey) throw new ForbiddenError("reward", "read");
  const url = await presignPrivateDownload(actor, t.qrKey, { entity: "RewardToken", entityId: t.id });
  res.json({ url });
};

rewardsRouter.get("/rewards", requireActor, listRewards);
rewardsRouter.get("/rewards/:id", requireActor, readReward);
rewardsRouter.get("/reward-tokens/:id/qr-url", requireActor, tokenQrUrl);
rewardsRouter.post("/campaigns/:id/rewards", requireActor, addReward);
rewardsRouter.post("/rewards/:id/transition", requireActor, moveReward);
rewardsRouter.post("/rewards/:id/tokens", requireActor, addToken);
rewardsRouter.get("/rewards/:id/funnel", requireActor, funnel);
rewardsRouter.post("/deliverables/:id/tracking-link", requireActor, addTrackingLink);
rewardsRouter.get("/campaigns/:id/tracking-codes", requireActor, campaignCodes);
rewardsRouter.get("/campaigns/:id/leads", requireActor, leads);
rewardsRouter.get("/tracking-links/:id/clicks", requireActor, linkClicks);

/* Public — no requireActor, deliberately, and all under /public so the
   unauthenticated surface is visible in one glance at the path. */
rewardsRouter.get("/public/tracking/:code", resolveTracking);
rewardsRouter.post("/public/tracking/:code/click", trackClick);
rewardsRouter.get("/public/rewards/:token", view);
rewardsRouter.post("/public/rewards/:token/scan", scan);
rewardsRouter.post("/public/rewards/:token/landing", landing);
rewardsRouter.post("/public/rewards/:token/claim", claim);
rewardsRouter.post("/public/rewards/:token/redeem", redeem);
rewardsRouter.post("/public/unsubscribe/:token", unsubscribe);

export { listRewards, readReward, tokenQrUrl };

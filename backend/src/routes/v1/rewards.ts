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
import { limit } from "../../lib/rate-limit";
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
  withdrawFanConsent,
} from "../../domain/reward";
import {
  clicksForLink,
  codesForCampaign,
  createTrackingLink,
  recordClick,
  resolveCode,
} from "../../domain/tracking";

export const rewardsRouter = Router();

/* ── staff ──────────────────────────────────────────────────────────────── */

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
  await limit("track:resolve", req.ip, 120, 60);
  const link = await resolveCode(req.params.code);
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
  await limit("track:click", req.ip, 120, 60);
  const forwarded = req.get("x-sponsorx-client-ip");
  const link = await resolveCode(req.params.code);
  await recordClick(link.linkId, link.tenantId, forwarded || req.ip || null);
  res.status(202).json({ recorded: true });
};

/** POST /public/rewards/:token/scan — the QR resolved. */
const scan: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:scan", req.ip, 60, 60);
  res.status(201).json(await recordScan(req.params.token));
};

/** POST /public/rewards/:token/landing — the page rendered. */
const landing: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:landing", req.ip, 60, 60);
  res.status(201).json(await recordLanding(req.params.token));
};

/** POST /public/rewards/:token/claim — the fan accepted the offer. */
const claim: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("reward:claim", req.ip, 20, 60);
  const body = RewardClaimInput.parse(req.body ?? {});
  res.status(201).json(
    await recordClaim(
      req.params.token,
      body.fanEmail ?? null,
      new Date(),
      body.consent ?? null,
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
  await limit("reward:redeem", req.ip, 20, 60);
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
  await limit("fan:unsubscribe", req.ip, 30, 60);
  res.status(200).json(await withdrawFanConsent(req.params.token));
};

/* Staff — authenticated. */
rewardsRouter.post("/campaigns/:id/rewards", requireActor, addReward);
rewardsRouter.post("/rewards/:id/transition", requireActor, moveReward);
rewardsRouter.post("/rewards/:id/tokens", requireActor, addToken);
rewardsRouter.get("/rewards/:id/funnel", requireActor, funnel);
rewardsRouter.post("/deliverables/:id/tracking-link", requireActor, addTrackingLink);
rewardsRouter.get("/campaigns/:id/tracking-codes", requireActor, campaignCodes);
rewardsRouter.get("/tracking-links/:id/clicks", requireActor, linkClicks);

/* Public — no requireActor, deliberately, and all under /public so the
   unauthenticated surface is visible in one glance at the path. */
rewardsRouter.get("/public/tracking/:code", resolveTracking);
rewardsRouter.post("/public/tracking/:code/click", trackClick);
rewardsRouter.post("/public/rewards/:token/scan", scan);
rewardsRouter.post("/public/rewards/:token/landing", landing);
rewardsRouter.post("/public/rewards/:token/claim", claim);
rewardsRouter.post("/public/rewards/:token/redeem", redeem);
rewardsRouter.post("/public/unsubscribe/:token", unsubscribe);

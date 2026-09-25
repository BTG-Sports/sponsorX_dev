/**
 * /api/v1 — SponsorX NEXT rights, featured athletes and the DMV pool
 * (P9-BE-10, -11, -14).
 *
 * Staff and the school's advisor reach these by matrix §15.3 scopes. The two
 * PUBLIC routes — a featured athlete's profile and the "that's me" claim —
 * are grouped at the bottom and rate-limited.
 *
 * No business rule lives here; see domain/content-rights.ts, featured.ts and
 * dmv-pools.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import {
  AssetCampaignInput,
  ClaimInput,
  ContentRightInput,
  ContributionInput,
  EditionAssetInput,
  FeaturedAthleteInput,
  RosterInput,
  SubjectConsentInput,
} from "../../contracts/rights";
import {
  addEditionAsset,
  grantRight,
  listAssets,
  recordSubjectConsent,
  useAssetInCampaign,
} from "../../domain/content-rights";
import {
  addRosterEntries,
  createFeaturedAthlete,
  listClaims,
  publicProfile,
  rejectClaim,
  submitClaim,
  verifyClaim,
} from "../../domain/featured";
import { recordContribution, schoolPools, type ContributionKind } from "../../domain/dmv-pools";

export const rightsRouter = Router();

const toDate = (d: string | null | undefined) => (d ? new Date(d) : null);

/* ── staff and advisor ─────────────────────────────────────────────────── */

const newAsset: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await addEditionAsset(req.actor!, req.params.id, EditionAssetInput.parse(req.body)));
};
const assets: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ assets: await listAssets(req.actor!, req.params.id) });
};
const grant: RequestHandler<{ id: string }> = async (req, res) => {
  const b = ContentRightInput.parse(req.body);
  res.status(201).json(await grantRight(req.actor!, req.params.id, { ...b, startsAt: new Date(b.startsAt), endsAt: toDate(b.endsAt) }));
};
const useInCampaign: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await useAssetInCampaign(req.actor!, req.params.id, AssetCampaignInput.parse(req.body).campaignId));
};
const consent: RequestHandler = async (req, res) => {
  res.status(201).json(await recordSubjectConsent(req.actor!, {
    ...SubjectConsentInput.parse(req.body), ip: clientIp(req) ?? "unknown", userAgent: req.get("user-agent") ?? "unknown",
  }));
};
const feature: RequestHandler = async (req, res) => {
  res.status(201).json(await createFeaturedAthlete(req.actor!, FeaturedAthleteInput.parse(req.body)));
};
const claims: RequestHandler = async (req, res) => {
  res.json({ claims: await listClaims(req.actor!) });
};
const verify: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await verifyClaim(req.actor!, req.params.id));
};
const reject: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await rejectClaim(req.actor!, req.params.id));
};
const roster: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await addRosterEntries(req.actor!, req.params.id, RosterInput.parse(req.body).entries));
};
const contribute: RequestHandler<{ id: string }> = async (req, res) => {
  const b = ContributionInput.parse(req.body);
  res.status(201).json(await recordContribution(req.actor!, req.params.id, { ...b, kind: b.kind as ContributionKind }));
};
const pools: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ pools: await schoolPools(req.actor!, req.params.id) });
};

rightsRouter.post("/editions/:id/assets", requireActor, newAsset);
rightsRouter.get("/editions/:id/assets", requireActor, assets);
rightsRouter.post("/edition-assets/:id/rights", requireActor, grant);
rightsRouter.post("/edition-assets/:id/campaign", requireActor, useInCampaign);
rightsRouter.post("/consents", requireActor, consent);
rightsRouter.post("/featured-athletes", requireActor, feature);
rightsRouter.get("/claims", requireActor, claims);
rightsRouter.post("/claims/:id/verify", requireActor, verify);
rightsRouter.post("/claims/:id/reject", requireActor, reject);
rightsRouter.post("/properties/:id/roster", requireActor, roster);
rightsRouter.post("/editions/:id/contributions", requireActor, contribute);
rightsRouter.get("/editions/:id/school-pools", requireActor, pools);

/* ── public ─────────────────────────────────────────────────────────────── */

/** GET /public/athletes/:slug — a featured or active athlete's public page. */
const profile: RequestHandler<{ slug: string }> = async (req, res) => {
  await limit("athlete:profile", clientIp(req), 120, 60);
  res.json(await publicProfile(req.params.slug));
};

/** POST /public/athletes/:slug/claim — "that's me". */
const claim: RequestHandler<{ slug: string }> = async (req, res) => {
  await limit("athlete:claim", clientIp(req), 5, 3600);
  const b = ClaimInput.parse(req.body);
  res.status(201).json(await submitClaim(req.params.slug, { ...b, birthDate: toDate(b.birthDate) }));
};

rightsRouter.get("/public/athletes/:slug", profile);
rightsRouter.post("/public/athletes/:slug/claim", claim);

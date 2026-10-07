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
import { assertAllowed, can, whereFor } from "../../auth/scope";
import { ForbiddenError } from "../../auth/errors";
import { prisma } from "../../db/client";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import { allowedList, pageRequest } from "../../lib/paging";
import {
  AssetCampaignInput,
  ClaimConfirmInput,
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
  rightsGap,
  recordSubjectConsent,
  useAssetInCampaign,
} from "../../domain/content-rights";
import {
  addRosterEntries,
  CLAIM_STATES,
  createFeaturedAthlete,
  listClaims,
  listClaimsPage,
  publicProfile,
  rejectClaim,
  submitClaim,
  confirmClaimEmail,
  confirmClaimFromLink,
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
/** GET /editions/:id/rights-ledger — P9-FE-09. Every asset with its grants
 *  and their evidence, and which assets the production gate would refuse:
 *  the DIGITAL gap on the publish target and the PRINT gap on the print date
 *  (or today), asked through `rightsGap` — the same query the transition
 *  runs, so the screen and the gate cannot disagree. */
const rightsLedger: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  assertAllowed(actor, "editionAsset", "read");
  const edition = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "read"), id: req.params.id },
    select: { id: true, label: true, state: true, publishTarget: true, printDate: true },
  });
  if (!edition) throw new ForbiddenError("edition", "read");
  const readsRights = can(actor, "contentRight", "read");
  const [rows, digital, print] = await Promise.all([
    prisma.editionAsset.findMany({
      where: { ...whereFor(actor, "editionAsset", "read"), editionId: edition.id },
      select: {
        id: true, kind: true, title: true, sourceKind: true, studentId: true, athleteId: true, campaignId: true, createdAt: true,
        ...(readsRights
          ? {
              rights: {
                where: whereFor(actor, "contentRight", "read"),
                select: {
                  id: true, grantorKind: true, grantorRef: true, mayPublishDigital: true, mayPublishPrint: true,
                  mayPromote: true, mayReuseCommercially: true, territory: true, startsAt: true, endsAt: true,
                  attribution: true, acceptanceId: true, licenseRef: true,
                  /* P9-BE-22, -23 — "Recorded automatically", and on what. */
                  autoBasis: true,
                },
                orderBy: { startsAt: "asc" as const },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    /* tenant-scope: the edition was scoped by whereFor(edition) above */
    rightsGap(prisma, actor.tenantId, edition.id, "DIGITAL", edition.publishTarget),
    rightsGap(prisma, actor.tenantId, edition.id, "PRINT", edition.printDate ?? new Date()),
  ]);
  const noDigital = new Set(digital.map((a) => a.id));
  const noPrint = new Set(print.map((a) => a.id));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  res.json({
    edition: { ...edition, publishTarget: edition.publishTarget.toISOString(), printDate: iso(edition.printDate) },
    assets: rows.map((a) => ({
      id: a.id, kind: a.kind, title: a.title, sourceKind: a.sourceKind,
      studentId: a.studentId, athleteId: a.athleteId, campaignId: a.campaignId,
      clearedDigital: !noDigital.has(a.id),
      clearedPrint: !noPrint.has(a.id),
      ...("rights" in a
        ? {
            rights: (a.rights as Array<{ startsAt: Date; endsAt: Date | null } & Record<string, unknown>>).map((r) => ({
              ...r, startsAt: r.startsAt.toISOString(), endsAt: iso(r.endsAt),
            })),
          }
        : {}),
    })),
  });
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
/** GET /claims — the claims in the caller's scope (an advisor: their school's),
 *  each with the claimed profile's PUBLIC fields — the name, slug and sport
 *  the public page already shows (P9-FE-08). An advisor holds no athlete
 *  read; this is not one: nothing private about the athlete is added. */
const claims: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  /* ?page= turns on paged mode (2026-09-29): one page, ?state= narrows it,
     and `summary` carries the open/all counts. Without it: every claim. */
  const query = (req.query ?? {}) as Record<string, unknown>;
  const pr = pageRequest(query);
  const paged = pr ? await listClaimsPage(actor, pr, { states: allowedList(query.state, CLAIM_STATES) }) : null;
  const rows = paged ? paged.claims : await listClaims(actor);
  const ids = [...new Set(rows.map((c) => c.athleteId))];
  const profiles = ids.length
    ? await prisma.athlete.findMany({
        /* tenant-scope: athletes reached through claims already scoped by whereFor(athleteClaim); public-profile fields only. */
        where: { tenantId: actor.tenantId, id: { in: ids } },
        select: { id: true, displayName: true, slug: true, sport: true, state: true },
      })
    : [];
  const by = new Map(profiles.map((p) => [p.id, p]));
  const joined = rows.map((c) => {
    const p = by.get(c.athleteId);
    return { ...c, athlete: p ? { displayName: p.displayName, slug: p.slug, sport: p.sport, state: p.state } : null };
  });
  res.json(paged ? { claims: joined, page: paged.page, summary: paged.summary } : { claims: joined });
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
rightsRouter.get("/editions/:id/rights-ledger", requireActor, rightsLedger);
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

/** GET /public/athlete-claims/confirm?t= — the emailed link, clicked
 *  (2S8-PMO-02). The web app forwards this path here; the answer is a
 *  redirect to the public profile with a `claim=` flag. */
const confirmFromLink: RequestHandler = async (req, res) => {
  await limit("athlete:claimConfirm", clientIp(req), 30, 3600);
  const t = typeof req.query.t === "string" ? req.query.t : "";
  res.redirect(302, await confirmClaimFromLink(t));
};

/** POST /public/athlete-claims/confirm-email — the same, as JSON, for a page that calls it. */
const confirmEmail: RequestHandler = async (req, res) => {
  await limit("athlete:claimConfirm", clientIp(req), 30, 3600);
  const r = await confirmClaimEmail(ClaimConfirmInput.parse(req.body).token);
  res.json({ state: r.state, slug: r.slug });
};

rightsRouter.get("/public/athletes/:slug", profile);
rightsRouter.post("/public/athletes/:slug/claim", claim);
rightsRouter.get("/public/athlete-claims/confirm", confirmFromLink);
rightsRouter.post("/public/athlete-claims/confirm-email", confirmEmail);
export { rightsLedger };
export { claims };

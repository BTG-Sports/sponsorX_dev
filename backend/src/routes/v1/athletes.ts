/**
 * /api/v1/athletes — the athlete's own profile (P3-FE-03, §11, §24).
 *
 * One endpoint, deliberately: `GET /athletes/me` answers "what does MY
 * profile hold", which is what the portal's profile page and its §11
 * completion meter render. It is not a general athlete browse — sponsors
 * meet athletes through the marketplace and matching, never by listing the
 * network (§15), so no collection route exists to be scoped wrong.
 *
 * The §11 sections are answered as DATA, not as a computed percentage: which
 * fields are filled, how many social rows, how many confirmed rates, how many
 * signed agreements. The meter's arithmetic lives in the frontend beside the
 * section definitions it renders (§24) — putting a "72%" here would freeze
 * §11's section list into the API contract for no consumer but one screen.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { ForbiddenError } from "../../auth/errors";
import { whereFor } from "../../auth/scope";
import { prisma } from "../../db/client";
import { ProfileChangeInput } from "../../contracts/profile-change";
import { myProfileChanges, submitProfileChange } from "../../domain/athlete-profile-change";

export const athletesRouter = Router();

export const getMyProfile: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  /* "Me" requires there to be a me: a BTG admin or sponsor holds no athlete
     row, and answering them with SOME athlete would be worse than refusing.
     The scope still applies on top — a suspended link matches nothing. */
  if (!actor.athleteId) throw new ForbiddenError("athlete", "read");

  const row = await prisma.athlete.findFirst({
    where: { ...whereFor(actor, "athlete", "read"), id: actor.athleteId },
    select: {
      id: true,
      slug: true,
      displayName: true,
      legalName: true,
      city: true,
      stateCode: true,
      sport: true,
      position: true,
      school: true,
      level: true,
      gradYear: true,
      achievements: true,
      state: true,
      tier: true,
      contentCapabilities: true,
      brandInterests: true,
      /* Private §26 sections — own scope makes this the athlete themselves. */
      restrictedCategories: true,
      restrictionNotes: true,
      socials: {
        select: {
          platform: true,
          handle: true,
          followers: true,
          avgViews: true,
          source: true,
        },
      },
      /* Counts, not contents: the meter asks "is this section done", and the
         rate card's own screen is P3-FE-04's. */
      _count: { select: { rates: true } },
    },
  });
  if (!row) throw new ForbiddenError("athlete", "read");

  const agreementsSigned = await prisma.agreementAcceptance.count({
    where: { tenantId: actor.tenantId, userId: actor.userId },
  });

  const { _count, ...profile } = row;
  res.json({
    ...profile,
    ratesConfirmed: _count.rates,
    agreementsSigned,
  });
};

/* P3-BE-16 — post-approval edits. `me/profile-changes` is the athlete's own
   history (the editor's pending banner and last decision); the POST is
   scoped through athlete.write, so the id can only be their own row (or a
   guardian's ward). */
export const getMyProfileChanges: RequestHandler = async (req, res) => {
  res.json({ changes: await myProfileChanges(req.actor!) });
};

export const postProfileChange: RequestHandler<{ id: string }> = async (req, res) => {
  const input = ProfileChangeInput.parse(req.body ?? {});
  res.status(201).json(await submitProfileChange(req.actor!, req.params.id, input));
};

athletesRouter.get("/me", requireActor, getMyProfile);
athletesRouter.get("/me/profile-changes", requireActor, getMyProfileChanges);
athletesRouter.post("/:id/profile-changes", requireActor, postProfileChange);

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

athletesRouter.get("/me", requireActor, getMyProfile);

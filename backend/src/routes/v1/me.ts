/**
 * GET /api/v1/me — who the caller is, as Postgres sees them.
 *
 * The one endpoint the portals need before they can render anything. Clerk
 * tells the Next app that someone is signed in; this tells it *who that is
 * here* — the tenant, the roles, and therefore which workspace they belong in.
 *
 * It exists because authorisation moved to the API (Addendum B). The frontend
 * no longer reads Postgres, so the identity mirror is reached over HTTP like
 * any other data. The mirror's write — claiming a provisioned row on first
 * sign-in — happens inside resolveActor(), which means simply calling this
 * endpoint completes a new user's link.
 */
import { Router } from "express";

import { requireActor } from "../../auth/actor";

export const meRouter = Router();

meRouter.get("/", requireActor, (req, res) => {
  /* `requireActor` has either attached an actor or thrown. */
  const actor = req.actor!;
  res.json({
    userId: actor.userId,
    tenantId: actor.tenantId,
    roles: actor.roles,
    /* The portal needs the sponsor a sponsor user acts for — a brief is
       filed against it (P4-FE-01). Never another sponsor's: it is the
       actor's own link, read from Postgres. */
    sponsorId: actor.sponsorId,
  });
});

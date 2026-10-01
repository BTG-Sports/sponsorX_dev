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
import { NotificationPreferenceInput } from "../../contracts/notification-preferences";
import { listPreferences, setPreference } from "../../domain/notification-preferences";
import { controlView } from "../../domain/guardian-acts";

export const meRouter = Router();

meRouter.get("/", requireActor, async (req, res) => {
  /* `requireActor` has either attached an actor or thrown. */
  const actor = req.actor!;
  res.json({
    /* 2S1-BE-11 — a guardian's minors (and which one this login is acting
       for), or, for a minor's own login, that their guardian acts for them —
       so the portal shows those actions as the guardian's. */
    ...(await controlView(actor)),
    userId: actor.userId,
    tenantId: actor.tenantId,
    /* The login's own roles — a guardian acting for a minor holds the
       ward's athlete cells (actingFor), not the ATHLETE role itself. */
    roles: actor.actingFor ? actor.roles.filter((r) => r !== "ATHLETE") : actor.roles,
    /* The portal needs the sponsor a sponsor user acts for — a brief is
       filed against it (P4-FE-01). Never another sponsor's: it is the
       actor's own link, read from Postgres. */
    sponsorId: actor.sponsorId,
    /* Likewise the property a property manager runs (P9-OPS-01) — the
       school, for a NEXT advisor. Their own link, nobody else's. */
    propertyId: actor.propertyId,
    /* And the student record a NEXT student is (P9-FE-01) — the portal
       reads its own code, sales and points by it. Their own, nobody else's. */
    studentId: actor.studentId ?? null,
  });
});

/* 2S6-BE-02 — the caller's own notification preferences: which events reach
   them on which channel. Always the caller's; there is no id to aim anywhere. */
meRouter.get("/notification-preferences", requireActor, async (req, res) => {
  res.json({ preferences: await listPreferences(req.actor!) });
});
meRouter.put("/notification-preferences", requireActor, async (req, res) => {
  res.json({ preferences: await setPreference(req.actor!, NotificationPreferenceInput.parse(req.body)) });
});

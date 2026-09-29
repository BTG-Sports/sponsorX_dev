/**
 * /api/v1/properties — the property portal's reads (P9-OPS-01, §8), and the
 * public property profile (§9 screen 5, P2-FE-01).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import { getOwnProperty, publicProperty } from "../../domain/property";

export const propertiesRouter = Router();

/** GET /properties/mine — the property this account manages, or 404. */
const mine: RequestHandler = async (req, res) => {
  res.json({ property: await getOwnProperty(req.actor!) });
};

/** GET /public/properties/:slug — the public profile. No actor; same limit
 *  as the public athlete profile it links to. */
const profile: RequestHandler<{ slug: string }> = async (req, res) => {
  await limit("property:profile", clientIp(req), 120, 60);
  res.json({ property: await publicProperty(req.params.slug) });
};

propertiesRouter.get("/properties/mine", requireActor, mine);
propertiesRouter.get("/public/properties/:slug", profile);

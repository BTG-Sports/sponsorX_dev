/**
 * /api/v1/properties — the property portal's reads (P9-OPS-01, §8).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { getOwnProperty } from "../../domain/property";

export const propertiesRouter = Router();

/** GET /properties/mine — the property this account manages, or 404. */
const mine: RequestHandler = async (req, res) => {
  res.json({ property: await getOwnProperty(req.actor!) });
};

propertiesRouter.get("/properties/mine", requireActor, mine);

/**
 * /api/v1/attribution — a partner's deliveries (3S6-BE-01,
 * documentation/SponsorX-Attribution-Framework.md).
 *
 * PUBLIC by necessity: a partner store cannot sign in. Guarded instead by the
 * partner's own token (`Authorization: Bearer …`, checked in constant time
 * against its hash) and a rate limit. Writes one row; never calls out.
 */
import { Router, type RequestHandler } from "express";

import { receiveDelivery } from "../../domain/attribution-intake";
import { limit } from "../../lib/rate-limit";

export const attributionRouter = Router();

/** POST /attribution/partners/:partnerId/events */
const deliver: RequestHandler<{ partnerId: string }> = async (req, res) => {
  await limit("attribution:intake", req.ip, 120, 60);
  res.status(202).json(await receiveDelivery(req.params.partnerId.slice(0, 64), req.get("authorization"), req.body ?? {}));
};

attributionRouter.post("/attribution/partners/:partnerId/events", deliver);

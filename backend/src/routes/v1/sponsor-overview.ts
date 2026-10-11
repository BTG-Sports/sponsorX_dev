/**
 * /api/v1/sponsor/overview — the sponsor's Stadium Board dashboard and the
 * campaign results chart (P1-ART-23). No business rule lives here; see
 * domain/sponsor-overview.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { RANGES, sponsorOverview, type RangeKey } from "../../domain/sponsor-overview";

export const sponsorOverviewRouter = Router();

/** GET /sponsor/overview?range=7d|30d|90d|all&campaignId= — default 30d. */
const overview: RequestHandler = async (req, res) => {
  const range = (RANGES as readonly string[]).includes(String(req.query.range)) ? (req.query.range as RangeKey) : "30d";
  const campaignId = typeof req.query.campaignId === "string" && req.query.campaignId ? req.query.campaignId.slice(0, 64) : undefined;
  res.json({ overview: await sponsorOverview(req.actor!, { range, campaignId }) });
};

sponsorOverviewRouter.get("/sponsor/overview", requireActor, overview);

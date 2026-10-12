/**
 * /api/v1/finance/overview — the Treasury, Finance's home (P1-ART-25). No
 * business rule lives here; see domain/finance-overview.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { financeOverview } from "../../domain/finance-overview";
import { RANGES, type RangeKey } from "../../domain/overview-window";

export const financeOverviewRouter = Router();

/** GET /finance/overview?range=7d|30d|90d|all — default 30d. */
const overview: RequestHandler = async (req, res) => {
  const range = (RANGES as readonly string[]).includes(String(req.query.range)) ? (req.query.range as RangeKey) : "30d";
  res.json({ overview: await financeOverview(req.actor!, { range }) });
};

financeOverviewRouter.get("/finance/overview", requireActor, overview);

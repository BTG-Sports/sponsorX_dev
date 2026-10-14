/**
 * /api/v1/intelligence — Phase 3's engines, read by the admin intelligence
 * screens (documentation/SponsorX-Phase3-Screen-Contracts.md).
 *
 * 3S2-BE-02 — the CPM engine's suggested prices: the pricing panel's list
 * and one item's detail. Tenant-wide, for BTG admins, campaign managers and
 * Sales (pricingRecommendation, RBAC matrix §28).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { pricingDesk, pricingDetail, type PricingDeskView } from "../../domain/pricing-engine";
import { pageRequest } from "../../lib/paging";

export const intelligenceRouter = Router();

const VIEWS = new Set(["above", "below", "low"]);

/** GET /intelligence/pricing?page&size&q&view=above|below|low */
const desk: RequestHandler = async (req, res) => {
  const page = pageRequest({ page: 1, ...req.query })!;
  const view = typeof req.query.view === "string" && VIEWS.has(req.query.view) ? (req.query.view as PricingDeskView) : "";
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  res.json(await pricingDesk(req.actor!, { page, search: q, view }));
};

/** GET /intelligence/pricing/:inventoryId */
const detail: RequestHandler<{ inventoryId: string }> = async (req, res) => {
  res.json(await pricingDetail(req.actor!, req.params.inventoryId));
};

intelligenceRouter.get("/intelligence/pricing", requireActor, desk);
intelligenceRouter.get("/intelligence/pricing/:inventoryId", requireActor, detail);

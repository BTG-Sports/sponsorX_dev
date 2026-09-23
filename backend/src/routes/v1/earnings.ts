/**
 * /api/v1 — earnings (P7-BE-01, P7-BE-03).
 *
 * The Finance surface. Every route is authenticated and tenant-scoped; there
 * is deliberately no public one, unlike the fan funnel.
 *
 * THERE IS NO CREATE ENDPOINT, ON PURPOSE. An earning is raised by
 * `acceptOrder`, inside the transaction that creates the contract it belongs
 * to — one earning per order, and the order is what says how much. An
 * endpoint that let someone mint an earning by hand would be a way to owe an
 * athlete money with no contract behind it.
 *
 * Nor is there an endpoint that moves one to ELIGIBLE by hand-waving: that
 * happens in `P7-BE-02` when the last deliverable is verified. `/transition`
 * can still reach ELIGIBLE — Finance must be able to release an earning that
 * was HELD — but the ordinary path is automatic and audited.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import {
  EarningAdjustmentInput,
  EarningTransitionInput,
} from "../../contracts/earning";
import {
  adjustEarning,
  readEarning,
  transitionEarning,
} from "../../domain/earning";

export const earningsRouter = Router();

/** GET /earnings/:id — the record with its money broken out. */
const read: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await readEarning(req.actor!, req.params.id));
};

/** POST /earnings/:id/transition — Finance moves it through §21. */
const move: RequestHandler<{ id: string }> = async (req, res) => {
  const body = EarningTransitionInput.parse(req.body ?? {});
  res.json(
    await transitionEarning(req.actor!, req.params.id, body.to, {
      reference: body.reference ?? null,
    }),
  );
};

/** POST /earnings/:id/adjustment — a correction, with its reason audited. */
const adjust: RequestHandler<{ id: string }> = async (req, res) => {
  const body = EarningAdjustmentInput.parse(req.body ?? {});
  res.json(
    await adjustEarning(req.actor!, req.params.id, body.adjustment, body.reason),
  );
};

earningsRouter.get("/earnings/:id", requireActor, read);
earningsRouter.post("/earnings/:id/transition", requireActor, move);
earningsRouter.post("/earnings/:id/adjustment", requireActor, adjust);

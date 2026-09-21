/**
 * /api/v1 router. Feature routers mount here as they are built, one loop-slice
 * at a time (SponsorX-Phase1-Build-Roadmap.md, Block B): applications,
 * approvals, briefs, matching, invitations, campaign orders, deliverables,
 * rewards, earnings, reports. The scaffold ships with the index only so the
 * shape is in place and the first feature has somewhere to land.
 */
import { Router } from "express";

import { meRouter } from "./me";
import { openapiRouter } from "./openapi";

export const v1Router = Router();

v1Router.get("/", (_req, res) => {
  res.json({ service: "sponsorx-api", version: "v1" });
});

/* Identity first: every portal asks who it is talking to before it renders. */
v1Router.use("/me", meRouter);

/* The published contract, generated from the Zod registry (§38). Public: a
   consumer has to be able to read how to authenticate before it can. */
v1Router.use("/openapi.json", openapiRouter);

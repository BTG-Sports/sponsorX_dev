/**
 * /api/v1 router. Feature routers mount here as they are built, one loop-slice
 * at a time (SponsorX-Phase1-Build-Roadmap.md, Block B): applications,
 * approvals, briefs, matching, invitations, campaign orders, deliverables,
 * rewards, earnings, reports. The scaffold ships with the index only so the
 * shape is in place and the first feature has somewhere to land.
 */
import { Router } from "express";

import { applicationsRouter } from "./applications";
import { campaignsRouter } from "./campaigns";
import { guardiansRouter } from "./guardians";
import { meRouter } from "./me";
import { openapiRouter } from "./openapi";

export const v1Router = Router();

v1Router.get("/", (_req, res) => {
  res.json({ service: "sponsorx-api", version: "v1" });
});

/* Identity first: every portal asks who it is talking to before it renders. */
v1Router.use("/me", meRouter);

/* B1 — athlete onboarding. The review queue and the three admin decisions
   (P3-BE-07). */
v1Router.use("/applications", applicationsRouter);

/* B1 — the guardian gate and agreement acceptance (P3-BE-14). Mounted at the
   root of /v1 rather than under a prefix, because these hang off athletes,
   guardians and agreements rather than off one noun. */
v1Router.use("/", guardiansRouter);

/* B3 — brief, matching, campaign and invitations (P4-BE-02..06). Mounted at
   the root for the same reason as guardians: these hang off several nouns
   rather than one. */
v1Router.use("/", campaignsRouter);

/* The published contract, generated from the Zod registry (§38). Public: a
   consumer has to be able to read how to authenticate before it can. */
v1Router.use("/openapi.json", openapiRouter);

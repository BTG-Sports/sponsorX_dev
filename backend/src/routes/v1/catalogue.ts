/**
 * /api/v1/catalogue — the sponsor marketplace's reads (P4-FE-01, §17).
 *
 * Sponsor prices only; see domain/catalogue.ts for why athlete pay can never
 * be in these bodies.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import { env } from "../../config/env";
import { listJobs, listPackages, listPublicPackages } from "../../domain/catalogue";

export const catalogueRouter = Router();

/**
 * GET /public/catalogue/packages — the §7 price list for the public
 * /packages page (P3-FE-05). No actor: a visitor browses before they exist
 * to us, exactly like /applications/intake. Generous limit — a price list is
 * cheap to serve and the point of a marketing page is being read.
 */
catalogueRouter.get("/public/catalogue/packages", async (req, res) => {
  await limit("catalogue:public", clientIp(req), 120, 3600);
  res.json({ packages: await listPublicPackages(env.PUBLIC_INTAKE_TENANT_ID) });
});

/** GET /catalogue/packages — the §7 packages, sponsor prices. */
const packages: RequestHandler = async (req, res) => {
  res.json({ packages: await listPackages(req.actor!) });
};

/** GET /catalogue/jobs — the NIL job catalogue, sponsor price bands. */
const jobs: RequestHandler = async (req, res) => {
  res.json({ jobs: await listJobs(req.actor!) });
};

catalogueRouter.get("/catalogue/packages", requireActor, packages);
catalogueRouter.get("/catalogue/jobs", requireActor, jobs);

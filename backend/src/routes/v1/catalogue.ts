/**
 * /api/v1/catalogue — the sponsor marketplace's reads (P4-FE-01, §17).
 *
 * Sponsor prices only; see domain/catalogue.ts for why athlete pay can never
 * be in these bodies.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { listJobs, listPackages } from "../../domain/catalogue";

export const catalogueRouter = Router();

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

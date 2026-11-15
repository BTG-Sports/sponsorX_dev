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
import { listJobs, listPackages, listPublicPackages, listTargeting, packageStaffing } from "../../domain/catalogue";
import { readPublicNetworkStats } from "../../domain/public-network-stats";
import { readHomeFeatured } from "../../domain/home-featured";

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

/**
 * GET /public/network-stats — the home page's network numbers (P8-FE-09).
 * Four row counts, no names or money; see domain/public-network-stats.ts.
 * No actor, pinned to the public tenant, the same generous limit as the
 * price list.
 */
catalogueRouter.get("/public/network-stats", async (req, res) => {
  await limit("network-stats:public", clientIp(req), 120, 3600);
  res.json(await readPublicNetworkStats(env.PUBLIC_INTAKE_TENANT_ID));
});

/**
 * GET /public/featured-athletes — the home page's Featured athletes panel
 * (P8-BE-08). At most four athletes who meet every rule in
 * domain/home-featured.ts, with only what their public page shows. No actor,
 * pinned to the public tenant, the same limit as the network numbers.
 */
catalogueRouter.get("/public/featured-athletes", async (req, res) => {
  await limit("featured-athletes:public", clientIp(req), 120, 3600);
  res.json(await readHomeFeatured(env.PUBLIC_INTAKE_TENANT_ID));
});

/** GET /catalogue/packages — the §7 packages, sponsor prices. */
const packages: RequestHandler = async (req, res) => {
  res.json({ packages: await listPackages(req.actor!) });
};

/** GET /catalogue/jobs — the NIL job catalogue, sponsor price bands. */
const jobs: RequestHandler = async (req, res) => {
  res.json({ jobs: await listJobs(req.actor!) });
};

/** A query value as a list: "MD,VA" or ?state=MD&state=VA → ["MD", "VA"]. Bounded. */
const listParam = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v])
    .filter((x): x is string => typeof x === "string")
    .flatMap((x) => x.split(","))
    .map((x) => x.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 60);

/** GET /catalogue/targeting — POL-FE-51: the sports and states live athletes cover; values only. */
export const targeting: RequestHandler = async (req, res) => {
  res.json(await listTargeting(req.actor!));
};

/** GET /catalogue/staffing?sport=&state= — POL-FE-51: could BTG staff each package for this targeting? Yes / no only. */
export const staffing: RequestHandler = async (req, res) => {
  res.json({
    packages: await packageStaffing(req.actor!, {
      sports: listParam(req.query.sport),
      stateCodes: listParam(req.query.state).map((s) => s.toUpperCase()),
    }),
  });
};

catalogueRouter.get("/catalogue/packages", requireActor, packages);
catalogueRouter.get("/catalogue/jobs", requireActor, jobs);
catalogueRouter.get("/catalogue/targeting", requireActor, targeting);
catalogueRouter.get("/catalogue/staffing", requireActor, staffing);

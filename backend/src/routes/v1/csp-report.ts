/**
 * POST /api/v1/public/csp-report — the browser's CSP violation reports
 * (2S8-PMO-02, owner decision 1). PUBLIC: a browser sends these with no
 * credentials. Reached through the web app, which forwards its same-origin
 * /api/v1/public/csp-report here (frontend/next.config.ts `rewrites`).
 *
 * Rate-limited, and nothing is stored; domain/csp-report.ts logs one
 * redacted line per violation. The answer is the same whatever arrives, so
 * the endpoint tells a caller nothing.
 */
import express, { Router } from "express";

import { recordCspReports } from "../../domain/csp-report";
import { clientIp } from "../../lib/client-ip";
import { limit } from "../../lib/rate-limit";

export const cspReportRouter = Router();

/* The two report media types. application/json is already parsed by the
   app-wide parser. 64 kB: a real report is under 2 kB. */
const reportBody = express.json({ type: ["application/csp-report", "application/reports+json"], limit: "64kb" });

cspReportRouter.post("/public/csp-report", reportBody, async (req, res) => {
  /* Reports reach the API through the web server, so without the edge key
     this is one bucket for every browser: generous, and a flood only drops
     reports, never a page. */
  await limit("csp:report", clientIp(req), 240, 60);
  recordCspReports(req.body);
  res.status(202).json({ received: true });
});

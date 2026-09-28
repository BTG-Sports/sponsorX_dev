/**
 * /api/v1 — metrics and the sponsor report (P7-DATA-01, P7-DATA-02, P7-BE-05).
 *
 * Every read here returns a breakdown by provenance label rather than a
 * single number. That is not a presentation choice made at the edge — it is
 * what `domain/metric.ts` returns, and the published contract types it that
 * way, so a client cannot receive a blended figure from these endpoints even
 * by accident.
 *
 * There is no endpoint that triggers a rollup. The rollup only warms a cache;
 * the numbers below are always computed from `MetricDaily`, so an endpoint
 * that "refreshed" them would imply they could otherwise be stale, which is
 * precisely the impression P7-DATA-02 is built to avoid.
 */
import { Router, type RequestHandler } from "express";
import { integrationHealth } from "../../domain/integration-health";
import { analyticsWindow } from "../../domain/reward-analytics";

import { requireActor } from "../../auth/actor";
import { MetricEntryInput } from "../../contracts/metric";
import {
  metricsForAthlete,
  metricsForCampaign,
  metricsForDeliverable,
  recordMetric,
} from "../../domain/metric";
import { assembleSponsorReport } from "../../domain/sponsor-report";
import { invoicesForCampaign, paymentStatusForCampaign } from "../../domain/invoice";
import { deliveryHealth, underDeliveringCampaigns } from "../../domain/delivery-health";
import { jobEconomics, networkMetrics } from "../../domain/network-metrics";
import { listReportFiles, requestReportRender } from "../../domain/report-files";

export const metricsRouter = Router();

/** POST /deliverables/:id/metrics — record one day, from one source. */
const record: RequestHandler<{ id: string }> = async (req, res) => {
  const body = MetricEntryInput.parse(req.body ?? {});
  res.status(201).json(
    await recordMetric(req.actor!, {
      deliverableId: req.params.id,
      day: new Date(body.day),
      views: body.views,
      engagements: body.engagements,
      source: body.source,
    }),
  );
};

/** GET /deliverables/:id/metrics — by label. */
const forDeliverable: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await metricsForDeliverable(req.actor!, req.params.id));
};

/** GET /campaigns/:id/metrics — by label, recomputed from the rows. */
const forCampaign: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await metricsForCampaign(req.actor!, req.params.id));
};

/** GET /athletes/:id/metrics — by label. */
const forAthlete: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await metricsForAthlete(req.actor!, req.params.id));
};

/** GET /campaigns/:id/report — §9 screen 12, every number labelled. */
const report: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await assembleSponsorReport(req.actor!, req.params.id));
};

/** GET /campaigns/:id/invoices — the Zoho mirror. Read-only by design. */
const invoices: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ invoices: await invoicesForCampaign(req.actor!, req.params.id) });
};

/** GET /campaigns/:id/payment-status — paid, invoiced, outstanding. */
const paymentStatus: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await paymentStatusForCampaign(req.actor!, req.params.id));
};

/**
 * GET /operations/delivery-health — §9 screen 9.
 *
 * `?under=true` narrows to the campaigns in trouble, which is what the
 * dashboard shows; the full list is there for a desk that wants to see
 * everything rather than only the exceptions.
 */
const delivery: RequestHandler = async (req, res) => {
  const onlyUnder = req.query.under === "true";
  const rows = onlyUnder
    ? await underDeliveringCampaigns(req.actor!)
    : await deliveryHealth(req.actor!);
  res.json({ campaigns: rows });
};

/** GET /operations/network-metrics — BTG's own numbers (P7-DATA-05). */
const network: RequestHandler = async (req, res) => {
  res.json(await networkMetrics(req.actor!));
};

/** GET /operations/job-economics — average price and margin per SX job. */
const economics: RequestHandler = async (req, res) => {
  res.json({ jobs: await jobEconomics(req.actor!) });
};

/** GET /operations/analytics?days=7|30|90 — the analytics story's numbers
 *  (P6-FE-03 / P7-FE-04), recomputed from event rows; tenant-wide, BTG only. */
const analytics: RequestHandler = async (req, res) => {
  const days = Number(req.query.days ?? 30);
  res.json(await analyticsWindow(req.actor!, Number.isFinite(days) ? days : 30));
};

/** GET /operations/integration-health — Zoho sync, webhooks, queue (P8-FE-01). */
const integrations: RequestHandler = async (req, res) => {
  res.json(await integrationHealth(req.actor!));
};

metricsRouter.get("/operations/integration-health", requireActor, integrations);
metricsRouter.get("/operations/analytics", requireActor, analytics);
metricsRouter.get("/operations/delivery-health", requireActor, delivery);
metricsRouter.get("/operations/network-metrics", requireActor, network);
metricsRouter.get("/operations/job-economics", requireActor, economics);

metricsRouter.get("/campaigns/:id/invoices", requireActor, invoices);
metricsRouter.get("/campaigns/:id/payment-status", requireActor, paymentStatus);

metricsRouter.post("/deliverables/:id/metrics", requireActor, record);
metricsRouter.get("/deliverables/:id/metrics", requireActor, forDeliverable);
metricsRouter.get("/campaigns/:id/metrics", requireActor, forCampaign);
metricsRouter.get("/athletes/:id/metrics", requireActor, forAthlete);
metricsRouter.get("/campaigns/:id/report", requireActor, report);

/* 2S7-BE-02 — the same report, rendered as a file on the worker. */
const renderReport: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(202).json(await requestReportRender(req.actor!, req.params.id));
};
const reportFiles: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ files: await listReportFiles(req.actor!, req.params.id) });
};
metricsRouter.post("/campaigns/:id/report/render", requireActor, renderReport);
metricsRouter.get("/campaigns/:id/report/files", requireActor, reportFiles);

export { analytics, integrations };

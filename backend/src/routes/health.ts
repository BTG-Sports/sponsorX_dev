/**
 * Liveness and readiness. `/health` is liveness (the process is up).
 * `/health/ready` is readiness — it actually touches Postgres, Redis and
 * object storage and reports each, so a deploy can gate on dependencies being
 * reachable rather than just the process having started.
 *
 * `/health/full` (2S8-OPS-01) is the monitor's: the same dependencies plus
 * whether the database backups are current (domain/system-health.ts). It is
 * deliberately NOT `/ready` — a stale backup must raise an alert, never block
 * a deploy that Railway gates on `/ready`.
 */
import { Router } from "express";
import { prisma } from "../db/client";
import { fullHealth } from "../domain/system-health";
import { clientIp } from "../lib/client-ip";
import { limit } from "../lib/rate-limit";
import { redisReachable } from "../lib/redis";
import { storageReachable } from "../lib/storage";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/ready", async (_req, res) => {
  const [db, cache, storage] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`.then(() => true)
      .catch(() => false),
    redisReachable(),
    storageReachable(),
  ]);

  const ok = db && cache && storage;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ready" : "degraded",
    checks: { db, redis: cache, storage },
  });
});

/* Public: production reaches it through the web server's
   /api/v1/public/health rewrite, so — as with the CSP reports — every caller
   behind the web server shares one bucket. 60 a minute is far above the
   monitor's few calls every 15 minutes and still caps what a flood can make
   this route spend on probes. */
healthRouter.get("/full", async (req, res) => {
  await limit("health:full", clientIp(req), 60, 60);
  const report = await fullHealth();
  res
    .status(report.status === "ok" ? 200 : 503)
    .set("Cache-Control", "no-store")
    .json(report);
});

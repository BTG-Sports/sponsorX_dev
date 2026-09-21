/**
 * Liveness and readiness. `/health` is liveness (the process is up).
 * `/health/ready` is readiness — it actually touches Postgres, Redis and
 * object storage and reports each, so a deploy can gate on dependencies being
 * reachable rather than just the process having started.
 */
import { Router } from "express";
import { prisma } from "../db/client";
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

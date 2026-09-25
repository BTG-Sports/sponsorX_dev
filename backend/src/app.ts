/**
 * The Express application — routes and middleware only, no listen(). Kept
 * separate from src/index.ts so tests (and, later, supertest) can import the
 * app without binding a port.
 *
 * Express 5: async route handlers that reject are forwarded to the error
 * middleware automatically, so handlers throw instead of calling next(err).
 */
import express, { type ErrorRequestHandler } from "express";
import { errorBody } from "./lib/error-body";
import { healthRouter } from "./routes/health";
import { v1Router } from "./routes/v1";

export function createApp() {
  const app = express();

  app.use(express.json());

  // Health lives outside /api/v1 so a load balancer can probe it without
  // versioning concerns.
  app.use("/health", healthRouter);

  // The Phase 1 API. Contracts are schema-first (Zod), shared with the
  // frontend — the OpenAPI spec is generated from the same Zod registry.
  app.use("/api/v1", v1Router);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found" } });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    /* A request body that fails its Zod contract is the CALLER's mistake —
       400, as the published spec says. It used to fall through to 500
       (ZodError carries no status), which logged every bad request as an
       outage and hid, from the cross-tenant sweep, which routes never
       reached their scope check (P8-SEC-02 follow-up). Both sides of the
       2026-09-25 merge fixed this independently; errorBody() is the kept
       version because it also names the failing paths (issues[]), which
       the /join wizard's field mapping consumes (P3-FE-01). */
    const { status, body } = errorBody(err);
    if (status >= 500) console.error(err);
    res.status(status).json(body);
  };
  app.use(onError);

  return app;
}

/**
 * Backend entry point — the HTTP API service.
 *
 * This is one of two long-running Node processes in the backend:
 *   1. this API (Express), and
 *   2. the pg-boss worker (worker/index.mts), started separately.
 * They share the database and the outbox but never the process, exactly as in
 * production (Railway runs them as two services).
 */
import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`SponsorX API listening on :${env.PORT} (${env.NODE_ENV})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

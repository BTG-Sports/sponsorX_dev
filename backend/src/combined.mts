/**
 * API and worker in one process — a cost decision, taken 2026-09-21.
 *
 * Addendum B separated the Express API from the pg-boss worker deliberately:
 * they scale differently, a slow job should not slow a request, and a crash
 * in one should not take the other down. That reasoning still holds. What
 * changed is that Railway bills per service, and Phase 1 is a pilot with 25
 * athletes — so for now they share a process and the separation is deferred
 * rather than abandoned.
 *
 * **Nothing about the code assumes this.** `src/index.ts` still runs the API
 * alone and `worker/index.mts` still runs the worker alone; both are
 * untouched entrypoints. Splitting later means pointing two Railway services
 * at those two files and deleting this one. That is why the worker was made
 * importable rather than merged into the API.
 *
 * WHAT YOU GIVE UP, so nobody is surprised by it later:
 *
 *   - **One crash takes both down.** An unhandled rejection in a job kills
 *     the API too. Railway restarts the service, so the effect is a few
 *     seconds of 502s rather than a silent outage, but it is real.
 *   - **They restart together.** Deploying an API change interrupts the
 *     drain, and vice versa.
 *   - **They share an event loop.** Phase 1's jobs are IO-bound — a database
 *     write, an HTTP call to Resend — so this costs little. The first
 *     CPU-heavy job (PDF rendering, image derivatives) is the signal to
 *     split, not a reason to worry now.
 *
 * The trigger to revisit: any CPU-bound job, or the API needing to scale
 * independently of the queue. Both are Phase 2 concerns at the earliest.
 */

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startWorker, stopWorker } from "../worker/index.mts";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`SponsorX API listening on :${env.PORT} (${env.NODE_ENV})`);
});

/* The worker starts after the server is listening, so a slow pg-boss
   migration cannot delay the health check Railway uses to decide the deploy
   succeeded. If the worker then fails, the process exits and Railway rolls
   back — which is the behaviour we want, because a deploy whose queue does
   not drain is not a successful deploy. */
startWorker().catch((error) => {
  console.error("[combined] worker failed to start:", error);
  process.exit(1);
});

/**
 * One shutdown for both, in order: stop accepting requests, then stop the
 * drain, then exit. Draining first would leave the API answering requests
 * that enqueue jobs nothing is going to pick up.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[combined] ${signal} received — shutting down API and worker.`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await stopWorker();
  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void shutdown(signal));
}

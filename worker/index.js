/**
 * SponsorX background worker — entrypoint.
 *
 * PLACEHOLDER (P2-OPS-02). Guide §10 fixes the start command for this service
 * as `node worker/index.js`, and Railway needs that file to exist before the
 * service can run as anything other than a second copy of the web app. This
 * file is that entrypoint and nothing more.
 *
 * What replaces it: the pg-boss task boots the queue here — pg-boss migrations
 * run on worker boot, never in the web app (§10), then the outbox drain and the
 * job handlers under worker/jobs/ are registered. Until then the process starts,
 * says so, and stays alive so the service reports healthy instead of crash-
 * looping.
 *
 * Plain JavaScript on purpose: the repo is TypeScript everywhere, but this
 * service has no build step of its own yet, and adding one (or a TS loader)
 * belongs to the task that makes the worker real — not to a placeholder.
 */

const started = new Date().toISOString();

console.log(
  `[worker] entrypoint up at ${started} — placeholder, no queue attached yet.`,
);
console.log(
  `[worker] DATABASE_URL is ${process.env.DATABASE_URL ? "present" : "MISSING"}.`,
);

/** Log every 5 minutes so an idle worker is distinguishable from a dead one. */
const HEARTBEAT_MS = 5 * 60 * 1000;
setInterval(() => {
  console.log(`[worker] idle — up since ${started}`);
}, HEARTBEAT_MS);

/* Railway sends SIGTERM on redeploy; exit cleanly so the deploy is not
   recorded as a crash. */
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} received — shutting down.`);
    process.exit(0);
  });
}

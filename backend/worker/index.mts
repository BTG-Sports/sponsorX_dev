/**
 * SponsorX background worker (P2-BE-05, Guide §05 and §10).
 *
 * Two jobs, both of them small:
 *
 *   1. Boot pg-boss. Its own migrations run here and ONLY here — never in the
 *      web app (Guide §10 rule 3). Two services racing to install the same
 *      schema produces an error in the first seconds of a deploy that looks
 *      like data corruption and is not.
 *
 *   2. Drain the outbox into pg-boss, once a second, with
 *      `FOR UPDATE SKIP LOCKED`.
 *
 * WHY `.mts`, AND WHY `pg` RATHER THAN PRISMA HERE.
 * The package is `"type": "commonjs"` and the generated Prisma client is
 * ESM-syntax TypeScript, so plain `node` cannot load it — Next bundles it, but
 * this process is not bundled. `.mts` is always an ES module, Node 24 strips
 * the types natively, and `pg` and `pg-boss` are both importable from ESM. No
 * build step, no bundler, no new dependency.
 *
 * The drain is raw SQL regardless — the guide's own version is `$queryRaw`,
 * because `FOR UPDATE SKIP LOCKED` has no ORM expression. Domain work that
 * needs the Prisma client belongs in a job handler, and handlers arrive with
 * the features that need them.
 *
 * DELIVERY IS AT-LEAST-ONCE, AND HANDLERS MUST BE IDEMPOTENT.
 * The drain sends to pg-boss and then marks the rows dispatched. If the process
 * dies between those two steps the rows stay undispatched and are sent again on
 * the next tick. That is the deliberate choice: marking first would instead risk
 * losing a job entirely, and a duplicated Zoho push is recoverable where a
 * dropped one is silent.
 */

import { PgBoss } from "pg-boss";
import pg from "pg";
import { seedEnvironment } from "./jobs/seed-environment.mts";
import { handleSendEmail, type EmailJob } from "./jobs/send-email.mts";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "[worker] DATABASE_URL is not set — refusing to start. A worker that " +
      "cannot reach the database is not a worker, and failing here makes the " +
      "deploy fail loudly instead of draining nothing in silence.",
  );
  process.exit(1);
}

/** How often the outbox is swept. Phase 1 volume is tens to low hundreds of
 *  jobs a day (Addendum A3), so a second is generous and costs almost nothing —
 *  the partial index `outbox_pending` keeps the query proportional to the
 *  backlog rather than to all history. */
const DRAIN_INTERVAL_MS = 1_000;

/** Rows claimed per sweep. Bounded so one enormous backlog cannot hold a
 *  transaction open long enough to matter. */
const DRAIN_BATCH = 100;

type OutboxRow = { id: string; name: string; payload: unknown };

const pool = new pg.Pool({ connectionString });
const boss = new PgBoss({ connectionString });

/** Queues pg-boss already knows about. Creating one is required before a send
 *  in pg-boss 10+, and it is cheap, so the drain creates them on demand rather
 *  than requiring a central registry that would go stale. */
const knownQueues = new Set<string>();

async function ensureQueue(name: string): Promise<void> {
  if (knownQueues.has(name)) return;
  await boss.createQueue(name);
  knownQueues.add(name);
}

/**
 * One sweep of the outbox.
 *
 * `FOR UPDATE SKIP LOCKED` is the whole reason two worker instances can run at
 * once: each sweep locks the rows it claims, and a second worker skips straight
 * past them instead of waiting. Drop that clause and the second worker — which
 * gets added the first time report generation blocks the queue — starts
 * double-sending sponsor email.
 */
async function drainOnce(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<OutboxRow>(
      `SELECT id, name, payload
         FROM "OutboxJob"
        WHERE "dispatchedAt" IS NULL
        ORDER BY "createdAt"
        LIMIT $1
          FOR UPDATE SKIP LOCKED`,
      [DRAIN_BATCH],
    );

    if (rows.length === 0) {
      await client.query("COMMIT");
      return 0;
    }

    for (const row of rows) {
      await ensureQueue(row.name);
      await boss.send(row.name, (row.payload ?? {}) as object);
    }

    await client.query(
      `UPDATE "OutboxJob" SET "dispatchedAt" = now() WHERE id = ANY($1::text[])`,
      [rows.map((r) => r.id)],
    );

    await client.query("COMMIT");
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

let draining = false;
let timer: NodeJS.Timeout | undefined;

/** Never let two sweeps overlap in one process. Overlap would not corrupt
 *  anything — SKIP LOCKED handles that — but it would stack connections
 *  pointlessly if a sweep ever ran long. */
async function tick(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const sent = await drainOnce();
    if (sent > 0) console.log(`[worker] drained ${sent} outbox job(s)`);
  } catch (error) {
    // Log and keep going. A failed sweep leaves its rows undispatched, so the
    // next tick retries them; exiting here would turn a transient database
    // blip into a stopped queue.
    console.error("[worker] drain failed:", error);
  } finally {
    draining = false;
  }
}

/**
 * Seed the environment before anything else (P2-OPS-05).
 *
 * Here rather than in a command someone runs, because Railway preview
 * environments start empty and an empty preview is a useless one. It is
 * idempotent and refuses to run in production, so booting repeatedly is
 * harmless. A failure is logged and swallowed: a worker that cannot seed demo
 * data must still drain the outbox, and turning a seed problem into a dead
 * queue would be the worse outcome by far.
 */
async function seedOnBoot(): Promise<void> {
  try {
    const outcome = await seedEnvironment(pool);
    if (outcome.skipped) {
      console.log(`[worker] seed skipped — ${outcome.reason}`);
    } else {
      console.log(
        `[worker] seed complete — ${outcome.tenantsCreated} tenant(s) and ` +
          `${outcome.usersCreated} user(s) created ` +
          `(0 means they already existed, which is the normal case)`,
      );
    }
  } catch (error) {
    console.error("[worker] seed failed, continuing to drain anyway:", error);
  }
}

async function main(): Promise<void> {
  await seedOnBoot();

  await boss.start(); // installs pg-boss's own schema — worker only
  console.log("[worker] pg-boss started; outbox drain every " + DRAIN_INTERVAL_MS + "ms");

  boss.on("error", (error) => console.error("[worker] pg-boss error:", error));

  /* Handlers land with the feature that needs them. The first is email
     (P3-INT-01); zoho.pushCampaign arrives with the Zoho integration and
     reward.generateQr with the QR task. A job with no handler queues and
     waits, which shows up as queue depth rather than a silent drop. */
  await boss.work<EmailJob>("notify.email", async ([job]) => {
    const outcome = await handleSendEmail(pool, job.data);
    /* Logged because a duplicate is not a failure — it means the message had
       already gone once, which is what was asked for. Silence here would
       make an at-least-once delivery look like a lost email. */
    console.log(`[worker] notify.email ${outcome}: ${job.data.template} -> ${job.data.to}`);
  });

  timer = setInterval(tick, DRAIN_INTERVAL_MS);
  await tick(); // sweep once at boot rather than waiting a full interval
}

/**
 * Stop draining and release the pool. Exported without calling `process.exit`
 * so a host process can shut the worker down and then close its own server —
 * see `src/combined.mts`. The standalone entry below still exits, because
 * when the worker *is* the process there is nothing else to wait for.
 */
export async function stopWorker(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  await boss.stop({ graceful: true }).catch(() => {});
  await pool.end().catch(() => {});
}

/** Boot the worker. Exported so it can run inside another process. */
export const startWorker = main;

/**
 * Only self-start when this file IS the process.
 *
 * Without this guard, importing the module to run it alongside the API would
 * start it twice — once on import and once when the host calls startWorker()
 * — giving two drains competing for the same rows. SKIP LOCKED would keep
 * that correct but it would still be two of everything for no reason.
 */
const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      console.log(`[worker] ${signal} received — shutting down.`);
      void stopWorker().then(() => process.exit(0));
    });
  }
}

if (isEntrypoint) {
  main().catch((error) => {
    console.error("[worker] failed to start:", error);
    process.exit(1);
  });
}

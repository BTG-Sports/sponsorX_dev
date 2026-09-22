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
import { seedEnvironment, TENANT_ID } from "./jobs/seed-environment.mts";
import { seedCatalogue } from "./jobs/seed-catalogue.mts";
import { expireInvitations } from "./jobs/expire-invitations.mts";
import { handleInvitationSent, type InvitationJob } from "./jobs/notify-invitation.mts";

/**
 * The job names this worker can actually consume.
 *
 * Every name here must have a matching `boss.work()` registration below. The
 * drain refuses to dispatch anything absent from this set, so adding a
 * handler is two edits in one file and forgetting one of them is visible in
 * the log rather than silent.
 */
const HANDLED_JOBS = new Set<string>(["notify.email", "notify.invitationSent"]);
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
/**
 * Outbox rows nobody can consume yet, reported so they are visible rather
 * than merely absent from the drain. Cheap: one count, no lock, and only
 * logged when it is non-zero.
 */
async function reportWaiting(): Promise<void> {
  const { rows } = await pool.query<{ name: string; n: string }>(
    `SELECT name, count(*)::text AS n
       FROM "OutboxJob"
      WHERE "dispatchedAt" IS NULL AND name <> ALL($1::text[])
      GROUP BY name`,
    [[...HANDLED_JOBS]],
  );
  if (rows.length > 0) {
    const summary = rows.map((r) => `${r.name} x${r.n}`).join(", ");
    console.log(`[worker] outbox waiting for a handler: ${summary}`);
  }
}

async function drainOnce(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /* A job type with no consumer is LEFT IN THE OUTBOX, and the filter is in
       the SQL rather than applied after LIMIT. pg-boss accepts a send() for a
       queue nobody works, the row would be marked dispatched, and the event
       would expire unread — the outbox exists so that work survives, and
       dispatching into a void defeats it.

       Filtering after the LIMIT would be worse than not filtering at all:
       undeliverable rows are the OLDEST, so they would fill every batch and
       starve everything behind them. `name = ANY(...)` keeps the batch full
       of work that can actually go.

       Two names sit here today — zoho.pushCampaign and notify.invitationSent,
       both enqueued by B3 domain code whose handlers are still to come
       (P8-INT-01, P4-INT-01). They wait, and go the moment a handler ships. */
    const { rows } = await client.query<OutboxRow>(
      `SELECT id, name, payload
         FROM "OutboxJob"
        WHERE "dispatchedAt" IS NULL
          AND name = ANY($2::text[])
        ORDER BY "createdAt"
        LIMIT $1
          FOR UPDATE SKIP LOCKED`,
      [DRAIN_BATCH, [...HANDLED_JOBS]],
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
/** Invitation expiry runs on its own, much slower, timer (P4-BE-05). */
let expiryTimer: ReturnType<typeof setInterval> | undefined;
const EXPIRY_INTERVAL_MS = 60 * 60 * 1000;

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
  /* The catalogue first, and outside the demo-data guard: the seven NIL jobs
     and six packages are the real price list, needed in production more than
     anywhere (P3-BE-08, P3-BE-11). A failure here is logged like any other —
     a worker that cannot seed must still drain. */
  try {
    const catalogue = await seedCatalogue(pool, TENANT_ID);
    console.log(
      `[worker] catalogue seeded — ${catalogue.nilJobs} NIL jobs, ` +
        `${catalogue.sponsorPackages} sponsor packages`,
    );
  } catch (error) {
    console.error("[worker] catalogue seed failed, continuing to drain anyway:", error);
  }

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
  /* The queue must exist before anything can consume from it. pg-boss 10+
     requires createQueue for BOTH sides, and `ensureQueue` above only covers
     the send path — which runs when a job is dispatched, i.e. after this
     registration. On a database that has never had an email queued, work()
     therefore failed on a loop with "Queue notify.email does not exist"
     until this line was added. Idempotent, so it costs nothing on restart. */
  await ensureQueue("notify.email");

  await boss.work<EmailJob>("notify.email", async ([job]) => {
    const outcome = await handleSendEmail(pool, job.data);
    /* Logged because a duplicate is not a failure — it means the message had
       already gone once, which is what was asked for. Silence here would
       make an at-least-once delivery look like a lost email. */
    console.log(`[worker] notify.email ${outcome}: ${job.data.template} -> ${job.data.to}`);
  });

  /* P4-INT-01. It resolves the invitation at send time and enqueues a
     notify.email row, so the vendor call still happens in exactly one place. */
  await ensureQueue("notify.invitationSent");
  await boss.work<InvitationJob>("notify.invitationSent", async ([job]) => {
    const outcome = await handleInvitationSent(
      pool, job.data, process.env.APP_URL ?? "http://localhost:3000");
    console.log(
      outcome.sent
        ? `[worker] notify.invitationSent queued mail to ${outcome.to}`
        : `[worker] notify.invitationSent skipped: ${outcome.reason}`,
    );
  });

  timer = setInterval(tick, DRAIN_INTERVAL_MS);
  await tick(); // sweep once at boot rather than waiting a full interval
  await reportWaiting().catch(() => {});

  /* Invitation expiry (P4-BE-05). A sweep rather than a timer per invitation:
     the comparison is one statement, and a per-invite job that is lost leaves
     that offer open forever where a missed sweep catches everything next run.
     Hourly is well inside the precision a multi-day window needs. */
  expiryTimer = setInterval(() => {
    void expireInvitations(pool, process.env.APP_URL ?? "http://localhost:3000")
      .then(({ expired, reminded, warned }) => {
        if (expired || reminded || warned) {
          console.log(
            `[worker] invitations — expired ${expired}, reminded ${reminded}, ` +
              `expiry-warned ${warned}`,
          );
        }
      })
      .catch((error: unknown) => {
        console.error("[worker] invitation expiry failed, will retry next hour:", error);
      });
  }, EXPIRY_INTERVAL_MS);
}

/**
 * Stop draining and release the pool. Exported without calling `process.exit`
 * so a host process can shut the worker down and then close its own server —
 * see `src/combined.mts`. The standalone entry below still exits, because
 * when the worker *is* the process there is nothing else to wait for.
 */
export async function stopWorker(): Promise<void> {
  if (timer) clearInterval(timer);
  if (expiryTimer) clearInterval(expiryTimer);
  timer = undefined;
  expiryTimer = undefined;
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

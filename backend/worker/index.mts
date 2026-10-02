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
const HANDLED_JOBS = new Set<string>([
  "notify.email",
  "notify.invitationSent",
  "reward.generateQr",
  "image.derive",
  "tracking.resolveGeo",
  "zoho.ingestInvoice",
  "athlete.importCohort",
  /* P8-INT-01..07 — the Zoho CRM sync. zoho.pushCampaign is the legacy
     name of the Deal push; rows queued under it before the sync shipped
     are consumed by the same handler. */
  "zoho.pushDeal",
  "zoho.pushCampaign",
  "zoho.pushTask",
  "zoho.pushLead",
  "zoho.pushRenewal",
  "zoho.pushSponsor",
  "zoho.ingestCrm",
  "zoho.backfill",
  /* 2S7-INT-01 — marketplace orders, their sponsors and properties. */
  "zoho.pushMarketplaceOrder",
  /* 2S7-BE-02 — the sponsor report rendered as a file, unattended. */
  "report.render",
  /* 2S5-INT-02 / 2S5-BE-05 — the payment provider's side (stand-in on staging). */
  "payments.confirm",
  "payouts.send",
  "payouts.confirm",
]);
import { handleSendEmail, type EmailJob } from "./jobs/send-email.mts";
import { handleGenerateQr, type QrJob } from "./jobs/generate-qr.mts";
import { handleDeriveImage, type DeriveImageJob } from "./jobs/derive-image.mts";
import { getPrivateObject, getPublicObject, putPrivateObject } from "../src/lib/storage.ts";
import {
  cityReaderToLookup, handleResolveGeo, type GeoJob, type GeoLookup,
} from "./jobs/resolve-geo.mts";
import { handleRollupMetrics } from "./jobs/rollup-metrics.mts";
import { remindDueDeliverables } from "./jobs/deliverable-reminders.mts";
import { handleIngestInvoice, type IngestInvoiceJob } from "./jobs/ingest-invoice.mts";
import { handleRenderReport } from "./jobs/render-report.mts";
import { applyQueuePolicy } from "./queue-policy.mts";
import { expireCarts } from "../src/domain/cart.ts";
import { expireReservations } from "../src/domain/reservation.ts";
import { sweepDeliveries } from "../src/domain/delivery.ts";
import { purgeExpiredClosures } from "../src/domain/account-closure.ts";
import { sweepComingOfAge } from "../src/domain/coming-of-age.ts";
import { LISTING_DIGEST_HOUR_UTC, sendListingDigests } from "../src/domain/listing.ts";
import type { RenderReportJob } from "../src/domain/report-files.ts";
import { prisma } from "../src/db/client.ts";
import { ingestZohoInvoice, type ZohoInvoicePayload } from "../src/domain/invoice.ts";
import { importCohort, type CohortImportJob } from "../src/domain/cohort-import.ts";
import { confirmPayment, confirmPayoutPaid, sendPayout } from "../src/domain/payouts.ts";
import { providerName } from "../src/lib/payment-provider.ts";
import { redis } from "../src/lib/redis.ts";
import { zohoConfigFromEnv, zohoFromEnv } from "../src/lib/zoho.ts";
import {
  handleBackfill, handleIngestCrm, handlePushDeal, handlePushLead, handlePushMarketplaceOrder, handlePushRenewal, handlePushSponsor,
  handlePushTask, renewWatch, runReconciliation, dispatchableJobs,
  type BackfillJob, type DealJob, type IngestCrmJob, type LeadJob, type MarketplaceOrderJob, type RenewalJob, type SponsorJob, type TaskJob,
} from "./jobs/zoho-sync.mts";

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

/* P7-DATA-02's sweep. Hourly: the cache spares a report page a GROUP BY, it
   does not make a number current — every read still computes from the rows. */
const ROLLUP_INTERVAL_MS = 60 * 60 * 1_000;

/* P5-INT-01's sweep. Hourly: the reminder windows are whole days, so this is
   far finer than it needs to be, and the idempotency key makes the extra
   passes free. */
const REMINDER_INTERVAL_MS = 60 * 60 * 1_000;

/** Rows claimed per sweep. Bounded so one enormous backlog cannot hold a
 *  transaction open long enough to matter. */
const DRAIN_BATCH = 100;

type OutboxRow = { id: string; tenantId: string; name: string; payload: unknown };

const pool = new pg.Pool({ connectionString });
const boss = new PgBoss({ connectionString });

/** Queues pg-boss already knows about. Creating one is required before a send
 *  in pg-boss 10+, and it is cheap, so the drain creates them on demand rather
 *  than requiring a central registry that would go stale. */
const knownQueues = new Set<string>();

async function ensureQueue(name: string): Promise<void> {
  if (knownQueues.has(name)) return;
  /* 2S1-INT-01 — a queue with a retry policy gets it here, on both sides. */
  await applyQueuePolicy(boss, name);
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

       zoho.pushAthlete still sits here: pushing athletes to the custom
       module is outside P8-INT-01's four objects, so it waits. */
    const { rows } = await client.query<OutboxRow>(
      `SELECT id, "tenantId", name, payload
         FROM "OutboxJob"
        WHERE "dispatchedAt" IS NULL
          AND name = ANY($2::text[])
        ORDER BY "createdAt"
        LIMIT $1
          FOR UPDATE SKIP LOCKED`,
      /* Zoho CRM jobs stay in the outbox on a worker with no credentials
         (production today) instead of failing into pg-boss's archive. */
      [DRAIN_BATCH, dispatchableJobs(HANDLED_JOBS, zohoConfigFromEnv() !== null)],
    );

    if (rows.length === 0) {
      await client.query("COMMIT");
      return 0;
    }

    for (const row of rows) {
      await ensureQueue(row.name);
      /* Every job learns the tenant it was enqueued under (P8-SEC-02). The
         row has always carried it; the payload did not, so a handler had to
         look records up by id alone. Spread first so a payload can never
         override the tenant its own row records. */
      await boss.send(row.name, { ...((row.payload ?? {}) as object), tenantId: row.tenantId });
    }

    await client.query(
      `UPDATE "OutboxJob" SET "dispatchedAt" = now() WHERE id = ANY($1::text[])`,
      [rows.map((r) => r.id)],
    );

    /* §26 — THE ADDRESS DOES NOT STAY HERE.
    
       P6-BE-05's acceptance says the raw IP "lives only in the job payload",
       which is only true if a payload is transient. Ours is not: rows are
       marked dispatched and never deleted, so without this the address of
       every fan who ever tapped a link would sit in Postgres indefinitely.
    
       It is stripped in the same transaction that marks the row dispatched,
       AFTER boss.send has already carried the full payload to the queue. So
       the worker still resolves the location and the database keeps no
       address — and a crash between the two rolls back both.

       The explicit ::jsonb cast is belt and braces. The column IS jsonb (see
       the init migration), and `-` is a jsonb operator a plain `json` column
       would reject — which would abort the WHOLE drain transaction, not just
       this statement. The cast makes it correct either way. It could not be
       checked against a live database: Railway's Postgres is reachable only
       over the private network and has no TCP proxy. */
    await client.query(
      `UPDATE "OutboxJob"
          SET payload = payload::jsonb - 'clientIp'
        WHERE id = ANY($1::text[])
          AND name = 'tracking.resolveGeo'`,
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
let rollupTimer: ReturnType<typeof setInterval> | undefined;
let reminderTimer: ReturnType<typeof setInterval> | undefined;
/* 2S4-BE-01 — the hourly cart expiry sweep. */
let cartTimer: ReturnType<typeof setInterval> | undefined;
/* 2S4-BE-02 — the reservation sweep, every minute. */
let holdTimer: ReturnType<typeof setInterval> | undefined;
/* 2S4-BE-07 / -08 — the delivery sweep: 24-hour silence confirms, overdue
   reminders, and the 30-day auto-close. Every ten minutes, so a sponsor's
   24 hours end within minutes of the deadline; each pass is idempotent. */
let deliveryTimer: ReturnType<typeof setInterval> | undefined;
const DELIVERY_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let zohoTimer: ReturnType<typeof setInterval> | undefined;
/* 2S1-BE-13 — the retention sweep: closed accounts' files go after 30 days. */
let retentionTimer: ReturnType<typeof setInterval> | undefined;
/* 2S1-BE-12 — the hourly coming-of-age sweep: start, remind, terminate. */
let comingOfAgeTimer: ReturnType<typeof setInterval> | undefined;
let listingDigestTimer: ReturnType<typeof setInterval> | undefined;
/* P8-INT-05 checks hourly and runs at most once a day per tenant; P8-INT-03's
   channel is renewed every 12 hours against a 24-hour expiry. */
const ZOHO_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const WATCH_RENEW_EVERY_MS = 12 * 60 * 60 * 1000;
let lastWatchRenewal = 0;
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
     and the sponsor packages (with NEXT's, P9-BE-01) are the real price list, needed in production more than
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
        `[worker] seed complete — ${outcome.athletesCreated ?? 0} athlete(s), ` +
          `${outcome.sponsorsCreated ?? 0} sponsor(s), ` +
          `${outcome.tenantsCreated} tenant(s) and ` +
          `${outcome.usersCreated} user(s) and ` +
          `${outcome.personaUsersCreated ?? 0} walkthrough login(s) created ` +
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
    /* 2S1-BE-16 — a support message's attachments are read from the private bucket at send time. */
    const outcome = await handleSendEmail(pool, job.data, getPrivateObject);
    /* Logged because a duplicate is not a failure — it means the message had
       already gone once, which is what was asked for. Silence here would
       make an at-least-once delivery look like a lost email. */
    /* A fan's address stays out of the log (P6-SEC-02/03): their consent
       covers the voucher email, not our log retention. Staff and athletes
       have accounts and are logged as before. */
    const to = job.data.fanEventId ? `fan claim ${job.data.fanEventId}` : job.data.to;
    console.log(`[worker] notify.email ${outcome}: ${job.data.template} -> ${to}`);
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

  /* P7-BE-04 — the inbound half of §18. The webhook route recorded the
     payload and queued this; applying it happens here, off the request path,
     so a slow apply cannot turn into a Zoho retry storm. */
  await ensureQueue("zoho.ingestInvoice");
  await boss.work<IngestInvoiceJob>("zoho.ingestInvoice", async ([job]) => {
    const outcome = await handleIngestInvoice(pool, job.data, {
      apply: async (payload) =>
        prisma.$transaction(async (tx) => {
          const result = await ingestZohoInvoice(tx, payload as ZohoInvoicePayload);
          return result.applied
            ? { applied: true, invoiceId: result.invoiceId }
            : { applied: false, reason: result.reason };
        }),
    });
    console.log(`[worker] zoho.ingestInvoice ${outcome.status}`);
  });

  /* P3-DATA-01 — the pilot cohort. Queued by `npm run cohort:import`, which
     has already validated every row and applied the production gate; this
     only creates. Skips by email, so a retry resumes rather than duplicates. */
  await ensureQueue("athlete.importCohort");
  await boss.work<CohortImportJob>("athlete.importCohort", async ([job]) => {
    const outcome = await importCohort(job.data);
    console.log(
      `[worker] athlete.importCohort ${job.data.source} (${job.data.sha256.slice(0, 12)}): ` +
        `${outcome.created} created, ${outcome.skipped.length} skipped`,
    );
  });

  /* P8-INT-01..07 — the Zoho CRM sync. Each handler is a thin call into
     src/domain/zoho-sync.ts; see worker/jobs/zoho-sync.mts for which errors
     are retried and which are recorded. The client is resolved per job, so a
     worker booted without credentials fails those jobs (and retries them)
     instead of refusing to start. */
  /* 2S7-BE-02 — one render at a time: Chromium is a separate process, but
     it is the first CPU-heavy job in a worker that shares a process with the
     API (src/combined.mts names this as the signal to split them). */
  await ensureQueue("report.render");
  await boss.work<RenderReportJob & { tenantId: string }>("report.render", { localConcurrency: 1 }, async ([job]) =>
    console.log(`[worker] report.render ${JSON.stringify(await handleRenderReport({ db: prisma, put: putPrivateObject, logo: getPublicObject }, job.data))}`));

  /* 2S5-INT-02 / 2S5-BE-05 — the provider's side of payments and payouts.
     The stand-in provider answers after a few seconds, the way a real
     provider's webhook arrives after the customer comes back — so the
     screens really do show "confirming" and "sending" in between. */
  const providerDelay = () => new Promise((r) => setTimeout(r, providerName() === "standin" ? 4_000 : 0));
  await ensureQueue("payments.confirm");
  await boss.work<{ attemptId: string }>("payments.confirm", async ([job]) => {
    await providerDelay();
    console.log(`[worker] payments.confirm ${JSON.stringify(await confirmPayment(job.data.attemptId))}`);
  });
  await ensureQueue("payouts.send");
  await boss.work<{ payoutId: string }>("payouts.send", async ([job]) => {
    const sent = await sendPayout(job.data.payoutId);
    console.log(`[worker] payouts.send ${JSON.stringify(sent)}`);
    if (sent.sent && providerName() === "standin") {
      await providerDelay();
      console.log(`[worker] payouts.confirm ${JSON.stringify(await confirmPayoutPaid(job.data.payoutId))}`);
    }
  });
  await ensureQueue("payouts.confirm");
  await boss.work<{ payoutId: string }>("payouts.confirm", async ([job]) =>
    console.log(`[worker] payouts.confirm ${JSON.stringify(await confirmPayoutPaid(job.data.payoutId))}`));

  const zohoDeps = { db: prisma, zoho: zohoFromEnv };
  const zohoLog = (name: string, outcome: unknown) =>
    console.log(`[worker] ${name} ${JSON.stringify(outcome)}`);
  await ensureQueue("zoho.pushDeal");
  await boss.work<DealJob>("zoho.pushDeal", async ([job]) =>
    zohoLog("zoho.pushDeal", await handlePushDeal(zohoDeps, job.data)));
  await ensureQueue("zoho.pushCampaign");
  await boss.work<DealJob>("zoho.pushCampaign", async ([job]) =>
    zohoLog("zoho.pushCampaign", await handlePushDeal(zohoDeps, job.data)));
  await ensureQueue("zoho.pushTask");
  await boss.work<TaskJob>("zoho.pushTask", async ([job]) =>
    zohoLog("zoho.pushTask", await handlePushTask(zohoDeps, job.data)));
  await ensureQueue("zoho.pushLead");
  await boss.work<LeadJob>("zoho.pushLead", async ([job]) =>
    zohoLog("zoho.pushLead", await handlePushLead(zohoDeps, job.data)));
  await ensureQueue("zoho.pushSponsor");
  await boss.work<SponsorJob>("zoho.pushSponsor", async ([job]) =>
    zohoLog("zoho.pushSponsor", await handlePushSponsor(zohoDeps, job.data)));
  await ensureQueue("zoho.pushMarketplaceOrder");
  await boss.work<MarketplaceOrderJob>("zoho.pushMarketplaceOrder", async ([job]) =>
    zohoLog("zoho.pushMarketplaceOrder", await handlePushMarketplaceOrder(zohoDeps, job.data)));
  await ensureQueue("zoho.pushRenewal");
  await boss.work<RenewalJob>("zoho.pushRenewal", async ([job]) =>
    zohoLog("zoho.pushRenewal", await handlePushRenewal(zohoDeps, job.data)));
  await ensureQueue("zoho.ingestCrm");
  await boss.work<IngestCrmJob>("zoho.ingestCrm", async ([job]) => {
    const out = await handleIngestCrm(zohoDeps, job.data);
    zohoLog("zoho.ingestCrm", { status: out.status, outcomes: out.outcomes.map((o) => o.status) });
  });
  await ensureQueue("zoho.backfill");
  await boss.work<BackfillJob>("zoho.backfill", async ([job]) =>
    zohoLog("zoho.backfill", (await handleBackfill(zohoDeps, job.data)).map((r) => ({
      module: r.module, seen: r.seen, created: r.created, linked: r.linked, skipped: r.skipped.length,
    }))));

  /* The sweeps. Both are no-ops without credentials — and say so once. */
  const zohoSweep = async () => {
    let zoho;
    try { zoho = zohoFromEnv(); } catch { return; }
    if (Date.now() - lastWatchRenewal > WATCH_RENEW_EVERY_MS) {
      await renewWatch(zoho)
        .then((r) => { lastWatchRenewal = Date.now(); zohoLog("zoho.watch", r); })
        .catch((error: unknown) => console.error("[worker] zoho.watch renewal failed:", error));
    }
    await runReconciliation(zohoDeps)
      .then((runs) => runs.forEach((run) => run.reports.forEach((r) => zohoLog("zoho.reconcile", {
        tenant: run.tenantId, module: r.module, checked: r.checked,
        missingInZoho: r.missingInZoho.length, unknownInSponsorX: r.unknownInSponsorX.length,
        diverged: r.diverged.length,
      }))))
      .catch((error: unknown) => console.error("[worker] zoho.reconcile failed:", error));
  };
  if (!process.env.ZOHO_CLIENT_ID) {
    console.log("[worker] Zoho is not configured — CRM sync jobs wait in the outbox; no reconcile or watch.");
  }
  zohoTimer = setInterval(() => void zohoSweep(), ZOHO_SWEEP_INTERVAL_MS);
  setTimeout(() => void zohoSweep(), 60_000).unref();

  /* P6-BE-05. The GeoLite2 file is opened ONCE, at boot, not per job: it is
     a hundred megabytes and the reader memory-maps it. A checkout without the
     file — it is a licensed MaxMind download and cannot be committed — starts
     normally and resolves nothing, because a missing dimension on a chart is
     better than a worker that will not boot. */
  let geoLookup: GeoLookup | null = null;
  const geoPath = process.env.GEOLITE2_CITY_PATH;
  if (geoPath) {
    try {
      const { open } = await import("maxmind");
      geoLookup = cityReaderToLookup(await open(geoPath));
      console.log(`[worker] GeoLite2 loaded from ${geoPath}`);
    } catch (error) {
      console.error(
        `[worker] GEOLITE2_CITY_PATH is set to ${geoPath} but the database ` +
          `could not be opened — clicks will record without a location. ` +
          `${(error as Error).message}`,
      );
    }
  } else {
    console.log(
      "[worker] GEOLITE2_CITY_PATH is not set — clicks record without a " +
        "location. Set it to a GeoLite2-City.mmdb to enable geo resolution.",
    );
  }

  await ensureQueue("tracking.resolveGeo");
  await boss.work<GeoJob>("tracking.resolveGeo", async ([job]) => {
    const outcome = await handleResolveGeo(pool, job.data, { lookup: geoLookup });
    console.log(
      outcome.resolved
        ? `[worker] tracking.resolveGeo ${outcome.region ?? "?"}/${outcome.city ?? "?"}`
        : `[worker] tracking.resolveGeo skipped: ${outcome.reason}`,
    );
  });

  /* P6-BE-06. The PNG goes to the PRIVATE bucket: a QR is a picture of a
     bearer credential, and the public bucket is a CDN with no access control
     by design. */
  await ensureQueue("reward.generateQr");
  await boss.work<QrJob>("reward.generateQr", async ([job]) => {
    const outcome = await handleGenerateQr(pool, job.data, {
      appUrl: process.env.APP_URL ?? "http://localhost:3000",
      putObject: putPrivateObject,
    });
    console.log(
      outcome.generated
        ? `[worker] reward.generateQr wrote ${outcome.key} (${outcome.bytes}b)`
        : `[worker] reward.generateQr skipped: ${outcome.reason}`,
    );
  });

  /* P5-BE-07. Three webp widths beside the original, never replacing it. */
  await ensureQueue("image.derive");
  await boss.work<DeriveImageJob>("image.derive", async ([job]) => {
    const outcome = await handleDeriveImage(pool, job.data, {
      getObject: getPrivateObject,
      putObject: putPrivateObject,
    });
    console.log(
      outcome.derived
        ? `[worker] image.derive wrote ${Object.keys(outcome.keys).join("/")}`
        : `[worker] image.derive skipped: ${outcome.reason}`,
    );
  });

  /* P7-DATA-02 — a SWEEP ON A TIMER, not a queued job per subject.
  
     Nothing enqueues this: totals are derived from MetricDaily, so there is
     no event that "makes" an aggregate stale, and a per-campaign job would
     mean inventing one. A sweep also self-heals — a missed run changes
     nothing, because the next one recomputes everything from the rows.
  
     Hourly. The cache exists to spare a report page a GROUP BY, not to make
     a number current: every read still computes from the rows. */
  /* P5-INT-01 — deadline reminders. A sweep for the same reason invitation
     expiry is one: a per-deliverable timer that is lost leaves that athlete
     never reminded. Hourly; the send log's idempotency key carries the
     window, so twelve sweeps a day do not make twelve emails. */
  reminderTimer = setInterval(() => {
    void remindDueDeliverables(pool, process.env.APP_URL ?? "http://localhost:3000")
      .then(({ queued, windows }) => {
        if (queued > 0) {
          console.log(
            `[worker] deliverable reminders — queued ${queued} ` +
              `(${Object.entries(windows).map(([d, n]) => `${d}d x${n}`).join(", ")})`,
          );
        }
      })
      .catch((error: unknown) => {
        console.error("[worker] deliverable reminders failed:", error);
      });
  }, REMINDER_INTERVAL_MS);

  rollupTimer = setInterval(() => {
    void handleRollupMetrics(pool, {
      cache: {
        set: async (key, value, ttlSeconds) => {
          await redis.set(key, value, "EX", ttlSeconds);
        },
      },
    })
      .then(({ campaigns, athletes, cached }) => {
        if (cached > 0) {
          console.log(
            `[worker] rollup-metrics — ${campaigns} campaigns, ${athletes} athletes cached`,
          );
        }
      })
      .catch((error: unknown) => {
        /* A failed rollup costs a cache miss, nothing more. */
        console.error("[worker] rollup-metrics failed:", error);
      });
  }, ROLLUP_INTERVAL_MS);

  timer = setInterval(tick, DRAIN_INTERVAL_MS);
  await tick(); // sweep once at boot rather than waiting a full interval
  await reportWaiting().catch(() => {});

  /* Invitation expiry (P4-BE-05). A sweep rather than a timer per invitation:
     the comparison is one statement, and a per-invite job that is lost leaves
     that offer open forever where a missed sweep catches everything next run.
     Hourly is well inside the precision a multi-day window needs. */
  /* 2S4-BE-01 — close carts a day past their last change. Hourly: a cart
     past its expiry is already refused on read, so the sweep only tidies. */
  /* 2S4-BE-02 — mark lapsed holds EXPIRED. The stock already came back the
     instant each one's time passed (availability counts only live holds);
     this keeps the record true. Every minute: a hold lasts fifteen. */
  holdTimer = setInterval(() => {
    void expireReservations(prisma)
      .then(({ expired }) => { if (expired) console.log(`[worker] reservations — expired ${expired}`); })
      .catch((error: unknown) => console.error("[worker] reservation expiry failed, will retry next minute:", error));
  }, 60_000);

  const deliverySweep = () =>
    void sweepDeliveries()
      /* 2S4-BE-07/-08/-11 — silence confirms, a side silent 72 hours hands a problem to BTG, reminders at 1 and 3 days, BTG at 7, auto-close. */
      .then((r) => { if (Object.values(r).some((n) => n > 0)) console.log(`[worker] deliveries ${JSON.stringify(r)}`); })
      .catch((error: unknown) => console.error("[worker] delivery sweep failed, will retry:", error));
  deliveryTimer = setInterval(deliverySweep, DELIVERY_SWEEP_INTERVAL_MS);
  setTimeout(deliverySweep, 30_000).unref();

  /* 2S1-BE-12 — coming of age. A sweep, like the invitation expiry: a
     per-athlete timer that is lost leaves a 90-day allowance never opened
     or never closed, where a missed sweep catches everything next hour.
     Every step is conditional on the row, so overlapping runs are harmless. */
  comingOfAgeTimer = setInterval(() => {
    void sweepComingOfAge()
      .then(({ started, reminded, terminated }) => {
        if (started || reminded || terminated) console.log(`[worker] coming of age — started ${started}, reminded ${reminded}, terminated ${terminated}`);
      })
      .catch((error: unknown) => console.error("[worker] coming-of-age sweep failed, will retry next hour:", error));
  }, REMINDER_INTERVAL_MS);

  /* 2S3-BE-06 — BTG's daily summary of the listings that went live on their
     own. Hourly, from LISTING_DIGEST_HOUR_UTC: the first pass of the day
     sends it and records the day (one per BTG tenant per UTC date), so the
     later passes — and a restarted worker — send nothing more. */
  listingDigestTimer = setInterval(() => {
    if (new Date().getUTCHours() < LISTING_DIGEST_HOUR_UTC) return;
    void sendListingDigests()
      .then(({ tenants, listings }) => { if (tenants) console.log(`[worker] listing digests — ${tenants} sent, ${listings} listing(s)`); })
      .catch((error: unknown) => console.error("[worker] listing digest failed, will retry next hour:", error));
  }, REMINDER_INTERVAL_MS);

  cartTimer = setInterval(() => {
    void expireCarts(prisma)
      .then(({ expired }) => { if (expired) console.log(`[worker] carts — expired ${expired}`); })
      .catch((error: unknown) => console.error("[worker] cart expiry failed, will retry next hour:", error));
  }, REMINDER_INTERVAL_MS);

  /* 2S1-BE-13 — the retention job. Hourly, though the window is whole days:
     a closure whose 30 days ended is purged within the hour, and a purged
     one is never picked up again, so the extra passes cost nothing. */
  retentionTimer = setInterval(() => {
    void purgeExpiredClosures(prisma)
      .then(({ closures, files, handoffDocuments }) => {
        if (closures || handoffDocuments) console.log(`[worker] retention — ${closures} closed account(s) purged, ${files + handoffDocuments} file(s) deleted`);
      })
      .catch((error: unknown) => console.error("[worker] retention sweep failed, will retry next hour:", error));
  }, REMINDER_INTERVAL_MS);

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
  if (rollupTimer) clearInterval(rollupTimer);
  if (reminderTimer) clearInterval(reminderTimer);
  if (cartTimer) clearInterval(cartTimer);
  if (retentionTimer) clearInterval(retentionTimer);
  if (holdTimer) clearInterval(holdTimer);
  if (deliveryTimer) clearInterval(deliveryTimer);
  if (zohoTimer) clearInterval(zohoTimer);
  if (comingOfAgeTimer) clearInterval(comingOfAgeTimer);
  if (listingDigestTimer) clearInterval(listingDigestTimer);
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

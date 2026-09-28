import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S1-INT-01 — "All five notifications send as queued jobs and retry on
   failure."

   The queued half is in property-onboarding.test.ts (each moment writes a
   notify.email outbox row in the decision's own transaction). This is the
   retry half, against a real pg-boss on the real database: the email queue
   carries its own retry policy, the policy lands on a queue that already
   existed under pg-boss's defaults, and a message whose first send fails is
   sent on a later attempt — once, not twice. Only the vendor is stubbed.
   -------------------------------------------------------------------------- */

const { attempts } = vi.hoisted(() => ({ attempts: [] as string[] }));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: { to: string }) => {
        attempts.push(m.to);
        /* The vendor has a bad minute: the first attempt is refused. */
        return attempts.length === 1 ? { error: { message: "503 Service Unavailable" } } : { data: { id: "em_1" }, error: null };
      },
    };
  },
}));

const { QUEUE_POLICY, applyQueuePolicy } = await import("../worker/queue-policy.mts");

describe("2S1-INT-01 · the email queue says how it retries (pure)", () => {
  it("backs off across half an hour of outage, rather than three attempts in a second", () => {
    expect(QUEUE_POLICY["notify.email"]).toEqual({ retryLimit: 6, retryDelay: 30, retryBackoff: true });
  });

  it("the worker applies it to every queue it creates, on both the send and the work side", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toMatch(/async function ensureQueue[\s\S]*?await applyQueuePolicy\(boss, name\)/);
    expect(worker).toMatch(/await ensureQueue\("notify\.email"\);\s*\n\s*await boss\.work<EmailJob>\("notify\.email"/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("a failed send is retried by pg-boss and sent once", async () => {
  const pg = (await import("pg")).default;
  const { PgBoss } = await import("pg-boss");
  const { handleSendEmail } = await import("../worker/jobs/send-email.mts");
  const { send } = await import("../src/lib/email");

  const SCHEMA = "pgboss_retry_test";
  const KEY = "onboarding.received:er_onboarding:1";
  /* Small pools: this runs beside eighty other files on one database. */
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: SCHEMA, max: 2 });

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "re_test";
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.query(`DELETE FROM "EmailSendLog" WHERE "idempotencyKey" = $1`, [KEY]);
    boss.on("error", () => {});
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: false, wait: true }).catch(() => {});
    await pool.query(`DELETE FROM "EmailSendLog" WHERE "idempotencyKey" = $1`, [KEY]);
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.end();
  });

  it("brings a queue created under the defaults up to the policy", async () => {
    await boss.createQueue("notify.email"); // as a deployed database already has it
    expect((await boss.getQueue("notify.email"))?.retryLimit).toBe(2);
    await applyQueuePolicy(boss, "notify.email");
    expect(await boss.getQueue("notify.email")).toMatchObject({ retryLimit: 6, retryDelay: 30, retryBackoff: true });
  });

  it("the vendor refuses the first attempt; a retry sends it, exactly once", async () => {
    /* The same queue with the delay shortened, so the test does not wait
       thirty seconds for the backoff it has just proven is configured. */
    await boss.updateQueue("notify.email", { retryLimit: 6, retryDelay: 0, retryBackoff: false });

    /* The payload exactly as an onboarding decision queues it. */
    const rows: Array<{ payload: Record<string, unknown> }> = [];
    const tx = { outboxJob: { create: async ({ data }: { data: { payload: Record<string, unknown> } }) => { rows.push(data); return { id: "x" }; } } };
    await send(tx as never, "er_tenant", {
      template: "onboarding.received", to: "dana@retry.invalid", data: { orgName: "Retry FC", contactName: "Dana" }, idempotencyKey: KEY,
    });

    const outcomes: string[] = [];
    await boss.work<Parameters<typeof handleSendEmail>[1]>("notify.email", { pollingIntervalSeconds: 0.5 }, async ([job]) => {
      outcomes.push(await handleSendEmail(pool, job!.data).catch((e: Error) => { outcomes.push(`failed: ${e.message}`); throw e; }));
    });
    const id = await boss.send("notify.email", rows[0]!.payload);

    let job = await boss.getJobById("notify.email", id!);
    for (let i = 0; i < 40 && job?.state !== "completed"; i++) {
      await new Promise((r) => setTimeout(r, 250));
      job = await boss.getJobById("notify.email", id!);
    }
    expect(job?.state).toBe("completed");
    expect(job?.retryCount).toBe(1);
    expect(outcomes).toEqual(["failed: Resend rejected the message: 503 Service Unavailable", "sent"]);
    expect(attempts).toEqual(["dana@retry.invalid", "dana@retry.invalid"]);
    /* The failed attempt released its claim; the successful one holds it. */
    expect((await pool.query(`SELECT 1 FROM "EmailSendLog" WHERE "idempotencyKey" = $1`, [KEY])).rowCount).toBe(1);
  }, 30_000);
});

/**
 * The worker's own code, run once for a spec — 2S8-QA-01.
 *
 * The e2e harness starts the API and the web app, never the worker (its boot
 * seeds demo personas and runs every timer). A step that in production
 * happens in the worker — the payment provider's confirmation, a payout
 * being sent and paid, the delivery sweep that closes an order, the staffing
 * sweep — is run here by calling the very handler the worker calls
 * (backend/worker/index.mts), against the same database. Nothing is
 * re-implemented: this file only routes.
 *
 *   node --import tsx ../e2e/support/worker-run.mts <job> '<json args>'
 *
 * run from backend/ (support/worker.ts does), with the API's environment.
 * Prints one line of JSON — what the handler returned — last.
 *
 * Queued jobs (OutboxJob rows): the worker's drain hands each undispatched
 * row to pg-boss and the job's handler runs; here each named row whose
 * payload carries one of `ids` is marked dispatched and handed to the same
 * handler, round after round, because a handler may queue the next job
 * (payouts.send → payouts.confirm).
 */
import pg from "pg";

import { confirmPayment, sendPayout, completeStandinPayout, confirmPayoutPaid } from "../../backend/src/domain/payouts.ts";
import { sweepDeliveries } from "../../backend/src/domain/delivery.ts";
import { sweepAutoStaffing } from "../../backend/src/domain/auto-staffing.ts";
import { providerName } from "../../backend/src/lib/payment-provider.ts";

type Args = { ids?: string[]; tenantIds?: string[]; daysAhead?: number; at?: string };

/** name → the worker's handler, as worker/index.mts wires it. */
const QUEUED: Record<string, (data: Record<string, string>) => Promise<unknown>> = {
  "payments.confirm": (d) => confirmPayment(d.attemptId!),
  /* As the worker: send; on the stand-in provider, it then pays (or fails, as configured). */
  "payouts.send": async (d) => {
    const sent = await sendPayout(d.payoutId!);
    const standin = sent.sent && providerName() === "standin" ? await completeStandinPayout(d.payoutId!) : null;
    return { sent, standin };
  },
  "payouts.confirm": (d) => confirmPayoutPaid(d.payoutId!),
};

async function drain(names: string[], ids: string[]) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const ran: Array<{ name: string; result: unknown }> = [];
  try {
    for (let round = 0; round < 5; round++) {
      const { rows } = await pool.query<{ id: string; name: string; payload: Record<string, string> }>(
        `select id, name, payload from "OutboxJob"
          where name = any($1) and "dispatchedAt" is null and payload::text like any($2)
          order by "createdAt"`,
        [names, ids.map((id) => `%${id}%`)],
      );
      if (!rows.length) break;
      for (const r of rows) {
        await pool.query(`update "OutboxJob" set "dispatchedAt" = now() where id = $1`, [r.id]);
        ran.push({ name: r.name, result: await QUEUED[r.name]!(r.payload) });
      }
    }
  } finally {
    await pool.end();
  }
  return ran;
}

const [job, raw] = process.argv.slice(2);
const args = JSON.parse(raw ?? "{}") as Args;
let result: unknown;
if (job === "sweepDeliveries") {
  /* The sweep takes its clock as an argument: time moves for it alone. */
  result = await sweepDeliveries(new Date(Date.now() + (args.daysAhead ?? 0) * 864e5), { tenantIds: args.tenantIds });
} else if (job === "sweepAutoStaffing") {
  /* Its clock too: an offer expires by time passing, which the sweep is told. */
  result = await sweepAutoStaffing(args.at ? new Date(args.at) : new Date(), { tenantIds: args.tenantIds });
} else if (job && QUEUED[job]) {
  if (!args.ids?.length) throw new Error(`${job} needs the ids its jobs name`);
  result = await drain(job === "payouts.send" ? ["payouts.send", "payouts.confirm"] : [job], args.ids);
} else {
  throw new Error(`No worker job "${job}"`);
}
console.log(JSON.stringify(result ?? null));
process.exit(0);

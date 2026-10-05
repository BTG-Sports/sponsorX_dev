/**
 * Run one of the worker's handlers for a spec — 2S8-QA-01. See
 * worker-run.mts for what each job is and why the harness has no worker.
 *
 * A child process, not an import: the backend is an ES module workspace
 * with a generated Prisma client, and the handlers must run exactly as the
 * worker runs them — under tsx, from backend/, with the API's environment
 * (DATABASE_URL, the Clerk keys the config validates, the payment provider).
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const BACKEND = path.resolve(__dirname, "../../backend");
const SCRIPT = path.resolve(__dirname, "worker-run.mts");

export type WorkerJob = "payments.confirm" | "payouts.send" | "sweepDeliveries" | "sweepAutoStaffing";

export async function runWorker<T = unknown>(
  job: WorkerJob,
  args: { ids?: string[]; tenantIds?: string[]; daysAhead?: number } = {},
): Promise<T> {
  try {
    const { stdout } = await run(process.execPath, ["--import", "tsx", SCRIPT, job, JSON.stringify(args)], {
      cwd: BACKEND,
      env: process.env,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const last = stdout.trim().split("\n").pop() ?? "null";
    return JSON.parse(last) as T;
  } catch (e) {
    const err = e as Error & { stdout?: string; stderr?: string };
    throw new Error(`worker job ${job} failed: ${err.message}\n${err.stderr ?? ""}\n${err.stdout ?? ""}`);
  }
}

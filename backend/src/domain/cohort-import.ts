/**
 * Pilot cohort import — P3-DATA-01.
 *
 * "The first 25 athletes can be imported as a job, run against staging first —
 * never hand-seeded into production."
 *
 * THREE CLAUSES, THREE MECHANISMS.
 *
 *   - AS A JOB. `requestCohortImport` validates the file and writes one
 *     `athlete.importCohort` row to the outbox; the worker runs `importCohort`.
 *     The operator's command never writes an athlete itself.
 *   - STAGING FIRST. Production refuses a file whose fingerprint is not listed
 *     in `COHORT_IMPORT_APPROVED_SHA256`. The fingerprint is printed by every
 *     run, so the path is: run on staging, check the result, add that exact
 *     fingerprint to production's variables, run on production. A file edited
 *     after its staging run has a different fingerprint and is refused.
 *   - NEVER HAND-SEEDED. An imported athlete is created by `createApplicantIn`
 *     — the same code `/join` uses — and moved to SUBMITTED through the state
 *     machine, so it lands in the review queue like any applicant. Import is a
 *     faster way to apply, not a way around approval (§39's loop starts with
 *     application → approval, and this does not skip it).
 *
 * IDEMPOTENT BY EMAIL. A row whose email already belongs to an athlete in the
 * tenant is skipped, so a job that is retried — or a file that is run twice —
 * creates nobody twice. There is no unique index on email (an athlete may
 * legitimately re-apply after a rejection), so the check is a lookup.
 *
 * NO EMAIL IS SENT. `/join` sends "we have your application"; an imported
 * athlete did not apply through the site and BTG contacts the pilot cohort
 * directly, so a confirmation of something they did not do would confuse.
 */
import { createHash } from "node:crypto";

import { prisma } from "../db/client";
import { enqueue } from "../db/outbox";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import { AthleteApplicationInput } from "../contracts/athlete";
import { transitionAthleteIn } from "./athlete";
import { asSystem, createApplicantIn } from "./application-intake";

/** The pilot is 25; the cap is headroom, not a target. */
export const COHORT_IMPORT_MAX_ROWS = 200;

/** Scalar columns, named exactly as the application contract names them. */
const SCALAR_COLUMNS = [
  "legalName", "displayName", "email", "phone", "birthDate", "ageBand", "city",
  "stateCode", "sport", "position", "school", "level", "gradYear", "achievements",
] as const;

/** One handle column per platform, plus an optional follower count. */
const SOCIAL_COLUMNS = {
  instagram: "INSTAGRAM",
  tiktok: "TIKTOK",
  youtube: "YOUTUBE",
  x: "X",
} as const;

export type CohortRow = AthleteApplicationInput;
export type CohortRowError = { line: number; email: string | null; errors: string[] };

export class CohortFileInvalidError extends Error {
  readonly status = 422;
  constructor(readonly rowErrors: CohortRowError[], summary?: string) {
    super(
      summary ??
        `${rowErrors.length} row(s) failed validation. Nothing was queued — ` +
          `a cohort is imported whole or not at all, so a fix-and-rerun never ` +
          `has to reason about which half already went in.`,
    );
    this.name = "CohortFileInvalidError";
  }
}

export class ProductionImportNotApprovedError extends Error {
  readonly status = 409;
  constructor(readonly sha256: string) {
    super(
      `This cohort file (sha256 ${sha256}) has not been approved for production. ` +
        `Run it on staging first, check the result, then add this fingerprint ` +
        `to COHORT_IMPORT_APPROVED_SHA256 in production's variables.`,
    );
    this.name = "ProductionImportNotApprovedError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Parsing
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * RFC 4180 CSV — quoted fields, doubled quotes, commas and newlines inside
 * quotes. Twenty lines rather than a dependency: the input is a 25-row file a
 * person exported from a spreadsheet.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * CSV text → validated application inputs, or every row's errors at once.
 *
 * All-or-nothing on purpose: an operator fixing a file wants the whole list of
 * problems in one pass, not one per run.
 */
export function parseCohortCsv(text: string): CohortRow[] {
  const [header, ...lines] = parseCsv(text);
  if (!header) throw new CohortFileInvalidError([], "The file is empty.");

  const columns = header.map((h) => h.trim());
  const known = new Set<string>([
    ...SCALAR_COLUMNS,
    ...Object.keys(SOCIAL_COLUMNS),
    ...Object.keys(SOCIAL_COLUMNS).map((p) => `${p}Followers`),
  ]);
  const unknown = columns.filter((c) => c && !known.has(c));
  if (unknown.length) {
    throw new CohortFileInvalidError(
      [],
      `Unknown column(s): ${unknown.join(", ")}. A misspelled header would ` +
        `silently drop that field for every athlete, so it is refused instead.`,
    );
  }
  if (lines.length === 0) throw new CohortFileInvalidError([], "The file has a header but no rows.");
  if (lines.length > COHORT_IMPORT_MAX_ROWS) {
    throw new CohortFileInvalidError(
      [],
      `${lines.length} rows is over the ${COHORT_IMPORT_MAX_ROWS}-row limit for one import.`,
    );
  }

  const rows: CohortRow[] = [];
  const errors: CohortRowError[] = [];
  const seen = new Set<string>();

  lines.forEach((cells, i) => {
    const line = i + 2; // 1-based, after the header — what a spreadsheet shows
    const get = (name: string) => {
      const v = cells[columns.indexOf(name)]?.trim();
      return v ? v : undefined;
    };

    const raw: Record<string, unknown> = {};
    for (const col of SCALAR_COLUMNS) {
      const v = get(col);
      if (v !== undefined) raw[col] = col === "gradYear" ? Number(v) : v;
    }
    raw.socials = Object.entries(SOCIAL_COLUMNS)
      .filter(([col]) => get(col))
      .map(([col, platform]) => {
        const followers = get(`${col}Followers`);
        return {
          platform,
          handle: get(col)!.replace(/^@/, ""),
          ...(followers !== undefined ? { followers: Number(followers) } : {}),
        };
      });

    const parsed = AthleteApplicationInput.safeParse(raw);
    const email = typeof raw.email === "string" ? raw.email.toLowerCase() : null;
    if (!parsed.success) {
      errors.push({
        line,
        email,
        errors: parsed.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`),
      });
      return;
    }
    if (email && seen.has(email)) {
      errors.push({ line, email, errors: ["email: appears more than once in this file"] });
      return;
    }
    if (email) seen.add(email);
    rows.push(parsed.data);
  });

  if (errors.length) throw new CohortFileInvalidError(errors);
  return rows;
}

/**
 * The file's identity: sha256 of the validated rows, not of the bytes. Two
 * exports of the same cohort that differ only in line endings or column order
 * are the same cohort; a changed email or birth date is not.
 */
export function cohortFingerprint(rows: CohortRow[]): string {
  const canonical = rows
    .map((r) => JSON.stringify(r, Object.keys(r).sort()))
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

/** Staging and developer machines run freely; production needs approval. */
export function assertImportAllowed(
  sha256: string,
  environment = env.RAILWAY_ENVIRONMENT_NAME,
  approved = env.COHORT_IMPORT_APPROVED_SHA256,
): void {
  if (environment !== "production") return;
  const list = approved.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.includes(sha256)) throw new ProductionImportNotApprovedError(sha256);
}

/* ────────────────────────────────────────────────────────────────────────────
   Queueing and running
   ──────────────────────────────────────────────────────────────────────────── */

export type CohortImportJob = {
  tenantId: string;
  source: string;
  sha256: string;
  rows: CohortRow[];
};

/**
 * Validate, gate and queue. Called by `scripts/cohort-import.mts`, the
 * operator's command. Writes nothing but the outbox row and its audit entry.
 */
export async function requestCohortImport(
  csv: string,
  source: string,
  tenantId = env.PUBLIC_INTAKE_TENANT_ID,
): Promise<{ sha256: string; count: number; environment: string }> {
  const rows = parseCohortCsv(csv);
  const sha256 = cohortFingerprint(rows);
  assertImportAllowed(sha256);

  const actor: AuditActor = { userId: null, tenantId };
  await prisma.$transaction(async (tx) => {
    await enqueue(tx, tenantId, "athlete.importCohort", { tenantId, source, sha256, rows });
    await audit(tx, actor, "athlete.importRequested", "CohortImport", sha256, {
      after: { source, count: rows.length, environment: env.RAILWAY_ENVIRONMENT_NAME ?? "local" },
    });
  });

  return { sha256, count: rows.length, environment: env.RAILWAY_ENVIRONMENT_NAME ?? "local" };
}

export type CohortImportOutcome = {
  created: number;
  skipped: { email: string; reason: string }[];
};

/**
 * The job. One transaction per athlete: a failure on row 14 must not undo the
 * thirteen before it, and because rows already imported are skipped by email,
 * a retry after that failure picks up exactly where it stopped.
 */
export async function importCohort(job: CohortImportJob): Promise<CohortImportOutcome> {
  const actor: AuditActor = { userId: null, tenantId: job.tenantId };
  const outcome: CohortImportOutcome = { created: 0, skipped: [] };

  for (const row of job.rows) {
    const email = row.email.toLowerCase();
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.athlete.findFirst({
        where: { tenantId: job.tenantId, email },
        select: { id: true },
      });
      if (existing) return false;

      const athlete = await createApplicantIn(tx, job.tenantId, actor, row, {
        importedFrom: job.source,
        cohortSha256: job.sha256,
      });
      await transitionAthleteIn(tx, asSystem(actor), athlete.id, "SUBMITTED");
      return true;
    });

    if (created) outcome.created += 1;
    else outcome.skipped.push({ email, reason: "an athlete with this email already exists" });
  }

  return outcome;
}

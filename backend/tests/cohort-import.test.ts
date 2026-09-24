/**
 * P3-DATA-01 — "The first 25 athletes can be imported as a job, run against
 * staging first — never hand-seeded into production."
 *
 * Each clause has its own block below: the file is validated whole, the
 * production gate refuses an unapproved fingerprint, the command only queues,
 * and the job creates through the applicant path and skips what exists.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const outbox: { name: string; payload: Record<string, unknown> }[] = [];
const audits: string[] = [];
const created: { email: string; extra: Record<string, unknown> }[] = [];
const transitions: string[] = [];
let existingEmails = new Set<string>();

vi.mock("../src/config/env", () => ({
  env: { PUBLIC_INTAKE_TENANT_ID: "t1", RAILWAY_ENVIRONMENT_NAME: "staging", COHORT_IMPORT_APPROVED_SHA256: "" },
}));
vi.mock("../src/db/outbox", () => ({
  enqueue: async (_tx: unknown, _t: string, name: string, payload: Record<string, unknown>) => {
    outbox.push({ name, payload });
  },
}));
vi.mock("../src/db/audit", () => ({
  audit: async (_tx: unknown, _a: unknown, action: string) => { audits.push(action); },
}));
vi.mock("../src/domain/athlete", () => ({
  transitionAthleteIn: async (_tx: unknown, _a: unknown, id: string, to: string) => {
    transitions.push(`${id}->${to}`);
  },
}));
vi.mock("../src/domain/application-intake", () => ({
  asSystem: (a: { tenantId: string }) => ({ system: true, tenantId: a.tenantId, userId: null }),
  createApplicantIn: async (_tx: unknown, _t: string, _a: unknown, row: { email: string }, extra: Record<string, unknown>) => {
    created.push({ email: row.email, extra });
    return { id: `ath_${created.length}` };
  },
}));
vi.mock("../src/db/client", () => {
  const tx = {
    athlete: {
      findFirst: ({ where }: { where: { email: string } }) =>
        Promise.resolve(existingEmails.has(where.email) ? { id: "old" } : null),
    },
  };
  return { prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

const {
  parseCsv, parseCohortCsv, cohortFingerprint, assertImportAllowed,
  requestCohortImport, importCohort, CohortFileInvalidError, ProductionImportNotApprovedError,
} = await import("../src/domain/cohort-import");

const HEADER = "legalName,displayName,email,birthDate,stateCode,sport,instagram,instagramFollowers";
const row = (n: number) =>
  `Athlete ${n} Smith,A${n},athlete${n}@example.com,2004-0${(n % 9) + 1}-15,TX,Basketball,@a${n},${n * 100}`;
const cohort = (count: number) => [HEADER, ...Array.from({ length: count }, (_, i) => row(i + 1))].join("\n");

beforeEach(() => {
  outbox.length = 0; audits.length = 0; created.length = 0; transitions.length = 0;
  existingEmails = new Set();
});

describe("the file is validated whole", () => {
  it("reads quoted fields, doubled quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("accepts the pilot's 25 athletes and maps socials", () => {
    const rows = parseCohortCsv(cohort(25));
    expect(rows).toHaveLength(25);
    expect(rows[0]!.socials).toEqual([
      { platform: "INSTAGRAM", handle: "a1", followers: 100, source: "SELF_REPORTED" },
    ]);
  });

  it("reports every bad row at once, with its spreadsheet line", () => {
    const text = [HEADER, row(1), "No Email,NE,,2004-01-01,TX,Soccer,,", "Bad State,BS,b@x.com,2004-01-01,TEXAS,Soccer,,"].join("\n");
    try {
      parseCohortCsv(text);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CohortFileInvalidError);
      expect((e as InstanceType<typeof CohortFileInvalidError>).rowErrors.map((r) => r.line)).toEqual([3, 4]);
    }
  });

  it("refuses a misspelled column rather than dropping the field", () => {
    expect(() => parseCohortCsv("legalName,emial\nA,a@x.com")).toThrow(/Unknown column/);
  });

  it("refuses the same email twice in one file", () => {
    expect(() => parseCohortCsv([HEADER, row(1), row(1)].join("\n"))).toThrow(CohortFileInvalidError);
  });

  it("fingerprints the cohort, not the bytes", () => {
    const a = parseCohortCsv(cohort(3));
    const b = parseCohortCsv(cohort(3).replace(/\n/g, "\r\n"));
    expect(cohortFingerprint(a)).toBe(cohortFingerprint(b));
    const c = parseCohortCsv(cohort(3).replace("athlete2@", "athlete2b@"));
    expect(cohortFingerprint(c)).not.toBe(cohortFingerprint(a));
  });
});

describe("staging first — production needs that file's approval", () => {
  const sha = cohortFingerprint(parseCohortCsv(cohort(25)));

  it("runs freely on staging and on a developer machine", () => {
    expect(() => assertImportAllowed(sha, "staging", "")).not.toThrow();
    expect(() => assertImportAllowed(sha, undefined, "")).not.toThrow();
  });

  it("refuses an unapproved file in production", () => {
    expect(() => assertImportAllowed(sha, "production", "")).toThrow(ProductionImportNotApprovedError);
    expect(() => assertImportAllowed(sha, "production", "deadbeef")).toThrow(ProductionImportNotApprovedError);
  });

  it("allows the exact approved fingerprint in production", () => {
    expect(() => assertImportAllowed(sha, "production", ` other , ${sha.toUpperCase()} `)).not.toThrow();
  });
});

describe("imported as a job", () => {
  it("the command queues one job and creates nobody itself", async () => {
    const out = await requestCohortImport(cohort(25), "pilot.csv");
    expect(out.count).toBe(25);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.name).toBe("athlete.importCohort");
    expect((outbox[0]!.payload.rows as unknown[]).length).toBe(25);
    expect(created).toEqual([]);
    expect(audits).toEqual(["athlete.importRequested"]);
  });

  it("queues nothing when any row is invalid", async () => {
    await expect(requestCohortImport([HEADER, row(1), "x,y,not-an-email,,TX,S,,"].join("\n"), "bad.csv"))
      .rejects.toThrow(CohortFileInvalidError);
    expect(outbox).toEqual([]);
  });

  it("creates each athlete through the applicant path, as SUBMITTED", async () => {
    const rows = parseCohortCsv(cohort(3));
    const out = await importCohort({ tenantId: "t1", source: "pilot.csv", sha256: "abc", rows });
    expect(out.created).toBe(3);
    expect(transitions).toEqual(["ath_1->SUBMITTED", "ath_2->SUBMITTED", "ath_3->SUBMITTED"]);
    expect(created[0]!.extra).toEqual({ importedFrom: "pilot.csv", cohortSha256: "abc" });
  });

  it("skips athletes that already exist, so a rerun duplicates nobody", async () => {
    existingEmails = new Set(["athlete2@example.com"]);
    const rows = parseCohortCsv(cohort(3));
    const out = await importCohort({ tenantId: "t1", source: "pilot.csv", sha256: "abc", rows });
    expect(out.created).toBe(2);
    expect(out.skipped).toEqual([{ email: "athlete2@example.com", reason: "an athlete with this email already exists" }]);
  });
});

describe("the import is reachable", () => {
  it("the operator command calls requestCohortImport", () => {
    const cli = readFileSync(new URL("../scripts/cohort-import.mts", import.meta.url), "utf8");
    expect(cli).toContain("requestCohortImport(");
  });

  it("the worker handles athlete.importCohort with importCohort", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toContain('boss.work<CohortImportJob>("athlete.importCohort"');
    expect(worker).toContain("importCohort(job.data)");
  });

  it("the npm script points at the command", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts["cohort:import"]).toContain("scripts/cohort-import.mts");
  });
});

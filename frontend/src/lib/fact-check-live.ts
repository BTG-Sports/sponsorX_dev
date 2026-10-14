/* --------------------------------------------------------------------------
   The nightly figures check on the Integrations screen — 3S1-FE-01.

   Reads the `facts` section of GET /operations/integration-health
   (backend/src/domain/fact-nightly.ts, FactCheckStatus): every night the
   worker compares the report figures (the fact ledger and its daily
   summaries) with the app's own records. This turns that answer into one of
   four states the page draws:

     never     — the check has not run yet in this environment
     failed    — the last check could not run (a database error); this is
                 NOT a mismatch, and nobody was emailed about it
     matching  — the figures agree with the app
     mismatch  — they don't: since when, and the differences in words

   Pure — no fetch, no React — so the states are tested on their own.
   -------------------------------------------------------------------------- */

export type ApiFactCheck = {
  lastRunAt: string | null;
  matches: boolean | null;
  failingSince: string | null;
  differences: { campaign: string | null; measure: string; what: string; app: number; facts: number }[];
  differenceCount: number;
  emails: boolean;
  lastError: string | null;
};

export type FactCheckView =
  | { state: "never"; emails: boolean }
  | { state: "failed"; lastRunAt: string; error: string; emails: boolean }
  | { state: "matching"; lastRunAt: string; emails: boolean }
  | {
      state: "mismatch";
      lastRunAt: string;
      failingSince: string | null;
      differences: string[];
      /** Differences beyond the ones the API sent (it sends at most 20). */
      more: number;
      count: number;
      emails: boolean;
    };

export function factCheckView(f: ApiFactCheck): FactCheckView {
  const emails = f.emails;
  if (!f.lastRunAt) return { state: "never", emails };
  /* matches is null when the last run recorded an error — it never got far
     enough to compare anything. */
  if (f.matches === null) return { state: "failed", lastRunAt: f.lastRunAt, error: f.lastError ?? "no error recorded", emails };
  if (f.matches) return { state: "matching", lastRunAt: f.lastRunAt, emails };
  const count = Math.max(f.differenceCount, f.differences.length);
  return {
    state: "mismatch",
    lastRunAt: f.lastRunAt,
    failingSince: f.failingSince,
    differences: f.differences.map((d) => d.what),
    more: count - f.differences.length,
    count,
    emails,
  };
}

/** The line it adds to the page's "needs attention" summary, or null when it needs none. */
export function factCheckProblem(v: FactCheckView): string | null {
  if (v.state === "mismatch") return `report figures don't match the app (${v.count} difference${v.count === 1 ? "" : "s"})`;
  if (v.state === "failed") return "the nightly figures check could not run";
  return null;
}

/** "2026-10-12" → "Oct 12" (the API sends the failing night as a date, not a time). */
export function nightLabel(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

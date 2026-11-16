import { rates } from "@/lib/fixtures";

/* The §5 NIL job's name for its code ("SX-03" → "Athlete Reel"), so a roster
   line can say which job it is. The names are the catalogue's (the same
   constants /packages uses). */
const NAMES: Record<string, string> = Object.fromEntries(rates.map((r) => [r.jobId, r.name]));

/* POL-FE-72 — `live` is GET /catalogue/jobs as id → name (the NilJob table,
   which BTG can rename). It wins; the constants above are only the fallback
   for a page that couldn't read the catalogue. */
type Names = Readonly<Record<string, string>>;

/** The job's name, or its code when the catalogue doesn't know it. */
export function jobName(jobId: string, live?: Names): string {
  return live?.[jobId] ?? NAMES[jobId] ?? jobId;
}

/** The job's name, or null for a code the catalogue doesn't know — for a
 *  sub-line, where a raw code would read as noise. */
export function knownJobName(jobId: string, live?: Names): string | null {
  return live?.[jobId] ?? NAMES[jobId] ?? null;
}

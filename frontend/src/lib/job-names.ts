import { rates } from "@/lib/fixtures";

/* The §5 NIL job's name for its code ("SX-03" → "Athlete Reel"), so a roster
   line can say which job it is. The names are the catalogue's (the same
   constants /packages uses). */
const NAMES: Record<string, string> = Object.fromEntries(rates.map((r) => [r.jobId, r.name]));

/** The job's name, or its code when the catalogue doesn't know it. */
export function jobName(jobId: string): string {
  return NAMES[jobId] ?? jobId;
}

/** The job's name, or null for a code the catalogue doesn't know — for a
 *  sub-line, where a raw code would read as noise. */
export function knownJobName(jobId: string): string | null {
  return NAMES[jobId] ?? null;
}

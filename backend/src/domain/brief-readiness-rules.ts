/**
 * The brief readiness checklist — P4-BE-07 (BTG admin review item 18).
 *
 * The programme owner (2026-10-03): BTG keeps the decision to qualify and
 * approve a brief; the system does the looking-up a reviewer would otherwise
 * do by hand before deciding. This is that looking-up, as a checklist
 * computed on read. NOTHING HERE MOVES A BRIEF: a DRAFT brief whose first
 * five checks pass is "ready for review", and a person still qualifies it.
 *
 * Pure: no database, no clock — `brief-readiness.ts` gathers the inputs.
 *
 * THE RULES, AND THE NUMBERS CHOSEN.
 *   1. Objective written — at least OBJECTIVE_MIN_WORDS words. A brief is a
 *      sentence or two about what the sponsor wants; fewer than eight words
 *      ("more sales", "brand awareness for spring") is a placeholder BTG
 *      would have to phone the sponsor about.
 *   2. Dates — the start is after now, the end is after the start, and the
 *      campaign runs at least MIN_CAMPAIGN_DAYS. Nothing in the code set a
 *      minimum length, so a week: the shortest job template schedules items
 *      a week apart (SX-04, SX-07), and a shorter window cannot hold them.
 *   3. Budget at or above the price floor (P0-PMO-13, the pricing floor
 *      decision): with a package, at least the package's price — its lowest
 *      list price, `priceLow`, when the package is a range; without one, at
 *      least the lowest sell floor of any NIL job (the cheapest single line
 *      BTG could sell under the 1.4x rule — today SX-01 at Emerging, $70).
 *      Package prices and NIL floors are whole dollars; the budget is cents.
 *   4. The sponsor is approved and in good standing — not rejected by BTG,
 *      and its account not closed.
 *   5. Eligible athletes exist after conflicts — the matching rule
 *      (ACTIVE, the brief's targeting, the §26 category exclusion) finds at
 *      least one. The count is shown.
 *   6. Category conflicts flagged — how many otherwise-eligible athletes the
 *      brief's categories exclude. Information, never a failure.
 */

export const OBJECTIVE_MIN_WORDS = 8;
export const MIN_CAMPAIGN_DAYS = 7;
const DAY = 86_400_000;

export type ReadinessKey = "objective" | "dates" | "budget" | "sponsor" | "eligible" | "conflicts";
export type ReadinessCheck = { key: ReadinessKey; ok: boolean; text: string; count?: number };
/** The checks that decide "ready for review" — conflicts only informs. */
export const READY_KEYS: readonly ReadinessKey[] = ["objective", "dates", "budget", "sponsor", "eligible"];

export type ReadinessInput = {
  objective: string;
  startDate: Date;
  endDate: Date;
  /** cents */
  budget: number;
  /** priceLow in whole dollars, the catalogue's unit. */
  package: { name: string; priceLow: number } | null;
  /** The lowest NIL job sell floor in the tenant, whole dollars; null with no catalogue. */
  lowestJobFloor: { dollars: number; jobId: string; jobName: string; tier: string } | null;
  sponsor: { ok: true } | { ok: false; reason: string };
  eligibleCount: number;
  conflictCount: number;
  now: Date;
};

/** "$2,500", "$1,500.50" — from cents. */
export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** The checklist. Pure. */
export function briefReadiness(i: ReadinessInput): ReadinessCheck[] {
  const out: ReadinessCheck[] = [];

  const words = wordCount(i.objective);
  out.push(
    words >= OBJECTIVE_MIN_WORDS
      ? { key: "objective", ok: true, text: `Objective written (${words} words)` }
      : {
          key: "objective",
          ok: false,
          text: words === 0
            ? "No objective written"
            : `Objective is too short — ${plural(words, "word", "words")}, at least ${OBJECTIVE_MIN_WORDS} needed`,
        },
  );

  const problems: string[] = [];
  if (i.startDate.getTime() <= i.now.getTime()) problems.push(`the start date (${day(i.startDate)}) isn't in the future`);
  const days = Math.round((i.endDate.getTime() - i.startDate.getTime()) / DAY);
  if (i.endDate.getTime() <= i.startDate.getTime()) problems.push("the end date isn't after the start date");
  else if (days < MIN_CAMPAIGN_DAYS) problems.push(`it runs ${plural(days, "day", "days")} — at least ${MIN_CAMPAIGN_DAYS} are needed`);
  out.push(
    problems.length
      ? { key: "dates", ok: false, text: `Dates: ${problems.join("; ")}` }
      : { key: "dates", ok: true, text: `Runs ${day(i.startDate)} – ${day(i.endDate)} (${plural(days, "day", "days")})` },
  );

  const budget = money(i.budget);
  if (i.package) {
    const floor = i.package.priceLow * 100;
    out.push(
      i.budget >= floor
        ? { key: "budget", ok: true, text: `Budget ${budget} covers the ${i.package.name} price (${money(floor)})` }
        : { key: "budget", ok: false, text: `Budget ${budget} is below the ${i.package.name} price (${money(floor)})` },
    );
  } else if (!i.lowestJobFloor) {
    out.push({ key: "budget", ok: false, text: "No NIL job prices to check the budget against" });
  } else {
    const f = i.lowestJobFloor;
    const floor = f.dollars * 100;
    const what = `the lowest NIL job sell floor (${money(floor)} — ${f.jobId} ${f.jobName}, ${f.tier.toLowerCase()})`;
    out.push(
      i.budget >= floor
        ? { key: "budget", ok: true, text: `Budget ${budget} is at or above ${what}` }
        : { key: "budget", ok: false, text: `Budget ${budget} is below ${what}` },
    );
  }

  out.push(
    i.sponsor.ok
      ? { key: "sponsor", ok: true, text: "Sponsor approved and in good standing" }
      : { key: "sponsor", ok: false, text: i.sponsor.reason },
  );

  out.push(
    i.eligibleCount > 0
      ? { key: "eligible", ok: true, count: i.eligibleCount, text: `${plural(i.eligibleCount, "athlete", "athletes")} eligible after conflicts` }
      : { key: "eligible", ok: false, count: 0, text: "No athletes eligible after conflicts" },
  );

  out.push({
    key: "conflicts",
    ok: true,
    count: i.conflictCount,
    text: i.conflictCount === 0
      ? "No category conflicts"
      : `${plural(i.conflictCount, "otherwise-eligible athlete", "otherwise-eligible athletes")} excluded — they refused a category on this brief`,
  });

  return out;
}

/** Ready for review: a DRAFT brief whose deciding checks all pass. Pure. */
export function isReady(state: string, checks: readonly ReadinessCheck[]): boolean {
  return state === "DRAFT" && READY_KEYS.every((k) => checks.find((c) => c.key === k)?.ok === true);
}

/** The lowest sell floor over a tenant's NIL jobs, any priced tier. Pure. */
export function lowestJobFloor(
  jobs: readonly { id: string; name: string; sellFloorEmerging: number; sellFloorCreator: number; sellFloorPremium: number }[],
): ReadinessInput["lowestJobFloor"] {
  let best: ReadinessInput["lowestJobFloor"] = null;
  for (const j of jobs) {
    for (const [tier, dollars] of [["EMERGING", j.sellFloorEmerging], ["CREATOR", j.sellFloorCreator], ["PREMIUM", j.sellFloorPremium]] as const) {
      if (!best || dollars < best.dollars || (dollars === best.dollars && j.id < best.jobId)) {
        best = { dollars, jobId: j.id, jobName: j.name, tier };
      }
    }
  }
  return best;
}

/**
 * The sponsor's standing, from what already records it. Pure.
 *
 * Approval lives on the sponsor's request (2S1-BE-05/-17): the latest one
 * that opened this sponsor is APPROVED, or REJECTED by BTG after approval
 * (logins off) until reinstated. A sponsor BTG opened itself — the managed
 * Phase 1 path, Zoho or the seed — has no request and is approved by that
 * act. Good standing: no open closure of the account (AccountClosure,
 * subject SPONSOR, still CLOSED).
 */
export function sponsorStanding(s: { latestRequestState: string | null; closed: boolean }): ReadinessInput["sponsor"] {
  if (s.latestRequestState === "REJECTED") return { ok: false, reason: "Sponsor's account was rejected by BTG" };
  if (s.latestRequestState && s.latestRequestState !== "APPROVED") {
    return { ok: false, reason: "Sponsor isn't approved yet" };
  }
  if (s.closed) return { ok: false, reason: "Sponsor's account is closed" };
  return { ok: true };
}

/* --------------------------------------------------------------------------
   Matching & roster review — pure module (P4-ART-01 in-app, 2026-09-21).

   Everything the Matching Studio computes lives here, unit-tested and free of
   React: the campaign brief being matched against, the eligible-athlete
   roster (fixtures — the real query is P4-BE-03, Blocked), margin math and
   the 1.4× floor rule (P0-PMO-09), filtering/sorting, slot assignment,
   relax suggestions for the empty state, and the conflict-detail records.

   Money is in CENTS throughout, matching AthleteRate.amount — format with
   fixtures' money(). Scores are stored §14 snapshots (rules-v1): each
   athlete's composite is the rounded mean of its six stored factors, so the
   number stays explainable — never a black-box verdict.

   Athlete cost is BTG-internal. It renders on this staff surface and must
   never reach a sponsor-facing one (the P1-FE-05 field-level rule).
   -------------------------------------------------------------------------- */

export type ReachSource = "VERIFIED_API" | "SELF_REPORTED";
export type GuardianState = "na" | "pending";
/** Live rows add ANCHOR (the backend's top tier) and "Untiered" — an
 *  athlete whose tier nobody has set yet, which is not "Emerging". */
export type MatchTier = "Anchor" | "Premium" | "Creator" | "Emerging" | "Untiered";
/** A fixture job ("JOB-A12") or, live, a package id (P4-FE-02). */
export type JobId = string;

export type MatchAthlete = {
  id: string;
  name: string;
  sport: string;
  market: string;
  tier: MatchTier;
  /** §14 composite, stored snapshot — equals round(mean(factors)) on
   *  fixtures. Live: null when the athlete has never been scored — never
   *  zero, which would be an assessment (§14). */
  score: number | null;
  /** Engagement · Content quality · Audience · Reliability · Geography · Fit.
   *  A null factor was not assessed. */
  factors: (number | null)[];
  /** Summed followers; null when no account reports any. */
  reach: number | null;
  reachSource: ReachSource;
  /** Athlete cost in cents — BTG-internal, from the rate card. */
  cost: number;
  /** Sell price in cents — the job's package price band. */
  sell: number;
  jobId: JobId;
  guardian: GuardianState;
  /** Contract countersigned and profile live. */
  active: boolean;
  /** Declared competing deal — blocks the invitation, never hides the row. */
  conflict: string | null;
  /* ---- live only (P4-FE-02 / -03) ---------------------------------- */
  /** A package job this athlete has no rate for. Without a rate there is
   *  no offer to send, so the row is visible but cannot be shortlisted. */
  noRate?: string | null;
  /** The invitations this pick becomes: one per package line, `offered`
   *  = the athlete's rate × quantity, in cents. */
  lines?: { jobId: string; quantity: number; offered: number }[];
  /** Already invited on this campaign — the roster's SENT / answered state. */
  invite?: string | null;
};

/* ------------------------------------------------------------- the brief */

export const JOBS: {
  id: JobId;
  label: string;
  perAthlete: string;
  slots: number;
  deliverable: string;
}[] = [
  {
    id: "JOB-A12",
    label: "Reel ×2",
    perAthlete: "×3",
    slots: 3,
    deliverable: "2 × Instagram Reel, 30s, sponsor-supplied brief",
  },
  {
    id: "JOB-B04",
    label: "Appearance",
    perAthlete: "×2",
    slots: 2,
    deliverable: "1 × in-person appearance, 2 hours, Austin",
  },
  {
    id: "JOB-C07",
    label: "Photo day",
    perAthlete: "×1",
    slots: 1,
    deliverable: "1 × brand photo day, 4 hours, studio",
  },
];

export const MATCH_BRIEF = {
  campaign: "Southwest Hydration Push",
  sponsor: "Rally Sports Drink",
  code: "CMP-2026-0418",
  /** Sponsor-approved budget, sell side, cents. */
  budget: 6_000_000,
  window: "6 Oct – 28 Nov 2026",
  windowNote: "invitations expire 7 days after send",
  market: "Texas — metro",
  marketNote: "home market must match",
  needed: 6,
  sponsorCategory: "beverages — sports hydration",
  responseDeadline: "24 Sep 2026",
  scoreSnapshot: "2 Sep 2026",
  scoreMethod: "rules-v1",
} as const;

/* ------------------------------------------------------------- the roster

   The eligible-athletes query result for this brief (fixtures). Fourteen
   rows from the accepted design: two carry declared conflicts and stay
   visible, two are minors awaiting guardian confirmation, one is approved
   but not yet countersigned. Composite = round(mean(factors)) — asserted in
   tests so the "explainable score" claim stays true.                       */

export const MATCH_ROSTER: MatchAthlete[] = [
  { id: "maya", name: "Maya Ortiz-Bell", sport: "Track & Field", market: "Austin, TX", tier: "Premium", score: 92, factors: [95, 90, 96, 88, 94, 89], reach: 412_000, reachSource: "VERIFIED_API", cost: 950_000, sell: 1_190_000, jobId: "JOB-A12", guardian: "na", active: true, conflict: null },
  { id: "kwame", name: "Kwame Asante", sport: "Football", market: "Fort Worth, TX", tier: "Premium", score: 90, factors: [92, 88, 91, 93, 90, 86], reach: 355_000, reachSource: "VERIFIED_API", cost: 880_000, sell: 1_190_000, jobId: "JOB-A12", guardian: "na", active: true, conflict: null },
  { id: "dion", name: "Dion Whitaker", sport: "Basketball", market: "Atlanta, GA", tier: "Premium", score: 88, factors: [90, 92, 89, 85, 78, 94], reach: 268_000, reachSource: "VERIFIED_API", cost: 720_000, sell: 1_190_000, jobId: "JOB-A12", guardian: "na", active: true, conflict: null },
  { id: "aiden", name: "Aiden Park", sport: "Golf", market: "Houston, TX", tier: "Premium", score: 86, factors: [82, 91, 84, 90, 88, 81], reach: 205_000, reachSource: "VERIFIED_API", cost: 690_000, sell: 1_190_000, jobId: "JOB-A12", guardian: "na", active: true, conflict: null },
  { id: "amara", name: "Amara Nwosu", sport: "Soccer", market: "Houston, TX", tier: "Creator", score: 85, factors: [88, 84, 80, 86, 90, 82], reach: 154_000, reachSource: "VERIFIED_API", cost: 340_000, sell: 620_000, jobId: "JOB-B04", guardian: "na", active: true, conflict: null },
  { id: "naomi", name: "Naomi Frazier", sport: "Softball", market: "Round Rock, TX", tier: "Creator", score: 83, factors: [85, 80, 78, 88, 87, 80], reach: 121_000, reachSource: "VERIFIED_API", cost: 360_000, sell: 620_000, jobId: "JOB-B04", guardian: "na", active: true, conflict: null },
  { id: "teo", name: "Teo Vasquez", sport: "Baseball", market: "San Antonio, TX", tier: "Creator", score: 81, factors: [84, 78, 74, 82, 88, 80], reach: 96_500, reachSource: "SELF_REPORTED", cost: 290_000, sell: 540_000, jobId: "JOB-B04", guardian: "na", active: true, conflict: null },
  { id: "priya", name: "Priya Raman", sport: "Gymnastics", market: "Frisco, TX", tier: "Emerging", score: 80, factors: [86, 84, 70, 76, 83, 81], reach: 33_600, reachSource: "VERIFIED_API", cost: 130_000, sell: 290_000, jobId: "JOB-C07", guardian: "pending", active: true, conflict: null },
  { id: "jules", name: "Jules Kaminski", sport: "Swimming", market: "Dallas, TX", tier: "Emerging", score: 78, factors: [76, 82, 72, 80, 81, 77], reach: 41_200, reachSource: "VERIFIED_API", cost: 145_000, sell: 290_000, jobId: "JOB-C07", guardian: "na", active: true, conflict: null },
  { id: "bree", name: "Bree Halloran", sport: "Volleyball", market: "Austin, TX", tier: "Creator", score: 76, factors: [78, 74, 70, 75, 82, 77], reach: 88_400, reachSource: "SELF_REPORTED", cost: 310_000, sell: 540_000, jobId: "JOB-B04", guardian: "pending", active: true, conflict: null },
  { id: "lena", name: "Lena Sørensen", sport: "Tennis", market: "Plano, TX", tier: "Creator", score: 74, factors: [75, 78, 68, 74, 76, 73], reach: 62_400, reachSource: "VERIFIED_API", cost: 260_000, sell: 540_000, jobId: "JOB-B04", guardian: "na", active: true, conflict: "Competing deal — racquets" },
  { id: "sasha", name: "Sasha Mbeki", sport: "Rugby", market: "Austin, TX", tier: "Emerging", score: 73, factors: [74, 70, 64, 78, 80, 72], reach: 27_400, reachSource: "SELF_REPORTED", cost: 98_000, sell: 290_000, jobId: "JOB-C07", guardian: "na", active: true, conflict: "Category exclusivity — hydration" },
  { id: "rico", name: "Rico Delgado", sport: "Boxing", market: "El Paso, TX", tier: "Emerging", score: 71, factors: [73, 68, 62, 74, 79, 70], reach: 38_900, reachSource: "VERIFIED_API", cost: 120_000, sell: 290_000, jobId: "JOB-C07", guardian: "na", active: true, conflict: null },
  { id: "cole", name: "Cole Bergstrom", sport: "Hockey", market: "Dallas, TX", tier: "Creator", score: 69, factors: [70, 66, 61, 72, 75, 70], reach: 54_800, reachSource: "VERIFIED_API", cost: 280_000, sell: 540_000, jobId: "JOB-B04", guardian: "na", active: false, conflict: null },
];

/** The design's starting shortlist — includes one below-floor line (Maya). */
export const DEFAULT_SHORTLIST = ["maya", "dion", "amara", "jules"];

/* ---------------------------------------------------------------- margin

   The floor rule (P0-PMO-09): sell must be at least 1.4× athlete cost, per
   line — a healthy blended margin does not excuse a breached line.         */

export const MARGIN_FLOOR = 1.4;
export const MARGIN_THIN = 1.7;

export type MarginBand = "below" | "thin" | "healthy";

export function marginRatio(cost: number, sell: number): number {
  return cost > 0 ? sell / cost : 0;
}

export function marginBand(ratio: number): MarginBand {
  if (ratio < MARGIN_FLOOR) return "below";
  if (ratio < MARGIN_THIN) return "thin";
  return "healthy";
}

/** Margin as a share of the sell price, in whole percent. */
export function marginPct(cost: number, sell: number): number {
  return sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
}

export function fmtRatio(ratio: number): string {
  return `${(Math.round(ratio * 100) / 100).toFixed(2).replace(/0$/, "")}×`;
}

export function blendedMargin(list: MatchAthlete[]): {
  cost: number;
  sell: number;
  ratio: number;
  pct: number;
} {
  const cost = list.reduce((s, a) => s + a.cost, 0);
  const sell = list.reduce((s, a) => s + a.sell, 0);
  return { cost, sell, ratio: marginRatio(cost, sell), pct: marginPct(cost, sell) };
}

/** Shortlisted lines that break the per-line floor. */
export function breachedLines(list: MatchAthlete[]): MatchAthlete[] {
  return list.filter((a) => marginBand(marginRatio(a.cost, a.sell)) === "below");
}

/* --------------------------------------------------------------- status */

export type RowStatusKind = "eligible" | "guardian" | "conflict" | "inactive" | "invited";

export type RowStatus = { kind: RowStatusKind; label: string; sub: string | null };

export const INVITE_LABEL: Record<string, string> = {
  INVITED: "Invited — awaiting",
  VIEWED: "Viewed — awaiting",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export function statusFor(a: MatchAthlete): RowStatus {
  if (a.conflict)
    return { kind: "conflict", label: "Conflict — blocked", sub: a.conflict };
  if (a.invite)
    return {
      kind: "invited",
      label: INVITE_LABEL[a.invite] ?? a.invite,
      sub: "already on this campaign",
    };
  if (a.noRate)
    return {
      kind: "inactive",
      label: "No rate on file",
      sub: `set a ${a.noRate} rate before inviting`,
    };
  if (!a.active)
    return {
      kind: "inactive",
      label: "Activation pending",
      sub: "approved — contract not countersigned",
    };
  if (a.guardian === "pending")
    return {
      kind: "guardian",
      label: "Guardian pending",
      sub: "can be shortlisted, cannot accept",
    };
  return { kind: "eligible", label: "Eligible", sub: null };
}

/** Conflicted, not-yet-active, unpriced and already-invited athletes
 *  cannot join the shortlist. An EXPIRED or DECLINED invite may be re-sent
 *  (invite-state.ts: re-inviting is normal), so only live ones block. */
export function canShortlist(a: MatchAthlete): boolean {
  const live = a.invite === "INVITED" || a.invite === "VIEWED" || a.invite === "ACCEPTED";
  return !a.conflict && a.active && !a.noRate && !live;
}

/* -------------------------------------------------------------- filters */

export type MatchSort = "score" | "margin" | "cost";

export type MatchFilters = {
  q: string;
  sport: string;
  tier: string;
  minScore: number;
  activeOnly: boolean;
  guardianOnly: boolean;
};

export const MIN_SCORE_FLOOR = 40;
export const MIN_SCORE_CEIL = 95;

export const DEFAULT_FILTERS: MatchFilters = {
  q: "",
  sport: "",
  tier: "",
  minScore: MIN_SCORE_FLOOR,
  activeOnly: true,
  guardianOnly: false,
};

export const SORT_OPTIONS: { value: MatchSort; label: string }[] = [
  { value: "score", label: "Score, high to low" },
  { value: "margin", label: "Margin, low to high" },
  { value: "cost", label: "Athlete cost, low to high" },
];

function passesSearch(a: MatchAthlete, needle: string): boolean {
  if (!needle) return true;
  return [a.name, a.sport, a.market, a.tier]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function passes(a: MatchAthlete, f: MatchFilters): boolean {
  return (
    passesSearch(a, f.q.trim().toLowerCase()) &&
    (!f.sport || a.sport === f.sport) &&
    (!f.tier || a.tier === f.tier) &&
    /* Unscored passes only while no minimum is set — a floor is a claim
       about the score, and there is none to compare. */
    (a.score === null ? f.minScore <= MIN_SCORE_FLOOR : a.score >= f.minScore) &&
    (!f.activeOnly || a.active) &&
    (!f.guardianOnly || a.guardian !== "pending")
  );
}

export function sortRoster(list: MatchAthlete[], sort: MatchSort): MatchAthlete[] {
  const c = [...list];
  if (sort === "margin")
    c.sort((a, b) => marginRatio(a.cost, a.sell) - marginRatio(b.cost, b.sell));
  else if (sort === "cost") c.sort((a, b) => a.cost - b.cost);
  else c.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return c;
}

/**
 * §26: conflicted athletes are never filtered away silently. `matched` is
 * the workable set; `blocked` carries every conflicted athlete that the
 * *search* still reaches — the other filters do not hide them, so a manager
 * can always see who was excluded and why.
 */
export function filterRoster(
  roster: MatchAthlete[],
  f: MatchFilters,
  sort: MatchSort = "score",
): { matched: MatchAthlete[]; blocked: MatchAthlete[] } {
  const needle = f.q.trim().toLowerCase();
  return {
    matched: sortRoster(roster.filter((a) => !a.conflict && passes(a, f)), sort),
    blocked: sortRoster(
      roster.filter((a) => Boolean(a.conflict) && passesSearch(a, needle)),
      sort,
    ),
  };
}

export function activeFilterCount(f: MatchFilters): number {
  return (
    (f.q.trim() ? 1 : 0) +
    (f.sport ? 1 : 0) +
    (f.tier ? 1 : 0) +
    (f.minScore > MIN_SCORE_FLOOR ? 1 : 0) +
    (f.activeOnly !== DEFAULT_FILTERS.activeOnly ? 1 : 0) +
    (f.guardianOnly ? 1 : 0)
  );
}

/* ---------------------------------------------------- relax suggestions

   The empty state offers real ways out: each suggestion is the same filter
   set with one constraint dropped, and the count is a genuine re-run of the
   filter — a suggestion that would still yield nothing is not shown.       */

export type RelaxSuggestion = {
  label: string;
  count: number;
  patch: Partial<MatchFilters>;
};

/** Largest multiple of 5 that would re-admit at least one athlete passing
    every *other* constraint — "drop minimum score to 70", computed. */
function scoreRelaxTarget(roster: MatchAthlete[], f: MatchFilters): number | null {
  const others = roster.filter(
    (a) => !a.conflict && passes(a, { ...f, minScore: MIN_SCORE_FLOOR }),
  );
  const scored = others.filter((a) => a.score !== null);
  if (scored.length === 0) return null;
  const top = Math.max(...scored.map((a) => a.score as number));
  return Math.max(MIN_SCORE_FLOOR, Math.floor(top / 5) * 5);
}

export function relaxSuggestions(
  roster: MatchAthlete[],
  f: MatchFilters,
): RelaxSuggestion[] {
  const out: RelaxSuggestion[] = [];
  const countWith = (patch: Partial<MatchFilters>) =>
    filterRoster(roster, { ...f, ...patch }).matched.length;

  if (f.minScore > MIN_SCORE_FLOOR) {
    const target = scoreRelaxTarget(roster, f);
    if (target !== null && target < f.minScore) {
      const patch = { minScore: target };
      const count = countWith(patch);
      if (count > 0)
        out.push({ label: `Drop minimum score to ${target}`, count, patch });
    }
  }
  if (f.tier) {
    const count = countWith({ tier: "" });
    if (count > 0) out.push({ label: "Allow all tiers", count, patch: { tier: "" } });
  }
  if (f.sport) {
    const count = countWith({ sport: "" });
    if (count > 0)
      out.push({ label: "Allow all sports", count, patch: { sport: "" } });
  }
  if (f.q.trim()) {
    const count = countWith({ q: "" });
    if (count > 0)
      out.push({ label: "Clear the search term", count, patch: { q: "" } });
  }
  if (f.guardianOnly) {
    const count = countWith({ guardianOnly: false });
    if (count > 0)
      out.push({
        label: "Include guardian-pending minors",
        count,
        patch: { guardianOnly: false },
      });
  }
  return out;
}

/* ---------------------------------------------------------------- slots */

export type SlotRow = {
  jobId: JobId;
  jobLabel: string;
  athlete: MatchAthlete | null;
};

/** Map the shortlist onto the brief's job slots, in pick order. Picks past a
    job's capacity land in `overflow` — visible, never silently dropped. */
export function slotFill(
  selected: MatchAthlete[],
  jobs = JOBS,
): { slots: SlotRow[]; overflow: MatchAthlete[] } {
  const slots: SlotRow[] = jobs.flatMap((j) =>
    Array.from({ length: j.slots }, () => ({
      jobId: j.id,
      jobLabel: j.label,
      athlete: null as MatchAthlete | null,
    })),
  );
  const overflow: MatchAthlete[] = [];
  for (const a of selected) {
    const open = slots.find((s) => s.jobId === a.jobId && !s.athlete);
    if (open) open.athlete = a;
    else overflow.push(a);
  }
  return { slots, overflow };
}

export function jobFor(id: JobId, jobs: readonly MatchJob[] = JOBS) {
  const j = jobs.find((x) => x.id === id);
  if (!j) throw new Error(`Unknown job ${id}`);
  return j;
}

/* ----------------------------------------------------------------- send */

export type SendSummary = {
  invitations: number;
  guardianCount: number;
  exceptions: MatchAthlete[];
  deadline: string;
};

export function sendSummary(
  selected: MatchAthlete[],
  brief: MatchBrief = MATCH_BRIEF,
): SendSummary {
  return {
    invitations: selected.length,
    guardianCount: selected.filter((a) => a.guardian === "pending").length,
    exceptions: breachedLines(selected),
    deadline: brief.responseDeadline,
  };
}

/** The green-check list on Review & send — derived, so the guardian and
    exception lines appear only when they are true of the roster. */
export function sendSteps(selected: MatchAthlete[], live = false): string[] {
  const s = sendSummary(selected);
  const steps = [
    "Each athlete receives the job, its deliverables and the offer shown here. The invitation window is 7 days.",
  ];
  for (const g of selected.filter((a) => a.guardian === "pending"))
    steps.push(
      `${g.name}'s guardian receives a consent request in parallel; ${g.name.split(" ")[0]} cannot accept until it is confirmed.`,
    );
  steps.push(
    "The sponsor sees the roster and sell prices only — athlete cost stays on BTG staff screens.",
  );
  if (s.exceptions.length > 0)
    steps.push(
      live
        ? `${s.exceptions.length === 1 ? "1 line sits" : `${s.exceptions.length} lines sit`} below the ${MARGIN_FLOOR}× floor. The invitation carries only the athlete's pay; the Campaign Order refuses a below-floor sell price, so reprice before BTG drafts it.`
        : `The margin exception on ${s.exceptions.length === 1 ? "1 line" : `${s.exceptions.length} lines`} is written to the campaign audit log against M. Reyes.`,
    );
  return steps;
}

/* ------------------------------------------------------ compare factors */

export const COMPARE_FACTORS: { label: string; sub: string }[] = [
  { label: "Engagement", sub: "interaction rate, stored" },
  { label: "Content quality", sub: "manual review score" },
  { label: "Audience", sub: "size and retention" },
  { label: "Reliability", sub: "past delivery record" },
  { label: "Geography", sub: "fit to campaign market" },
  { label: "Fit", sub: "sponsor category match" },
];

/* ----------------------------------------------------- conflict details */

export type ConflictFact = {
  k: string;
  v: string;
  tone: "danger" | "warn" | "neutral";
  sub: string;
};

export type ConflictDetail = {
  athleteId: string;
  facts: ConflictFact[];
  why: string;
  provenance: string;
  actions: { title: string; body: string; cta: string }[];
};

export const CONFLICT_DETAILS: Record<string, ConflictDetail> = {
  lena: {
    athleteId: "lena",
    facts: [
      { k: "Conflict type", v: "Declared competing deal", tone: "danger", sub: "athlete-declared, compliance-reviewed" },
      { k: "Counterparty category", v: "Sporting goods — racquets", tone: "neutral", sub: "counterparty name withheld from matching" },
      { k: "Exclusivity scope", v: "Whole-of-endorsement", tone: "danger", sub: "not category-limited" },
      { k: "Deal term", v: "1 Sep 2026 – 31 Dec 2026", tone: "neutral", sub: "covers the full campaign window" },
      { k: "Campaign window", v: MATCH_BRIEF.window, tone: "warn", sub: "54 days of overlap" },
      { k: "Waiver on file", v: "None", tone: "danger", sub: "a written waiver would clear the block" },
    ],
    why:
      "Her declared deal is in sporting goods — racquets, a different category from this sponsor's beverages — sports hydration. The block comes from its exclusivity scope: whole-of-endorsement means no other sponsorship of any kind during the term, and the term covers the entire campaign window. Until the clause is waived in writing she cannot be invited.",
    provenance:
      "Declared by the athlete on 14 Aug 2026 · reviewed by J. Okafor, Compliance",
    actions: [
      {
        title: "Request a waiver",
        body: "Compliance contacts the athlete's rep for a written, campaign-scoped waiver of the exclusivity clause. Typical turnaround is 5–10 working days — tight against this window.",
        cta: "Request waiver",
      },
      {
        title: "Offer a later window",
        body: "Her deal ends 31 Dec 2026. A campaign flighted after that date can invite her without a waiver.",
        cta: "Note on campaign",
      },
      {
        title: "Leave her out of this roster",
        body: "She stays visible and blocked here, and eligible everywhere the conflict does not reach.",
        cta: "Keep excluded",
      },
    ],
  },
  sasha: {
    athleteId: "sasha",
    facts: [
      { k: "Conflict type", v: "Category exclusivity", tone: "danger", sub: "athlete-declared, compliance-reviewed" },
      { k: "Counterparty category", v: "Beverages — sports hydration", tone: "danger", sub: "the same category this sponsor sells" },
      { k: "Exclusivity scope", v: "Category-limited", tone: "neutral", sub: "other categories stay open" },
      { k: "Deal term", v: "1 Jul 2026 – 30 Jun 2027", tone: "neutral", sub: "covers the full campaign window" },
      { k: "Campaign window", v: MATCH_BRIEF.window, tone: "warn", sub: "full overlap" },
      { k: "Waiver on file", v: "None", tone: "danger", sub: "a written waiver would clear the block" },
    ],
    why:
      "His declared deal is category-exclusive in beverages — sports hydration: exactly the category this sponsor sells. §26 requires the category conflict to block the invitation outright; a category-limited clause cannot be worked around by scoping deliverables.",
    provenance:
      "Declared by the athlete on 2 Jul 2026 · reviewed by J. Okafor, Compliance",
    actions: [
      {
        title: "Request a waiver",
        body: "Same-category waivers are rare — the counterparty would be licensing a direct competitor — but compliance can ask.",
        cta: "Request waiver",
      },
      {
        title: "Match him to a different brief",
        body: "The exclusivity is category-limited: briefs outside sports hydration can invite him today.",
        cta: "Note on athlete",
      },
      {
        title: "Leave him out of this roster",
        body: "He stays visible and blocked here, and eligible everywhere the conflict does not reach.",
        cta: "Keep excluded",
      },
    ],
  },
};

/* ------------------------------------------------------------ formatting */

const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function fmtReach(n: number | null): string {
  return n === null ? "—" : compactFmt.format(n);
}

/* --------------------------------------------------------- the data bundle

   Everything the Studio renders, in one value, so the same island runs on
   fixtures (the demo) or on a real brief (P4-FE-02). The Studio reads it
   through context rather than the module constants above.                 */

export type MatchJob = (typeof JOBS)[number];
export type MatchBrief = {
  campaign: string;
  sponsor: string;
  code: string;
  budget: number;
  window: string;
  windowNote: string;
  market: string;
  marketNote: string;
  needed: number;
  sponsorCategory: string;
  responseDeadline: string;
  scoreSnapshot: string;
  scoreMethod: string;
};

export type MatchData = {
  brief: MatchBrief;
  jobs: MatchJob[];
  roster: MatchAthlete[];
  defaultShortlist: string[];
  conflicts: Record<string, ConflictDetail>;
  /** True when rows come from Postgres — sends are real, no Undo. */
  live: boolean;
  /** Live: why this brief cannot send yet (e.g. not APPROVED), or null. */
  sendBlocked?: string | null;
};

export const FIXTURE_MATCH: MatchData = {
  brief: MATCH_BRIEF,
  jobs: JOBS,
  roster: MATCH_ROSTER,
  defaultShortlist: DEFAULT_SHORTLIST,
  conflicts: CONFLICT_DETAILS,
  live: false,
};

export function athleteById(id: string, roster = MATCH_ROSTER): MatchAthlete | null {
  return roster.find((a) => a.id === id) ?? null;
}

export function byIds(ids: string[], roster = MATCH_ROSTER): MatchAthlete[] {
  return ids
    .map((id) => roster.find((a) => a.id === id))
    .filter((a): a is MatchAthlete => Boolean(a));
}

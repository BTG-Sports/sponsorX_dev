import type { LiveApplicationState } from "@/lib/applications-ui";

/* --------------------------------------------------------------------------
   P3-FE-02 — the admin review queue's live rows.

   Pure mapping from the API's `GET /applications` summary (the shape
   `toSummary` answers in backend/src/routes/v1/applications.ts) to the row
   shape the ApplicationsDesk renders. Pure like join-flow's
   `draftToApplication`: no fetch, no Date.now() — `now` is a parameter — so
   every translation rule is testable without a server.

   WHAT IS DELIBERATELY NOT INVENTED (§22). The fixtures carry followers,
   conflict flags and a public-profile slug; the queue API answers none of
   those today. A live row says nothing rather than something plausible:
   `followers: null` (the desk drops the segment), `flags: []` (the drawer
   says conflicts aren't checked here yet), no slug (no profile link).
   -------------------------------------------------------------------------- */

/** The API's §4 guardian answer, computed per request in guardian-rules.ts. */
export type GuardianStatus = "not-required" | "missing" | "unverified" | "ready";

/** One factor as the API's stored ScoreBreakdown records it (§14). */
export type ApiScoreFactor = {
  factor: string;
  /** null = not assessed — which is not zero, per §14's missing-factor rule. */
  value: number | null;
  weight: number;
  effectiveWeight: number;
  contribution: number;
};

export type ApiScoreBreakdown = {
  score: number;
  method: string;
  factors: ApiScoreFactor[];
  assessedGapPercent: number;
};

/** A queue row as the API answers it. */
export type ApiApplication = {
  id: string;
  displayName: string;
  legalName: string;
  sport: string;
  stateCode: string | null;
  state: LiveApplicationState;
  guardianStatus: GuardianStatus;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  score: {
    total: number;
    method: string;
    scoredAt: string;
    factors: ApiScoreBreakdown | null;
  } | null;
};

/** Backend factor keys → the labels FACTOR_HINTS explains. An unknown key
 *  (a future method's factor) falls through as itself rather than vanishing. */
export const FACTOR_LABELS: Record<string, string> = {
  engagement: "Engagement",
  contentQuality: "Content quality",
  audience: "Audience",
  reliability: "Reliability",
  geography: "Geography",
  sportBrandFit: "Fit",
  sponsorPerformance: "Sponsor performance",
};

/** The desk's row shape. Fixture rows satisfy it structurally; live rows are
 *  produced by `toDeskApp`. Optional fields are the fixture-only extras. */
export type DeskApp = {
  id: string;
  name: string;
  /** Public profile — fixtures only; the queue API has no slug. */
  slug?: string;
  sport: string;
  region: string;
  /** Relative ("2 hours ago") — both modes, so waitHours() reads either. */
  submittedAt: string;
  state: LiveApplicationState;
  isMinor: boolean;
  guardianVerified: boolean | null;
  /** Live rows carry the API's own §4 answer; fixtures derive it. */
  guardianStatus?: GuardianStatus;
  followers: number | null;
  flags: string[];
  legalName?: string;
  reviewerNotes?: string | null;
  score: {
    total: number;
    method: string;
    factors: Array<{ label: string; value: number | null }>;
    /** §14 — share of the score's weight nobody has assessed yet. */
    gapPercent?: number;
  } | null;
};

/* ------------------------------------------------------- action contract */

/** The four things a reviewer can do; "begin" is the §21 claim step. */
export type ReviewActionKind = "begin" | "approve" | "changes" | "reject";

export type ReviewActionResult =
  | { ok: true; state: LiveApplicationState }
  | { ok: false; message: string };

/** "2 hours ago" / "3 days ago" from an ISO timestamp — the same vocabulary
 *  the fixtures use, so `waitHours()` and the aging badge read both modes. */
export function relativeSince(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "1 hour ago";
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

/** One API row → one desk row. */
export function toDeskApp(row: ApiApplication, now: Date): DeskApp {
  const g = row.guardianStatus;
  const breakdown = row.score?.factors;
  return {
    id: row.id,
    name: row.displayName,
    legalName: row.legalName,
    sport: row.sport,
    region: row.stateCode ?? "—",
    submittedAt: relativeSince(row.createdAt, now),
    state: row.state,
    isMinor: g !== "not-required",
    guardianVerified: g === "not-required" ? null : g === "ready",
    guardianStatus: g,
    followers: null,
    flags: [],
    reviewerNotes: row.reviewerNotes,
    score: row.score
      ? {
          total: row.score.total,
          method: row.score.method,
          factors: Array.isArray(breakdown?.factors)
            ? breakdown.factors.map((f) => ({
                label: FACTOR_LABELS[f.factor] ?? f.factor,
                value: f.value,
              }))
            : [],
          gapPercent: breakdown?.assessedGapPercent ?? 0,
        }
      : null,
  };
}

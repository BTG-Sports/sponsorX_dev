import { STATE_COPY, type LiveApplicationState } from "@/lib/applications-ui";

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
  /** Required application fields the record lacks (the backend's
   *  `missingApplicationFields`) — activation refuses until empty. */
  missingFields: string[];
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
  /** Live rows only — what activation would refuse for. */
  missingFields?: string[];
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

/** What a reviewer can do; "begin" is the §21 claim step and "activate" is
 *  B1's last one — APPROVED → ACTIVE, the move that lets an athlete take paid
 *  work (`POST /applications/:id/activate`). */
export type ReviewActionKind = "begin" | "approve" | "changes" | "reject" | "activate";

/** The API's missing-field keys, in words. A copy of the labels in
 *  backend/src/domain/athlete.ts (the frontend cannot import the backend);
 *  an unknown key falls through as itself rather than vanishing. */
export const MISSING_FIELD_LABELS: Record<string, string> = {
  legalName: "legal name",
  displayName: "display name",
  email: "email",
  stateCode: "state",
  sport: "sport",
  birthDateOrAgeBand: "date of birth or age band",
};

function fieldList(keys: readonly string[]): string {
  return keys.map((k) => MISSING_FIELD_LABELS[k] ?? k).join(", ");
}

/**
 * Why activation can't be offered yet, or null when it can.
 *
 * Only an APPROVED athlete activates — a SUSPENDED one needs reinstatement,
 * a separate step (decision 2, 2026-09-28). The record must hold every field
 * the application requires (decision 3), and a minor needs a verified
 * guardian — §37's gate. The API enforces all three for every caller; the
 * desk says so before it has to, instead of showing a button that 409s.
 * "Linked but unverified" and "none linked" need different work, so they get
 * different words (the guardian-readiness distinction, guardian-rules.ts).
 */
export function activationBlock(
  a: Pick<DeskApp, "isMinor" | "guardianVerified" | "guardianStatus" | "missingFields">,
  state: LiveApplicationState,
): string | null {
  if (state === "SUSPENDED") {
    return "Suspended — activating doesn't lift a suspension. Reinstatement is a separate step.";
  }
  if (state !== "APPROVED") return "Only an approved athlete can be activated.";
  if (a.missingFields && a.missingFields.length > 0) {
    return `The profile is incomplete, so this athlete can't be activated yet. Missing: ${fieldList(a.missingFields)}.`;
  }
  if (!a.isMinor || a.guardianVerified) return null;
  return a.guardianStatus === "missing"
    ? "A minor can't go live until a guardian is linked and verified — no guardian is linked yet."
    : "A minor can't go live until their guardian is verified — the guardian is linked but not verified yet.";
}

/**
 * A refused result carries `state` when the API said where the row really is
 * now — the drawer adopts it, so a stale click refreshes the row and the
 * buttons that no longer apply disappear (F-10, QA pass 5).
 */
export type ReviewActionResult =
  | { ok: true; state: LiveApplicationState }
  | { ok: false; message: string; state?: LiveApplicationState };

/** The API's one error envelope, as far as the desk reads it. */
export type ApiErrorBody = {
  code?: string;
  message?: string;
  issues?: Array<{ path: string; message: string }>;
  /** illegal_transition */
  from?: string;
  to?: string;
  /** profile_incomplete */
  missing?: string[];
  /** 5xx */
  reference?: string;
};

const LIVE_STATES = new Set<string>(Object.keys(STATE_COPY));

/**
 * Turn a refusal into product copy. Pure; branches on the API's `code`,
 * never on its sentence — the state machine's own text ("An athlete cannot go
 * from ACTIVE to ACTIVE…") is for logs, not reviewers.
 */
export function explainRefusal(
  kind: ReviewActionKind,
  status: number,
  error: ApiErrorBody | undefined,
): { message: string; state?: LiveApplicationState } {
  if (status >= 500) {
    return {
      message:
        "Something went wrong on our side — nothing was decided. Try again shortly." +
        (error?.reference ? ` (Reference ${error.reference}.)` : ""),
    };
  }
  switch (error?.code) {
    case "illegal_transition": {
      const from =
        error.from && LIVE_STATES.has(error.from)
          ? (error.from as LiveApplicationState)
          : undefined;
      if (kind === "activate" && from === "ACTIVE") {
        return { message: "Already active — refresh to see the latest.", state: from };
      }
      return from
        ? {
            message: `Someone else already moved this application — it's now ${STATE_COPY[from]}. Refresh to see the latest.`,
            state: from,
          }
        : { message: "This application has already moved on — refresh to see the latest." };
    }
    case "reinstatement_required":
      return {
        message:
          "This athlete is suspended — activating doesn't lift a suspension. Reinstatement is a separate step.",
        state: "SUSPENDED",
      };
    case "profile_incomplete":
      return {
        message: `The profile is incomplete, so this athlete can't be activated yet. Missing: ${fieldList(error.missing ?? [])}.`,
      };
    case "guardian_required":
      return { message: "A minor can't go live until a guardian is linked and verified." };
    default:
      return {
        message:
          error?.issues?.[0]?.message ??
          error?.message ??
          `The decision was not accepted (HTTP ${status}).`,
      };
  }
}

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
    missingFields: Array.isArray(row.missingFields) ? row.missingFields : [],
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

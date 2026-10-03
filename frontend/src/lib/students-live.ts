/* --------------------------------------------------------------------------
   P9-FE-01 / -02 — SponsorX NEXT students as GET /students and
   /students/:id/* answer them, and the review menu the advisor desk offers.

   The review verbs mirror the athlete application desk on purpose (NEXT
   spec §5.1). The API's state machine decides every move — this only
   chooses which buttons to draw for a state; ACTIVE for a minor is refused
   there until a guardian is verified, and the refusal is shown as said.
   -------------------------------------------------------------------------- */

import { pageParamsFor, type PageInfo } from "@/lib/list-query";

export type ApiStudentState =
  | "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "CHANGES_REQUESTED"
  | "REJECTED" | "ACTIVE" | "SUSPENDED" | "INACTIVE";

export type ApiStudent = {
  id: string;
  propertyId: string;
  athleteId: string | null;
  guardianId: string | null;
  legalName: string;
  displayName: string;
  email: string | null;
  gradYear: number | null;
  masthead: string[];
  state: ApiStudentState;
  reviewerNotes: string | null;
  leftAt: string | null;
  createdAt: string;
  /** P9-BE-20 — reviewers only (the advisor, BTG): why the application
   *  waits for them, and when the system approved it from the roster. A
   *  student's or guardian's read never carries either. */
  reviewReasons?: string[];
  autoApprovedAt?: string | null;
};

export const STUDENT_STATE_COPY: Record<ApiStudentState, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  REJECTED: "Not accepted",
  ACTIVE: "On the masthead",
  SUSPENDED: "Suspended",
  INACTIVE: "Left",
};

export type ReviewMove = { to: ApiStudentState; label: string; needsNote?: boolean; tone: "primary" | "secondary" };

/** What the desk offers for a state (the API's machine is the rule). */
export function reviewMoves(state: ApiStudentState): ReviewMove[] {
  switch (state) {
    case "SUBMITTED":
      return [{ to: "UNDER_REVIEW", label: "Start review", tone: "primary" }];
    case "UNDER_REVIEW":
      return [
        { to: "APPROVED", label: "Approve", tone: "primary" },
        { to: "CHANGES_REQUESTED", label: "Request changes", needsNote: true, tone: "secondary" },
        { to: "REJECTED", label: "Decline", needsNote: true, tone: "secondary" },
      ];
    case "APPROVED":
      return [{ to: "ACTIVE", label: "Add to the masthead", tone: "primary" }];
    case "ACTIVE":
      return [{ to: "SUSPENDED", label: "Suspend", needsNote: true, tone: "secondary" }];
    case "SUSPENDED":
      return [{ to: "ACTIVE", label: "Reinstate", tone: "primary" }];
    default:
      return [];
  }
}

/** The desk's three groups. */
export function groupStudents(students: ApiStudent[]) {
  const waiting = students.filter((s) => s.state === "SUBMITTED" || s.state === "UNDER_REVIEW");
  const withStudent = students.filter((s) => s.state === "CHANGES_REQUESTED" || s.state === "DRAFT");
  const approved = students.filter((s) => s.state === "APPROVED");
  const roster = students.filter((s) => s.state === "ACTIVE" || s.state === "SUSPENDED");
  const closed = students.filter((s) => s.state === "REJECTED" || s.state === "INACTIVE");
  return { waiting, withStudent, approved, roster, closed };
}

/* ── server paging (2026-09-29) ─────────────────────────────────────────
   The desk's groups are the API's `?group=` (GET /students answers one page
   of one group, plus every group's count); the claims list and the sales
   ledger are second lists on their pages, with their own URL keys. */

export type StudentGroup = "waiting" | "approved" | "with" | "roster" | "closed";

export const STUDENT_GROUPS: Array<{ key: StudentGroup; tab: string; title: string; hint: string }> = [
  { key: "waiting", tab: "Waiting", title: "Waiting on you", hint: "Start a review, then approve, ask for changes or decline" },
  { key: "approved", tab: "Approved", title: "Approved — not yet on the masthead", hint: "A minor joins once a guardian is verified" },
  { key: "with", tab: "With the student", title: "With the student", hint: "Changes requested — they resubmit" },
  { key: "roster", tab: "Masthead", title: "On the masthead", hint: "Active students" },
  { key: "closed", tab: "Closed", title: "Closed", hint: "Declined or left" },
];
export const STUDENT_GROUP_KEYS = STUDENT_GROUPS.map((g) => g.key);

export type StudentGroupCounts = { groups: Record<StudentGroup, number>; all: number; autoApproved?: number };

/** URL keys for the advisor desk's "Approved automatically" list (P9-FE-11). */
export const AUTO_KEYS = { page: "apage", size: "asize" } as const;

/** Why an application waits for the advisor — only while it is under review. */
export function waitingReasons(s: Pick<ApiStudent, "state" | "reviewReasons">): string[] {
  return s.state === "UNDER_REVIEW" ? (s.reviewReasons ?? []) : [];
}

/**
 * P9-FE-11 — what a student reads about their own application, in plain
 * words. Never the advisor's internal reasons (the API does not send them
 * to a student): while it waits, "your school is reviewing" is all it says.
 * The advisor's own note to the student is shown where one was written.
 */
export function studentStatusWords(s: Pick<ApiStudent, "state" | "reviewerNotes">): { title: string; body: string } {
  const note = s.reviewerNotes?.trim() ? `Your advisor's note: ${s.reviewerNotes.trim()}` : null;
  switch (s.state) {
    case "DRAFT":
      return { title: "Not sent yet", body: "Finish your application and send it to your school." };
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return { title: "Your school is reviewing your application", body: "You'll hear as soon as there's a decision." };
    case "CHANGES_REQUESTED":
      return { title: "Your school asked for changes", body: note ?? "Update your application and send it again." };
    case "APPROVED":
      return {
        title: "You're approved",
        body: "You join the masthead as soon as your parent or guardian is confirmed (if you're under 18), or when your advisor adds you.",
      };
    case "REJECTED":
      return { title: "Your application wasn't accepted", body: note ?? "Talk to your advisor if you have questions." };
    case "ACTIVE":
      return { title: "You're on the masthead", body: "Your code and prospects are open." };
    case "SUSPENDED":
      return { title: "Your place on the masthead is paused", body: note ?? "Talk to your advisor." };
    case "INACTIVE":
      return { title: "You've left the programme", body: "Your sales record stays yours." };
  }
}

/** URL keys for the second list on a page. */
export const CLAIM_KEYS = { page: "cpage", size: "csize" } as const;
export const LEDGER_KEYS = { page: "lpage", size: "lsize" } as const;

/** The student's prospect filter (`?pstate`) → the API's `?state=`. */
export const PROSPECT_FILTERS: Array<{ value: string; label: string; states: string }> = [
  { value: "open", label: "Open", states: "SUBMITTED,ACCEPTED" },
  { value: "rejected", label: "Not accepted", states: "REJECTED" },
];
export const prospectStatesFor = (filter: string) => PROSPECT_FILTERS.find((f) => f.value === filter)?.states ?? "";

/** The API query for a list on its own URL keys: page + size always (paged
 *  mode on), then every non-empty extra. */
export function keyedListQuery(
  sp: Record<string, string | string[] | undefined>,
  keys: { page: string; size: string },
  extras: Record<string, string> = {},
): string {
  const { page, size } = pageParamsFor(sp, keys);
  const u = new URLSearchParams({ page: String(page), size: String(size) });
  for (const [k, v] of Object.entries(extras)) if (v) u.set(k, v);
  return `?${u}`;
}

export type ApiSale = { id: string; sponsorId: string; campaignId: string | null; editionId: string | null; value: number; originatedAt: string };
export type ApiAccrual = { id: string; reason: string; points: number; editionId: string | null; accruedAt: string };

/** GET /students/:id/sales and /points — `page` only in paged mode; the
 *  total and balance are always the database's all-time sums. */
export type ApiSalesRead = { sales: ApiSale[]; totalCents: number; page?: PageInfo };
export type ApiPointsRead = { accruals: ApiAccrual[]; balance: number; page?: PageInfo };
export type ProspectSummary = { states: Record<"SUBMITTED" | "ACCEPTED" | "REJECTED", number>; all: number };

/** Sum of accruals — the balance is never stored, only folded. */
export const balanceOf = (rows: ApiAccrual[]) => rows.reduce((n, r) => n + r.points, 0);

/** The categories a student may sell (NEXT spec §5.6) — the brand list minus
 *  the API's NOT_FOR_STUDENTS set. The API refuses the rest regardless. */
export const STUDENT_CATEGORIES: Array<[string, string]> = [
  ["RESTAURANT", "Restaurant"],
  ["LOCAL_RETAIL", "Local retail"],
  ["FAST_FOOD", "Fast food"],
  ["FITNESS", "Fitness"],
  ["HEALTHCARE", "Healthcare"],
  ["EDUCATION", "Education / tutoring"],
  ["AUTOMOTIVE", "Automotive"],
  ["APPAREL", "Apparel"],
  ["FOOTWEAR", "Footwear"],
  ["FINANCIAL", "Financial services"],
  ["TELECOM", "Telecom"],
  ["GAMING", "Gaming"],
  ["NONPROFIT", "Nonprofit"],
];

export const PROSPECT_STATE_COPY: Record<string, string> = {
  SUBMITTED: "With SponsorX",
  ACCEPTED: "Accepted",
  REJECTED: "Not accepted",
};

export const POINT_REASON_COPY: Record<string, string> = {
  ARTICLE: "Article approved",
  PHOTO: "Photo set published",
  INTERVIEW: "Interview delivered",
  APPOINTMENT: "Sales meeting held",
  SALES_500: "Every $500 closed",
  VIEWS_BONUS: "Views bonus",
};

/** Progress toward the next SALES_500 accrual — one per full $500 closed. */
export function salesMilestone(totalCents: number) {
  const step = 50_000;
  const into = totalCents % step;
  return { toNextCents: step - into, pct: Math.round((into / step) * 100) };
}

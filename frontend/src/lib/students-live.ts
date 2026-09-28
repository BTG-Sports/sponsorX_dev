/* --------------------------------------------------------------------------
   P9-FE-01 / -02 — SponsorX NEXT students as GET /students and
   /students/:id/* answer them, and the review menu the advisor desk offers.

   The review verbs mirror the athlete application desk on purpose (NEXT
   spec §5.1). The API's state machine decides every move — this only
   chooses which buttons to draw for a state; ACTIVE for a minor is refused
   there until a guardian is verified, and the refusal is shown as said.
   -------------------------------------------------------------------------- */

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

export type ApiSale = { id: string; sponsorId: string; campaignId: string | null; editionId: string | null; value: number; originatedAt: string };
export type ApiAccrual = { id: string; reason: string; points: number; editionId: string | null; accruedAt: string };

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

/* --------------------------------------------------------------------------
   P9-BE-24 / P9-FE-12 — student assignments and the advisor's content review.

     POST /editions/:id/assignments          the advisor (or BTG) assigns a piece
     GET  /student-assignments               a student their own; the advisor
                                             their school's (?view= &page=)
     POST /student-assignments/:id/uploads   presign the draft's file
     POST /student-assignments/:id/submit    {text?, r2Key?} — the student
     POST /student-assignments/:id/approve   the advisor — it joins the edition
     POST /student-assignments/:id/revision  {note} — back to the student
     GET  /student-assignments/:id/file      a signed read of the file

   The review reuses the deliverable states; `stage` is where it is in
   words. Pure: shapes, the words the pages derive, the send rules.
   -------------------------------------------------------------------------- */

import type { AssignmentRow } from "@/components/student-assignments";

export type AssignmentStage = "ASSIGNED" | "WAITING_FOR_ADVISOR" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";

export type ApiAssignment = {
  id: string;
  edition: { id: string; label: string; state: string; closeDate: string | null };
  student: { id: string; displayName: string };
  propertyId: string;
  kind: AssignmentRow["kind"];
  title: string;
  section: string | null;
  brief: string;
  dueAt: string | null;
  state: "NOT_STARTED" | "DRAFT_SUBMITTED" | "BTG_REVIEW" | "APPROVED";
  stage: AssignmentStage;
  draftText: string | null;
  hasFile: boolean;
  fileType: string | null;
  version: number;
  submittedAt: string | null;
  revisionNote: string | null;
  approvedAt: string | null;
  assetId: string | null;
  /** POL-BE-59 — an approved piece's usage right: false = no consent on file yet, so it can't go to print. */
  usageRight?: boolean | null;
  points: number;
  createdAt: string;
};

export type AssignmentView = "waiting" | "with-student" | "approved" | "all";
export type ApiAssignmentList = {
  assignments: ApiAssignment[];
  counts: Record<AssignmentView, number>;
  page?: { page: number; size: number; total: number; pages: number };
};

/** The advisor's tabs, in order: what's waiting on them first. */
export const REVIEW_TABS: readonly { key: Exclude<AssignmentView, "all">; label: string }[] = [
  { key: "waiting", label: "Waiting for you" },
  { key: "with-student", label: "With the student" },
  { key: "approved", label: "Approved" },
];

/** ?tab= → a tab; anything else is "Waiting for you". */
export function reviewTab(v: string | string[] | undefined): Exclude<AssignmentView, "all"> {
  const k = Array.isArray(v) ? v[0] : v;
  return REVIEW_TABS.find((t) => t.key === k)?.key ?? "waiting";
}

export const KIND_WORDS: Record<AssignmentRow["kind"], string> = {
  ARTICLE: "Article",
  INTERVIEW: "Interview",
  PHOTO: "Photo",
  DESIGN: "Design",
};

/** Where a piece is, for a badge: the words and the tone. */
export function stageBadge(stage: AssignmentStage | string): { label: string; tone: "neutral" | "primary" | "warn" | "accent" | "danger" } {
  switch (stage) {
    case "ASSIGNED": return { label: "Not started", tone: "neutral" };
    case "WAITING_FOR_ADVISOR": return { label: "Waiting for the advisor", tone: "primary" };
    case "IN_REVIEW": return { label: "Advisor review", tone: "warn" };
    case "CHANGES_REQUESTED": return { label: "Changes requested", tone: "danger" };
    case "APPROVED": return { label: "Approved", tone: "accent" };
    default: return { label: stage, tone: "neutral" };
  }
}

/** A date as the pages show it: "Dec 1", or "—". Read in UTC so the server and browser agree. */
export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The API's assignment as the student's list draws it. */
export function toAssignmentRow(a: ApiAssignment): AssignmentRow {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    section: a.section ?? a.edition.label,
    due: a.dueAt ? shortDate(a.dueAt) : "no date set",
    state: a.state,
    points: a.points,
    brief: a.brief,
    live: {
      stage: a.stage,
      edition: a.edition.label,
      revisionNote: a.revisionNote,
      draftText: a.draftText,
      hasFile: a.hasFile,
      version: a.version,
      canSubmit: a.stage === "ASSIGNED" || a.stage === "CHANGES_REQUESTED" || a.stage === "WAITING_FOR_ADVISOR",
    },
  };
}

export const DRAFT_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const DRAFT_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_DRAFT_TEXT = 20_000;

/** Why the student's Submit can't go yet, or null. */
export function draftProblem(f: { text: string; file: { type: string; size: number } | null; keepFile?: boolean }): string | null {
  const text = f.text.trim();
  if (!text && !f.file && !f.keepFile) return "Write your piece or attach its file first.";
  if (text.length > MAX_DRAFT_TEXT) return `Keep the text under ${MAX_DRAFT_TEXT.toLocaleString("en-US")} characters (it is ${text.length.toLocaleString("en-US")}).`;
  if (f.file && !(DRAFT_FILE_TYPES as readonly string[]).includes(f.file.type)) return "Attach a JPG, a PNG or a PDF.";
  if (f.file && f.file.size > DRAFT_MAX_BYTES) return "Keep the file under 20 MB.";
  return null;
}

/** Why the advisor's "Send back" can't go yet, or null. */
export function revisionProblem(note: string): string | null {
  const t = note.trim();
  if (!t) return "Tell the student what to change — they read this word for word.";
  if (t.length > 2000) return "Keep the note under 2,000 characters.";
  return null;
}

export type AssignDraft = { studentId: string; editionId: string; kind: string; title: string; brief: string };

/** Why "Assign" can't go yet, or null. */
export function assignProblem(f: AssignDraft): string | null {
  if (!f.editionId) return "Pick the edition.";
  if (!f.studentId) return "Pick the student.";
  if (!(f.kind in KIND_WORDS)) return "Pick what they're making.";
  if (!f.title.trim()) return "Give the piece a title.";
  if (!f.brief.trim()) return "Write the brief — what you want, and anything they must include.";
  return null;
}

/** An edition still taking content (before production). */
export const OPEN_EDITION_STATES = ["PLANNING", "SELLING", "CLOSED"];

/** The API's refusal in the words it chose, or a plain fallback. */
export function assignmentRefusal(status: number, body: unknown): string {
  const m = (body as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof m === "string" && m) return m;
  if (status === 403) return "This isn't yours to change.";
  if (status === 409) return "This piece changed — reload the page and try again.";
  return `SponsorX couldn't save that (HTTP ${status}). Nothing changed.`;
}

/** POL-FE-59 — what an approved piece's line says about printing it. */
export function approvedLine(a: Pick<ApiAssignment, "usageRight">): { text: string; ok: boolean } {
  if (a.usageRight === false) {
    return { text: "It can't go to print yet: no media consent is on file for this student (a minor's comes from their verified guardian). BTG records the right once consent is given.", ok: false };
  }
  return { text: "Its usage right is recorded — it can go to print with the edition.", ok: true };
}

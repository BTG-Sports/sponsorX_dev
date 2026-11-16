import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  assignmentRefusal, assignProblem, draftProblem, reviewTab, revisionProblem, stageBadge, toAssignmentRow, type ApiAssignment,
} from "@/lib/student-assignments-live";

/* The server actions are "use server" modules that read Next's request; the islands only need their names. */
vi.mock("@/app/(app)/next/assignments/actions", () => ({ presignDraftAction: vi.fn(), submitDraftAction: vi.fn(), draftFileAction: vi.fn() }));
vi.mock("@/app/(app)/advisor/review/actions", () => ({ approveAssignmentAction: vi.fn(), reviseAssignmentAction: vi.fn(), createAssignmentAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/* P9-FE-12 — student Assignments and the advisor's Content review, live.
   Done when: a signed-in student sees their real assignments, submits a
   draft (words or a file) and reads the advisor's note; a signed-in advisor
   sees their school's pieces by tab, approves or sends one back with a
   note, and assigns new work; neither screen shows "not connected" or
   sample data to a signed-in person. (Who may do what is the API's —
   backend/tests/student-assignments.test.ts.) */

const api = (over: Partial<ApiAssignment> = {}): ApiAssignment => ({
  id: "sa1",
  edition: { id: "e1", label: "Winter edition", state: "SELLING", closeDate: "2026-12-20T00:00:00.000Z" },
  student: { id: "s1", displayName: "Jordan" },
  propertyId: "p1",
  kind: "ARTICLE",
  title: "Northside's comeback season",
  section: "Sports",
  brief: "600 words on the run to the regional final.",
  dueAt: "2026-12-01T00:00:00.000Z",
  state: "NOT_STARTED",
  stage: "ASSIGNED",
  draftText: null,
  hasFile: false,
  fileType: null,
  version: 0,
  submittedAt: null,
  revisionNote: null,
  approvedAt: null,
  assetId: null,
  points: 50,
  createdAt: "2026-11-15T00:00:00.000Z",
  ...over,
});

describe("the student's list", () => {
  it("draws the API's assignment as the existing list's row, with what the drawer needs", () => {
    const row = toAssignmentRow(api());
    expect(row).toMatchObject({ id: "sa1", kind: "ARTICLE", section: "Sports", due: "Dec 1", state: "NOT_STARTED", points: 50 });
    expect(row.live).toMatchObject({ stage: "ASSIGNED", edition: "Winter edition", canSubmit: true, version: 0 });
    expect(toAssignmentRow(api({ section: null, dueAt: null })).section).toBe("Winter edition");
    expect(toAssignmentRow(api({ section: null, dueAt: null })).due).toBe("no date set");
  });

  it("the student can submit before review and after a change request, never during review or once approved", () => {
    expect(toAssignmentRow(api({ stage: "CHANGES_REQUESTED", state: "DRAFT_SUBMITTED" })).live!.canSubmit).toBe(true);
    expect(toAssignmentRow(api({ stage: "WAITING_FOR_ADVISOR", state: "DRAFT_SUBMITTED" })).live!.canSubmit).toBe(true);
    expect(toAssignmentRow(api({ stage: "IN_REVIEW", state: "BTG_REVIEW" })).live!.canSubmit).toBe(false);
    expect(toAssignmentRow(api({ stage: "APPROVED", state: "APPROVED" })).live!.canSubmit).toBe(false);
  });

  it("the drawer shows the advisor's note word for word and the draft form, prefilled with the last draft", async () => {
    const { StudentAssignments } = await import("@/components/student-assignments");
    const note = "Add the coach's quote and cut the second paragraph.";
    const row = toAssignmentRow(api({ stage: "CHANGES_REQUESTED", state: "DRAFT_SUBMITTED", revisionNote: note, draftText: "First go.", version: 1 }));
    const html = renderToStaticMarkup(createElement(StudentAssignments, { rows: [row], initialOpen: "sa1" }));
    expect(html).toContain("Your advisor asked for changes");
    expect(html).toContain(note.replace(/'/g, "&#x27;"));
    expect(html).toContain('aria-label="Your draft"');
    expect(html).toContain(">First go.</textarea>");
    expect(html).toContain("Send the new version");
    expect(html).toContain("Changes requested");
    expect(html).not.toContain("Uploading a draft isn&#x27;t available yet.");
  });

  it("a resubmission keeps the last file by default — a ticked box the student can untick", async () => {
    const { StudentAssignments } = await import("@/components/student-assignments");
    const row = toAssignmentRow(api({ stage: "CHANGES_REQUESTED", state: "DRAFT_SUBMITTED", revisionNote: "Add captions.", hasFile: true, version: 1 }));
    const html = renderToStaticMarkup(createElement(StudentAssignments, { rows: [row], initialOpen: "sa1" }));
    expect(html).toMatch(/<input type="checkbox" name="keepFile" checked=""/);
    expect(html).toContain("Keep the file from your last version");
    expect(draftProblem({ text: "", file: null, keepFile: true })).toBeNull();
    const actions = readFileSync(new URL("../src/app/(app)/next/assignments/actions.ts", import.meta.url), "utf8");
    expect(actions).toMatch(/keepFile: keepFile !== false/);
  });

  it("mid-review the drawer shows the draft but no form", async () => {
    const { StudentAssignments } = await import("@/components/student-assignments");
    const row = toAssignmentRow(api({ stage: "IN_REVIEW", state: "BTG_REVIEW", draftText: "Final words.", version: 2 }));
    const html = renderToStaticMarkup(createElement(StudentAssignments, { rows: [row], initialOpen: "sa1" }));
    expect(html).not.toContain('aria-label="Your draft"');
    expect(html).toContain("Your advisor is reviewing it.");
    expect(html).toContain("Final words.");
  });

  it("a sample row (demo) still draws the old disabled button", async () => {
    const { StudentAssignments } = await import("@/components/student-assignments");
    const sample = { ...toAssignmentRow(api()), live: undefined };
    const html = renderToStaticMarkup(createElement(StudentAssignments, { rows: [sample], initialOpen: "sa1" }));
    expect(html).toContain("Uploading a draft isn&#x27;t available yet.");
  });

  it("Submit needs words or a file, a JPG, PNG or PDF under 20 MB", () => {
    expect(draftProblem({ text: " ", file: null })).toBe("Write your piece or attach its file first.");
    expect(draftProblem({ text: "Words.", file: null })).toBeNull();
    expect(draftProblem({ text: "", file: { type: "image/jpeg", size: 1000 } })).toBeNull();
    expect(draftProblem({ text: "", file: { type: "application/zip", size: 1000 } })).toBe("Attach a JPG, a PNG or a PDF.");
    expect(draftProblem({ text: "", file: { type: "image/png", size: 21 * 1024 * 1024 } })).toBe("Keep the file under 20 MB.");
  });
});

describe("the advisor's desk", () => {
  it("tabs: waiting for you first; anything else is waiting", () => {
    expect(reviewTab("approved")).toBe("approved");
    expect(reviewTab("with-student")).toBe("with-student");
    expect(reviewTab("nope")).toBe("waiting");
    expect(reviewTab(undefined)).toBe("waiting");
  });

  it("names each stage in a person's words", () => {
    expect(stageBadge("WAITING_FOR_ADVISOR").label).toBe("Waiting for the advisor");
    expect(stageBadge("IN_REVIEW").label).toBe("Advisor review");
    expect(stageBadge("CHANGES_REQUESTED")).toEqual({ label: "Changes requested", tone: "danger" });
    expect(stageBadge("APPROVED").tone).toBe("accent");
  });

  it("Send back needs a note; Assign needs the edition, the student, a title and the brief", () => {
    expect(revisionProblem("  ")).toMatch(/word for word/);
    expect(revisionProblem("Shorter, please.")).toBeNull();
    const ok = { editionId: "e1", studentId: "s1", kind: "ARTICLE", title: "T", brief: "B" };
    expect(assignProblem(ok)).toBeNull();
    expect(assignProblem({ ...ok, studentId: "" })).toBe("Pick the student.");
    expect(assignProblem({ ...ok, brief: " " })).toMatch(/Write the brief/);
  });

  it("the decision and the assign form render for a live piece", async () => {
    const { AssignForm, ReviewDecision } = await import("@/components/advisor-review");
    const decision = renderToStaticMarkup(createElement(ReviewDecision, { id: "sa1", title: "Senior night" }));
    expect(decision).toContain("Approve — add it to the edition");
    expect(decision).toContain("Send back to the student");
    const form = renderToStaticMarkup(createElement(AssignForm, { editions: [{ id: "e1", label: "Winter edition · The Northside Record" }], students: [{ id: "s1", label: "Jordan" }] }));
    expect(form).toContain('aria-label="Assign a piece"');
    for (const w of ["Article", "Interview", "Photo", "Design"]) expect(form).toContain(`>${w}</option>`);
    const none = renderToStaticMarkup(createElement(AssignForm, { editions: [], students: [{ id: "s1", label: "Jordan" }] }));
    expect(none).toContain("No edition is taking content right now");
  });

  it("refusals read in the API's words", () => {
    expect(assignmentRefusal(409, { error: { message: "This piece is back with the student — wait for their next draft." } })).toMatch(/back with the student/);
    expect(assignmentRefusal(403, null)).toBe("This isn't yours to change.");
  });
});

describe("POL-FE-59 · the app review's content review findings", () => {
  it("the list badge says Changes requested for a piece sent back, and counts it under To do", async () => {
    const { StudentAssignments } = await import("@/components/student-assignments");
    const back = toAssignmentRow(api({ stage: "CHANGES_REQUESTED", state: "DRAFT_SUBMITTED", revisionNote: "Shorter.", version: 1 }));
    const html = renderToStaticMarkup(createElement(StudentAssignments, { rows: [back] }));
    expect(html).toContain("Changes requested");
    expect(html).not.toContain(">Draft submitted<");
    expect(html).toMatch(/To do[\s\S]{0,80}1/);
  });

  it("an approved piece says whether it can go to print", async () => {
    const { approvedLine } = await import("@/lib/student-assignments-live");
    expect(approvedLine({ usageRight: false })).toMatchObject({ ok: false });
    expect(approvedLine({ usageRight: false }).text).toMatch(/can't go to print yet/);
    expect(approvedLine({ usageRight: true }).ok).toBe(true);
  });

  it("BTG staff get the live desk, never the sample", () => {
    const review = readFileSync(new URL("../src/app/(app)/advisor/review/page.tsx", import.meta.url), "utf8");
    expect(review).toContain('const LIVE_REVIEW_ROLES = ["ADVISOR", "BTG_ADMIN", "SUPER_ADMIN"];');
    expect(review).toMatch(/roles\.some\(\(r\) => LIVE_REVIEW_ROLES\.includes\(r\)\)/);
  });
});

describe("no signed-in person sees 'not connected' any more", () => {
  it("both pages read the API for a signed-in student or advisor", () => {
    const review = readFileSync(new URL("../src/app/(app)/advisor/review/page.tsx", import.meta.url), "utf8");
    expect(review).not.toContain("isn't connected yet");
    expect(review).toMatch(/readJson<ApiAssignmentList>\(`\/student-assignments\?view=\$\{tab\}/);
    const assignments = readFileSync(new URL("../src/app/(app)/next/assignments/page.tsx", import.meta.url), "utf8");
    expect(assignments).not.toContain("LiveAssignmentsNotice");
    expect(assignments).toMatch(/apiFetch\("\/student-assignments"\)/);
  });
});

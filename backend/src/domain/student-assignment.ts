/**
 * Student assignments and the advisor's content review — P9-BE-24, spec §7.
 *
 * The school's advisor (or BTG) gives a student a piece of an edition to make:
 * an article, an interview, a photo or a design. The student writes it and
 * submits it — words, a file, or both. The advisor approves it or sends it
 * back with a reason, and only for their own school. An approved piece
 * becomes one of the edition's content items (`EditionAsset`, source
 * STUDENT), which is what the edition's rights and production read.
 *
 * NO STATE MACHINE OF ITS OWN. The review reuses the deliverable states and
 * their transition table (deliverable-state.ts), as the edition artwork does
 * (P9-BE-16), and stops at APPROVED:
 *
 *   NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → APPROVED
 *                       ↑______________|  (a change request)
 *
 * BTG_REVIEW is the deliverable chain's review step; here the reviewer is the
 * school's advisor, and the student's screen calls it "Advisor review". While
 * a change request is open the piece is DRAFT_SUBMITTED with `revisionNote`
 * set — back with the student — exactly as artwork and deliverables do it.
 * The advisor may approve or send back straight from a fresh submission: the
 * move goes through BTG_REVIEW, each step checked against the table.
 *
 * A PERSON DECIDES. Nothing here is automatic: nearly every student is a
 * minor, so every piece reaches the advisor (CLAUDE.md, "minors always reach
 * a person"). The student must be ACTIVE — activation already waits for a
 * minor's verified guardian (P9-BE-04/-20).
 *
 * Every write is conditional on the row being as it was read, so two
 * decisions racing record one and refuse the other. Each step emails whoever
 * it hands the piece to: a new piece and a decision to the student, a draft
 * to the school's advisor(s).
 */
import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { env } from "../config/env";
import { send, type EmailTemplate } from "../lib/email";
import { checkPrivateUpload, presignPrivateDownload, presignPrivateUpload, uploadRefusal } from "../lib/storage";
import type { Actor } from "../auth/actor";
import { assertAllowed, scopeOf, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { canTransitionDeliverable, type DeliverableState } from "./deliverable-state";
import { POINT_VALUES, type PointReason } from "./student-points";
import { recordConsentRightsIn } from "./content-rights";
import { readPage, type PageRequest } from "../lib/paging";

type Tx = Prisma.TransactionClient;

/* ── vocabulary ─────────────────────────────────────────────────────────── */

export const ASSIGNMENT_KINDS = ["ARTICLE", "INTERVIEW", "PHOTO", "DESIGN"] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

/** The four states this review uses (a CHECK holds the table to them). */
export type AssignmentState = Extract<DeliverableState, "NOT_STARTED" | "DRAFT_SUBMITTED" | "BTG_REVIEW" | "APPROVED">;

/** Where a piece is, in words a person uses — derived, never stored. */
export type AssignmentStage = "ASSIGNED" | "WAITING_FOR_ADVISOR" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";

/** The desk's tabs: waiting on the advisor, with the student, approved. */
export const ASSIGNMENT_VIEWS = ["waiting", "with-student", "approved", "all"] as const;
export type AssignmentView = (typeof ASSIGNMENT_VIEWS)[number];

/** What a piece is worth in points once it runs (P9-BE-15's values). Shown,
 *  not accrued here — accruals stay with P9-BE-15's ledger. */
const POINTS_BY_KIND: Record<AssignmentKind, number> = {
  ARTICLE: POINT_VALUES.ARTICLE,
  INTERVIEW: POINT_VALUES.INTERVIEW,
  PHOTO: POINT_VALUES.PHOTO,
  DESIGN: 0,
};

/** POL-BE-59 — the points reason an approved piece accrues (P9-BE-15's ledger); a design accrues none. */
const POINT_REASON: Partial<Record<AssignmentKind, Exclude<PointReason, "VIEWS_BONUS" | "SALES_500">>> = {
  ARTICLE: "ARTICLE", INTERVIEW: "INTERVIEW", PHOTO: "PHOTO",
};

/** Editions still taking content: before production. */
const OPEN_EDITION_STATES = ["PLANNING", "SELLING", "CLOSED"];

/** A draft's file: a photo, a layout or a document. */
export const DRAFT_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const DRAFT_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_DRAFT_TEXT = 20_000;
export const MAX_REVISION_NOTE = 2_000;

const keyPrefix = (tenantId: string, assignmentId: string) => `student-drafts/${tenantId}/${assignmentId}/`;

/* ── errors ─────────────────────────────────────────────────────────────── */

class Http extends Error {
  constructor(readonly status: number, message: string, name: string) {
    super(message);
    this.name = name;
  }
}

/** 409 — not this person's move now, or someone else moved it first. */
export class AssignmentTurnError extends Http {
  constructor(message: string) {
    super(409, message, "AssignmentTurnError");
  }
}

/** 422 — the request itself can't be done as asked. */
export class AssignmentInputError extends Http {
  constructor(message: string) {
    super(422, message, "AssignmentInputError");
  }
}

/* ── notifications ──────────────────────────────────────────────────────── */

const appUrl = () => env.APP_URL.replace(/\/+$/, "");

const KIND_WORD: Record<AssignmentKind, string> = { ARTICLE: "article", INTERVIEW: "interview", PHOTO: "photo", DESIGN: "design" };

/**
 * Email whoever's turn it now is, inside the step's own transaction (the
 * outbox: a rolled-back step sends nothing). Keyed on the piece, the step
 * and the version, so a retry never sends twice and a second round of
 * review sends again. The student: their own login. The advisor: every
 * active ADVISOR login at the piece's school.
 */
async function tell(
  tx: Tx,
  r: { id: string; tenantId: string; propertyId: string; studentId: string; title: string; kind: string; edition: { label: string }; student: { displayName: string } },
  to: "STUDENT" | "ADVISOR",
  template: EmailTemplate,
  occurrence: string,
  data: Record<string, string> = {},
) {
  const people = await tx.user.findMany({
    where: to === "STUDENT"
      ? { tenantId: r.tenantId, disabledAt: null, studentId: r.studentId }
      : { tenantId: r.tenantId, disabledAt: null, propertyId: r.propertyId, roles: { has: "ADVISOR" } },
    select: { id: true, email: true },
    take: 20,
  });
  const reviewUrl = to === "STUDENT" ? `${appUrl()}/next/assignments?open=${r.id}` : `${appUrl()}/advisor/review?open=${r.id}`;
  for (const u of people) {
    await send(tx, r.tenantId, {
      template,
      to: u.email,
      idempotencyKey: `${template}:${r.id}:${occurrence}:${u.id}`,
      data: {
        title: r.title, kindWord: KIND_WORD[r.kind as AssignmentKind] ?? "piece", editionLabel: r.edition.label,
        studentName: r.student.displayName, reviewUrl, ...data,
      },
    });
  }
}

/* ── reading ────────────────────────────────────────────────────────────── */

const SELECT = {
  id: true, tenantId: true, editionId: true, studentId: true, propertyId: true, kind: true, title: true,
  section: true, brief: true, dueAt: true, reviewState: true, draftText: true, r2Key: true, fileType: true,
  version: true, submittedAt: true, revisionNote: true, approvedAt: true, assetId: true, createdAt: true,
  /* A student is named by display name only — never the legal name (P9-SEC-01). */
  student: { select: { id: true, displayName: true, state: true } },
  edition: { select: { id: true, label: true, state: true, closeDate: true } },
  /* POL-BE-59 — whether the approved piece has a usage right yet (production refuses it without one). */
  asset: { select: { id: true, rights: { select: { id: true }, take: 1 } } },
} as const;

type Row = Prisma.StudentAssignmentGetPayload<{ select: typeof SELECT }>;

export function stageOf(r: { reviewState: string; revisionNote: string | null }): AssignmentStage {
  if (r.reviewState === "APPROVED") return "APPROVED";
  if (r.reviewState === "BTG_REVIEW") return "IN_REVIEW";
  if (r.reviewState === "DRAFT_SUBMITTED") return r.revisionNote ? "CHANGES_REQUESTED" : "WAITING_FOR_ADVISOR";
  return "ASSIGNED";
}

/** What every reader sees. The file is never a URL here — `fileUrl` signs one. */
export function assignmentOut(r: Row) {
  return {
    id: r.id,
    edition: { id: r.edition.id, label: r.edition.label, state: r.edition.state, closeDate: r.edition.closeDate },
    student: { id: r.student.id, displayName: r.student.displayName },
    propertyId: r.propertyId,
    kind: r.kind as AssignmentKind,
    title: r.title,
    section: r.section,
    brief: r.brief,
    dueAt: r.dueAt,
    state: r.reviewState as AssignmentState,
    stage: stageOf(r),
    draftText: r.draftText,
    hasFile: r.r2Key !== null,
    fileType: r.fileType,
    version: r.version,
    submittedAt: r.submittedAt,
    revisionNote: r.revisionNote,
    approvedAt: r.approvedAt,
    assetId: r.assetId,
    /* POL-BE-59 — an approved piece with no usage right can't go to print yet (no consent on file). */
    usageRight: r.asset ? r.asset.rights.length > 0 : null,
    points: POINTS_BY_KIND[r.kind as AssignmentKind] ?? 0,
    createdAt: r.createdAt,
  };
}
export type AssignmentOut = ReturnType<typeof assignmentOut>;

const WAITING: Prisma.StudentAssignmentWhereInput = {
  OR: [{ reviewState: "DRAFT_SUBMITTED", revisionNote: null }, { reviewState: "BTG_REVIEW" }],
};
const WITH_STUDENT: Prisma.StudentAssignmentWhereInput = {
  OR: [{ reviewState: "NOT_STARTED" }, { reviewState: "DRAFT_SUBMITTED", revisionNote: { not: null } }],
};
const VIEW_WHERE: Record<AssignmentView, Prisma.StudentAssignmentWhereInput> = {
  waiting: WAITING,
  "with-student": WITH_STUDENT,
  approved: { reviewState: "APPROVED" },
  all: {},
};

/** Waiting first, oldest submission first; then by due date. */
const ORDER: Prisma.StudentAssignmentOrderByWithRelationInput[] = [
  { submittedAt: { sort: "asc", nulls: "last" } },
  { dueAt: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
];

/**
 * The assignments the actor reads: a student their own, a guardian their
 * child's, the advisor their school's, BTG the tenant's. Without a page, the
 * whole list (a student's own is short); with one, a page of one view and
 * every view's count — the advisor's desk.
 */
export async function listAssignments(
  actor: Actor,
  opts: { view?: AssignmentView; editionId?: string; studentId?: string; q?: string; page?: PageRequest | null } = {},
) {
  assertAllowed(actor, "studentAssignment", "read");
  const scope = whereFor(actor, "studentAssignment", "read");
  const narrow: Prisma.StudentAssignmentWhereInput = {
    ...(opts.editionId ? { editionId: opts.editionId } : {}),
    ...(opts.studentId ? { studentId: opts.studentId } : {}),
    ...(opts.q ? { OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { student: { is: { displayName: { contains: opts.q, mode: "insensitive" } } } }] } : {}),
  };
  const base = { AND: [scope, narrow] };
  const view = opts.view ?? "all";
  const where = { AND: [scope, narrow, VIEW_WHERE[view]] };
  const [waiting, withStudent, approved] = await Promise.all([
    prisma.studentAssignment.count({ /* tenant-scope: base is whereFor(actor, "studentAssignment", "read") */ where: { AND: [base, WAITING] } }),
    prisma.studentAssignment.count({ /* tenant-scope: base is whereFor(actor, "studentAssignment", "read") */ where: { AND: [base, WITH_STUDENT] } }),
    prisma.studentAssignment.count({ /* tenant-scope: base is whereFor(actor, "studentAssignment", "read") */ where: { AND: [base, { reviewState: "APPROVED" }] } }),
  ]);
  const counts = { waiting, "with-student": withStudent, approved, all: waiting + withStudent + approved };
  if (!opts.page) {
    const rows = await prisma.studentAssignment.findMany({ /* tenant-scope: where is built on whereFor(actor, "studentAssignment", "read") */ where, select: SELECT, orderBy: ORDER, take: 500 });
    return { assignments: rows.map(assignmentOut), counts };
  }
  const { rows, page } = await readPage(
    opts.page,
    () => prisma.studentAssignment.count({ /* tenant-scope: where is built on whereFor(actor, "studentAssignment", "read") */ where }),
    (skip, take) => prisma.studentAssignment.findMany({ /* tenant-scope: where is built on whereFor(actor, "studentAssignment", "read") */ where, select: SELECT, orderBy: ORDER, skip, take }),
  );
  return { assignments: rows.map(assignmentOut), counts, page };
}

/** One assignment in the actor's read scope. */
export async function getAssignment(actor: Actor, id: string): Promise<AssignmentOut> {
  assertAllowed(actor, "studentAssignment", "read");
  const row = await prisma.studentAssignment.findFirst({ where: { AND: [{ id }, whereFor(actor, "studentAssignment", "read")] }, select: SELECT });
  if (!row) throw new ForbiddenError("studentAssignment", "read");
  return assignmentOut(row);
}

/* ── assigning ──────────────────────────────────────────────────────────── */

export type AssignmentInput = {
  studentId: string;
  kind: AssignmentKind;
  title: string;
  section?: string | null;
  brief: string;
  dueAt?: Date | null;
};

/**
 * The advisor (their own school's students) or BTG gives a student a piece
 * of an edition. The student must be ACTIVE and at the edition's school (a
 * regional edition, with no school of its own, takes any school's student —
 * BTG's to assign); the edition must not be in production yet.
 */
export async function createAssignment(actor: Actor, editionId: string, input: AssignmentInput): Promise<AssignmentOut> {
  assertAllowed(actor, "studentAssignment", "write");
  const scope = scopeOf(actor, "studentAssignment", "write");
  /* A student's write is their own draft, never an assignment. */
  if (scope !== "any" && scope !== "own-tenant" && scope !== "own-property") throw new ForbiddenError("studentAssignment", "write");

  return prisma.$transaction(async (tx) => {
    const edition = await tx.edition.findFirst({
      where: { AND: [{ id: editionId }, whereFor(actor, "edition", "read")] },
      select: { id: true, tenantId: true, state: true, label: true, publication: { select: { propertyId: true } } },
    });
    if (!edition) throw new ForbiddenError("studentAssignment", "write");
    if (!OPEN_EDITION_STATES.includes(edition.state)) {
      throw new AssignmentTurnError(`${edition.label} is ${edition.state.toLowerCase().replace(/_/g, " ")} — its content is final, so nothing new can be assigned.`);
    }
    const student = await tx.student.findFirst({
      where: { AND: [{ id: input.studentId, tenantId: edition.tenantId }, whereFor(actor, "student", "read")] },
      select: { id: true, propertyId: true, state: true, displayName: true },
    });
    if (!student) throw new ForbiddenError("studentAssignment", "write");
    if (scope === "own-property" && student.propertyId !== actor.propertyId) throw new ForbiddenError("studentAssignment", "write");
    if (student.state !== "ACTIVE") throw new AssignmentInputError(`${student.displayName} isn't active yet, so they can't be given work.`);
    const school = edition.publication.propertyId;
    if (school && school !== student.propertyId) throw new AssignmentInputError(`${student.displayName} isn't at this edition's school.`);

    const created = await tx.studentAssignment.create({
      data: {
        tenantId: edition.tenantId, editionId: edition.id, studentId: student.id, propertyId: student.propertyId,
        kind: input.kind, title: input.title.trim(), section: input.section?.trim() || null, brief: input.brief.trim(),
        dueAt: input.dueAt ?? null, assignedById: actor.userId,
      },
      select: SELECT,
    });
    await audit(tx, actor, AUDIT_ACTIONS.studentAssignment.create, "StudentAssignment", created.id, {
      after: { editionId: edition.id, studentId: student.id, kind: input.kind },
    });
    await tell(tx, created, "STUDENT", "studentAssignment.assigned", "assigned", {
      brief: created.brief,
      ...(created.dueAt ? { due: created.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) } : {}),
    });
    return assignmentOut(created);
  });
}

/* ── the student's draft ────────────────────────────────────────────────── */

/** The student's own assignment, for their own write — nobody submits for them. */
async function ownForWrite(db: Tx | typeof prisma, actor: Actor, id: string) {
  assertAllowed(actor, "studentAssignment", "write");
  const row = await db.studentAssignment.findFirst({
    where: { AND: [{ id }, whereFor(actor, "studentAssignment", "write")] },
    select: { ...SELECT, student: { select: { id: true, displayName: true, state: true } } },
  });
  if (!row || !actor.studentId || row.studentId !== actor.studentId) throw new ForbiddenError("studentAssignment", "write");
  return row;
}

/** The student's move: before anything is submitted, or while it is back with them (or not yet picked up). */
function canSubmit(r: { reviewState: string }): boolean {
  return r.reviewState === "NOT_STARTED" || r.reviewState === "DRAFT_SUBMITTED";
}

function turnRefusal(r: { reviewState: string }): string {
  if (r.reviewState === "APPROVED") return "This piece is approved — it can't be changed.";
  return "Your advisor is reviewing this piece — it can't be changed until they ask for changes.";
}

/**
 * Presign a direct-to-R2 upload of the draft's file to the private bucket.
 * The key is built here; the submit accepts only a key under this
 * assignment's prefix that this grant handed out. Type and size are signed
 * into the PUT.
 */
export async function presignDraftUpload(actor: Actor, id: string, contentType: string, bytes: number): Promise<{ url: string; key: string }> {
  const row = await ownForWrite(prisma, actor, id);
  if (!canSubmit(row)) throw new AssignmentTurnError(turnRefusal(row));
  if (!(DRAFT_FILE_TYPES as readonly string[]).includes(contentType)) throw new AssignmentInputError("Upload a JPG, a PNG or a PDF.");
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > DRAFT_MAX_BYTES) throw new AssignmentInputError("Keep the file under 20 MB.");
  const key = `${keyPrefix(row.tenantId, row.id)}${randomUUID()}`;
  const url = await presignPrivateUpload(actor, key, contentType, { entity: "StudentAssignment", entityId: row.id }, {
    contentLength: bytes,
    signContentType: true,
  });
  return { url, key };
}

/**
 * The student submits their draft: words, a file they uploaded, or both.
 * The first submission is the chain's first move (NOT_STARTED →
 * DRAFT_SUBMITTED); another while DRAFT_SUBMITTED replaces the draft, counts
 * the version up and answers an open change request. The piece then waits
 * for the advisor.
 */
export async function submitDraft(
  actor: Actor,
  id: string,
  input: { text?: string | null; r2Key?: string | null; keepFile?: boolean | null },
): Promise<AssignmentOut> {
  const text = input.text?.trim() || null;
  const key = input.r2Key || null;
  /* Keep the last version's file unless a new one is attached or the student
     drops it — a resubmission that fixes the words keeps the photo. */
  const keepFile = input.keepFile !== false;
  if (text && text.length > MAX_DRAFT_TEXT) throw new AssignmentInputError(`Keep the text under ${MAX_DRAFT_TEXT.toLocaleString("en-US")} characters.`);

  const row = await ownForWrite(prisma, actor, id);
  if (!canSubmit(row)) throw new AssignmentTurnError(turnRefusal(row));
  if (!text && !key && !(keepFile && row.r2Key)) throw new AssignmentInputError("Write your piece or attach its file before you submit.");
  if (row.student.state !== "ACTIVE") throw new AssignmentTurnError("Your student account isn't active, so you can't submit work.");
  if (!OPEN_EDITION_STATES.includes(row.edition.state)) throw new AssignmentTurnError(`${row.edition.label} is in production — its content is final.`);

  /* The file, as its grant described it: a key this assignment was never
     granted fails, and the arrived object must match the signed type and size. */
  let fileType: string | null = row.fileType;
  let r2Key: string | null = row.r2Key;
  if (key && key !== row.r2Key) {
    if (!key.startsWith(keyPrefix(row.tenantId, row.id))) throw new AssignmentInputError("That file wasn't uploaded for this assignment.");
    const grant = await prisma.auditLog.findFirst({
      where: {
        tenantId: row.tenantId, entity: "StudentAssignment", entityId: row.id,
        action: AUDIT_ACTIONS.storage.privateUploadGrant, after: { path: ["key"], equals: key },
      },
      select: { after: true },
    });
    const granted = grant?.after as { contentType?: string; bytes?: number } | null;
    if (!granted?.contentType) throw new AssignmentInputError("That file wasn't uploaded for this assignment.");
    const check = await checkPrivateUpload(actor, key, { contentType: granted.contentType, bytes: granted.bytes ?? null, maxBytes: DRAFT_MAX_BYTES }, {
      entity: "StudentAssignment", entityId: row.id,
    });
    if (!check.ok) throw new AssignmentInputError(uploadRefusal(check, "Your file"));
    fileType = granted.contentType;
    r2Key = key;
  }
  if (!key && !keepFile) {
    /* The student dropped the earlier file: the advisor reviews exactly what was sent. */
    fileType = null;
    r2Key = null;
  }

  if (row.reviewState === "NOT_STARTED" && !canTransitionDeliverable("NOT_STARTED", "DRAFT_SUBMITTED")) {
    throw new AssignmentTurnError("This piece can't be submitted.");
  }
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const moved = await tx.studentAssignment.updateMany({
      where: { id: row.id, tenantId: row.tenantId, reviewState: row.reviewState, version: row.version },
      data: { reviewState: "DRAFT_SUBMITTED", draftText: text, r2Key, fileType, version: row.version + 1, submittedAt: now, revisionNote: null },
    });
    if (moved.count !== 1) throw new AssignmentTurnError("This piece changed while you were working — reload it and try again.");
    await audit(tx, actor, AUDIT_ACTIONS.studentAssignment.submit, "StudentAssignment", row.id, {
      before: { state: row.reviewState, version: row.version, revisionNote: row.revisionNote },
      after: { state: "DRAFT_SUBMITTED", version: row.version + 1, words: text ? text.split(/\s+/).length : 0, file: r2Key !== null },
    });
    await tell(tx, row, "ADVISOR", "studentAssignment.submitted", `v${row.version + 1}`, { version: String(row.version + 1) });
    return assignmentOut(await tx.studentAssignment.findFirstOrThrow({ where: { id: row.id, tenantId: row.tenantId }, select: SELECT }));
  });
}

/* ── the advisor's review ───────────────────────────────────────────────── */

/** An assignment the actor may review: the advisor's school, or BTG's tenant. */
async function forReview(tx: Tx, actor: Actor, id: string) {
  assertAllowed(actor, "studentAssignment", "approve");
  const row = await tx.studentAssignment.findFirst({ where: { AND: [{ id }, whereFor(actor, "studentAssignment", "approve")] }, select: SELECT });
  if (!row) throw new ForbiddenError("studentAssignment", "approve");
  /* An advisor who is also this student is never their own reviewer. */
  if (actor.studentId && actor.studentId === row.studentId) throw new ForbiddenError("studentAssignment", "approve");
  return row;
}

/** The advisor's turn: a fresh submission, or one already in review. */
function reviewable(r: Row): boolean {
  return (r.reviewState === "DRAFT_SUBMITTED" && r.revisionNote === null && r.version > 0) || r.reviewState === "BTG_REVIEW";
}

function reviewRefusal(r: Row): string {
  if (r.reviewState === "APPROVED") return "This piece is already approved.";
  if (r.reviewState === "NOT_STARTED") return "Nothing has been submitted yet.";
  return "This piece is back with the student — wait for their next draft.";
}

function assertOpen(r: Row) {
  if (!OPEN_EDITION_STATES.includes(r.edition.state)) throw new AssignmentTurnError(`${r.edition.label} is in production — its content is final.`);
}

/** Every step of a move, checked against the deliverable table. */
function path(from: AssignmentState, to: AssignmentState): AssignmentState[] {
  const steps: AssignmentState[] = from === "DRAFT_SUBMITTED" ? ["BTG_REVIEW", to] : [to];
  let at: AssignmentState = from;
  for (const s of steps) {
    if (s === at) continue;
    if (!canTransitionDeliverable(at, s)) throw new AssignmentTurnError(`A piece can't go from ${at} to ${s}.`);
    at = s;
  }
  return steps;
}

/** The advisor opens a fresh submission: DRAFT_SUBMITTED → BTG_REVIEW ("Advisor review"). */
export async function startAssignmentReview(actor: Actor, id: string): Promise<AssignmentOut> {
  return prisma.$transaction(async (tx) => {
    const row = await forReview(tx, actor, id);
    if (row.reviewState === "BTG_REVIEW") return assignmentOut(row);
    if (!reviewable(row)) throw new AssignmentTurnError(reviewRefusal(row));
    path("DRAFT_SUBMITTED", "BTG_REVIEW");
    const moved = await tx.studentAssignment.updateMany({
      where: { id: row.id, tenantId: row.tenantId, reviewState: "DRAFT_SUBMITTED", version: row.version, revisionNote: null },
      data: { reviewState: "BTG_REVIEW", reviewedById: actor.userId },
    });
    if (moved.count !== 1) throw new AssignmentTurnError("This piece changed — reload it and try again.");
    await audit(tx, actor, AUDIT_ACTIONS.studentAssignment.startReview, "StudentAssignment", row.id, {
      before: { state: "DRAFT_SUBMITTED" }, after: { state: "BTG_REVIEW", version: row.version },
    });
    return assignmentOut(await tx.studentAssignment.findFirstOrThrow({ where: { id: row.id, tenantId: row.tenantId }, select: SELECT }));
  });
}

/**
 * The advisor approves the piece. It becomes one of the edition's content
 * items — an `EditionAsset`, source STUDENT, the draft's file carried over —
 * which the edition's rights and production then read. Final: an approved
 * piece is not changed.
 */
export async function approveAssignment(actor: Actor, id: string): Promise<AssignmentOut> {
  return prisma.$transaction(async (tx) => {
    const row = await forReview(tx, actor, id);
    if (!reviewable(row)) throw new AssignmentTurnError(reviewRefusal(row));
    assertOpen(row);
    const from = row.reviewState as AssignmentState;
    path(from, "APPROVED");

    const asset = await tx.editionAsset.create({
      data: {
        tenantId: row.tenantId, editionId: row.editionId, kind: row.kind, title: row.title,
        sourceKind: "STUDENT", studentId: row.studentId, r2Key: row.r2Key,
      },
      select: { id: true },
    });
    const now = new Date();
    const moved = await tx.studentAssignment.updateMany({
      where: { id: row.id, tenantId: row.tenantId, reviewState: from, version: row.version, revisionNote: null },
      data: { reviewState: "APPROVED", assetId: asset.id, approvedAt: now, reviewedById: actor.userId },
    });
    if (moved.count !== 1) throw new AssignmentTurnError("This piece changed — reload it and try again.");
    if (from === "DRAFT_SUBMITTED") {
      await audit(tx, actor, AUDIT_ACTIONS.studentAssignment.startReview, "StudentAssignment", row.id, {
        before: { state: "DRAFT_SUBMITTED" }, after: { state: "BTG_REVIEW", version: row.version },
      });
    }
    /* POL-BE-59 (app review §6) — approval does what the piece promised:
       its points, as the system (the ledger is never written by the person
       it credits), and its usage right from the student's consent in force
       (P9-BE-23's rule: a minor's consent is their verified guardian's). No
       consent on file: no right, and the edition's production gate keeps
       refusing the piece until one is recorded — approval publishes nothing. */
    const reason = POINT_REASON[row.kind as AssignmentKind];
    const points = reason ? POINT_VALUES[reason] : 0;
    if (reason) {
      await tx.studentPointAccrual.create({ data: { tenantId: row.tenantId, studentId: row.studentId, reason, points, editionId: row.editionId } });
    }
    const rights = await recordConsentRightsIn(tx, row.tenantId, { assetIds: [asset.id] });
    await audit(tx, actor, AUDIT_ACTIONS.studentAssignment.approve, "StudentAssignment", row.id, {
      before: { state: "BTG_REVIEW" }, after: { state: "APPROVED", version: row.version, assetId: asset.id, points, rightsRecorded: rights.length },
    });
    await tell(tx, row, "STUDENT", "studentAssignment.approved", `v${row.version}`);
    return assignmentOut(await tx.studentAssignment.findFirstOrThrow({ where: { id: row.id, tenantId: row.tenantId }, select: SELECT }));
  });
}

/**
 * The advisor sends the piece back with a reason the student reads word for
 * word. It returns to DRAFT_SUBMITTED with the note open until the student's
 * next submission answers it.
 */
export async function requestAssignmentRevision(actor: Actor, id: string, note: string): Promise<AssignmentOut> {
  const reason = note.trim();
  if (!reason) throw new AssignmentInputError("Tell the student what to change.");
  if (reason.length > MAX_REVISION_NOTE) throw new AssignmentInputError(`Keep the note under ${MAX_REVISION_NOTE.toLocaleString("en-US")} characters.`);
  return prisma.$transaction(async (tx) => {
    const row = await forReview(tx, actor, id);
    if (!reviewable(row)) throw new AssignmentTurnError(reviewRefusal(row));
    assertOpen(row);
    const from = row.reviewState as AssignmentState;
    path(from, "DRAFT_SUBMITTED");
    const moved = await tx.studentAssignment.updateMany({
      where: { id: row.id, tenantId: row.tenantId, reviewState: from, version: row.version, revisionNote: null },
      data: { reviewState: "DRAFT_SUBMITTED", revisionNote: reason, reviewedById: actor.userId },
    });
    if (moved.count !== 1) throw new AssignmentTurnError("This piece changed — reload it and try again.");
    if (from === "DRAFT_SUBMITTED") {
      await audit(tx, actor, AUDIT_ACTIONS.studentAssignment.startReview, "StudentAssignment", row.id, {
        before: { state: "DRAFT_SUBMITTED" }, after: { state: "BTG_REVIEW", version: row.version },
      });
    }
    await audit(tx, actor, AUDIT_ACTIONS.studentAssignment.requestRevision, "StudentAssignment", row.id, {
      before: { state: "BTG_REVIEW" }, after: { state: "DRAFT_SUBMITTED", version: row.version, note: reason },
    });
    await tell(tx, row, "STUDENT", "studentAssignment.revisionRequested", `v${row.version}`, { reason });
    return assignmentOut(await tx.studentAssignment.findFirstOrThrow({ where: { id: row.id, tenantId: row.tenantId }, select: SELECT }));
  });
}

/** A short-lived, audited signed read of the draft's file, for whoever reads the assignment. */
export async function assignmentFileUrl(actor: Actor, id: string): Promise<{ url: string }> {
  assertAllowed(actor, "studentAssignment", "read");
  const row = await prisma.studentAssignment.findFirst({
    where: { AND: [{ id }, whereFor(actor, "studentAssignment", "read")] },
    select: { id: true, r2Key: true },
  });
  if (!row) throw new ForbiddenError("studentAssignment", "read");
  if (!row.r2Key) throw new AssignmentInputError("This piece has no file.");
  return { url: await presignPrivateDownload(actor, row.r2Key, { entity: "StudentAssignment", entityId: row.id }) };
}

/**
 * /api/v1 — student assignments and the advisor's content review (P9-BE-24).
 *
 * The advisor (their school) or BTG assigns; the student submits their own
 * draft; the advisor approves or sends it back. No business rule lives here;
 * see domain/student-assignment.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { AssignmentInput, AssignmentRevisionInput, DraftSubmitInput, DraftUploadInput } from "../../contracts/student-assignment";
import {
  approveAssignment,
  ASSIGNMENT_VIEWS,
  assignmentFileUrl,
  createAssignment,
  getAssignment,
  listAssignments,
  presignDraftUpload,
  requestAssignmentRevision,
  startAssignmentReview,
  submitDraft,
} from "../../domain/student-assignment";
import { allowedList, pageRequest, searchTerm } from "../../lib/paging";

export const studentAssignmentsRouter = Router();

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const create: RequestHandler<{ id: string }> = async (req, res) => {
  const b = AssignmentInput.parse(req.body);
  res.status(201).json(await createAssignment(req.actor!, req.params.id, { ...b, dueAt: b.dueAt ? new Date(b.dueAt) : null }));
};
/** GET /student-assignments — ?view= waiting | with-student | approved | all, ?editionId= ?studentId= ?q=, ?page= &size=. */
export const list: RequestHandler = async (req, res) => {
  const query = (req.query ?? {}) as Record<string, unknown>;
  const [view] = allowedList(query.view, ASSIGNMENT_VIEWS);
  res.json(await listAssignments(req.actor!, {
    view, editionId: str(query.editionId), studentId: str(query.studentId), q: searchTerm(query), page: pageRequest(query),
  }));
};
const read: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getAssignment(req.actor!, req.params.id));
};
const upload: RequestHandler<{ id: string }> = async (req, res) => {
  const b = DraftUploadInput.parse(req.body);
  res.status(201).json(await presignDraftUpload(req.actor!, req.params.id, b.contentType, b.bytes));
};
const submit: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await submitDraft(req.actor!, req.params.id, DraftSubmitInput.parse(req.body)));
};
const startReview: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await startAssignmentReview(req.actor!, req.params.id));
};
const approve: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await approveAssignment(req.actor!, req.params.id));
};
const revision: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await requestAssignmentRevision(req.actor!, req.params.id, AssignmentRevisionInput.parse(req.body).note));
};
const fileUrl: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await assignmentFileUrl(req.actor!, req.params.id));
};

studentAssignmentsRouter.post("/editions/:id/assignments", requireActor, create);
studentAssignmentsRouter.get("/student-assignments", requireActor, list);
studentAssignmentsRouter.get("/student-assignments/:id", requireActor, read);
studentAssignmentsRouter.post("/student-assignments/:id/uploads", requireActor, upload);
studentAssignmentsRouter.post("/student-assignments/:id/submit", requireActor, submit);
studentAssignmentsRouter.post("/student-assignments/:id/review", requireActor, startReview);
studentAssignmentsRouter.post("/student-assignments/:id/approve", requireActor, approve);
studentAssignmentsRouter.post("/student-assignments/:id/revision", requireActor, revision);
studentAssignmentsRouter.get("/student-assignments/:id/file", requireActor, fileUrl);

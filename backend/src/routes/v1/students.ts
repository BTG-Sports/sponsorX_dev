/**
 * /api/v1 — SponsorX NEXT students (P9-BE-04, -07, -13, -15, P9-SEC-01).
 *
 * Staff, the school's advisor, the student and their guardian reach these by
 * matrix §15.2 scopes. The two PUBLIC routes — the student application and
 * the /s/[code] resolver — are grouped at the bottom and rate-limited.
 *
 * No business rule lives here; see domain/student.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import {
  AssignStudentInput,
  PointsInput,
  ProspectDecisionInput,
  ProspectInput,
  StudentApplicationInput,
  StudentGuardianInput,
  StudentInput,
  StudentTransitionInput,
} from "../../contracts/student";
import {
  accruePoints,
  applyAsStudent,
  assignAccountStudent,
  createStudent,
  decideProspect,
  getStudent,
  issueStudentCode,
  linkStudentGuardian,
  listProspects,
  listProspectsPage,
  listStudents,
  listStudentsPage,
  PROSPECT_STATES,
  readStudentCode,
  resolveStudentCode,
  studentPointsBalance,
  studentSales,
  STUDENT_GROUP_KEYS,
  submitProspect,
  transitionStudent,
  type MastheadRole,
  type ProspectRejectionReason,
} from "../../domain/student";
import type { PointReason } from "../../domain/student-points";
import { allowedList, pageRequest, searchTerm } from "../../lib/paging";

export const studentsRouter = Router();

const toDate = (d: string | null | undefined) => (d ? new Date(d) : null);

/* ── staff, advisor, student, guardian ─────────────────────────────────── */

const create: RequestHandler = async (req, res) => {
  const b = StudentInput.parse(req.body);
  res.status(201).json(await createStudent(req.actor!, { ...b, birthDate: toDate(b.birthDate), masthead: b.masthead as MastheadRole[] }));
};
/** GET /students — unpaged (legacy) without `?page=`; with it, one page,
 *  `?group=` one of the advisor desk's five groups, `?q=` a name search,
 *  and the groups' counts (2026-09-29). */
export const list: RequestHandler = async (req, res) => {
  const query = (req.query ?? {}) as Record<string, unknown>;
  const pr = pageRequest(query);
  if (!pr) {
    res.json({ students: await listStudents(req.actor!) });
    return;
  }
  const [group] = allowedList(query.group, STUDENT_GROUP_KEYS);
  res.json(await listStudentsPage(req.actor!, pr, { group, q: searchTerm(query) }));
};
const read: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getStudent(req.actor!, req.params.id));
};
const transition: RequestHandler<{ id: string }> = async (req, res) => {
  const b = StudentTransitionInput.parse(req.body);
  res.json(await transitionStudent(req.actor!, req.params.id, b.to, b.reviewerNotes));
};
const guardian: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await linkStudentGuardian(req.actor!, req.params.id, StudentGuardianInput.parse(req.body)));
};
const issueCode: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await issueStudentCode(req.actor!, req.params.id));
};
const readCode: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await readStudentCode(req.actor!, req.params.id));
};
export const sales: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await studentSales(req.actor!, req.params.id, pageRequest((req.query ?? {}) as Record<string, unknown>)));
};
export const points: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await studentPointsBalance(req.actor!, req.params.id, pageRequest((req.query ?? {}) as Record<string, unknown>)));
};
const accrue: RequestHandler<{ id: string }> = async (req, res) => {
  const b = PointsInput.parse(req.body);
  res.status(201).json(await accruePoints(req.actor!, req.params.id, { ...b, reason: b.reason as Exclude<PointReason, "SALES_500"> }));
};
const newProspect: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await submitProspect(req.actor!, req.params.id, ProspectInput.parse(req.body)));
};
export const prospects: RequestHandler<{ id: string }> = async (req, res) => {
  const query = (req.query ?? {}) as Record<string, unknown>;
  const pr = pageRequest(query);
  if (!pr) {
    res.json({ prospects: await listProspects(req.actor!, req.params.id) });
    return;
  }
  res.json(await listProspectsPage(req.actor!, req.params.id, pr, { states: allowedList(query.state, PROSPECT_STATES) }));
};
const decide: RequestHandler<{ id: string }> = async (req, res) => {
  const b = ProspectDecisionInput.parse(req.body);
  res.json(await decideProspect(req.actor!, req.params.id, { ...b, reasonCode: b.reasonCode as ProspectRejectionReason | undefined }));
};
const assign: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await assignAccountStudent(req.actor!, req.params.id, AssignStudentInput.parse(req.body).studentId));
};

studentsRouter.post("/students", requireActor, create);
studentsRouter.get("/students", requireActor, list);
studentsRouter.get("/students/:id", requireActor, read);
studentsRouter.post("/students/:id/transition", requireActor, transition);
studentsRouter.post("/students/:id/guardian", requireActor, guardian);
studentsRouter.post("/students/:id/code", requireActor, issueCode);
studentsRouter.get("/students/:id/code", requireActor, readCode);
studentsRouter.get("/students/:id/sales", requireActor, sales);
studentsRouter.get("/students/:id/points", requireActor, points);
studentsRouter.post("/students/:id/points", requireActor, accrue);
studentsRouter.post("/students/:id/prospects", requireActor, newProspect);
studentsRouter.get("/students/:id/prospects", requireActor, prospects);
studentsRouter.post("/prospects/:id/decision", requireActor, decide);
studentsRouter.post("/sponsors/:id/assigned-student", requireActor, assign);

/* ── public ─────────────────────────────────────────────────────────────── */

/** POST /public/students/applications — "Become the Media". */
const apply: RequestHandler = async (req, res) => {
  await limit("student:apply", clientIp(req), 5, 3600);
  const b = StudentApplicationInput.parse(req.body);
  res.status(201).json(await applyAsStudent({ ...b, birthDate: toDate(b.birthDate), masthead: b.masthead as MastheadRole[], guardian: b.guardian ?? null }));
};

/** GET /public/s/:code — who sent this business, and from which school. */
const resolve: RequestHandler<{ code: string }> = async (req, res) => {
  await limit("student:code", clientIp(req), 60, 60);
  res.json(await resolveStudentCode(req.params.code));
};

studentsRouter.post("/public/students/applications", apply);
studentsRouter.get("/public/s/:code", resolve);

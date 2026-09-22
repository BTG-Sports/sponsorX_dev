/**
 * /api/v1/applications — the athlete application review surface (P3-BE-07,
 * §13, §23).
 *
 * The first feature router, and the shape the rest of Block B follows: read
 * endpoints answer from a scoped `where`, decision endpoints parse a Zod
 * contract and hand off to a domain function. No business rule lives here —
 * the router's job is HTTP, and every rule it could enforce would then exist
 * only for HTTP callers, leaving §8's service account and any internal caller
 * outside it.
 *
 * Errors are thrown, not handled: Express 5 forwards a rejected async handler
 * to the error middleware in app.ts, which reads `status` off the error.
 * ForbiddenError is 403, IllegalTransitionError 409, ReviewNotesRequiredError
 * 422 — each one set where the rule lives.
 */
import { Router } from "express";

import { requireActor } from "../../auth/actor";
import { whereFor } from "../../auth/scope";
import { prisma } from "../../db/client";
import {
  ApplicationDecisionNotes,
  ApproveApplicationInput,
  AthleteState,
} from "../../contracts/athlete";
import {
  approveApplication,
  beginReview,
  rejectApplication,
  requestChanges,
} from "../../domain/application-review";
import { guardianReadiness } from "../../domain/guardian-rules";

export const applicationsRouter = Router();

applicationsRouter.use(requireActor);

/** The columns the queue needs, and no more — the §26 habit of selecting
 *  explicitly rather than handing back whole rows (enforced by P2-OPS-06). */
const SUMMARY_SELECT = {
  id: true,
  displayName: true,
  legalName: true,
  sport: true,
  stateCode: true,
  state: true,
  birthDate: true,
  ageBand: true,
  guardianId: true,
  reviewerNotes: true,
  reviewedAt: true,
  createdAt: true,
  guardian: { select: { verifiedAt: true } },
} as const;

type SummaryRow = {
  id: string;
  displayName: string;
  legalName: string;
  sport: string;
  stateCode: string | null;
  state: string;
  birthDate: Date | null;
  ageBand: string | null;
  guardianId: string | null;
  reviewerNotes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  guardian: { verifiedAt: Date | null } | null;
};

/**
 * Shape a row for the desk.
 *
 * `guardianStatus` is computed rather than stored, because §37's gate is
 * about age *now* (see guardian-rules.ts). Putting it on the queue row means
 * a reviewer can see before opening an application that approving it will not
 * lead anywhere until a guardian is verified.
 */
function toSummary(row: SummaryRow) {
  return {
    id: row.id,
    displayName: row.displayName,
    legalName: row.legalName,
    sport: row.sport,
    stateCode: row.stateCode,
    state: row.state,
    guardianStatus: guardianReadiness({
      birthDate: row.birthDate,
      ageBand: row.ageBand,
      guardianId: row.guardianId,
      guardianVerifiedAt: row.guardian?.verifiedAt ?? null,
    }).status,
    reviewerNotes: row.reviewerNotes,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * GET /applications — the review queue.
 *
 * `?state=` narrows it; the default is everything the caller may reach rather
 * than a hard-coded SUBMITTED, because §23's desk also shows what was decided
 * this week. Oldest first: a review queue worked newest-first starves the
 * applicant who has waited longest.
 */
applicationsRouter.get("/", async (req, res) => {
  const actor = req.actor!;
  const where = whereFor(actor, "athleteApplication", "read");

  const parsed = AthleteState.safeParse(req.query.state);
  const rows = await prisma.athlete.findMany({
    where: { ...where, ...(parsed.success ? { state: parsed.data } : {}) },
    select: SUMMARY_SELECT,
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  res.json({ applications: rows.map((row) => toSummary(row as SummaryRow)) });
});

/** GET /applications/:id — one application, as the review drawer shows it. */
applicationsRouter.get("/:id", async (req, res) => {
  const actor = req.actor!;
  const where = whereFor(actor, "athleteApplication", "read");

  const row = await prisma.athlete.findFirst({
    where: { ...where, id: req.params.id },
    select: SUMMARY_SELECT,
  });
  if (!row) {
    res.status(404).json({ error: { code: "not_found" } });
    return;
  }

  res.json(toSummary(row as SummaryRow));
});

/** POST /applications/:id/begin-review — claim it. SUBMITTED → UNDER_REVIEW. */
applicationsRouter.post("/:id/begin-review", async (req, res) => {
  res.json(await beginReview(req.actor!, req.params.id));
});

/** POST /applications/:id/approve — passed review. Activation is separate. */
applicationsRouter.post("/:id/approve", async (req, res) => {
  const body = ApproveApplicationInput.parse(req.body ?? {});
  res.json(await approveApplication(req.actor!, req.params.id, body.reviewerNotes));
});

/** POST /applications/:id/request-changes — notes are required and are sent. */
applicationsRouter.post("/:id/request-changes", async (req, res) => {
  const body = ApplicationDecisionNotes.parse(req.body ?? {});
  res.json(await requestChanges(req.actor!, req.params.id, body.reviewerNotes));
});

/** POST /applications/:id/reject — terminal. Notes are required and are sent. */
applicationsRouter.post("/:id/reject", async (req, res) => {
  const body = ApplicationDecisionNotes.parse(req.body ?? {});
  res.json(await rejectApplication(req.actor!, req.params.id, body.reviewerNotes));
});

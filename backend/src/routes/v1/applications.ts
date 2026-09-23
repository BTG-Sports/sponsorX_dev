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
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { readIntakeToken } from "../../lib/intake-token";
import { ForbiddenError } from "../../auth/errors";
import { whereFor } from "../../auth/scope";
import { prisma } from "../../db/client";
import { PageQuery } from "../../contracts/common";
import {
  ApplicationDecisionNotes,
  ApproveApplicationInput,
  AthleteApplicationInput,
  AthleteApplicationPatch,
  AthleteState,
} from "../../contracts/athlete";
import {
  approveApplication,
  beginReview,
  rejectApplication,
  requestChanges,
} from "../../domain/application-review";
import { transitionAthlete } from "../../domain/athlete";
import { guardianReadiness } from "../../domain/guardian-rules";
import {
  ApplicationNotFoundError,
  patchApplication,
  readOwnApplication,
  submitApplication,
} from "../../domain/application-intake";

export const applicationsRouter = Router();

/* --------------------------------------------------------------------------
   PUBLIC INTAKE — no actor, and mounted first (P3-BE-13).

   These four routes are the only unauthenticated writes in the API. They are
   declared above the protected ones for a routing reason and kept together
   for a reading one: `/intake` would otherwise be captured by `/:id`, and a
   public route buried among protected ones is how one accidentally loses its
   guard in a later edit.

   `requireActor` is attached per route below rather than to the router, so
   that no route is protected by position. Adding one without a guard is then
   a visible omission instead of an invisible one.
   -------------------------------------------------------------------------- */

/** Anything that reaches an existing application by signed link rather than
 *  by session. Throws rather than returning null — a bad token and a missing
 *  application are the same answer to a caller who should learn neither. */
function applicationFromToken(req: { query: Record<string, unknown> }): string {
  const raw = req.query.token;
  const id = readIntakeToken(typeof raw === "string" ? raw : null);
  if (!id) throw new ApplicationNotFoundError();
  return id;
}

/**
 * POST /applications/intake — apply.
 *
 * Five an hour per address. High enough that a family sharing a connection at
 * a tournament is unaffected, low enough that nobody scripts the form into
 * sending a thousand receipt emails.
 */
applicationsRouter.post("/intake", async (req, res) => {
  await limit("intake:create", req.ip, 5, 3600);
  const input = AthleteApplicationInput.parse(req.body ?? {});
  res.status(201).json(await submitApplication(input));
});

/** GET /applications/intake/mine?token= — the applicant's own view. */
applicationsRouter.get("/intake/mine", async (req, res) => {
  await limit("intake:read", req.ip, 60, 3600);
  res.json(await readOwnApplication(applicationFromToken(req)));
});

/** PATCH /applications/intake/mine?token= — edit while it is still open.
 *  From CHANGES_REQUESTED this also resubmits: an applicant who has answered
 *  the request should not have to find a second button. */
applicationsRouter.patch("/intake/mine", async (req, res) => {
  await limit("intake:patch", req.ip, 30, 3600);
  const patch = AthleteApplicationPatch.parse(req.body ?? {});
  res.json(await patchApplication(applicationFromToken(req), patch));
});

/* --------------------------------------------------------------------------
   Everything below requires an actor.
   -------------------------------------------------------------------------- */

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
 *
 * PAGINATED BY CURSOR, NOT OFFSET — the reason `PageQuery` was written that
 * way (P2-BE-07). This collection changes under the caller by definition: it
 * is a work queue, and the rows being decided are the rows being listed. An
 * offset would skip an applicant or show one twice precisely when the desk is
 * busy.
 *
 * The tiebreaker on `id` is load-bearing. `createdAt` alone is not unique —
 * an import job can write a whole cohort in the same millisecond — and a
 * cursor over a non-deterministic order drops rows silently.
 */
export const listApplications: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const where = whereFor(actor, "athleteApplication", "read");

  /* Query strings are text; the contract describes the decoded shape. */
  const page = PageQuery.parse({
    cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
    ...(req.query.limit === undefined ? {} : { limit: Number(req.query.limit) }),
  });

  const parsed = AthleteState.safeParse(req.query.state);
  /* One more than asked for: whether a next page exists is a fact about the
     data, and answering it with a second COUNT query would be a second read
     of a table that is being written to. */
  const rows = await prisma.athlete.findMany({
    where: { ...where, ...(parsed.success ? { state: parsed.data } : {}) },
    select: SUMMARY_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: page.limit + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > page.limit;
  const items = (hasMore ? rows.slice(0, page.limit) : rows) as SummaryRow[];

  res.json({
    applications: items.map(toSummary),
    page: { nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore },
  });
};

/**
 * GET /applications/:id — one application, as the review drawer shows it.
 *
 * A miss answers 403, not 404, because that is what the decision endpoints
 * below already answer through the domain layer — and the same id returning
 * 404 here and 403 there is an inconsistency a client has to code around.
 *
 * The convention itself is P3-BE-01's and is deliberate: **not found and not
 * yours are answered identically**, because telling a caller that an id
 * exists in another tenant is itself a disclosure. Both endpoints held that
 * property on their own; this makes them hold it as a pair.
 */
export const getApplication: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const where = whereFor(actor, "athleteApplication", "read");

  const row = await prisma.athlete.findFirst({
    where: { ...where, id: req.params.id },
    select: SUMMARY_SELECT,
  });
  if (!row) throw new ForbiddenError("athleteApplication", "read");

  res.json(toSummary(row as SummaryRow));
};

applicationsRouter.get("/", requireActor, listApplications);
applicationsRouter.get("/:id", requireActor, getApplication);

/** POST /applications/:id/begin-review — claim it. SUBMITTED → UNDER_REVIEW. */
applicationsRouter.post<{ id: string }>("/:id/begin-review", requireActor, async (req, res) => {
  res.json(await beginReview(req.actor!, req.params.id));
});

/** POST /applications/:id/approve — passed review. Activation is separate. */
applicationsRouter.post<{ id: string }>("/:id/approve", requireActor, async (req, res) => {
  const body = ApproveApplicationInput.parse(req.body ?? {});
  res.json(await approveApplication(req.actor!, req.params.id, body.reviewerNotes));
});

/** POST /applications/:id/request-changes — notes are required and are sent. */
applicationsRouter.post<{ id: string }>("/:id/request-changes", requireActor, async (req, res) => {
  const body = ApplicationDecisionNotes.parse(req.body ?? {});
  res.json(await requestChanges(req.actor!, req.params.id, body.reviewerNotes));
});

/**
 * POST /applications/:id/activate — APPROVED → ACTIVE.
 *
 * The last step of B1, and the only one in this file that needs `approve` on
 * `athlete` rather than on `athleteApplication`. That distinction is real and
 * worth preserving: BTG_ADMIN may approve an *application* and deliberately
 * may not activate an *athlete* — the matrix gives athlete.approve to
 * NETWORK_MGR and SUPER_ADMIN only.
 *
 * It goes through `transitionAthlete` rather than doing the update here, so
 * §37's gate fires: a minor with no verified guardian is refused, for the API
 * and §8's service account exactly as for someone clicking a button.
 */
applicationsRouter.post<{ id: string }>("/:id/activate", requireActor, async (req, res) => {
  res.json(await transitionAthlete(req.actor!, req.params.id, "ACTIVE"));
});

/** POST /applications/:id/reject — terminal. Notes are required and are sent. */
applicationsRouter.post<{ id: string }>("/:id/reject", requireActor, async (req, res) => {
  const body = ApplicationDecisionNotes.parse(req.body ?? {});
  res.json(await rejectApplication(req.actor!, req.params.id, body.reviewerNotes));
});

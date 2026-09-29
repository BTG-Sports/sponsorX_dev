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
import { clientIp } from "../../lib/client-ip";
import { readIntakeToken } from "../../lib/intake-token";
import { ForbiddenError } from "../../auth/errors";
import { whereFor } from "../../auth/scope";
import { prisma } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { PageQuery } from "../../contracts/common";
import { pageRequest, readPage, searchTerm } from "../../lib/paging";
import {
  ApplicationDecisionNotes,
  ApproveApplicationInput,
  AthleteApplicationInput,
  AthleteApplicationPatch,
  AthleteState,
  missingApplicationFields,
} from "../../contracts/athlete";
import {
  approveApplication,
  beginReview,
  rejectApplication,
  requestChanges,
} from "../../domain/application-review";
import { activateAthlete } from "../../domain/athlete";
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
  await limit("intake:create", clientIp(req), 5, 3600);
  const input = AthleteApplicationInput.parse(req.body ?? {});
  res.status(201).json(await submitApplication(input));
});

/** GET /applications/intake/mine?token= — the applicant's own view. */
applicationsRouter.get("/intake/mine", async (req, res) => {
  await limit("intake:read", clientIp(req), 60, 3600);
  res.json(await readOwnApplication(applicationFromToken(req)));
});

/** PATCH /applications/intake/mine?token= — edit while it is still open.
 *  From CHANGES_REQUESTED this also resubmits: an applicant who has answered
 *  the request should not have to find a second button. */
applicationsRouter.patch("/intake/mine", async (req, res) => {
  await limit("intake:patch", clientIp(req), 30, 3600);
  const patch = AthleteApplicationPatch.parse(req.body ?? {});
  res.json(await patchApplication(applicationFromToken(req), patch));
});

/* --------------------------------------------------------------------------
   Everything below requires an actor.
   -------------------------------------------------------------------------- */

/** The columns the queue needs, and no more — the §26 habit of selecting
 *  explicitly rather than handing back whole rows (enforced by P2-OPS-06).
 *
 *  The latest score rides along WITH its factor snapshot (P3-FE-02): §23's
 *  desk renders the breakdown in the review drawer, and a second request per
 *  opened row would read the same table again for no reason. Safe for every
 *  role that can reach this router — §7's `athleteScore.value` denial names
 *  only sponsor and property roles, and they have no `athleteApplication`
 *  cell at all. Latest only, not the history: a queue decision is made
 *  against the current assessment, and §14's append-only trail stays a
 *  domain-layer concern (`readLatestScore` / `scoreAthlete`). */
const SUMMARY_SELECT = {
  id: true,
  displayName: true,
  legalName: true,
  email: true,
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
  scores: {
    select: { score: true, factors: true, method: true, scoredAt: true },
    orderBy: { scoredAt: "desc" },
    take: 1,
  },
} as const;

type ScoreRow = {
  score: number;
  factors: unknown;
  method: string;
  scoredAt: Date;
};

type SummaryRow = {
  id: string;
  displayName: string;
  legalName: string;
  email: string | null;
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
  scores: ScoreRow[];
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
  const latest = row.scores[0];
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
    /* What activation would refuse for (decision 3, QA pass 5): the same
       shared definition activateAthlete() checks, so the desk can say why
       before the API has to. Field NAMES only — the email itself is read to
       answer "is there one" and is not added to the row. */
    missingFields: missingApplicationFields(row),
    reviewerNotes: row.reviewerNotes,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    /* null means "not scored yet", which is an honest state the desk must
       show — not zero, per §14's missing-factor rule writ large. `factors`
       is the whole ScoreBreakdown recorded by scoreAthlete. */
    score: latest
      ? {
          total: latest.score,
          method: latest.method,
          scoredAt: latest.scoredAt.toISOString(),
          factors: latest.factors,
        }
      : null,
  };
}

/* --------------------------------------------------------------------------
   The desk's paged mode (2026-09-29) — tabs, filters, search and sort done IN
   THE DATABASE, so the admin desk never fetches the queue to slice it.

   Every rule below is the one the desk applied in the browser before, moved:
   - tabs are applications-ui.ts `stateBucket` — DRAFT, SUSPENDED and
     FEATURED are "other", reachable from the All tab only;
   - "minor" is guardian-rules.ts `requiresGuardian` as a WHERE: a birth date
     under 18 years ago, or a minor age band — evaluated against now, never
     stored, for the same reason the rule gives;
   - "aging" is in review (SUBMITTED / UNDER_REVIEW) and created more than
     48 hours ago — the desk's AGING_HOURS, as a createdAt threshold;
   - "flagged" matches nothing: the queue records no conflict flags yet (the
     live desk has always shown `flags: []`), and an honest empty list beats
     a filter that quietly ignores itself;
   - search is case-insensitive contains over what the desk searched —
     display name, sport, region (stateCode).
   Sort is createdAt (+ id, the same tiebreaker the cursor mode needs):
   waiting-longest by default, `?sort=newest` for the reverse. The desk's
   "score" sort is NOT offered here — the score is the latest row of a related
   table, which Prisma cannot order a parent by — so it falls back to the
   default rather than sorting one page in memory and calling it the order.
   -------------------------------------------------------------------------- */

export const DESK_TABS = {
  review: ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"],
  approved: ["APPROVED", "ACTIVE"],
  rejected: ["REJECTED"],
} as const satisfies Record<string, readonly AthleteState[]>;

/** In the queue proper — what "waiting" and "aging" count. */
const WAITING_STATES = ["SUBMITTED", "UNDER_REVIEW"] as const satisfies readonly AthleteState[];

export const AGING_HOURS = 48;
const MINOR_BANDS = ["UNDER_16", "16_17"];

const DESK_OLDEST = [{ createdAt: "asc" as const }, { id: "asc" as const }];
const DESK_NEWEST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/** The date an athlete born after is under 18 on `now` (isMinorOn, inverted). */
function adultCutoff(now: Date): Date {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - 18);
  return d;
}

function agingCutoff(now: Date): Date {
  return new Date(now.getTime() - AGING_HOURS * 3_600_000);
}

/**
 * The paged desk's WHERE. The caller's scope is ALWAYS the first AND clause —
 * nothing a query string says can widen it, only narrow it.
 */
export function deskWhere(
  scope: Prisma.AthleteWhereInput,
  query: Record<string, unknown>,
  now: Date,
): Prisma.AthleteWhereInput {
  /* hasOwn, not `in` — `?tab=constructor` must not reach Object.prototype. */
  const tab =
    typeof query.tab === "string" && Object.hasOwn(DESK_TABS, query.tab) ? (query.tab as keyof typeof DESK_TABS) : null;
  const sport = typeof query.sport === "string" && query.sport.trim() ? query.sport.trim().slice(0, 100) : null;
  const q = searchTerm(query);
  const clauses: Prisma.AthleteWhereInput[] = [scope];
  if (tab) clauses.push({ state: { in: [...DESK_TABS[tab]] } });
  if (sport) clauses.push({ sport });
  switch (query.flag) {
    case "minor":
      clauses.push({ OR: [{ birthDate: { gt: adultCutoff(now) } }, { ageBand: { in: MINOR_BANDS } }] });
      break;
    case "aging":
      clauses.push({ state: { in: [...WAITING_STATES] }, createdAt: { lt: agingCutoff(now) } });
      break;
    case "flagged":
      clauses.push({ id: { in: [] } });
      break;
  }
  if (q) {
    clauses.push({
      OR: [
        { displayName: { contains: q, mode: "insensitive" as const } },
        { sport: { contains: q, mode: "insensitive" as const } },
        { stateCode: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  return { AND: clauses };
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

  /* Offset mode (?page=) — the admin desk's pages. The cursor mode below is
     untouched for every caller that doesn't send ?page. */
  const paged = pageRequest(req.query as Record<string, unknown>);
  if (paged) {
    const pagedWhere = deskWhere(where, req.query as Record<string, unknown>, new Date());
    const orderBy = req.query.sort === "newest" ? DESK_NEWEST : DESK_OLDEST;
    const { rows, page: info } = await readPage(
      paged,
      () =>
        prisma.athlete.count({
          /* tenant-scope: deskWhere puts whereFor(actor, "athleteApplication", "read") first in its AND */
          where: pagedWhere,
        }),
      (skip, take) =>
        prisma.athlete.findMany({
          /* tenant-scope: deskWhere puts whereFor(actor, "athleteApplication", "read") first in its AND */
          where: pagedWhere,
          select: SUMMARY_SELECT,
          orderBy,
          skip,
          take,
        }) as unknown as Promise<SummaryRow[]>,
    );
    res.json({ applications: rows.map(toSummary), page: info });
    return;
  }

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

/**
 * GET /applications/summary — the desk's headline numbers over the caller's
 * whole scope (2026-09-29): waiting, overdue (> 48h), decided, total, the
 * per-tab counts and the sports on file (the sport filter's options). Counted
 * in the database, so the hero band no longer needs every row in hand.
 * Unfiltered on purpose, like the desk's tab counts always were: they answer
 * "how is the queue doing", not "how many match my search".
 *
 * "decided" keeps the desk's definition — everything outside the review tab,
 * so DRAFT / SUSPENDED count as decided, exactly as before.
 */
export const applicationsSummary: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const scope = whereFor(actor, "athleteApplication", "read");

  const [byState, overdue, sports] = await Promise.all([
    prisma.athlete.groupBy({
      by: ["state"],
      /* tenant-scope: scope = whereFor(actor, "athleteApplication", "read") */
      where: scope,
      _count: { _all: true },
    }),
    prisma.athlete.count({
      /* tenant-scope: scope = whereFor(actor, "athleteApplication", "read"), first in the AND */
      where: { AND: [scope, { state: { in: [...WAITING_STATES] }, createdAt: { lt: agingCutoff(new Date()) } }] },
    }),
    prisma.athlete.groupBy({
      by: ["sport"],
      /* tenant-scope: scope = whereFor(actor, "athleteApplication", "read") */
      where: scope,
      orderBy: { sport: "asc" },
    }),
  ]);

  const n = (states: readonly string[]) =>
    byState.filter((r) => states.includes(r.state)).reduce((sum, r) => sum + r._count._all, 0);
  const total = byState.reduce((sum, r) => sum + r._count._all, 0);
  const review = n(DESK_TABS.review);

  res.json({
    summary: {
      total,
      waiting: n(WAITING_STATES),
      overdue,
      decided: total - review,
      tabs: { review, approved: n(DESK_TABS.approved), rejected: n(DESK_TABS.rejected), all: total },
      sports: sports.map((s) => s.sport),
    },
  });
};

applicationsRouter.get("/", requireActor, listApplications);
/* Before /:id, which would otherwise read "summary" as an id. */
applicationsRouter.get("/summary", requireActor, applicationsSummary);
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
 * POST /applications/:id/activate — APPROVED → ACTIVE, and only that.
 *
 * The last step of B1, and the only one in this file that needs `approve` on
 * `athlete` rather than on `athleteApplication`. The two permissions are
 * held by the same three BTG roles today — NETWORK_MGR day to day, BTG_ADMIN
 * and SUPER_ADMIN as superset roles (RBAC matrix §12; b1.endpoints.test.ts
 * pins the list) — but they stay distinct cells: CAMPAIGN_MGR is the case
 * that proves approving an application is not activating an athlete.
 *
 * `activateAthlete` refuses a SUSPENDED athlete (reinstatement is a separate
 * step, not built yet) and an incomplete record (`profile_incomplete`, with
 * the missing fields named), then goes through the one transition function,
 * so §37's gate fires: a minor with no verified guardian is refused, for the
 * API and §8's service account exactly as for someone clicking a button.
 */
applicationsRouter.post<{ id: string }>("/:id/activate", requireActor, async (req, res) => {
  res.json(await activateAthlete(req.actor!, req.params.id));
});

/** POST /applications/:id/reject — terminal. Notes are required and are sent. */
applicationsRouter.post<{ id: string }>("/:id/reject", requireActor, async (req, res) => {
  const body = ApplicationDecisionNotes.parse(req.body ?? {});
  res.json(await rejectApplication(req.actor!, req.params.id, body.reviewerNotes));
});

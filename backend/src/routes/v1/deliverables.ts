/**
 * /api/v1 — deliverables, the approval chain and creative assets
 * (P5-BE-05, P5-BE-06, P5-BE-08).
 *
 * One endpoint per step of §13's chain rather than a single generic
 * `/transition` taking a target state. The steps do not carry the same
 * permission — an athlete submits and publishes, BTG reviews and verifies, a
 * sponsor approves or asks for a revision — and a generic endpoint would have
 * to re-derive which of those applied from the body, which is exactly the
 * business logic that is supposed to live in the domain.
 *
 * No business rule lives here. Every state guard, permission check and audit
 * write is in `domain/deliverable.ts`, so §8's service account meets the same
 * rules as a browser.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { assertAllowed, whereFor } from "../../auth/scope";
import { ForbiddenError } from "../../auth/errors";
import { prisma } from "../../db/client";
import { AUDIT_ACTIONS } from "../../db/audit";
import { presignPrivateDownload } from "../../lib/storage";
import { allowedList, pageRequest, readPage, searchTerm } from "../../lib/paging";
import {
  CreativeAssetInput,
  CreativeUploadInput,
  MarkPublishedInput,
  RevisionRequestInput,
  SubmitDraftInput,
} from "../../contracts/deliverable";
import { readChecks, sentBack } from "../../domain/content-check-rules";
import { isBtgReviewer } from "../../domain/content-trust";
import {
  approveDeliverable,
  markPublished,
  presignCreativeUpload,
  registerCreativeAsset,
  requestRevision,
  sendToSponsorReview,
  startBtgReview,
  submitDraft,
  verifyPublished,
} from "../../domain/deliverable";

export const deliverablesRouter = Router();

/* --- reads (P5-FE-02 / -03 / -04 / -05) ----------------------------------

   The chain had every write and no read: nothing could list what an athlete
   owes, what BTG has waiting, or what a sponsor must approve. These are the
   reads — scoped by the matrix (athlete own, sponsor own-campaign, BTG
   tenant), no rule of their own.

   REVISIONS ARE DERIVED, NOT STORED. requestRevision moves a deliverable
   back to DRAFT_SUBMITTED — the same state as a first submission — and puts
   the reason on its audit row. So "a revision is waiting on you" is: the
   latest requestRevision is newer than the latest uploaded asset. A new
   upload answers it. */

const APPEARANCE_JOBS = new Set(["SX-05"]);
const STATES = ["NOT_STARTED", "DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW", "APPROVED", "PUBLISHED", "VERIFIED"];

const LIST_SELECT = {
  id: true, title: true, dueDate: true, state: true, publishedUrl: true, publishedAt: true,
  /* P5-BE-09 — the latest submission's caption and checks, and the wait. */
  caption: true, captionVersion: true, checks: true, checksPassed: true, checkedAt: true, reviewWaitingSince: true,
  /* P5-BE-10 — the latest submission skipped BTG's review, and why. */
  btgReviewSkipped: true, skipReason: true,
  order: {
    select: {
      id: true, jobId: true,
      job: { select: { name: true } },
      athlete: { select: { id: true, displayName: true } },
      campaign: { select: { id: true, name: true, sponsor: { select: { name: true } } } },
      /* P5-BE-09 — what the caption must carry (the accepted offer's terms). */
      offer: { select: { disclosures: true } },
    },
  },
  assets: {
    select: { version: true, uploadedAt: true },
    orderBy: { version: "desc" as const },
  },
} as const;

type ListRow = {
  id: string; title: string; dueDate: Date; state: string;
  publishedUrl: string | null; publishedAt: Date | null;
  caption: string | null; captionVersion: number | null;
  checks: unknown; checksPassed: boolean | null; checkedAt: Date | null; reviewWaitingSince: Date | null;
  btgReviewSkipped: boolean; skipReason: string | null;
  order: {
    id: string; jobId: string; job: { name: string };
    athlete: { id: string; displayName: string };
    campaign: { id: string; name: string; sponsor: { name: string } };
    offer: { disclosures: string[] } | null;
  };
  assets: { version: number; uploadedAt: Date }[];
};

/** Latest revision request per deliverable, from the audit log. */
async function revisionsFor(tenantId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { reason: string; at: Date }>();
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId, entity: "Deliverable", entityId: { in: ids },
      action: AUDIT_ACTIONS.deliverable.requestRevision,
    },
    select: { entityId: true, after: true, at: true },
    orderBy: { at: "desc" },
  });
  const out = new Map<string, { reason: string; at: Date }>();
  for (const r of rows) {
    if (out.has(r.entityId)) continue;
    const reason = (r.after as { reason?: unknown } | null)?.reason;
    out.set(r.entityId, { reason: typeof reason === "string" ? reason : "", at: r.at });
  }
  return out;
}

function rowOut(d: ListRow, revision: { reason: string; at: Date } | undefined, btg = false) {
  const latest = d.assets[0] ?? null;
  /* Open only while it sits back with the athlete: sent back by the
     automatic checks (until a submission passes), or by a reviewer and not
     yet answered (content-check-rules sentBack). */
  const back = sentBack({
    state: d.state,
    checksPassed: d.checksPassed,
    checks: d.checks,
    checkedAt: d.checkedAt,
    latestUploadAt: latest?.uploadedAt ?? null,
    revision,
  });
  const onReviewDesk = REVIEW_STATES.includes(d.state) && !back;
  return {
    id: d.id,
    title: d.title,
    dueDate: d.dueDate.toISOString(),
    state: d.state,
    publishedUrl: d.publishedUrl,
    publishedAt: d.publishedAt?.toISOString() ?? null,
    orderId: d.order.id,
    jobId: d.order.jobId,
    jobName: d.order.job.name,
    appearance: APPEARANCE_JOBS.has(d.order.jobId),
    athlete: d.order.athlete,
    campaign: { id: d.order.campaign.id, name: d.order.campaign.name, sponsorName: d.order.campaign.sponsor.name },
    latestAsset: latest ? { version: latest.version, uploadedAt: latest.uploadedAt.toISOString() } : null,
    assetCount: d.assets.length,
    /* `by` SYSTEM: the automatic checks sent it back; `failed` lists them. */
    revision: back
      ? {
          reason: back.reason,
          at: back.at.toISOString(),
          by: back.by,
          ...(back.by === "SYSTEM" ? { failed: back.failed } : {}),
        }
      : null,
    /* P5-BE-09 — the latest submission: its caption (and the version it went
       with), the disclosures it had to carry, and the automatic checks (null
       for a draft submitted before they existed). */
    caption: d.caption,
    captionVersion: d.captionVersion,
    requiredDisclosures: d.order.offer?.disclosures ?? [],
    checks: readChecks(d.checks),
    /* When it reached the reviewer it is waiting on; null off a review desk.
       A draft from before the clock existed falls back to its latest upload,
       the desk's old measure. */
    waitingSince: onReviewDesk
      ? (d.reviewWaitingSince ?? latest?.uploadedAt ?? null)?.toISOString() ?? null
      : null,
    /* P5-BE-10 — the latest submission went straight to the sponsor. Why, in
       words, is BTG's to read: it describes the athlete's record. */
    btgReviewSkipped: d.btgReviewSkipped,
    skipReason: btg && d.btgReviewSkipped ? d.skipReason : null,
  };
}

/* --- server-paged reads (2026-09-29) ---------------------------------------

   `?page=` turns on OFFSET MODE (lib/paging): one page plus its true total,
   with every filter, the search and the sort done IN THE DATABASE, so the
   content desk and the athlete's agenda never fetch every deliverable to
   slice it in the browser. `?from=&to=` (a dueDate range, ISO dates) works
   in both modes; without `?page=` it is how the athlete's calendar fetches
   ONE MONTH — bounded by the range and still capped by UNPAGED_CAP.

   Without `?page=` and without a range the list is exactly what it always
   was — the admin board and athlete home read it that way. */

const UNPAGED_CAP = 300;
/** Mirrors the frontend's jobFormat (approvals-live.ts): these jobs are
    video; every other job — and an unknown one — is an image job. */
const VIDEO_JOBS = ["SX-01", "SX-03", "SX-04"];
/** On a review desk — where "waiting" is measured. */
const REVIEW_STATES = ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"];
/** Mirrors the desk's AGING_HOURS (approvals-ui.ts). */
const AGING_HOURS = 24;
/** Bound on the DRAFT_SUBMITTED scan that derives open revisions. */
const DRAFT_SCAN_CAP = 2000;
const SORTS = ["due", "waiting", "newest"] as const;
const TABS = ["todo", "review", "done"] as const;

type Where = Record<string, unknown>;

/** A valid ISO date query value, or undefined (a bad one is ignored). */
function dateParam(v: unknown): Date | undefined {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** P5-BE-09 — `?systemReturned=exclude`: BTG's queue never shows a draft the
 *  automatic checks sent back (it is the athlete's to fix). Spelled as an OR
 *  rather than a NOT, so a draft never checked (checksPassed null) stays. */
const NOT_SYSTEM_RETURNED: Where = {
  OR: [{ state: { not: "DRAFT_SUBMITTED" } }, { checksPassed: null }, { checksPassed: true }],
};

/** P5-BE-10 — `?btgSkipped=only`: the drafts that skipped BTG's review,
 *  for BTG's spot checks. */
const BTG_SKIPPED: Where = { btgReviewSkipped: true };

/** The narrowing both modes share: `?state`, `?campaignId`, `?from`/`?to`,
 *  `?systemReturned=exclude`, `?btgSkipped=only`. */
function baseFilters(query: Record<string, unknown>): Where[] {
  const wanted = allowedList(query.state, STATES);
  const campaignId = typeof query.campaignId === "string" && query.campaignId ? query.campaignId : undefined;
  const from = dateParam(query.from);
  const to = dateParam(query.to);
  return [
    ...(query.systemReturned === "exclude" ? [NOT_SYSTEM_RETURNED] : []),
    ...(query.btgSkipped === "only" ? [BTG_SKIPPED] : []),
    ...(wanted.length ? [{ state: { in: wanted } }] : []),
    ...(campaignId ? [{ order: { campaignId } }] : []),
    ...(from || to ? [{ dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }] : []),
  ];
}

/**
 * The DRAFT_SUBMITTED deliverables in `where` whose revision is still open
 * (rowOut's rule: requested after the latest upload). Revisions are derived
 * from the audit log, so no WHERE can say it — this is the one bounded scan
 * the tab filter, the waiting sort and the summary share.
 */
async function openRevisions(tenantId: string, where: Where) {
  const drafts = await prisma.deliverable.findMany({
    /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
    where: { AND: [where, { state: "DRAFT_SUBMITTED" }] },
    select: {
      id: true, dueDate: true, checks: true, checksPassed: true, checkedAt: true,
      assets: { select: { uploadedAt: true }, orderBy: { version: "desc" as const }, take: 1 },
    },
    take: DRAFT_SCAN_CAP,
  });
  const revisions = await revisionsFor(tenantId, drafts.map((d) => d.id));
  const open = new Map<string, { dueDate: Date; uploadedAt: Date | null }>();
  const notOpen: { uploadedAt: Date | null }[] = [];
  for (const d of drafts) {
    const latest = d.assets[0]?.uploadedAt ?? null;
    /* P5-BE-09 — sent back by the checks, or by a reviewer and unanswered. */
    const back = sentBack({
      state: "DRAFT_SUBMITTED",
      checksPassed: d.checksPassed ?? null,
      checks: d.checks,
      checkedAt: d.checkedAt ?? null,
      latestUploadAt: latest,
      revision: revisions.get(d.id),
    });
    if (back) open.set(d.id, { dueDate: d.dueDate, uploadedAt: latest });
    else notOpen.push({ uploadedAt: latest });
  }
  return { open, notOpen };
}

/** The athlete's "whose move" tabs as a WHERE (deliverables-live tabOf). */
function tabWhere(tab: (typeof TABS)[number], openIds: string[]): Where {
  switch (tab) {
    case "todo":
      return { OR: [{ state: { in: ["NOT_STARTED", "APPROVED"] } }, { id: { in: openIds } }] };
    case "review":
      return {
        OR: [
          { state: { in: ["BTG_REVIEW", "SPONSOR_REVIEW"] } },
          { state: "DRAFT_SUBMITTED", id: { notIn: openIds } },
        ],
      };
    case "done":
      return { state: { in: ["PUBLISHED", "VERIFIED"] } };
  }
}

/** `?q` over the title, the athlete, the campaign and its sponsor. */
function searchWhere(q: string): Where {
  const has = { contains: q, mode: "insensitive" as const };
  return {
    OR: [
      { title: has },
      { order: { athlete: { displayName: has } } },
      { order: { campaign: { name: has } } },
      { order: { campaign: { sponsor: { name: has } } } },
    ],
  };
}

/**
 * The desk's "waiting longest" / "newest" order: by the LATEST upload,
 * ranked in the database by grouping the assets (Prisma cannot order a
 * deliverable by a max over its relation). Only what is actually waiting —
 * on a review desk, uploaded, not sent back — is ranked; everything else
 * (cleared, open revision, nothing uploaded) follows by due date, which is
 * where the desk's zero-hour rows always sat.
 */
async function readByWaiting(
  tenantId: string,
  where: Where,
  openIds: string[],
  dir: "asc" | "desc",
  skip: number,
  take: number,
): Promise<ListRow[]> {
  const waiting: Where = {
    AND: [
      { state: { in: REVIEW_STATES } },
      { assets: { some: {} } },
      ...(openIds.length ? [{ id: { notIn: openIds } }] : []),
    ],
  };
  const rankedWhere = { AND: [where, waiting] };
  const ranked = await prisma.deliverable.count({
    /* tenant-scope: rankedWhere = whereFor(actor, "deliverable", "read") ∧ filters */
    where: rankedWhere,
  });
  const out: ListRow[] = [];
  if (skip < ranked) {
    const groups = await prisma.creativeAsset.groupBy({
      by: ["deliverableId"],
      where: { tenantId, deliverable: rankedWhere },
      _max: { uploadedAt: true },
      orderBy: [{ _max: { uploadedAt: dir } }, { deliverableId: "asc" }],
      skip,
      take,
    });
    const ids = groups.map((g) => g.deliverableId);
    const rows = (await prisma.deliverable.findMany({
      /* tenant-scope: the scoped `where` again, narrowed to the ranked ids */
      where: { AND: [where, { id: { in: ids } }] },
      select: LIST_SELECT,
    })) as ListRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) {
      const r = byId.get(id);
      if (r) out.push(r);
    }
  }
  const room = take - out.length;
  if (room > 0) {
    const tail = (await prisma.deliverable.findMany({
      /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
      where: { AND: [where, { NOT: waiting }] },
      select: LIST_SELECT,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip: Math.max(0, skip - ranked),
      take: room,
    })) as ListRow[];
    out.push(...tail);
  }
  return out;
}

/**
 * GET /deliverables — `?state=A,B`, `?campaignId=`, `?from=&to=` narrow;
 * soonest due first. With `?page=` (and `?size=`): one page, plus `?q`
 * (title / athlete / campaign / sponsor), `?kind=video|image` (the job's
 * format), `?tab=todo|review|done` (whose move) and
 * `?sort=due|waiting|newest`.
 */
const listDeliverables: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const query = req.query as Record<string, unknown>;
  const paged = pageRequest(query);
  const btg = isBtgReviewer(actor);

  if (!paged) {
    const wanted =
      typeof req.query.state === "string"
        ? req.query.state.split(",").filter((x) => STATES.includes(x))
        : [];
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const from = dateParam(query.from);
    const to = dateParam(query.to);
    const where = {
      ...whereFor(actor, "deliverable", "read"),
      ...(wanted.length ? { state: { in: wanted as never } } : {}),
      ...(campaignId ? { order: { campaignId } } : {}),
      /* the calendar's month — only when asked, so the legacy call is unchanged */
      ...(from || to ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    };
    const rows = (await prisma.deliverable.findMany({
      /* tenant-scope: `where` spreads whereFor(actor, "deliverable", "read") */
      where: query.systemReturned === "exclude" || query.btgSkipped === "only"
        ? {
            AND: [
              where,
              ...(query.systemReturned === "exclude" ? [NOT_SYSTEM_RETURNED] : []),
              ...(query.btgSkipped === "only" ? [BTG_SKIPPED] : []),
            ],
          }
        : where,
      select: LIST_SELECT,
      orderBy: { dueDate: "asc" },
      take: UNPAGED_CAP,
    })) as ListRow[];
    const revisions = await revisionsFor(actor.tenantId, rows.map((r) => r.id));
    res.json({ deliverables: rows.map((d) => rowOut(d, revisions.get(d.id), btg)) });
    return;
  }

  const q = searchTerm(query);
  const kind = query.kind === "video" || query.kind === "image" ? query.kind : undefined;
  const tab = allowedList(query.tab, TABS)[0];
  const sort = allowedList(query.sort, SORTS)[0] ?? "due";

  const scoped: Where = {
    AND: [
      whereFor(actor, "deliverable", "read"),
      ...baseFilters(query),
      ...(kind ? [{ order: { jobId: kind === "video" ? { in: VIDEO_JOBS } : { notIn: VIDEO_JOBS } } }] : []),
      ...(q ? [searchWhere(q)] : []),
    ],
  };
  const needOpen = Boolean(tab) || sort !== "due";
  const openIds = needOpen ? [...(await openRevisions(actor.tenantId, scoped)).open.keys()] : [];
  const where: Where = tab ? { AND: [...(scoped.AND as Where[]), tabWhere(tab, openIds)] } : scoped;

  const { rows, page } = await readPage(
    paged,
    () =>
      prisma.deliverable.count({
        /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
        where,
      }),
    (skip, take) =>
      sort === "due"
        ? (prisma.deliverable.findMany({
            /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
            where,
            select: LIST_SELECT,
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            skip,
            take,
          }) as unknown as Promise<ListRow[]>)
        : readByWaiting(actor.tenantId, where, openIds, sort === "waiting" ? "asc" : "desc", skip, take),
  );
  const revisions = await revisionsFor(actor.tenantId, rows.map((r) => r.id));
  res.json({ deliverables: rows.map((d) => rowOut(d, revisions.get(d.id), btg)), page });
};

/**
 * GET /deliverables/summary — the headline counts the content desk and the
 * athlete's deliverables page show, counted in the database under the same
 * scope as the list (`?state=A,B` / `?campaignId=` narrow it, as they do the
 * list). Everything a page needs to derive its tiles without the rows:
 *   states         — per raw state
 *   openRevisions  — DRAFT_SUBMITTED sent back, still with the athlete
 *   aging          — on a review desk, not sent back, latest upload more
 *                    than AGING_HOURS whole hours ago (the desk's flag)
 *   overdue        — the athlete's move and due before today (UTC day)
 *   campaigns      — the campaigns those deliverables belong to (the desk's
 *                    campaign filter), by name
 *   btgSkipped     — those whose latest submission skipped BTG's review
 *                    (P5-BE-10, the desk's spot-check tab)
 */
const summarizeDeliverables: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const query = req.query as Record<string, unknown>;
  const where: Where = { AND: [whereFor(actor, "deliverable", "read"), ...baseFilters(query)] };
  const now = Date.now();
  /* floor(hours) > 24 ⇔ at least 25 whole hours — the desk's waitingHours rule. */
  const agingCutoff = new Date(now - (AGING_HOURS + 1) * 3_600_000);
  const today = new Date(new Date(now).toISOString().slice(0, 10));

  const [grouped, { open, notOpen }, deskAging, lateOwn, orders, btgSkipped] = await Promise.all([
    prisma.deliverable.groupBy({
      by: ["state"],
      /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
      where,
      _count: { _all: true },
    }),
    openRevisions(actor.tenantId, where),
    prisma.deliverable.count({
      /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
      where: {
        AND: [
          where,
          { state: { in: ["BTG_REVIEW", "SPONSOR_REVIEW"] } },
          { assets: { some: {} } },
          { assets: { none: { uploadedAt: { gt: agingCutoff } } } },
        ],
      },
    }),
    prisma.deliverable.count({
      /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
      where: { AND: [where, { state: { in: ["NOT_STARTED", "APPROVED"] } }, { dueDate: { lt: today } }] },
    }),
    prisma.campaignOrder.findMany({
      /* tenant-scope: only orders holding a deliverable the caller can read —
         whose campaign name every list row already carries */
      where: { tenantId: actor.tenantId, deliverables: { some: where } },
      distinct: ["campaignId"],
      select: { campaign: { select: { id: true, name: true } } },
      take: 500,
    }),
    prisma.deliverable.count({
      /* tenant-scope: `where` is whereFor(actor, "deliverable", "read") ∧ filters */
      where: { AND: [where, BTG_SKIPPED] },
    }),
  ]);

  const states = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<string, number>;
  for (const g of grouped as unknown as { state: string; _count: { _all: number } }[]) states[g.state] = g._count._all;
  const draftAging = notOpen.filter((d) => d.uploadedAt && d.uploadedAt <= agingCutoff).length;
  const lateRevisions = [...open.values()].filter((d) => d.dueDate < today).length;
  const campaigns = (orders as { campaign: { id: string; name: string } }[])
    .map((o) => o.campaign)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    total: Object.values(states).reduce((n, c) => n + c, 0),
    states,
    openRevisions: open.size,
    aging: deskAging + draftAging,
    overdue: lateOwn + lateRevisions,
    campaigns,
    btgSkipped,
  });
};

/** GET /deliverables/:id — one deliverable, with its asset versions. */
const readDeliverable: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const d = (await prisma.deliverable.findFirst({
    where: { ...whereFor(actor, "deliverable", "read"), id: req.params.id },
    select: LIST_SELECT,
  })) as ListRow | null;
  if (!d) throw new ForbiddenError("deliverable", "read");
  const revisions = await revisionsFor(actor.tenantId, [d.id]);
  res.json({
    ...rowOut(d, revisions.get(d.id), isBtgReviewer(actor)),
    assets: d.assets.map((a) => ({ version: a.version, uploadedAt: a.uploadedAt.toISOString() })),
  });
};

/**
 * GET /deliverables/:id/assets/:version/url — a short-lived signed read of
 * one creative version (P5-FE-04's preview). The bucket is private (§11,
 * guide §11); the grant is audited by presignPrivateDownload before the URL
 * is returned, and only a caller who can read the asset gets one.
 */
const assetUrl: RequestHandler<{ id: string; version: string }> = async (req, res) => {
  const actor = req.actor!;
  assertAllowed(actor, "creativeAsset", "read");
  const version = Number(req.params.version);
  const asset = Number.isInteger(version)
    ? await prisma.creativeAsset.findFirst({
        where: {
          version,
          deliverableId: req.params.id,
          deliverable: whereFor(actor, "deliverable", "read"),
        },
        select: { r2Key: true, deliverableId: true },
      })
    : null;
  if (!asset) throw new ForbiddenError("creativeAsset", "read");
  const url = await presignPrivateDownload(actor, asset.r2Key, {
    entity: "Deliverable",
    entityId: asset.deliverableId,
  });
  res.json({ url });
};

/** POST /deliverables/:id/submit — the athlete submits a draft, with its
 *  caption; the automatic checks run (P5-BE-09). */
const submit: RequestHandler<{ id: string }> = async (req, res) => {
  const { caption } = SubmitDraftInput.parse(req.body ?? {});
  res.json(await submitDraft(req.actor!, req.params.id, { caption }));
};

/** POST /deliverables/:id/btg-review — BTG picks it up. */
const btgReview: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await startBtgReview(req.actor!, req.params.id));
};

/** POST /deliverables/:id/sponsor-review — BTG routes it on. Optional step. */
const sponsorReview: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await sendToSponsorReview(req.actor!, req.params.id));
};

/** POST /deliverables/:id/revision — either reviewer sends it back. */
const revise: RequestHandler<{ id: string }> = async (req, res) => {
  const { reason } = RevisionRequestInput.parse(req.body ?? {});
  res.json(await requestRevision(req.actor!, req.params.id, reason));
};

/** POST /deliverables/:id/approve — either reviewer approves. */
const approve: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await approveDeliverable(req.actor!, req.params.id));
};

/** POST /deliverables/:id/published — the athlete says it is live. */
const publish: RequestHandler<{ id: string }> = async (req, res) => {
  const { publishedUrl } = MarkPublishedInput.parse(req.body ?? {});
  res.json(await markPublished(req.actor!, req.params.id, publishedUrl));
};

/** POST /deliverables/:id/verify — BTG confirms it. Turns into money later. */
const verify: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await verifyPublished(req.actor!, req.params.id));
};

/**
 * POST /deliverables/:id/uploads — a presigned PUT straight to R2.
 *
 * The response carries the URL and the key. The browser PUTs the bytes to R2
 * itself; they never pass through this server (Addendum A8).
 */
const upload: RequestHandler<{ id: string }> = async (req, res) => {
  const { contentType, bytes } = CreativeUploadInput.parse(req.body ?? {});
  res.status(201).json(await presignCreativeUpload(req.actor!, req.params.id, contentType, bytes));
};

/** POST /deliverables/:id/assets — record what was uploaded. */
const registerAsset: RequestHandler<{ id: string }> = async (req, res) => {
  const { r2Key } = CreativeAssetInput.parse(req.body ?? {});
  res.status(201).json(await registerCreativeAsset(req.actor!, req.params.id, r2Key));
};

deliverablesRouter.get("/deliverables", requireActor, listDeliverables);
/* before /deliverables/:id, or "summary" would be read as an id */
deliverablesRouter.get("/deliverables/summary", requireActor, summarizeDeliverables);
deliverablesRouter.get("/deliverables/:id", requireActor, readDeliverable);
deliverablesRouter.get("/deliverables/:id/assets/:version/url", requireActor, assetUrl);
deliverablesRouter.post("/deliverables/:id/submit", requireActor, submit);
deliverablesRouter.post("/deliverables/:id/btg-review", requireActor, btgReview);
deliverablesRouter.post("/deliverables/:id/sponsor-review", requireActor, sponsorReview);
deliverablesRouter.post("/deliverables/:id/revision", requireActor, revise);
deliverablesRouter.post("/deliverables/:id/approve", requireActor, approve);
deliverablesRouter.post("/deliverables/:id/published", requireActor, publish);
deliverablesRouter.post("/deliverables/:id/verify", requireActor, verify);
deliverablesRouter.post("/deliverables/:id/uploads", requireActor, upload);
deliverablesRouter.post("/deliverables/:id/assets", requireActor, registerAsset);

export { listDeliverables, readDeliverable, assetUrl, summarizeDeliverables };

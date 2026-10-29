import type { ReviewContentItem } from "@/lib/fixtures";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import type { ContentCheck } from "@/lib/content-checks";

/* --------------------------------------------------------------------------
   P5-FE-04 — the content approval desk's live translation: GET /deliverables
   (BTG's tenant scope) → the item the ApprovalsDesk island renders. Pure.

   ONE ITEM SHAPE FOR BOTH MODES, like the applications desk: live items are
   ReviewContentItems plus a `live` block the drawer's real decision bar
   reads. Two fields the fixtures invent get honest sources here:
     - assetKind — what the athlete actually uploaded, from the latest
       asset's content type (P5-BE-09 records it). An athlete can upload a
       PNG to a video job, and the desk called it "Video · v1" when this was
       the job's format (staging dry run, 2026-10-26). Assets registered
       before the type was recorded fall back to the JOB's format (a reel is
       video, a sponsored post an image), labelled as the job's in the UI.
     - waitingHours — since the latest upload, the moment it landed on the
       desk; nothing uploaded means nothing is waiting.
   A revision request that is still open (derived by the API from the audit
   log) shows as the desk's REVISION state — it's back with the athlete.
   -------------------------------------------------------------------------- */

export type LiveDeskItem = ReviewContentItem & {
  live: {
    revisionReason: string | null;
    publishedUrl: string | null;
    latestVersion: number | null;
    /** True when assetKind is the upload's own type; false when it is the
     *  job's format, standing in for an asset with no recorded type. */
    kindFromUpload: boolean;
    jobId: string;
    dueIso: string;
    /* P5-BE-09 — what the reviewer sees beside the draft: the automatic
       checks it passed, the caption the athlete will post (and its version),
       and when it reached the desk it is waiting on. */
    checks: ContentCheck[] | null;
    caption: string | null;
    captionVersion: number | null;
    waitingSince: string | null;
    /* P5-BE-10 — the latest submission skipped BTG's review and went straight
       to the sponsor, and why (BTG's to read). BTG can still open it and ask
       for changes while it is with the sponsor. */
    btgSkipped: boolean;
    skipReason: string | null;
    /* POL-FE-23 — when this draft should be reviewed by (reviewBy below);
       null once it is off the review desks. */
    reviewBy: ReviewBy | null;
  };
};

/* --------------------------------------------------------------------------
   POL-FE-23 — "review by". The API returns no review deadline of its own
   (POL-BE-23 is the field); until it does, the date is computed from what
   it does return, and the rule is the backend's own:

     - review-reminders.ts reminds a reviewer once a draft has waited more
       than REVIEW_REMINDER_HOURS (48) on their desk, counted from
       `waitingSince` (P5-BE-09) — so that is when the review is due;
     - a draft submitted before `waitingSince` existed counts from its latest
       upload, the measure the desk already used for "waiting";
     - and never later than the post's own due date: content due to publish
       on Friday can't be reviewed on Saturday.

   Only a draft actually on a review desk (not sent back) has a review-by.
   -------------------------------------------------------------------------- */

/** Mirrors REVIEW_REMINDER_HOURS in backend/src/domain/content-check-rules.ts. */
export const REVIEW_WINDOW_HOURS = 48;

export type ReviewBy = {
  iso: string;
  /** "Oct 16", the desk's date style. */
  label: string;
  /** Past the review-by moment at `now`. */
  late: boolean;
  /** Which of the two bounds set it. */
  from: "window" | "due";
};

type ReviewByInput = Pick<ApiDeliverable, "state" | "revision" | "dueDate"> & {
  waitingSince?: string | null;
  latestAsset?: { uploadedAt: string } | null;
};

/** 23:59:59.999 local on a YYYY-MM-DD (or the day of an ISO datetime); NaN when it isn't a date. */
function endOfDay(day: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!m) return Number.NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
}

export function reviewBy(d: ReviewByInput, now: Date): ReviewBy | null {
  if (!REVIEW_STATES.includes(d.state) || d.revision) return null;
  const since = d.waitingSince ?? d.latestAsset?.uploadedAt ?? null;
  if (!since) return null;
  const sinceMs = Date.parse(since);
  /* The due date is a calendar day, not an instant: the bound is the END of
     that day where the reviewer sits, so "overdue" doesn't flip the evening
     before in US time zones (review 2026-10-29). */
  const dueMs = endOfDay(d.dueDate);
  if (Number.isNaN(sinceMs)) return null;
  const windowMs = sinceMs + REVIEW_WINDOW_HOURS * 3_600_000;
  const byMs = Number.isNaN(dueMs) ? windowMs : Math.min(windowMs, dueMs);
  const iso = new Date(byMs).toISOString();
  return { iso, label: monDay(iso), late: now.getTime() > byMs, from: byMs === windowMs ? "window" : "due" };
}

/** The desk with this post's drawer open — where a dashboard or email link lands (POL-FE-23). */
export function postHref(id: string): string {
  return `/admin/approvals?open=${encodeURIComponent(id)}`;
}

/** The post a link asked the desk to open, from the URL; "" for none. */
export function deskOpenId(sp: Record<string, string | string[] | undefined>): string {
  const v = sp.open;
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim().slice(0, 100);
}

export type ApprovalActionKind = "btg-review" | "sponsor-review" | "approve" | "revision" | "verify";
export type ApprovalResult = { ok: true; state: string } | { ok: false; message: string };
export type AssetLinkResult = { ok: true; url: string } | { ok: false; message: string };

/** The job's format — what the reviewer is checking the upload against. */
const JOB_FORMAT: Record<string, "video" | "image"> = {
  "SX-01": "video", // Story Drop
  "SX-02": "image", // Sponsored Post
  "SX-03": "video", // Athlete Reel
  "SX-04": "video", // Product Experience
  "SX-05": "image", // Local Appearance — proof is a photo
};

export function jobFormat(jobId: string): "video" | "image" {
  return JOB_FORMAT[jobId] ?? "image";
}

/** The upload's kind from its MIME type: video/* or image/*. Anything else —
 *  no type, or the `application/octet-stream` a browser sends when it can't
 *  tell (deliverable-upload.tsx) — is null, so the desk falls back to the
 *  job's format rather than calling a .mov an image. */
export function uploadKind(contentType: string | null | undefined): "video" | "image" | null {
  const t = contentType?.trim().toLowerCase() ?? "";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  return null;
}

function ago(fromIso: string, now: Date): { hours: number; label: string } {
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / 3_600_000));
  if (hours < 1) return { hours, label: "just now" };
  if (hours < 24) return { hours, label: `${hours} ${hours === 1 ? "hour" : "hours"} ago` };
  const d = Math.floor(hours / 24);
  return { hours, label: `${d} ${d === 1 ? "day" : "days"} ago` };
}

/** "Oct 14" — the desk sorts on "Mon D" strings (approvals-ui dueValue). */
function monDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function toDeskItem(d: ApiDeliverable, now: Date): LiveDeskItem {
  const uploaded = uploadKind(d.latestAsset?.contentType);
  const since = d.latestAsset ? ago(d.latestAsset.uploadedAt, now) : null;
  /* P5-BE-09 — the API says when it reached its reviewer; before that
     field existed, the latest upload was the measure. */
  const waited = d.waitingSince ? ago(d.waitingSince, now) : since;
  return {
    id: d.id,
    campaign: d.campaign.name,
    sponsor: d.campaign.sponsorName,
    title: d.title,
    dueDate: monDay(d.dueDate),
    state: d.state,
    revisionRequested: Boolean(d.revision),
    athlete: d.athlete.displayName,
    assetKind: uploaded ?? jobFormat(d.jobId),
    version: d.latestAsset?.version ?? 0,
    submittedAt: since ? since.label : "nothing uploaded yet",
    /* Only content actually sitting on a review desk is "waiting". */
    waitingHours:
      waited && ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"].includes(d.state) && !d.revision
        ? waited.hours
        : 0,
    ...(d.publishedAt ? { clearedAt: monDay(d.publishedAt) } : {}),
    live: {
      revisionReason: d.revision?.reason ?? null,
      publishedUrl: d.publishedUrl,
      latestVersion: d.latestAsset?.version ?? null,
      kindFromUpload: uploaded !== null,
      jobId: d.jobId,
      dueIso: d.dueDate,
      checks: d.checks ?? null,
      caption: d.caption ?? null,
      captionVersion: d.captionVersion ?? null,
      waitingSince: d.waitingSince ?? null,
      btgSkipped: Boolean(d.btgReviewSkipped),
      skipReason: d.skipReason ?? null,
      reviewBy: reviewBy(d, now),
    },
  };
}

export function isLiveItem(it: ReviewContentItem): it is LiveDeskItem {
  return "live" in it && Boolean((it as LiveDeskItem).live);
}

/** The real §21 moves BTG can make from a state (deliverable-state.ts). */
export function liveMoves(state: string, revisionOpen: boolean): ApprovalActionKind[] {
  if (revisionOpen) return [];
  switch (state) {
    case "DRAFT_SUBMITTED":
      return ["btg-review"];
    case "BTG_REVIEW":
      return ["sponsor-review", "approve", "revision"];
    case "SPONSOR_REVIEW":
      return ["approve", "revision"];
    case "PUBLISHED":
      return ["verify"];
    default:
      return [];
  }
}

/* --------------------------------------------------------------------------
   Server-paged desk (2026-09-29). The page reads the URL (?tab ?q ?camp
   ?kind ?sort ?page ?size), asks GET /deliverables for exactly one page, and
   GET /deliverables/summary for the hero's and the tabs' counts — nothing
   fetches the whole pipeline. `camp` is a campaign id now (it was a name
   while the desk filtered in the browser).
   -------------------------------------------------------------------------- */

/** Every state that has reached the desk (NOT_STARTED hasn't). */
export const DESK_STATES = ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW", "APPROVED", "PUBLISHED", "VERIFIED"] as const;
const REVIEW_STATES = ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"];
const CLEARED_STATES = ["APPROVED", "PUBLISHED", "VERIFIED"];

/* P5-BE-10 — "skipped": the drafts that skipped BTG's review, every state,
   for BTG's spot checks. */
export const DESK_TABS = ["review", "cleared", "all", "skipped"] as const;
export type DeskTab = (typeof DESK_TABS)[number];
export const DESK_KINDS = ["video", "image"] as const;
/** "" is the desk's default, "Waiting longest". */
export const DESK_SORTS = ["due", "newest"] as const;

export type DeskFilters = { tab: DeskTab; q: string; camp: string; kind: string; sort: string };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

/** The desk's filters from the URL, each clamped to what it may be. */
export function deskFilters(sp: Params): DeskFilters {
  const tab = one(sp.tab);
  const kind = one(sp.kind);
  const sort = one(sp.sort);
  return {
    tab: (DESK_TABS as readonly string[]).includes(tab) ? (tab as DeskTab) : "review",
    q: one(sp.q).slice(0, 100),
    camp: one(sp.camp).slice(0, 100),
    kind: (DESK_KINDS as readonly string[]).includes(kind) ? kind : "",
    sort: (DESK_SORTS as readonly string[]).includes(sort) ? sort : "",
  };
}

/** A tab as the API's state list — a revision sent back is still DRAFT_SUBMITTED, so still "review". */
export function tabStates(tab: DeskTab): readonly string[] {
  return tab === "review" ? REVIEW_STATES : tab === "cleared" ? CLEARED_STATES : DESK_STATES;
}

/** The GET /deliverables query for one page of the desk. */
export function deskListQuery(f: DeskFilters, p: { page: number; size: number }): string {
  const u = new URLSearchParams({ page: String(p.page), size: String(p.size), state: tabStates(f.tab).join(",") });
  /* P5-BE-09 — a draft the automatic checks sent back is the athlete's to
     fix; it never sits in BTG's queue. */
  u.set("systemReturned", "exclude");
  /* P5-BE-10 — the spot-check tab: only the drafts that skipped BTG. */
  if (f.tab === "skipped") u.set("btgSkipped", "only");
  if (f.q) u.set("q", f.q);
  if (f.camp) u.set("campaignId", f.camp);
  if (f.kind) u.set("kind", f.kind);
  u.set("sort", f.sort === "due" ? "due" : f.sort === "newest" ? "newest" : "waiting");
  return `?${u}`;
}

/** The summary query — counted over every state on the desk, without the
 *  drafts the automatic checks sent back (P5-BE-09). */
export const DESK_SUMMARY_QUERY = `?state=${DESK_STATES.join(",")}&systemReturned=exclude`;

/** Only the fields of GET /deliverables/summary the desk reads. */
export type DeskSummary = {
  total: number;
  states: Record<string, number>;
  openRevisions: number;
  aging: number;
  campaigns: { id: string; name: string }[];
  /** P5-BE-10 — how many skipped BTG's review (absent from an older API). */
  btgSkipped?: number;
};

/** The hero's figures, the pipeline strip and the tab counts, from the summary. */
export function deskHeadline(s: DeskSummary) {
  const n = (k: string) => s.states[k] ?? 0;
  const waiting = n("DRAFT_SUBMITTED") + n("BTG_REVIEW") + n("SPONSOR_REVIEW");
  const cleared = n("APPROVED") + n("PUBLISHED") + n("VERIFIED");
  return {
    waiting,
    aging: s.aging,
    /* A revision sent back is with the athlete, not on the submit desk. */
    stageCounts: [Math.max(0, n("DRAFT_SUBMITTED") - s.openRevisions), n("BTG_REVIEW"), n("SPONSOR_REVIEW"), cleared],
    tabs: { review: waiting, cleared, all: waiting + cleared, skipped: s.btgSkipped ?? 0 },
  };
}

export const MOVE_LABEL: Record<ApprovalActionKind, string> = {
  "btg-review": "Start BTG review",
  "sponsor-review": "Send to sponsor",
  approve: "Approve",
  revision: "Request revision",
  verify: "Verify publication",
};

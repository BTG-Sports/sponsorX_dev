import type { ReviewContentItem } from "@/lib/fixtures";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import type { ContentCheck } from "@/lib/content-checks";

/* --------------------------------------------------------------------------
   P5-FE-04 — the content approval desk's live translation: GET /deliverables
   (BTG's tenant scope) → the item the ApprovalsDesk island renders. Pure.

   ONE ITEM SHAPE FOR BOTH MODES, like the applications desk: live items are
   ReviewContentItems plus a `live` block the drawer's real decision bar
   reads. Two fields the fixtures invent get honest sources here:
     - assetKind — CreativeAsset stores no content type, so this is the JOB's
       format (a reel is video, a sponsored post an image), which is what the
       reviewer is checking against. Labelled as the job's format in the UI.
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
  };
};

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
    assetKind: jobFormat(d.jobId),
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
      jobId: d.jobId,
      dueIso: d.dueDate,
      checks: d.checks ?? null,
      caption: d.caption ?? null,
      captionVersion: d.captionVersion ?? null,
      waitingSince: d.waitingSince ?? null,
      btgSkipped: Boolean(d.btgReviewSkipped),
      skipReason: d.skipReason ?? null,
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

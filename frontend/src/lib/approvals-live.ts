import type { ReviewContentItem } from "@/lib/fixtures";
import type { ApiDeliverable } from "@/lib/deliverables-live";

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
      since && ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"].includes(d.state) && !d.revision
        ? since.hours
        : 0,
    ...(d.publishedAt ? { clearedAt: monDay(d.publishedAt) } : {}),
    live: {
      revisionReason: d.revision?.reason ?? null,
      publishedUrl: d.publishedUrl,
      latestVersion: d.latestAsset?.version ?? null,
      jobId: d.jobId,
      dueIso: d.dueDate,
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

export const MOVE_LABEL: Record<ApprovalActionKind, string> = {
  "btg-review": "Start BTG review",
  "sponsor-review": "Send to sponsor",
  approve: "Approve",
  revision: "Request revision",
  verify: "Verify publication",
};

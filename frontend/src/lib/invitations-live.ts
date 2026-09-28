import type { InviteState } from "@/lib/fixtures";
import { urgencyHours } from "@/lib/invitations-ui";

/* --------------------------------------------------------------------------
   P4-FE-04 — the athlete invitation inbox's live translation: GET /invitations
   (backend/src/routes/v1/campaigns.ts) → the row the InvitationsInbox island
   renders. Pure, like applications-live and profile-live: data and a clock
   in, rows out, no fetch.

   ONE ROW SHAPE FOR BOTH MODES. The island takes InboxRow whether the rows
   came from fixtures or from Postgres, so the demo and the real inbox cannot
   drift into two components. Fields the API does not answer — deliverable
   count, usage rights, exclusivity, decline reason — are null in live rows,
   never invented: those terms live on the Campaign Order (§24), which BTG
   drafts after an acceptance, not on the invitation.
   -------------------------------------------------------------------------- */

/** One row of GET /invitations. Money in cents. */
export type ApiInvitation = {
  id: string;
  state: InviteState;
  offered: number;
  jobId: string;
  jobName: string;
  campaignName: string;
  sponsorName: string | null;
  sentAt: string;
  viewedAt: string | null;
  respondedAt: string | null;
  expiresAt: string;
  /** The order an accepted invite became, once BTG sends one (P5-FE-01). */
  order?: { id: string; state: string } | null;
};

export type InboxRow = {
  id: string;
  state: InviteState;
  /** cents */
  offered: number;
  sponsor: string;
  campaign: string;
  jobId: string;
  jobName: string;
  /** Human time-to-expiry ("2 days", "9 hours"), or the resolution label. */
  expiresIn: string;
  /** Hours to expiry, for sorting and the urgency flag; Infinity once past. */
  hoursLeft: number;
  deliverableCount: number | null;
  usageRights: string | null;
  exclusivity: string | null;
  declineReason: string | null;
  /** ISO — live rows only. */
  sentAt: string | null;
  /** Live: the Campaign Order this accepted invite became, if sent. */
  order?: { id: string; state: string } | null;
};

export type InviteActionResult =
  | { ok: true; state: InviteState }
  | { ok: false; message: string };

/** "2 days", "9 hours", "under an hour" — the same vocabulary the fixture
 *  strings use, so the card reads identically in both modes. */
export function timeLeft(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 48) {
    const h = Math.floor(hours);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const d = Math.floor(hours / 24);
  return `${d} days`;
}

/** An API row, as of `now`. An open invite whose expiry has passed but whose
 *  sweep has not run yet still says INVITED/VIEWED — we show "expired" as
 *  the time left and let the API refuse the answer, rather than pretending
 *  to know the state the database hasn't recorded. */
export function toInboxRow(r: ApiInvitation, now: Date): InboxRow {
  const hours = (new Date(r.expiresAt).getTime() - now.getTime()) / 3_600_000;
  const open = r.state === "INVITED" || r.state === "VIEWED";
  return {
    id: r.id,
    state: r.state,
    offered: r.offered,
    sponsor: r.sponsorName ?? "BTG",
    campaign: r.campaignName,
    jobId: r.jobId,
    jobName: r.jobName,
    expiresIn: open ? (hours > 0 ? timeLeft(hours) : "expired") : resolvedLabel(r),
    hoursLeft: open && hours > 0 ? hours : Number.POSITIVE_INFINITY,
    deliverableCount: null,
    usageRights: null,
    exclusivity: null,
    declineReason: null,
    sentAt: r.sentAt,
    order: r.order ?? null,
  };
}

/** What a resolved card says in the expiry slot. */
function resolvedLabel(r: ApiInvitation): string {
  if (r.state === "EXPIRED") return "expired";
  const at = r.respondedAt ? shortDate(r.respondedAt) : null;
  const verb = r.state === "ACCEPTED" ? "accepted" : "declined";
  return at ? `${verb} ${at}` : verb;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** A fixture invite, in the shared row shape. */
export function fixtureInboxRow(i: {
  id: string;
  state: InviteState;
  offered: number;
  sponsor: string;
  campaign: string;
  jobId: string;
  jobName: string;
  expiresIn: string;
  deliverableCount: number;
  usageRights: string;
  exclusivity: string | null;
  declineReason: string | null;
}): InboxRow {
  return {
    ...i,
    hoursLeft: urgencyHours(i.expiresIn),
    sentAt: null,
  };
}

/** What the card offers next, per §21's invite machine. Accept only out of
 *  VIEWED — the backend refuses INVITED→ACCEPTED so "accepted without ever
 *  seeing it" is unrepresentable; decline from either open state. */
export function inviteMoves(state: InviteState): {
  open: boolean;
  accept: boolean;
  decline: boolean;
} {
  return {
    open: state === "INVITED",
    accept: state === "VIEWED",
    decline: state === "INVITED" || state === "VIEWED",
  };
}

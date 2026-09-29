import type { QueueRow, ReviewRow } from "@/components/attention-queue";
import type { SectionKey } from "@/lib/profile-sections";
import { SECTIONS } from "@/lib/profile-sections";
import { money } from "@/lib/fixtures";
import type { ApiEarningsSummary } from "@/lib/earnings-live";
import { dueLabel, nextStep, type ApiDeliverable } from "@/lib/deliverables-live";
import { timeLeft, type ApiInvitation } from "@/lib/invitations-live";
import { completion, sectionStates, type ApiMyProfile } from "@/lib/profile-live";

/* --------------------------------------------------------------------------
   P2-FE-01 — the athlete dashboard's live translation. Pure: the athlete's
   own reads and a clock in; the queue, the journey counts and the money
   strip out.

   SERVER-PAGED (2026-09-29). The dashboard no longer reads every invitation,
   deliverable and earning. Every COUNT and every MONEY figure is a database
   aggregate (the inbox, deliverable and earnings summaries, and the paged
   lists' `page.total`); the attention queue shows the TOP few of each queue —
   the soonest-expiring open invites, the athlete's next moves, what's in
   review — each fetched as one small server page, with the full lists one
   click away on their own paged screens.

   HONESTY RULES. Nothing here is estimated. An open invite whose expiry has
   passed is not "open". The profile meter is the §24 meter from profile-live,
   which excludes what Phase 1 can't collect.
   -------------------------------------------------------------------------- */

export type GuardianStatus = "not-required" | "missing" | "unverified" | "ready";

/** How many rows of each queue the dashboard shows; the rest are paged on
 *  their own screens. */
export const QUEUE_TOP = 10;

export type AthleteHomeInput = {
  profile: ApiMyProfile;
  /** Open invitations, soonest expiry first (one server page). */
  invitesTop: ApiInvitation[];
  /** All open invitations (the inbox summary). */
  openInvites: number;
  /** The athlete's moves, soonest due first (one server page, tab=todo). */
  dueTop: ApiDeliverable[];
  dueTotal: number;
  /** Waiting on BTG or the sponsor (one server page, tab=review). */
  reviewTop: ApiDeliverable[];
  reviewTotal: number;
  /** Distinct campaigns with delivery still open (the deliverable summary). */
  activeCampaigns: number;
  earnings: ApiEarningsSummary;
  guardian: GuardianStatus;
};

const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<SectionKey, string>;

const REVIEW_TONE: Record<string, ReviewRow["badge"]["tone"]> = {
  btg: "warn",
  sponsor: "warn",
  done: "accent",
};

export function athleteHome(input: AthleteHomeInput, now: Date) {
  const { profile: p, earnings: e, guardian } = input;
  const guardianPending = guardian === "missing" || guardian === "unverified";

  /* The page already asked for open invites only; a row that lapsed between
     the query and now still isn't shown as open. */
  const invites = input.invitesTop.filter((i) => Date.parse(i.expiresAt) > now.getTime());
  const due = input.dueTop;
  const meter = completion(sectionStates(p));

  const queueRows: QueueRow[] = [
    ...invites.map((inv): QueueRow => {
      const hours = (Date.parse(inv.expiresAt) - now.getTime()) / 3_600_000;
      return {
        id: inv.id,
        kind: "invite",
        title: `${inv.sponsorName ?? "BTG"} — ${inv.campaignName}`,
        money: money(inv.offered),
        sub: `${inv.jobId} · ${inv.jobName}`,
        badges: [
          ...(inv.state === "INVITED" ? [{ label: "New", tone: "primary" as const }] : []),
          { label: `expires in ${timeLeft(hours)}`, tone: hours <= 72 ? "warn" : "neutral" },
        ],
        action: { label: inv.state === "INVITED" ? "Open offer" : "Review offer", href: "/athlete/invitations" },
      };
    }),
    ...due.map((d): QueueRow => {
      const step = nextStep(d);
      const label = dueLabel(d.dueDate, now);
      return {
        id: d.id,
        kind: "deliverable",
        title: d.title,
        sub: `${d.campaign.name} · ${d.campaign.sponsorName}`,
        badges: [
          { label, tone: label.includes("overdue") || label === "due today" ? "warn" : "neutral" },
          ...(d.revision ? [{ label: "revision requested", tone: "warn" as const }] : []),
        ],
        action: guardianPending
          ? { label: step.label, disabled: true, title: "Blocked: a minor needs a verified guardian first (§4)" }
          : { label: step.label, href: `/athlete/deliverables/${encodeURIComponent(d.id)}` },
      };
    }),
    ...(meter.missing.length > 0
      ? [
          {
            id: "profile-gaps",
            kind: "profile",
            title: `Finish your profile — ${meter.missing.length} ${meter.missing.length === 1 ? "item" : "items"} left`,
            sub: meter.missing.map((k) => SECTION_LABEL[k] ?? k).join(" · "),
            badges: [],
            action: { label: "Finish →", variant: "ghost", href: `/athlete/profile/edit?section=${meter.missing[0]}` },
          } satisfies QueueRow,
        ]
      : []),
  ];

  const reviewRows: ReviewRow[] = input.reviewTop.map((d) => {
    const step = nextStep(d);
    return {
      id: d.id,
      due: new Date(d.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      title: d.title,
      sub: `${d.campaign.name} · ${d.campaign.sponsorName}`,
      badge: { label: step.label, tone: REVIEW_TONE[step.on] ?? "neutral" },
    };
  });

  const bucket = (s: keyof ApiEarningsSummary["byState"]) => ({
    amount: e.byState[s]?.amount ?? 0,
    count: e.byState[s]?.count ?? 0,
  });
  const earned = e.career?.raised ?? 0;
  const paid = e.career?.paid ?? 0;
  const paidThisYear = e.paidByMonth?.months ?? Array.from({ length: 12 }, () => 0);

  return {
    guardianPending,
    openInvites: input.openInvites,
    due: input.dueTotal,
    nextDue: due[0] ? dueLabel(due[0].dueDate, now) : null,
    activeCampaigns: input.activeCampaigns,
    pending: bucket("PENDING"),
    approved: bucket("APPROVED_FOR_PAYOUT"),
    earned,
    paid,
    /** Paid ÷ earned, whole percent; null with nothing earned yet. */
    paidPct: earned > 0 ? Math.round((100 * paid) / earned) : null,
    paidThisYear,
    paidThisYearTotal: paidThisYear.reduce((n, v) => n + v, 0),
    profilePct: meter.percent,
    profileMissing: meter.missing.length,
    /** The TRUE number waiting on the athlete — not the rows shown. */
    attentionTotal: input.openInvites + input.dueTotal + (meter.missing.length > 0 ? 1 : 0),
    /** More exist than the dashboard shows — link to the full screens. */
    moreInvites: input.openInvites > invites.length,
    moreDue: input.dueTotal > due.length,
    queueRows,
    reviewRows,
  };
}

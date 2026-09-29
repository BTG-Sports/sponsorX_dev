/* --------------------------------------------------------------------------
   P3-FE-06 — the athlete portal home, from the athlete's own live reads:

     GET /athletes/me     profile, state, completion (athlete only; a
                          guardian has no athlete row and gets none)
     GET /invitations     open invitations (own, or a guardian's ward)
     GET /deliverables    work still due
     GET /earnings        amounts by status

   It replaced a sample athlete ("Shammah") behind a demo banner. Every figure
   is one of these reads; nothing is estimated.
   -------------------------------------------------------------------------- */

import { buckets, type ApiEarning } from "./earnings-live";
import { dueLabel, type ApiDeliverable } from "./deliverables-live";
import { toInboxRow, type ApiInvitation } from "./invitations-live";
import { isOpen } from "./invitations-ui";
import { completion, sectionStates, type ApiMyProfile } from "./profile-live";
import { SECTIONS } from "./profile-sections";

export type HomeStatus = { label: string; line: string; tone: "accent" | "primary" | "warn" | "neutral" };

export function statusOf(state: string): HomeStatus {
  switch (state) {
    case "ACTIVE":
      return { label: "Active", line: "Your profile is live and sponsors can be matched to you.", tone: "accent" };
    case "APPROVED":
      return { label: "Approved", line: "Finish your profile to go live — BTG activates you once it's complete.", tone: "primary" };
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return { label: "In review", line: "BTG is reviewing your application. You'll get an email with the outcome.", tone: "warn" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", line: "BTG asked for a change before approving — check your email.", tone: "warn" };
    case "SUSPENDED":
      return { label: "Paused", line: "Your profile is paused. Contact BTG for details.", tone: "neutral" };
    default:
      return { label: state.charAt(0) + state.slice(1).toLowerCase().replace(/_/g, " "), line: "", tone: "neutral" };
  }
}

/** 25000 → "$250"; 25050 → "$250.50". */
export function usd(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export type HomeInvite = { id: string; sponsor: string; mono: string; campaign: string; offer: string; expires: string; urgent: boolean };
export type HomeDeliverable = { id: string; title: string; campaign: string; mon: string; day: string; due: string; review: string; overdue: boolean };

const REVIEW: Record<string, string> = {
  NOT_STARTED: "Not started",
  DRAFT_SUBMITTED: "Submitted",
  BTG_REVIEW: "BTG review",
  SPONSOR_REVIEW: "Sponsor review",
};

export type AthleteHome = {
  firstName: string | null;
  subtitle: string | null;
  status: HomeStatus | null;
  profile: { percent: number; done: number; total: number; missing: string[] } | null;
  inviteCount: number;
  invites: HomeInvite[];
  dueCount: number;
  deliverables: HomeDeliverable[];
  earnings: { label: string; amount: string; hint: string; tone: "neutral" | "primary" | "accent" }[];
  hasEarnings: boolean;
};

const mono = (s: string) => s.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

export function buildHome(input: {
  profile: ApiMyProfile | null;
  invitations: ApiInvitation[];
  deliverables: ApiDeliverable[];
  earnings: ApiEarning[];
  now: Date;
}): AthleteHome {
  const { profile, now } = input;

  let prof: AthleteHome["profile"] = null;
  if (profile) {
    const states = sectionStates(profile);
    const c = completion(states);
    const total = Object.values(states).filter((s) => s !== "not-collected").length;
    prof = {
      percent: c.percent,
      done: total - c.missing.length,
      total,
      missing: c.missing.map((k) => SECTIONS.find((s) => s.key === k)?.label ?? k),
    };
  }

  const open = input.invitations
    .filter((i) => isOpen(i.state))
    .map((i) => toInboxRow(i, now))
    .sort((a, b) => a.hoursLeft - b.hoursLeft);

  const due = input.deliverables
    .filter((d) => d.state in REVIEW)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const b = buckets(input.earnings);

  return {
    firstName: profile ? (profile.legalName.trim() || profile.displayName).split(/\s+/)[0] ?? null : null,
    subtitle: profile
      ? [profile.legalName || profile.displayName, profile.sport, profile.school].filter(Boolean).join(" · ")
      : null,
    status: profile ? statusOf(profile.state) : null,
    profile: prof,
    inviteCount: open.length,
    invites: open.slice(0, 3).map((i) => ({
      id: i.id,
      sponsor: i.sponsor,
      mono: mono(i.sponsor),
      campaign: i.campaign,
      offer: usd(i.offered),
      expires: Number.isFinite(i.hoursLeft) ? `Expires in ${i.expiresIn}` : "Expired",
      urgent: i.hoursLeft < 48,
    })),
    dueCount: due.length,
    deliverables: due.slice(0, 3).map((d) => {
      const date = new Date(d.dueDate);
      return {
        id: d.id,
        title: d.title,
        campaign: d.campaign.name,
        mon: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
        day: String(date.getUTCDate()),
        due: dueLabel(d.dueDate, now),
        review: REVIEW[d.state] ?? d.state,
        overdue: dueLabel(d.dueDate, now).includes("overdue"),
      };
    }),
    earnings: [
      { label: "Pending", amount: usd(b.PENDING.amount), hint: "Work in progress", tone: "neutral" },
      { label: "Eligible", amount: usd(b.ELIGIBLE.amount), hint: "Deliverable verified", tone: "primary" },
      { label: "Approved", amount: usd(b.APPROVED_FOR_PAYOUT.amount), hint: "Approved for payout", tone: "primary" },
      { label: "Paid", amount: usd(b.PAID.amount), hint: "Paid by BTG Finance", tone: "accent" },
    ],
    hasEarnings: input.earnings.length > 0,
  };
}

import Link from "next/link";

import { Badge, BlockedNotice } from "@/components/ui";
import { TeamLeave } from "@/components/team-leave";
import {
  SAMPLE_INVITATION, SAMPLE_MEMBERSHIP, SAMPLE_ORDER, TEAM_WAITING, joinedOn, keepPct, sharePct, splitExample, teamInitials, usd,
} from "@/lib/team-invite-live";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Team — 2S2-FE-05 (Claude Design TeamInvite.dc.html: invite · joined ·
   leave). Athlete portal: a team's invitation to join its roster and the
   share it takes, or the team the athlete is on, with Leave team.

   SCAFFOLD — sample data. Accept, Decline and Leave are 2S2-BE-05 (not
   built); they are disabled with the reason. Reads nothing yet: no read
   names the athlete's team — GET /me's propertyId is a team manager's
   link, and GET /athletes/me selects no team.
   Will read  the athlete's invitation and membership   (2S2-BE-05)
   Will write accept · decline · leave                  (2S2-BE-05)
   ?view=joined shows the on-a-team view; the default is the invitation.

   Copy changed from the design, on the programme owner's rules
   (2026-10-01): joining does NOT end the athlete's own listings — that was
   never agreed — so the page says only that orders already placed carry
   on and pay as before. The split is a labelled sample.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const primary =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text disabled:cursor-not-allowed disabled:opacity-40";

export default async function AthleteTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const raw = (await searchParams).view;
  const view = (Array.isArray(raw) ? raw[0] : raw) === "joined" ? "joined" : "invite";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-xs text-muted">Teams can sell your items for you and take an agreed share.</p>
      </div>

      <BlockedNotice>
        Sample data — this page goes live with 2S2-BE-05 (team invitations: accept, decline and leave). Until then the buttons are off.
      </BlockedNotice>

      <nav aria-label="Sample view" className="flex flex-wrap gap-2">
        {([["invite", "An invitation"], ["joined", "On a team"]] as const).map(([k, label]) => (
          <Link
            key={k}
            href={k === "invite" ? "/athlete/team" : "/athlete/team?view=joined"}
            aria-current={view === k ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-xs ${view === k ? "border-primary/60 text-primary" : "border-line text-muted hover:text-text"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === "invite" ? <Invitation /> : <Joined />}
    </div>
  );
}

function Invitation() {
  const inv = SAMPLE_INVITATION;
  const split = splitExample(SAMPLE_ORDER.orderCents, SAMPLE_ORDER.feesCents, inv.teamShareBps);
  const share = sharePct(inv.teamShareBps);
  return (
    <section aria-label="Team invitation" className="space-y-4 rounded-xl border border-primary/45 bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary-soft">{teamInitials(inv.team.name)}</span>
        <h2 className="min-w-0 flex-1 text-[17px] font-semibold">The {inv.team.name} invited you to join their roster.</h2>
        <Badge tone="warn"><span aria-hidden="true" className="mr-1">!</span>Waiting for your answer</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-bg px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">The team’s share</p>
          <p className="mt-1 text-[28px] font-bold leading-tight">{share}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-text/85">
            Of what’s left after BTG’s fees and card processing, the {inv.team.name.split(" ").pop()} get {share} and you keep {keepPct(inv.teamShareBps)}.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-bg px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">What it means on $500 sessions</p>
          <p className="mt-1.5 text-xs text-muted">Sample: {SAMPLE_ORDER.label}</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-1.5 text-[13px] tabular-nums">
            <dt>You</dt><dd className="font-bold">{usd(split.athleteCents)}</dd>
            <dt>{inv.team.name} ({share})</dt><dd>{usd(split.teamCents)}</dd>
            <dt className="text-muted">BTG fees and card processing</dt><dd className="text-muted">{usd(split.feesCents)}</dd>
          </dl>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-bg px-3.5 py-3">
        <p className="text-[13px] font-semibold">What joining means for orders you already have</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text/85">Orders already placed carry on and pay you as before.</p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={primary} disabled title={TEAM_WAITING}>Accept and join</button>
        <button type="button" className={secondary} disabled title={TEAM_WAITING}>Decline</button>
      </div>
    </section>
  );
}

function Joined() {
  const m = SAMPLE_MEMBERSHIP;
  const share = sharePct(m.teamShareBps);
  const short = m.team.name.split(" ").pop()!;
  return (
    <section aria-label="Your team" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary-soft">{teamInitials(m.team.name)}</span>
        <span className="min-w-0 flex-1">
          <strong className="block text-base font-semibold">{m.team.name}</strong>
          <span className="text-xs text-muted">{m.team.city} · team share {share} · joined {joinedOn(m.joinedAt)}</span>
        </span>
        <Badge tone="accent"><span aria-hidden="true" className="mr-1">✓</span>Member</Badge>
      </div>
      <p className="text-[13px] leading-relaxed text-text/85">
        The {short} list your items on the marketplace. You see every sale on your <Link href="/athlete/sales" className="text-primary-soft hover:underline">Orders</Link> page.
      </p>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft pt-3">
        <TeamLeave team={m.team.name} share={share} />
        <span className="text-xs text-muted">You can list your own items again after you leave.</span>
      </div>
    </section>
  );
}

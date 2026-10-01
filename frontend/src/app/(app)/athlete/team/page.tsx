import Link from "next/link";

import { Badge } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { TeamInviteAnswer, TeamLeave } from "@/components/team-leave";
import { demoState } from "@/lib/demo";
import {
  EXAMPLE_ORDER, joinedOn, keepPct, sharePct, splitExample, teamInitials, usd, type ApiMyTeam, type ApiTeamInvitation, type ApiTeamMembership,
} from "@/lib/team-invite-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Team — 2S2-FE-05 (Claude Design TeamInvite.dc.html: invite · joined ·
   leave). Athlete portal: a team's invitation to join its roster and the
   share it takes, or the team the athlete is on, with Leave team.

   Reads  GET  /me/team                          membership + invitations (2S2-BE-05)
   Writes POST /team-invitations/:id/respond     Accept / Decline (TeamInviteAnswer → ./actions.ts)
          POST /me/team/leave                    Leave team (TeamLeave → ./actions.ts)
   ?demo=loading|empty|error renders the branded states.

   Copy changed from the design to say what happens (2S2-BE-05): joining
   doesn't delete the athlete's own listings — while on the team they don't
   sell and the team lists their items, and they sell again after leaving;
   orders already placed carry on and pay as before. The split is a labelled example on the invitation's real share.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const demo = await demoState(searchParams);

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-xs text-muted">Teams can sell your items for you and take an agreed share.</p>
    </div>
  );
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        {heading}
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const res = demo === "empty" ? null : await apiFetch("/me/team");
  if (res && res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="users" title="No athlete profile is linked to this login" hint="Your team and its invitations show here once your login is linked to your athlete profile." />
      </div>
    );
  }
  if (res && !res.ok) throw new Error(`Team unavailable (${res.status}).`);
  const data: ApiMyTeam = res ? ((await res.json()) as ApiMyTeam) : { membership: null, invitations: [] };

  return (
    <div className="space-y-6">
      {heading}
      {data.membership && <Joined m={data.membership} />}
      {data.invitations.map((inv) => <Invitation key={inv.id} inv={inv} onTeam={Boolean(data.membership)} />)}
      {!data.membership && data.invitations.length === 0 && (
        <EmptyState mark="users" title="You're not on a team" hint="When a team invites you to its roster, the invitation shows here and we email you. Nothing changes unless you accept." />
      )}
    </div>
  );
}

function Invitation({ inv, onTeam }: { inv: ApiTeamInvitation; onTeam: boolean }) {
  const split = splitExample(EXAMPLE_ORDER.orderCents, EXAMPLE_ORDER.feesCents, inv.teamShareBps);
  const share = sharePct(inv.teamShareBps);
  return (
    <section aria-label={`Invitation from ${inv.team.name}`} className="space-y-4 rounded-xl border border-primary/45 bg-surface p-5">
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
          <p className="mt-1.5 text-xs text-muted">Example: {EXAMPLE_ORDER.label}</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-1.5 text-[13px] tabular-nums">
            <dt>You</dt><dd className="font-bold">{usd(split.athleteCents)}</dd>
            <dt>{inv.team.name} ({share})</dt><dd>{usd(split.teamCents)}</dd>
            <dt className="text-muted">BTG fees and card processing</dt><dd className="text-muted">{usd(split.feesCents)}</dd>
          </dl>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-bg px-3.5 py-3">
        <p className="text-[13px] font-semibold">What joining means</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text/85">
          Orders already placed carry on and pay you as before. While you’re on the team, the {inv.team.name} list your items, and your own listings don’t sell.
        </p>
      </div>

      {onTeam ? (
        <p className="text-xs text-muted">You’re on a team already. Leave it first to join this one.</p>
      ) : (
        <TeamInviteAnswer invitationId={inv.id} team={inv.team.name} />
      )}
      <p className="text-[11px] text-faint">Invited {joinedOn(inv.invitedAt)}{inv.team.city ? ` · ${inv.team.city}` : ""}</p>
    </section>
  );
}

function Joined({ m }: { m: ApiTeamMembership }) {
  const share = m.teamShareBps === null ? "not set" : sharePct(m.teamShareBps);
  const short = m.team.name.split(" ").pop()!;
  return (
    <section aria-label="Your team" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary-soft">{teamInitials(m.team.name)}</span>
        <span className="min-w-0 flex-1">
          <strong className="block text-base font-semibold">{m.team.name}</strong>
          <span className="text-xs text-muted">{[m.team.city, `team share ${share}`, `joined ${joinedOn(m.joinedAt)}`].filter(Boolean).join(" · ")}</span>
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

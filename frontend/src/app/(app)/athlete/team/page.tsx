import Link from "next/link";

import { ArenaChip, ArenaHead, ArenaUpdated, ArenaLane, ArenaPanel, at } from "@/components/arena-stage";
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

   P1-ART-22 (2026-10-11) — on the Arena. Bounded data (one membership, a
   few invitations), so no paging: ArenaHead with the provenance pill, the
   membership as a plate (initials tile, name, the share and the joining
   day in jersey numerals, Leave), each invitation as a flare plate with
   the share as a jersey numeral over a lane (what the athlete keeps) and
   the worked split as two inner plates. The read, the two writes and
   TeamInviteAnswer / TeamLeave are unchanged.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const LEDE = "Teams can sell your items for you and take an agreed share.";

export default async function AthleteTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const demo = await demoState(searchParams);
  const now = new Date();
  const pill = <ArenaUpdated at={now} />;

  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <ArenaHead title="Team" lede={LEDE} />
        <ArenaPanel flush delay={0.1}><SkeletonRows rows={3} /></ArenaPanel>
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const res = demo === "empty" ? null : await apiFetch("/me/team");
  if (res && res.status === 403) {
    return (
      <div className="space-y-6">
        <ArenaHead title="Team" lede={LEDE} />
        <EmptyState mark="users" title="No athlete profile is linked to this login" hint="Your team and its invitations show here once your login is linked to your athlete profile." />
      </div>
    );
  }
  if (res && !res.ok) throw new Error(`Team unavailable (${res.status}).`);
  const data: ApiMyTeam = res ? ((await res.json()) as ApiMyTeam) : { membership: null, invitations: [] };
  const waiting = data.invitations.length;

  return (
    <div className="space-y-6">
      <ArenaHead
        title="Team"
        pill={pill}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <span>{LEDE}</span>
            {data.membership ? (
              <ArenaChip tone="win">✓ Member</ArenaChip>
            ) : waiting > 0 ? (
              <ArenaChip tone="flare">{waiting === 1 ? "1 invitation waiting" : `${waiting} invitations waiting`}</ArenaChip>
            ) : null}
          </span>
        }
      />
      {data.membership && <Joined m={data.membership} />}
      {data.invitations.map((inv, i) => <Invitation key={inv.id} inv={inv} onTeam={Boolean(data.membership)} i={i + (data.membership ? 1 : 0)} />)}
      {!data.membership && waiting === 0 && (
        <EmptyState mark="users" title="You're not on a team" hint="When a team invites you to its roster, the invitation shows here and we email you. Nothing changes unless you accept." />
      )}
    </div>
  );
}

/** A team's initials on a plate — the jersey tile at the left of a row. */
function Crest({ name, tone = "blue" }: { name: string; tone?: "blue" | "flare" }) {
  return (
    <span aria-hidden="true" className={`sx-arena-num grid size-14 shrink-0 place-items-center rounded-2xl border text-base ${tone === "flare" ? "border-accent/35 bg-accent/10 text-accent" : "border-athlete/30 bg-athlete/10 text-athlete"}`}>
      {teamInitials(name)}
    </span>
  );
}

/** One figure on an inner plate: an eyebrow, a jersey numeral, a line under it. */
function Fact({ label, value, sub, tone = "text-text" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className={`sx-arena-num mt-1 text-[22px] leading-none ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function Invitation({ inv, onTeam, i }: { inv: ApiTeamInvitation; onTeam: boolean; i: number }) {
  const split = splitExample(EXAMPLE_ORDER.orderCents, EXAMPLE_ORDER.feesCents, inv.teamShareBps);
  const share = sharePct(inv.teamShareBps);
  const keep = keepPct(inv.teamShareBps);
  const short = inv.team.name.split(" ").pop();
  const delay = 0.16 + i * 0.1;
  return (
    <ArenaPanel tone="flare" delay={delay} spot>
      <section aria-label={`Invitation from ${inv.team.name}`} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Crest name={inv.team.name} tone="flare" />
          <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">The {inv.team.name} invited you to join their roster.</h2>
          <ArenaChip tone="warn"><span aria-hidden="true" className="mr-1">!</span>Waiting for your answer</ArenaChip>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface/60 px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">The team&rsquo;s share</p>
            <p className="sx-arena-num mt-1 text-[40px] leading-none text-accent">{share}</p>
            <div role="img" aria-label={`You keep ${keep}, the team takes ${share}`} className="mt-3">
              <ArenaLane value={1 - inv.teamShareBps / 10_000} tone="blue" delay={delay + 0.3} />
              <p className="mt-1.5 flex justify-between text-[11px] text-faint">
                <span>You keep <strong className="text-text">{keep}</strong></span>
                <span>{short} <strong className="text-text">{share}</strong></span>
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text/85">
              Of what&rsquo;s left after BTG&rsquo;s fees and card processing, the {short} get {share} and you keep {keep}.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface/60 px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">What it means on $500 sessions</p>
            <p className="mt-1.5 text-xs text-muted">Example: {EXAMPLE_ORDER.label}</p>
            <dl className="mt-2.5 grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5 text-[13px]">
              <dt>You</dt><dd className="sx-arena-num text-lg text-athlete">{usd(split.athleteCents)}</dd>
              <dt>{inv.team.name} ({share})</dt><dd className="sx-arena-num text-base">{usd(split.teamCents)}</dd>
              <dt className="text-muted">BTG fees and card processing</dt><dd className="tabular-nums text-muted">{usd(split.feesCents)}</dd>
            </dl>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface/60 px-4 py-3.5">
          <p className="text-[13px] font-semibold">What joining means</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text/85">
            Orders already placed carry on and pay you as before. While you&rsquo;re on the team, the {inv.team.name} list your items, and your own listings don&rsquo;t sell.
          </p>
        </div>

        {onTeam ? (
          <p className="text-xs text-muted">You&rsquo;re on a team already. Leave it first to join this one.</p>
        ) : (
          <TeamInviteAnswer invitationId={inv.id} team={inv.team.name} />
        )}
        <p className="text-[11px] text-faint">Invited {joinedOn(inv.invitedAt)}{inv.team.city ? ` · ${inv.team.city}` : ""}</p>
      </section>
    </ArenaPanel>
  );
}

function Joined({ m }: { m: ApiTeamMembership }) {
  const share = m.teamShareBps === null ? "not set" : sharePct(m.teamShareBps);
  const keep = m.teamShareBps === null ? null : keepPct(m.teamShareBps);
  const short = m.team.name.split(" ").pop()!;
  return (
    <ArenaPanel tone="win" delay={0.14} spot>
      <section aria-label="Your team" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Crest name={m.team.name} />
          <span className="min-w-0 flex-1">
            <strong className="block text-base font-semibold">{m.team.name}</strong>
            <span className="text-xs text-muted">{[m.team.city, "on the roster"].filter(Boolean).join(" · ")}</span>
          </span>
          <ArenaChip tone="win"><span aria-hidden="true" className="mr-1">✓</span>Member</ArenaChip>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="sx-arena-in rounded-2xl border border-line bg-surface/60 px-4 py-3" style={at(0.24)}>
            <Fact label="Team share" value={share} sub={keep ? `you keep ${keep}` : "BTG sets it with the team"} tone="text-athlete" />
          </div>
          <div className="sx-arena-in rounded-2xl border border-line bg-surface/60 px-4 py-3" style={at(0.3)}>
            <Fact label="Joined" value={joinedOn(m.joinedAt)} />
          </div>
          <div className="sx-arena-in col-span-2 rounded-2xl border border-line bg-surface/60 px-4 py-3 sm:col-span-1" style={at(0.36)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Who lists your items</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text/85">
              The {short}. You see every sale on your <Link href="/athlete/sales" className="font-medium text-athlete hover:underline">Orders</Link> page.
            </p>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft pt-3">
          <TeamLeave team={m.team.name} share={share} />
          <span className="text-xs text-muted">You can list your own items again after you leave.</span>
        </div>
      </section>
    </ArenaPanel>
  );
}

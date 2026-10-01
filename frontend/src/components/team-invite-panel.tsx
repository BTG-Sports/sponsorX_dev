"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { inviteAthleteAction, removeFromRosterAction, searchInvitableAction, withdrawInvitationAction } from "@/app/(app)/property/roster/actions";
import { Badge } from "@/components/ui";
import { joinedOn, parseInviteShare, sentState, sharePct, type ApiInvitableAthlete, type ApiSentInvitation } from "@/lib/team-invite-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   2S2-FE-05 (team side) — on the property roster page: invite an athlete
   already on SponsorX (search, share, send), the invitations sent and their
   state (with Withdraw), and Remove from roster. No Claude Design artboard
   exists for the team's side; it follows the roster's own controls.

   Writes (property/roster/actions.ts, 2S2-BE-05)
     searchInvitableAction    GET  /team/invitations/candidates?q=
     inviteAthleteAction      POST /team/invitations
     withdrawInvitationAction POST /team-invitations/:id/withdraw
     removeFromRosterAction   POST /team/roster/:athleteId/remove
   -------------------------------------------------------------------------- */

const field =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const small =
  "rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const ghost =
  "rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

export function TeamInvitePanel({ teamName, invitations }: { teamName: string; invitations: ApiSentInvitation[] | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [share, setShare] = useState("");
  const [found, setFound] = useState<ApiInvitableAthlete[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const search = () =>
    start(async () => {
      setMessage(null);
      if (q.trim().length < 2) return setMessage("Type at least two letters of their name.");
      const r = await searchInvitableAction(q);
      if (!r.ok) return setMessage(r.message);
      setFound(r.athletes);
    });

  const invite = (a: ApiInvitableAthlete) =>
    start(async () => {
      setMessage(null);
      const parsed = parseInviteShare(share);
      if (!parsed.ok) return setMessage(parsed.message);
      const r = await inviteAthleteAction(a.id, share);
      if (!r.ok) return setMessage(r.message);
      setSent(`${a.displayName} is invited at ${sharePct(parsed.bps)}. They're emailed, and join only if they accept.`);
      setFound((list) => list?.map((x) => (x.id === a.id ? { ...x, invited: true } : x)) ?? null);
      router.refresh();
    });

  return (
    <section aria-label="Invite an athlete already on SponsorX" className="space-y-3">
      {!open ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={ghost} onClick={() => setOpen(true)}>
            Invite an athlete already on SponsorX
          </button>
          {sent && <p role="status" className="text-[11px] text-accent">{sent}</p>}
        </div>
      ) : (
        <form
          className="space-y-3 rounded-xl border border-line bg-surface p-5"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div>
            <h3 className="text-sm font-semibold">Invite an athlete to {teamName}</h3>
            <p className="mt-0.5 text-xs text-muted">
              Find an approved athlete who isn&rsquo;t on a team, set the team&rsquo;s share, and send. They&rsquo;re emailed and join only if they accept.
              Orders they already have carry on as before.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
            <label className="block">
              <span className="block text-[11px] font-medium text-muted">Athlete&rsquo;s name</span>
              <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Jordan Reed" autoComplete="off" />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-muted">Team share %</span>
              <input className={field} value={share} onChange={(e) => setShare(e.target.value)} inputMode="decimal" placeholder="e.g. 20" />
            </label>
            <button type="submit" className={small} disabled={pending}>{pending ? "Searching…" : "Search"}</button>
          </div>
          {message && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{message}</p>}
          {sent && <p role="status" className="text-[11px] text-accent">{sent}</p>}
          {found && (
            found.length === 0 ? (
              <p className="text-xs text-muted">No approved athlete without a team matches that name.</p>
            ) : (
              <ul className="divide-y divide-line-soft rounded-lg border border-line" aria-label="Athletes you can invite">
                {found.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
                    <span className="min-w-0">
                      <span className="block font-medium">{a.displayName}</span>
                      <span className="block text-[11px] text-muted">{[a.sport, a.position, a.school, [a.city, a.stateCode].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                    </span>
                    {a.invited ? (
                      <Badge tone="warn">Invited</Badge>
                    ) : (
                      <button type="button" className={small} disabled={pending} onClick={() => invite(a)} aria-label={`Invite ${a.displayName}`}>
                        Invite
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
          <button
            type="button"
            className={ghost}
            onClick={() => {
              setOpen(false);
              setFound(null);
              setMessage(null);
            }}
          >
            Close
          </button>
        </form>
      )}

      {invitations && invitations.length > 0 && <SentInvitations invitations={invitations} />}
    </section>
  );
}

function SentInvitations({ invitations }: { invitations: ApiSentInvitation[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <p className="border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint">Invitations</p>
      <ul className="divide-y divide-line-soft">
        {invitations.slice(0, 20).map((i) => {
          const s = sentState(i.state);
          return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
              <span className="min-w-0">
                <span className="block font-medium">{i.athlete.displayName}</span>
                <span className="block text-[11px] text-muted">
                  {sharePct(i.teamShareBps)} team share · sent {joinedOn(i.createdAt)}{i.decidedAt ? ` · answered ${joinedOn(i.decidedAt)}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={s.tone}>{s.label}</Badge>
                {i.state === "PENDING" && <WithdrawButton id={i.id} name={i.athlete.displayName} />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WithdrawButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        className={ghost}
        disabled={pending}
        aria-label={`Withdraw the invitation to ${name}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await withdrawInvitationAction(id);
            if (!r.ok) return setError(r.message);
            router.refresh();
          })
        }
      >
        {pending ? "…" : "Withdraw"}
      </button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** "Remove from roster" on a roster row, with a confirm step. */
export function RosterRemove({ athleteId, name, team }: { athleteId: string; name: string; team: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-muted underline-offset-2 hover:text-danger hover:underline" aria-label={`Remove ${name} from the roster`}>
        Remove
      </button>
      {open && <RemoveDialog athleteId={athleteId} name={name} team={team} onClose={() => setOpen(false)} />}
    </>
  );
}

function RemoveDialog({ athleteId, name, team, onClose }: { athleteId: string; name: string; team: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="rm-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl">
          <h2 id="rm-title" className="text-base font-semibold tracking-tight">Remove {name} from {team}?</h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-text/85">
            <li>Orders already placed carry on, and {team} keep their share on those.</li>
            <li>Your listings of {name}&rsquo;s items are paused.</li>
            <li>{name} is emailed, and can list their own items again.</li>
          </ul>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" data-autofocus onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">
              Keep on the roster
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await removeFromRosterAction(athleteId);
                  if (!r.ok) return setError(r.message);
                  onClose();
                  router.refresh();
                })
              }
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              {pending ? "Removing…" : "Remove from roster"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { leaveTeamAction, respondToShareChangeAction, respondToTeamAction } from "@/app/(app)/athlete/team/actions";
import type { ShareChangeView } from "@/lib/team-invite-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   2S2-FE-05 — the athlete's two answers: Accept / Decline on an invitation
   (TeamInvite.dc.html, invite view) and "Leave team" with its dialog (leave
   view). Live (2S2-BE-05): respondToTeamAction and leaveTeamAction.

   The design's first leave bullet ("the team's listings of your items
   end") is replaced by what happens (2S2-BE-05): the team's listings of the
   athlete's items are paused, and orders already placed carry on.

   POL-FE-03 — ShareChangeAnswer: Accept (behind a one-sentence confirm,
   since it changes what the athlete is paid from here on) and Decline on
   the team's request to change its share (respondToShareChangeAction).
   -------------------------------------------------------------------------- */

const danger =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";
const primary =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

/** Accept and join, or decline — the athlete's answer to one invitation. */
export function TeamInviteAnswer({ invitationId, team }: { invitationId: string; team: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const answer = (decision: "ACCEPT" | "DECLINE") =>
    start(async () => {
      setError(null);
      const r = await respondToTeamAction(invitationId, decision);
      if (!r.ok) return setError(r.message);
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={primary} disabled={pending} onClick={() => answer("ACCEPT")} aria-label={`Accept and join ${team}`}>
          {pending ? "Saving…" : "Accept and join"}
        </button>
        <button type="button" className={secondary} disabled={pending} onClick={() => answer("DECLINE")} aria-label={`Decline ${team}'s invitation`}>
          Decline
        </button>
      </div>
      {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}

/** POL-FE-03 — Accept (confirmed in a dialog) or Decline the team's share request. */
export function ShareChangeAnswer({ view, team }: { view: ShareChangeView; team: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decline = () =>
    start(async () => {
      setError(null);
      const r = await respondToShareChangeAction(view.id, "DECLINE");
      if (!r.ok) return setError(r.message);
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={primary} disabled={pending} onClick={() => setConfirm(true)} aria-label={`${view.acceptLabel}: ${view.to} for ${team}`}>
          {view.acceptLabel}
        </button>
        <button type="button" className={secondary} disabled={pending} onClick={decline} aria-label={`Decline ${team}'s share request`}>
          {pending ? "Saving…" : "Decline"}
        </button>
      </div>
      {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
      {confirm && <ShareAcceptDialog view={view} onClose={() => setConfirm(false)} />}
    </div>
  );
}

function ShareAcceptDialog({ view, onClose }: { view: ShareChangeView; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const accept = () =>
    start(async () => {
      setError(null);
      const r = await respondToShareChangeAction(view.id, "ACCEPT");
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="sc-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl">
          <h2 id="sc-title" className="text-base font-semibold tracking-tight">{view.acceptTitle}</h2>
          <p className="text-[13px] leading-relaxed text-text/85">{view.acceptLine}</p>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" data-autofocus onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">
              Not now
            </button>
            <button type="button" className={primary} disabled={pending} onClick={accept}>
              {pending ? "Saving…" : view.acceptLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamLeave({ team, share }: { team: string; share: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={danger} onClick={() => setOpen(true)}>Leave team</button>
      {open && <LeaveDialog team={team} share={share} onClose={() => setOpen(false)} />}
    </>
  );
}

function LeaveDialog({ team, share, onClose }: { team: string; share: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const leave = () =>
    start(async () => {
      setError(null);
      const r = await leaveTeamAction();
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="lv-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl">
          <h2 id="lv-title" className="text-base font-semibold tracking-tight">Leave the {team}?</h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-text/85">
            <li>Orders already placed carry on, and the {team} keep their {share} on those.</li>
            <li>The {team} stop selling your items; their listings of them are paused.</li>
            <li>You can list your own items; each one is checked before it goes live.</li>
          </ul>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" data-autofocus onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">
              Stay on the team
            </button>
            <button type="button" className={danger} disabled={pending} onClick={leave}>
              {pending ? "Leaving…" : "Leave team"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

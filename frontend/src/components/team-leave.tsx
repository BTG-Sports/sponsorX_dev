"use client";

import { useState } from "react";

import { TEAM_WAITING } from "@/lib/team-invite-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   2S2-FE-05 — "Leave team" and its dialog (TeamInvite.dc.html, leave view).

   SCAFFOLD: leaving a team is 2S2-BE-05 — not built. The dialog opens so
   the athlete can read what leaving means; its "Leave team" is disabled
   with the reason, and "Stay on the team" just closes it. Nothing here
   pretends to write.

   The design's first bullet ("the team's listings of your items end") is
   left out: no such rule was agreed (programme owner, 2026-10-01). Only
   what was agreed is said — orders already placed carry on.
   -------------------------------------------------------------------------- */

const danger =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";

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
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="lv-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl">
          <h2 id="lv-title" className="text-base font-semibold tracking-tight">Leave the {team}?</h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-text/85">
            <li>Orders already placed carry on, and the {team} keep their {share} on those.</li>
            <li>You can list your own items, and BTG checks each one.</li>
          </ul>
          <p className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] text-warn">{TEAM_WAITING}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" data-autofocus onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">
              Stay on the team
            </button>
            <button type="button" className={danger} disabled title={TEAM_WAITING}>Leave team</button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decideLegalNameAction, sendBackLegalNameIdAction } from "@/app/(app)/admin/new-signups/sensitive-edit-actions";
import { SendBackDialog } from "@/components/document-check";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   A held legal name — P8-FE-11, over P8-BE-11 / -10. The athlete's ID
   arrived but didn't read clear (or couldn't be read), so the new name
   waits for BTG on the Sensitive profile edits panel:

   - Apply makes it live (POST /profile-changes/:id/decision APPLY);
   - Decline closes it with a note the athlete reads (DECLINE, note);
   - Send ID back declines it with the reason and asks the athlete to submit
     again with a clearer ID (POST …/id-document/send-back).

   Each goes through sensitive-edit-actions.ts; the panel then re-reads.
   -------------------------------------------------------------------------- */

export function LegalNameDecision({ changeId, athlete, newName }: { changeId: string; athlete: string; newName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "decline" | "send-back">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = athlete.split(/\s+/)[0] ?? athlete;

  const apply = () =>
    start(async () => {
      setError(null);
      const r = await decideLegalNameAction(changeId, "APPLY").catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now — nothing changed." }));
      if (!r.ok) return setError(r.message);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={apply}
        className="min-h-9 rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
        {pending ? "Applying…" : `Apply “${newName}”`}
      </button>
      <button type="button" disabled={pending} onClick={() => setOpen("decline")}
        className="min-h-9 rounded-lg border border-danger/50 px-3.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40">
        Decline
      </button>
      <button type="button" disabled={pending} onClick={() => setOpen("send-back")}
        className="min-h-9 rounded-lg border border-warn/50 px-3.5 text-xs font-semibold text-warn hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-40">
        Send ID back
      </button>
      {error && <p role="alert" className="basis-full text-[11px] text-danger">{error}</p>}
      {open === "decline" && (
        <DeclineDialog changeId={changeId} first={first} newName={newName} onClose={() => setOpen(null)} onDone={() => { setOpen(null); router.refresh(); }} />
      )}
      {open === "send-back" && (
        <SendBackDialog
          name="ID"
          who={first}
          title={`Send ${first}’s ID back?`}
          lead={`The change to “${newName}” is declined with your reason, the file is deleted, and ${first} is emailed to enter the name again with a clearer ID.`}
          send={(reason) => sendBackLegalNameIdAction(changeId, reason)}
          onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function DeclineDialog({ changeId, first, newName, onClose, onDone }: { changeId: string; first: string; newName: string; onClose: () => void; onDone: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = !note.trim();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await decideLegalNameAction(changeId, "DECLINE", note).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now — nothing changed." }));
      if (!r.ok) return setError(r.message);
      onDone();
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="ln-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-danger/40 bg-surface p-6 shadow-2xl">
          <h2 id="ln-title" className="text-lg font-semibold">Decline the change to &ldquo;{newName}&rdquo;?</h2>
          <p className="text-xs leading-relaxed text-muted">{first}&rsquo;s legal name stays as it is. They read your note and can submit the change again.</p>
          <label htmlFor="ln-note" className="text-[13px] font-semibold">Note for {first} <span className="font-medium text-warn">(required)</span></label>
          <p id="ln-hint" className="-mt-2 text-[11px] text-muted">{first} reads this exactly as written.</p>
          <textarea id="ln-note" rows={3} required aria-describedby="ln-hint" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} data-autofocus
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={pending || off} onClick={submit}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Declining…" : "Decline and send note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

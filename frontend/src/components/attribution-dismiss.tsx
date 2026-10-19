"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { dismissUnmatchedAction } from "@/app/(app)/admin/intelligence/attribution/actions";
import { DialogError, NoteField, btn } from "@/components/order-dialog";
import { DISMISS_REASON_MIN, dismissError } from "@/lib/attribution-live";

/* --------------------------------------------------------------------------
   3S6-FE-01 — one queued sale's Dismiss, in its row. A small client island:
   the button opens an inline form (a required reason, the API's 10..500
   characters), Dismiss → dismissUnmatchedAction → POST
   /intelligence/attribution/unmatched/:id/dismiss. The page renders it only
   for the roles the API lets dismiss (lib/attribution-live.ts canDismiss);
   a dismissed sale shows its mark instead and has no button.

   `sample` (the ?demo=sample preview) never sends.
   -------------------------------------------------------------------------- */

export function DismissSale({ saleId, reference, sample }: { saleId: string; reference: string; sample: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setReason("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    const invalid = dismissError(reason);
    if (invalid) return setError(invalid);
    start(async () => {
      const res = await dismissUnmatchedAction(saleId, reason.trim());
      if (!res.ok) return setError(res.message);
      close();
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`Dismiss unmatched sale ${reference}`} className={`${btn.quiet} min-h-9 px-3 text-xs`}>
        Dismiss…
      </button>
    );
  }

  return (
    <form
      noValidate
      aria-label={`Dismiss unmatched sale ${reference}`}
      className="block w-full min-w-[16rem] max-w-sm space-y-2 whitespace-normal rounded-xl border border-primary/40 bg-surface-2 p-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-[11px] text-muted">
        <strong className="font-semibold text-text">{reference}</strong> stays on this list, marked dismissed with your name and reason. It is never assigned to a campaign by hand.
      </p>
      <NoteField id={`dismiss-${saleId}`} label="Why it is dismissed" hint={`Kept on the sale and in the audit log — at least ${DISMISS_REASON_MIN} characters.`} value={reason} onChange={setReason} rows={2} />
      <DialogError message={error} />
      {sample && <p className="text-[11px] text-warn">Sample preview — dismissing here sends nothing.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={`${btn.quiet} min-h-9 px-3 text-xs`} onClick={close} disabled={pending}>Cancel</button>
        <button type="submit" formNoValidate className={`${btn.danger} min-h-9 px-3 text-xs`} disabled={pending || !reason.trim() || sample}>
          {pending ? "Dismissing…" : "Dismiss sale"}
        </button>
      </div>
    </form>
  );
}

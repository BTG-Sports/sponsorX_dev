"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { resolveEventAction } from "@/app/(app)/admin/payments/actions";
import { eventWords, statusLabel, typeLabel, type ApiPaymentEvent } from "@/lib/payment-events-live";
import { DialogError, NoteField, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S5-FE-07 — "Resolve…" on Payment events: the event's words, a required
   note saying what BTG did about it, then resolveEventAction →
   POST /payment-events/:id/resolve. Once only; a refusal (409 already
   resolved or not a held/failed event, 422 an empty note or a card number)
   is shown in the API's words. BTG admin only — Finance sees no button.
   -------------------------------------------------------------------------- */

export function ResolveEvent({ event }: { event: ApiPaymentEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Resolve the ${typeLabel(event.type).toLowerCase()} event ${event.providerEventId}`}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-cta-ink hover:bg-primary-soft md:min-h-9 md:w-auto md:text-xs">
        Resolve…
      </button>
      {open && <ResolveDialog event={event} onClose={() => setOpen(false)} />}
    </>
  );
}

function ResolveDialog({ event: e, onClose }: { event: ApiPaymentEvent; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = !note.trim();
  const submit = () => {
    setError(null);
    if (off) return setError("Say what you did about it — the next person reads this.");
    start(async () => {
      const res = await resolveEventAction(e.id, { note: note.trim() });
      if (!res.ok) return setError(res.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id={`pe-${e.id}`} title="Mark this event dealt with?" onClose={onClose} onSubmit={submit}>
      <p className="text-sm leading-relaxed">
        <span className="font-semibold">{statusLabel(e.status)}</span> · {eventWords(e)}
      </p>
      <p className="text-[11px] text-muted">Provider event {e.providerEventId}</p>
      <NoteField id={`pe-${e.id}-note`} label="What you did about it" value={note} onChange={setNote}
        hint="Recorded the payment by hand, refunded it, confirmed it with the provider — the record for whoever looks next. Never a card number." />
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
        <li>The note is recorded with your name and the time, and the event leaves Needs BTG. It can’t be marked twice.</li>
        {e.type === "payment.refunded" && <li>A held provider refund closed here frees the order’s payouts again.</li>}
      </ul>
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={off || pending} className={btn.primary}>{pending ? "Saving…" : "Mark dealt with"}</button>
      </div>
      {off && <p className="text-[11px] text-muted">Write the note to turn on “Mark dealt with”.</p>}
    </OrderDialog>
  );
}

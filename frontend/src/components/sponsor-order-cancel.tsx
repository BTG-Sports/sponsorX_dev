"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelLineAction } from "@/app/(app)/sponsor/orders/[id]/delivery-actions";
import { DeadlineChip } from "@/components/order-bits";
import { cancelMode, sponsorCancelDialog, type ApiCancellationTerms, type CancelMode, type SponsorCancelView } from "@/lib/cancellations-live";
import { DialogError, NoteField, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S4-FE-06 — the sponsor cancels a paid line (OrderCancellations.dc.html,
   CX-1 Cancel this line · CX-2 the free dialog · CX-3 Ask the seller).

   Free until 3 days before the line's first date: refunded at once, the
   reason optional. After that, until the first date: the seller is asked,
   a reason required. cancelLineAction → POST /deliveries/:lineId/cancel;
   a refusal (409) or a missing reason (422) shows the API's words.
   SPONSOR_ADMIN only — the API decides.
   -------------------------------------------------------------------------- */

const link =
  "inline-flex min-h-11 items-center self-start rounded-lg text-[13px] font-semibold text-primary-soft hover:underline disabled:cursor-not-allowed disabled:opacity-40";

export function SponsorCancelControls({ orderId, lineId, title, seller, terms, view, canWrite, clock }: {
  orderId: string;
  lineId: string;
  title: string;
  seller: string;
  terms: ApiCancellationTerms;
  view: SponsorCancelView;
  canWrite: boolean;
  clock: Date;
}) {
  const [open, setOpen] = useState<CancelMode | null>(null);
  const [gone, setGone] = useState(false);
  if (!view.action) return null;
  /* The terms are re-read against the clock when pressed: the page may have sat open past a cut-off. */
  const press = () => {
    const live = cancelMode(terms, new Date());
    if (live) setOpen(live);
    else setGone(true);
  };
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {view.chip && <DeadlineChip d={view.chip} />}
      {gone ? (
        <p role="alert" className="text-xs text-danger">Its first date has started, so this line can’t be cancelled any more. Reload the page to see where it stands.</p>
      ) : canWrite ? (
        <button type="button" className={link} onClick={press}>
          {view.action.label}
        </button>
      ) : (
        <p className="text-xs text-muted">A Sponsor Admin in your organisation can cancel this line.</p>
      )}
      {open && (
        <CancelDialog
          orderId={orderId} lineId={lineId} title={title} seller={seller} terms={terms} mode={open} clock={clock}
          onMode={setOpen} onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function CancelDialog({ orderId, lineId, title, seller, terms, mode, clock, onMode, onClose }: {
  orderId: string; lineId: string; title: string; seller: string; terms: ApiCancellationTerms; mode: CancelMode; clock: Date;
  onMode: (m: CancelMode) => void; onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = sponsorCancelDialog(mode, { title, seller, refundCents: terms.refundCents, terms }, clock);
  const off = d.reasonRequired && !reason.trim();
  const submit = () => {
    setError(null);
    /* The free cut-off can pass while the dialog is open: never send a "free" cancel the API would turn into a request. */
    const live = cancelMode(terms, new Date());
    if (live !== mode) {
      if (!live) return setError("This line can’t be cancelled any more — its first date has started. Reload the page to see where it stands.");
      onMode(live);
      return setError(`The free cancellation ended while this was open, so ${seller} now has to agree. Read the new terms, add a reason and ask again.`);
    }
    if (off) return setError("Write a reason first.");
    start(async () => {
      const r = await cancelLineAction(orderId, lineId, reason, mode);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id={`cx-${lineId}`} title={d.title} onClose={onClose} onSubmit={submit}>
      <p className="text-sm leading-relaxed">{d.lead}</p>
      {d.chip && <DeadlineChip d={d.chip} />}
      {d.points.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
          {d.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <NoteField id={`cx-${lineId}-note`} label="Reason" hint={d.hint} value={reason} onChange={setReason} required={d.reasonRequired} />
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>{d.cancelLabel}</button>
        <button type="submit" disabled={off || pending} className={d.danger ? btn.danger : btn.primary}>
          {pending ? "Sending…" : d.button}
        </button>
      </div>
      {off && <p className="text-[11px] text-muted">Write a reason to turn on “{d.button}”.</p>}
    </OrderDialog>
  );
}

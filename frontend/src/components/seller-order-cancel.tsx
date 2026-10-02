"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { answerCancellationAction, sellerCancelAction } from "@/app/(app)/seller-sales-actions";
import { BOX, DeadlineChip } from "@/components/order-bits";
import { cancelWarning, sellerCancelDialog, type SellerCancelBanner, type SellerCancellation } from "@/lib/cancellations-live";
import { DialogError, NoteField, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S4-FE-06 — cancelling a sold line, the seller's side
   (OrderCancellations.dc.html):

     CX-6 / 6b / 7  the sponsor asks to cancel → Agree to cancel, or Keep
                    the line with a reason (BTG decides) —
                    answerCancellationAction (POST /sales/:id/cancellation-answer)
     CX-8           Can't deliver this line? → cancel it, a reason required,
                    with the 90-day warning — sellerCancelAction
                    (POST /sales/:id/cancel)

   The API decides who may (the team's manager, or the athlete whose item
   it is) and whether it still can; its refusal is shown as it says it. The
   agree and can't-deliver dialogs state what the sponsor gets back —
   `cancellation.refundCents` (the line, or the rest of the order with the
   buyer fee when it is the last live line).
   -------------------------------------------------------------------------- */

/** The box above the line: the request (with the deadline and Agree / Keep), or how it ended. */
export function SellerCancelBox({ lineId, title, sponsor, refundCents, banner }: {
  lineId: string; title: string; sponsor: string; refundCents: number; banner: SellerCancelBanner;
}) {
  const [open, setOpen] = useState<null | "agree" | "keep">(null);
  const t = BOX[banner.tone];
  return (
    <section role="status" aria-label={banner.tag} className={`flex flex-col gap-2.5 rounded-xl border px-4 py-3.5 ${t.box}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${t.title}`}>{banner.tag}</p>
      <h2 className="text-[15px] font-semibold leading-snug">{banner.title}</h2>
      {banner.quote && <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed">{banner.quote}</p>}
      {banner.text && <p className="text-[13px] leading-relaxed text-text/85">{banner.text}</p>}
      {banner.deadline && <DeadlineChip d={banner.deadline} after={banner.after} />}
      {banner.ask && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={btn.primary} onClick={() => setOpen("agree")}>Agree to cancel</button>
          <button type="button" className={btn.quiet} onClick={() => setOpen("keep")}>Keep the line</button>
        </div>
      )}
      {open && (
        <AnswerDialog kind={open} lineId={lineId} title={title} sponsor={sponsor} refundCents={refundCents} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function AnswerDialog({ kind, lineId, title, sponsor, refundCents, onClose }: {
  kind: "agree" | "keep"; lineId: string; title: string; sponsor: string; refundCents: number; onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = sellerCancelDialog(kind, { title, sponsor, refundCents });
  const off = d.reasonRequired && !reason.trim();
  const submit = () => {
    setError(null);
    if (off) return setError("Write a reason first.");
    start(async () => {
      const r = await answerCancellationAction(lineId, kind === "agree" ? "ACCEPT" : "DECLINE", kind === "keep" ? reason : undefined);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id={`ca-${kind}`} title={d.title} onClose={onClose} onSubmit={submit}>
      {d.lead && <p className="text-sm leading-relaxed">{d.lead}</p>}
      {d.points.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
          {d.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {d.reasonRequired && <NoteField id={`ca-${kind}-note`} label="Reason" hint={d.hint ?? undefined} value={reason} onChange={setReason} />}
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" data-autofocus={d.reasonRequired ? undefined : true} className={btn.quiet} onClick={onClose}>{d.cancelLabel}</button>
        <button type="submit" disabled={off || pending} className={btn.primary}>{pending ? "Sending…" : d.button}</button>
      </div>
      {off && <p className="text-[11px] text-muted">Write a reason to turn on “{d.button}”.</p>}
    </OrderDialog>
  );
}

/** "Can't deliver this line?" — the seller cancels it, with the 90-day warning (CX-8). */
export function SellerCantDeliver({ lineId, title, sponsor, refundCents, cancellation }: {
  lineId: string; title: string; sponsor: string; refundCents: number; cancellation: SellerCancellation;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center self-start rounded-lg text-[13px] font-semibold text-primary-soft hover:underline">
        Can’t deliver this line?
      </button>
      {open && <CantDialog lineId={lineId} title={title} sponsor={sponsor} refundCents={refundCents} cancellation={cancellation} onClose={() => setOpen(false)} />}
    </>
  );
}

function CantDialog({ lineId, title, sponsor, refundCents, cancellation, onClose }: {
  lineId: string; title: string; sponsor: string; refundCents: number; cancellation: SellerCancellation; onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = sellerCancelDialog("cant", { title, sponsor, refundCents });
  const warn = cancelWarning(cancellation);
  const off = !reason.trim();
  const submit = () => {
    setError(null);
    if (off) return setError("Write a reason first.");
    start(async () => {
      const r = await sellerCancelAction(lineId, reason);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id="cx-cant" title={d.title} onClose={onClose} onSubmit={submit}>
      <p className="text-sm leading-relaxed">{d.lead}</p>
      <NoteField id="cx-cant-note" label="Reason" hint={d.hint ?? undefined} value={reason} onChange={setReason} />
      <p className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${warn.near ? "border-warn/45 bg-warn/8" : "border-line bg-bg text-muted"}`}>
        {warn.near && <strong className="text-warn" aria-hidden="true">! </strong>}
        {warn.text}
      </p>
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>{d.cancelLabel}</button>
        <button type="submit" disabled={off || pending} className={btn.danger}>{pending ? "Cancelling…" : d.button}</button>
      </div>
      {off && <p className="text-[11px] text-muted">Write a reason to turn on “{d.button}”.</p>}
    </OrderDialog>
  );
}

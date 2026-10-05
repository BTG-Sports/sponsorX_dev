"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { markRefundSentAction } from "@/app/(app)/admin/refunds/actions";
import { money } from "@/lib/order-automation-live";
import { METHOD_WORDS, REFUND_METHODS, refundRef, refundWhat, sentNotice, sentProblems, today, type ApiRefund, type RefundMethod } from "@/lib/refunds-live";
import { DialogError, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S4-FE-06 — "Mark refunded" on Refunds to send (OrderCancellations.dc.html,
   CX-12): how it was sent, its reference and the day — markRefundSentAction
   → POST /refunds/:id/sent. Once only; the sponsor is emailed that it was
   sent. A card or bank number is refused here and again by the API; a
   refusal (409 already sent, 422 a card-number reference or a future date)
   is shown in the API's words.
   -------------------------------------------------------------------------- */

export function MarkRefunded({ refund }: { refund: ApiRefund }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Mark the ${refundRef(refund)} refund sent`}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-cta-ink hover:bg-primary-soft xl:min-h-9 xl:w-auto xl:text-xs">
        Mark refunded
      </button>
      {open && <MarkDialog refund={refund} onClose={() => setOpen(false)} />}
    </>
  );
}

const input =
  "box-border h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-text focus:border-primary/60 focus:outline-none";

function MarkDialog({ refund: r, onClose }: { refund: ApiRefund; onClose: () => void }) {
  const router = useRouter();
  const max = today();
  const [method, setMethod] = useState<RefundMethod>(r.paidVia === "CHEQUE" ? "CHEQUE" : "BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [sentOn, setSentOn] = useState(max);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bad = sentProblems({ method, reference, sentOn });
  /* An empty reference keeps the button off quietly; anything typed that's wrong says why. */
  const refError = reference.trim() ? bad.reference : undefined;
  const off = Boolean(bad.method || bad.reference || bad.sentOn);
  const submit = () => {
    setError(null);
    if (off) return setError(bad.method ?? bad.reference ?? bad.sentOn ?? null);
    start(async () => {
      const res = await markRefundSentAction(r.id, { method, reference: reference.trim(), sentOn });
      if (!res.ok) return setError(res.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id={`rf-${r.id}`} title={`Mark the ${refundRef(r)} refund sent?`} onClose={onClose} onSubmit={submit}>
      {r.zohoNote && (
        <p className="rounded-lg border border-primary/40 bg-primary/8 px-3 py-2.5 text-xs leading-relaxed">
          Paid by Zoho invoice — {r.zohoNote.charAt(0).toLowerCase()}{r.zohoNote.slice(1)} too.
        </p>
      )}
      <p className="text-sm leading-relaxed">{r.sponsor.name} · {refundWhat(r)} · <strong className="tabular-nums">{money(r.amountCents)}</strong></p>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 p-0 text-xs font-medium">How it was sent</legend>
        <div className="flex flex-wrap gap-2">
          {REFUND_METHODS.map((m) => (
            <label key={m}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs ${method === m ? "border-primary-soft bg-primary/12" : "border-line bg-bg"}`}>
              <input type="radio" name={`rf-${r.id}-method`} value={m} checked={method === m} onChange={() => setMethod(m)} className="m-0 accent-primary" />
              {METHOD_WORDS[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          <span>Reference <span className="text-warn">(required)</span></span>
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} required maxLength={200} autoComplete="off"
            data-autofocus aria-invalid={refError ? true : undefined} aria-describedby={`rf-${r.id}-ref-hint`} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          <span>Date sent</span>
          <input type="date" value={sentOn} max={max} onChange={(e) => setSentOn(e.target.value)} required className={input} />
        </label>
      </div>
      <p id={`rf-${r.id}-ref-hint`} className={`-mt-1 text-[11px] ${refError ? "text-danger" : "text-muted"}`}>
        {refError ?? "The transfer’s, cheque’s or provider’s own reference. Never a card or bank number."}
      </p>
      {bad.sentOn && sentOn && <p className="-mt-1 text-[11px] text-danger">{bad.sentOn}</p>}
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
        <li>{sentNotice(r)}</li>
        <li>The method, reference and day are recorded, and it moves to Sent. It can’t be marked twice.</li>
      </ul>
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={off || pending} className={btn.primary}>{pending ? "Saving…" : "Mark refunded"}</button>
      </div>
      {off && !refError && !bad.sentOn && <p className="text-[11px] text-muted">Enter the reference to turn on “Mark refunded”.</p>}
    </OrderDialog>
  );
}

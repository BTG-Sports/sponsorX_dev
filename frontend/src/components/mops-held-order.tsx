"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { decideOrderAction } from "@/app/(app)/admin/marketplace/actions";
import { heldDecision } from "@/lib/order-automation-live";
import { DialogError, NoteField, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S4-FE-05 — BTG's Approve / Reject on an order held above the sponsor's
   spending limit (OrderExceptions.dc.html, views approveHeld / rejectHeld).
   Live: decideOrderAction → POST /marketplace-orders/:id/decision
   { decision: APPROVE | REJECT, notes } (2S4-BE-09). Approving lets it
   through this once — the limit itself doesn't change; rejecting needs a
   reason the sponsor reads, and releases the stock.
   -------------------------------------------------------------------------- */

export function HeldOrderDecision({ id, orderRef, totalCents, limit }: {
  id: string;
  orderRef: string;
  totalCents: number;
  limit: { sponsorName: string; limitCents: number } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "APPROVE" | "REJECT">(null);
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = open ? heldDecision(open, { ref: orderRef, totalCents }, limit) : null;
  const off = Boolean(d?.needsReason) && !why.trim();
  const close = () => {
    setOpen(null);
    setError(null);
  };
  const submit = () => {
    if (!open) return;
    if (off) return setError("Write a reason — the sponsor reads it.");
    start(async () => {
      setError(null);
      const r = await decideOrderAction(id, "PENDING_APPROVAL", open, open === "REJECT" ? why : "");
      if (!r.ok) return setError(r.message);
      close();
      router.refresh();
    });
  };
  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={btn.primary} onClick={() => setOpen("APPROVE")}>Approve</button>
        <button type="button" className={btn.danger} onClick={() => setOpen("REJECT")}>Reject</button>
      </div>
      {open && d && (
        <OrderDialog id="hd" title={d.title} onClose={close} onSubmit={submit}>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
            {d.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
          {d.needsReason && <NoteField id="hd-why" label="Reason" hint={`${limit?.sponsorName ?? "The sponsor"} reads this.`} value={why} onChange={setWhy} />}
          <DialogError message={error} />
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus={d.needsReason ? undefined : true} className={btn.quiet} onClick={close}>Cancel</button>
            <button type="submit" disabled={off || pending} className={open === "REJECT" ? btn.danger : btn.primary}>{pending ? "Saving…" : d.button}</button>
          </div>
          {off && <p className="text-[11px] text-muted">Write a reason to turn on “{d.button}”.</p>}
        </OrderDialog>
      )}
    </>
  );
}

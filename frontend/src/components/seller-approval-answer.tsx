"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { decideSellerApprovalAction } from "@/app/(app)/seller-sales-actions";
import { PAYMENT_WINDOW_DAYS, datesText, lineDays, type ApiApprovalLine } from "@/lib/order-automation-live";
import { DialogError, NoteField, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S4-FE-05 — the seller's Accept / Decline on an order their listing asks
   to approve (SellerOrderActions.dc.html, views approve · accept · decline).
   Live (2S4-BE-09): decideSellerApprovalAction → POST
   /seller-approvals/:id/decision. Declining needs a reason, which the
   sponsor reads; the API refuses after the 48 hours or a second answer.
   -------------------------------------------------------------------------- */

export function SellerApprovalAnswer({ id, sponsor, lines }: { id: string; sponsor: string; lines: ApiApprovalLine[] }) {
  const [open, setOpen] = useState<null | "accept" | "decline">(null);
  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={btn.primary} onClick={() => setOpen("accept")}>Accept</button>
        <button type="button" className={btn.quiet} onClick={() => setOpen("decline")}>Decline</button>
      </div>
      {open === "accept" && <AcceptDialog id={id} sponsor={sponsor} lines={lines} onClose={() => setOpen(null)} />}
      {open === "decline" && <DeclineDialog id={id} sponsor={sponsor} onClose={() => setOpen(null)} />}
    </>
  );
}

function useAnswer(id: string, onClose: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (decision: "ACCEPT" | "DECLINE", reason?: string) =>
    start(async () => {
      setError(null);
      const r = await decideSellerApprovalAction(id, decision, reason);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  return { error, setError, pending, send };
}

function AcceptDialog({ id, sponsor, lines, onClose }: { id: string; sponsor: string; lines: ApiApprovalLine[]; onClose: () => void }) {
  const { error, pending, send } = useAnswer(id, onClose);
  return (
    <OrderDialog id="ac" title={`Accept ${sponsor}’s order?`} onClose={onClose} onSubmit={() => send("ACCEPT")}>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
        {lines.map((l) => (
          <li key={l.id}>{l.title}, {datesText(lineDays(l))}, is booked for {sponsor}.</li>
        ))}
        <li>{sponsor} is then asked to pay within {PAYMENT_WINDOW_DAYS} days.</li>
        <li>Your share shows on the order once it’s paid.</li>
      </ul>
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" data-autofocus className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" className={btn.primary} disabled={pending}>{pending ? "Accepting…" : "Accept"}</button>
      </div>
    </OrderDialog>
  );
}

function DeclineDialog({ id, sponsor, onClose }: { id: string; sponsor: string; onClose: () => void }) {
  const { error, setError, pending, send } = useAnswer(id, onClose);
  const [why, setWhy] = useState("");
  const off = !why.trim();
  return (
    <OrderDialog
      id="dc"
      title={`Decline ${sponsor}’s order?`}
      onClose={onClose}
      onSubmit={() => (off ? setError("Write a reason — the sponsor reads it.") : send("DECLINE", why))}
    >
      <p className="text-xs leading-relaxed text-muted">The order is cancelled, the dates are free again and nothing is charged.</p>
      <NoteField id="dc-why" label="Reason" hint={`${sponsor} reads this.`} value={why} onChange={setWhy} />
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" className={btn.danger} disabled={off || pending}>{pending ? "Declining…" : "Decline the order"}</button>
      </div>
      {off && <p className="text-[11px] text-muted">Write a reason to turn on “Decline the order”.</p>}
    </OrderDialog>
  );
}

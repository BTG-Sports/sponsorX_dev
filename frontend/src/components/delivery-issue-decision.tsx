"use client";

import { useState } from "react";

import { DELIVERY_BACKEND, money, possessive, type DeliveryProblem } from "@/lib/delivery-issues-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   BTG's decision on a reported delivery problem — 2S4-FE-04 (design
   DeliveryIssues.dc.html, views detail / confirm / refund). A SCAFFOLD:
   both dialogs open so the decision can be walked through, but "Confirm
   delivered" and "Cancel and refund" inside them stay off until 2S4-BE-07.
   No hold is released, no refund is asked for and no email is sent.
   -------------------------------------------------------------------------- */

const OFF = `Goes live with ${DELIVERY_BACKEND} — this is sample data, nothing is paid, refunded or sent.`;

export function DeliveryIssueDecision({ problem }: { problem: DeliveryProblem }) {
  const [open, setOpen] = useState<null | "confirm" | "refund">(null);
  const team = problem.seller.sub;
  return (
    <>
      <aside aria-label="Decision" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">Your decision</p>
        <button type="button" onClick={() => setOpen("confirm")}
          className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
          Confirm delivered
        </button>
        <button type="button" onClick={() => setOpen("refund")}
          className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10">
          Cancel and refund this line
        </button>
        <p className="text-xs leading-relaxed text-muted">
          Both choices email {problem.sponsor.name}, {problem.seller.name}{team ? ` and ${team}` : ""}. Talk to both sides first if you need more.
        </p>
      </aside>

      {open === "confirm" && (
        <Decision
          id="dc" title={`Confirm ${problem.orderRef} was delivered?`} onClose={() => setOpen(null)}
          cancel="Cancel" go="Confirm delivered" primary
          points={[
            "The line counts as delivered.",
            `The hold ends: ${possessive(problem.seller.name)} ${money(problem.hold.sellerShareCents)}${team ? ` and ${possessive(team)} ${money(problem.hold.teamShareCents)}` : ""} can be paid out.`,
            `${problem.sponsor.name} is told, with your note.`,
          ]}
        />
      )}
      {open === "refund" && (
        <Decision
          id="rf" title="Cancel and refund this line?" onClose={() => setOpen(null)}
          cancel="Keep the line" go="Cancel and refund"
          points={[
            `${problem.sponsor.name} gets ${money(problem.hold.sponsorPaidCents)} back through the payment provider.`,
            `${possessive(problem.seller.name)} ${money(problem.hold.sellerShareCents)}${team ? ` and ${possessive(team)} ${money(problem.hold.teamShareCents)}` : ""} are cancelled.`,
            "Everyone is emailed your note.",
          ]}
        />
      )}
    </>
  );
}

function Decision({ id, title, points, cancel, go, primary, onClose }: {
  id: string; title: string; points: string[]; cancel: string; go: string; primary?: boolean; onClose: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [note, setNote] = useState("");
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed">
            {points.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p className="text-[11px] text-warn">Sample amounts.</p>
          <label htmlFor={`${id}-note`} className="text-[13px] font-semibold">Note to everyone <span className="font-medium text-warn">(required)</span></label>
          <textarea id={`${id}-note`} rows={3} required aria-describedby={`${id}-off`} value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">{cancel}</button>
            <button type="button" disabled title={OFF}
              className={`min-h-11 cursor-not-allowed rounded-lg px-4 text-[13px] font-semibold opacity-40 ${primary ? "bg-primary text-cta-ink" : "border border-danger/50 text-danger"}`}>
              {go}
            </button>
          </div>
          <p id={`${id}-off`} className="text-[11px] text-warn">Sample — this decision goes live with {DELIVERY_BACKEND}. Nothing is paid, refunded or emailed from here yet.</p>
        </div>
      </div>
    </div>
  );
}

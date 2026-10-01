"use client";

import { useState } from "react";

import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   2S4-FE-03 — "Mark delivered" and its dialog (Orders.dc.html, mark view).

   SCAFFOLD: marking a line delivered, and the sponsor's 24-hour
   confirmation that follows, are 2S4-BE-07 — not built. The dialog opens so
   the seller can see what they'll be asked for, but its own "Mark
   delivered", the photo and the link are disabled with the reason. Nothing
   here pretends to write.
   -------------------------------------------------------------------------- */

const WAITING = "Goes live with 2S4-BE-07 (marking delivered and the sponsor’s confirmation) — nothing is sent yet.";

const primary =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-line px-3.5 text-xs font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

export function SellerMarkDelivered({
  applies,
  why,
  sponsor,
  summary,
}: {
  /** Whether this line can be marked at all (only while in delivery). */
  applies: boolean;
  /** The reason shown beside the button. */
  why: string;
  sponsor: string;
  /** "Youth basketball clinic with Riley Carter · 2 sessions · Oct 10 and Oct 17" */
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={primary} disabled={!applies} title={applies ? undefined : why} onClick={() => setOpen(true)}>
        Mark delivered
      </button>
      <span className="text-xs text-muted">{why}</span>
      {open && <MarkDialog sponsor={sponsor} summary={summary} onClose={() => setOpen(false)} />}
    </div>
  );
}

function MarkDialog({ sponsor, summary, onClose }: { sponsor: string; summary: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [note, setNote] = useState("");
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="mk-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl">
          <h2 id="mk-title" className="text-base font-semibold tracking-tight">Mark this line delivered?</h2>
          <p className="text-xs text-muted">{summary}</p>
          <label htmlFor="mk-note" className="block text-sm font-semibold">
            What happened <span className="font-medium text-warn">(required)</span>
          </label>
          <textarea
            id="mk-note"
            data-autofocus
            rows={3}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Both clinics held, Oct 10 and 17, 18 kids each"
            className="-mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
          />
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface px-4 py-4 text-center text-xs text-muted">
            <span className="text-sm font-medium text-text">
              Add a photo or a link <span className="font-normal text-muted">(optional)</span>
            </span>
            <span>Helps if {sponsor} has a question later.</span>
            <span className="flex gap-2">
              <button type="button" className={secondary} disabled title={WAITING}>Choose photo</button>
              <button type="button" className={secondary} disabled title={WAITING}>Add link</button>
            </span>
          </div>
          <p className="text-xs text-muted">
            {sponsor} is asked to confirm, and has 24 hours to confirm or report a problem. If they don’t answer in time, it counts as confirmed.
          </p>
          <p className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] text-warn">{WAITING}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2">
              Cancel
            </button>
            <button type="button" className={primary} disabled title={WAITING}>
              Mark delivered
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

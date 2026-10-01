"use client";

import { useState } from "react";

import { CLOSE_DIALOG, CLOSE_NOT_LIVE } from "@/lib/account-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   Close account — 2S1-FE-08 (design Account.dc.html, settings + close).
   The settings row and its confirm dialog: one island because the row's
   button opens the dialog.

   Scaffold: closing is 2S1-BE-13, not built. The dialog shows what closing
   will mean, and its "Close account" stays disabled with the reason under
   it — "Keep my account" is the only live button, and nothing is sent.
   -------------------------------------------------------------------------- */

export function CloseAccount({ line }: { line: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Close account" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/35 bg-surface px-4.5 py-4">
      <span className="min-w-0 grow basis-56">
        <strong className="block text-sm font-semibold">Close account</strong>
        <span className="text-xs leading-relaxed text-muted">{line}</span>
      </span>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="min-h-11 rounded-lg border border-danger/50 px-4 text-xs font-semibold text-danger outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-danger">
        Close account
      </button>
      {open && <CloseDialog onClose={() => setOpen(false)} />}
    </section>
  );
}

function CloseDialog({ onClose }: { onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cl-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-3.5 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl sm:p-6">
          <h2 id="cl-title" className="text-base font-semibold tracking-tight">{CLOSE_DIALOG.title}</h2>
          <p className="text-sm leading-relaxed">{CLOSE_DIALOG.body}</p>
          <p className="text-xs leading-relaxed text-muted">{CLOSE_DIALOG.money}</p>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-xs font-medium text-text hover:bg-surface-2">
              Keep my account
            </button>
            <button type="button" disabled title={CLOSE_NOT_LIVE} aria-describedby="cl-why"
              className="min-h-11 cursor-not-allowed rounded-lg border border-danger/50 px-4 text-xs font-semibold text-danger opacity-40">
              Close account
            </button>
          </div>
          <p id="cl-why" className="text-[11px] text-warn">{CLOSE_NOT_LIVE}</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDialogFocus } from "./use-dialog-focus";
import { useMounted } from "./use-mounted";

/* --------------------------------------------------------------------------
   2S4-FE-05 — the confirm dialog the order screens open (accept, decline,
   refund, send, reject, decide, mark paid): the same shell as the Mark
   delivered dialog — focus kept inside, Escape closes, a bottom sheet on a
   phone and a centred card from sm up.
   -------------------------------------------------------------------------- */

/* PORTALED TO <body> (QA 2026-10-07): a `position: fixed` box is laid out
   against the nearest ancestor with a transform or a filter, and the stage
   tables' cards carry `backdrop-filter` — so a dialog opened from a table
   row was confined to the card and clipped. On the body it covers the
   viewport again; StagePortals keeps `.sx-ops` on the body, so it stays on
   the night stage. */
export function OrderDialog({ id, title, onClose, onSubmit, children }: {
  id: string;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/65" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-start sm:pt-32">
        <form
          className="sx-pop relative flex w-full max-w-[30rem] flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">{title}</h2>
          {children}
        </form>
      </div>
    </div>,
    document.body,
  );
}

export const btn = {
  primary: "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40",
  quiet: "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40",
  danger: "inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40",
} as const;

/** The required-field textarea the dialogs share. */
export function NoteField({ id, label, hint, value, onChange, required = true, rows = 3 }: {
  id: string; label: string; hint?: string; value: string; onChange: (v: string) => void; required?: boolean; rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label} {required ? <span className="font-medium text-warn">(required)</span> : <span className="font-normal text-muted">(optional)</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="-mt-1 text-[11px] text-muted">{hint}</p>}
      <textarea
        id={id}
        data-autofocus
        rows={rows}
        required={required}
        maxLength={2000}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal text-text focus:border-primary/60 focus:outline-none"
      />
    </div>
  );
}

/** The dialog's error line. */
export function DialogError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{message}</p> : null;
}

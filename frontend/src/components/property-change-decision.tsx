"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { approvePropertyChangeAction, rejectPropertyChangeAction, type PropertyChangeWrite } from "@/app/(app)/admin/new-signups/property-change-actions";
import { btn, DialogError, NoteField, OrderDialog } from "@/components/order-dialog";

/* --------------------------------------------------------------------------
   POL-FE-104 — BTG's answer to an organisation's held change, on New
   sign-ups: Approve (it takes effect) or Reject, which asks for the reason
   the organisation reads on its own Profile page. Each goes through
   property-change-actions.ts; the list then re-reads.

   The reject pop-up is OrderDialog, which is portaled to <body>: the card it
   opens from is clipped (a chamfer), and a fixed box inside a clipped card
   is cut to the card.
   -------------------------------------------------------------------------- */

const OFFLINE: PropertyChangeWrite = { ok: false, message: "Couldn’t reach SponsorX just now, so nothing changed." };

export function PropertyChangeDecision({ changeId, organisation }: { changeId: string; organisation: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const inFlight = useRef(false);

  /** One answer at a time: the ref is flipped before anything is awaited, so a double click sends one. */
  const run = async (kind: "approve" | "reject", write: () => Promise<PropertyChangeWrite>, fail: (m: string) => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    setDialogError(null);
    try {
      const r = await write().catch(() => OFFLINE);
      if (!r.ok) return fail(r.message);
      setOpen(false);
      router.refresh();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run("approve", () => approvePropertyChangeAction(changeId), setError)}
        className="min-h-9 rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "approve" ? "Approving…" : "Approve the change"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => { setReason(""); setDialogError(null); setOpen(true); }}
        className="min-h-9 rounded-lg border border-danger/50 px-3.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Reject
      </button>
      {error && <p role="alert" className="basis-full text-[11px] text-danger">{error}</p>}

      {open && (
        <OrderDialog
          id={`sx-pc-${changeId}`}
          title={`Reject ${organisation}’s change?`}
          onClose={() => setOpen(false)}
          onSubmit={() => void run("reject", () => rejectPropertyChangeAction(changeId, reason), setDialogError)}
        >
          <p className="text-xs leading-relaxed text-muted">
            Nothing changes: {organisation} keeps what is on file. Its manager reads your reason on their Profile page and can ask again.
          </p>
          <NoteField id={`sx-pc-${changeId}-reason`} label="Reason" hint={`${organisation}’s manager reads this exactly as written.`} value={reason} onChange={setReason} />
          <DialogError message={dialogError} />
          <div className="flex items-center justify-end gap-2">
            <button type="button" className={btn.quiet} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={btn.danger} disabled={busy !== null || !reason.trim()}>{busy === "reject" ? "Rejecting…" : "Reject and send the reason"}</button>
          </div>
        </OrderDialog>
      )}
    </div>
  );
}

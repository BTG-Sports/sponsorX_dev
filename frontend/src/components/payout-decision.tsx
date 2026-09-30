"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PayoutWriteFailure } from "@/lib/payouts-live";

/* --------------------------------------------------------------------------
   Approve / Send back — 2S5-FE-04 (design Approvals.dc.html). Approve hands
   the payout to the payment provider; Send back needs a note the payee reads
   exactly as written, and returns the money to their available balance.
   Retry is the Problems tab's one action.
   -------------------------------------------------------------------------- */

type Result = { ok: true; state: string } | PayoutWriteFailure;

export function PayoutDecision({
  payeeFirstName,
  amount,
  decide,
}: {
  payeeFirstName: string;
  amount: string;
  decide: (decision: "APPROVE" | "REJECT", note: string | null) => Promise<Result>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "sendback">("choose");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (decision: "APPROVE" | "REJECT") => {
    setBusy(true);
    setError(null);
    try {
      const r = await decide(decision, decision === "REJECT" ? note.trim() : null);
      if (!r.ok) setError(r.message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (mode === "sendback") {
    return (
      <div className="space-y-3">
        <label className="block text-xs font-medium" htmlFor="sendback-note">
          Note to {payeeFirstName} <span className="text-warn">(required)</span>
        </label>
        <textarea
          id="sendback-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Say what to fix — e.g. confirm the clinic date in Deliverables, then request again."
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs outline-none focus:border-primary"
        />
        <p className="text-[11px] text-muted">{payeeFirstName} reads this exactly as you write it. Nothing is paid; the {amount} goes back to their available balance.</p>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || !note.trim()} onClick={() => run("REJECT")} className="rounded-lg border border-warn/60 px-3.5 py-2 text-xs font-medium text-warn disabled:opacity-40">
            {busy ? "Sending back…" : `Send back to ${payeeFirstName}`}
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("choose")} className="rounded-lg border border-line px-3.5 py-2 text-xs text-muted">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run("APPROVE")} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-cta-ink disabled:opacity-40">
          {busy ? "Approving…" : "Approve payout"}
        </button>
        <button type="button" disabled={busy} onClick={() => setMode("sendback")} className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-text hover:bg-surface-2">
          Send back
        </button>
      </div>
      <p className="text-[11px] text-muted">Approving hands it to the payment provider.</p>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

export function PayoutRetry({ retry }: { retry: () => Promise<Result> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await retry();
            if (!r.ok) setError(r.message);
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-cta-ink disabled:opacity-40"
      >
        {busy ? "Retrying…" : "Retry"}
      </button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

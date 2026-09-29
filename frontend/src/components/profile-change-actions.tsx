"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideChange, type DecisionResult } from "@/app/(app)/admin/profile-changes/actions";

/* --------------------------------------------------------------------------
   P3-BE-16 — Approve / Decline on one proposed profile edit. Decline asks
   for notes first (the API requires them; the athlete reads them verbatim).
   On success the page re-reads: the row moves out of the pending queue.
   -------------------------------------------------------------------------- */

const BTN = "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-opacity disabled:opacity-50";

export function ProfileChangeActions({ id }: { id: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [pending, start] = useTransition();

  const run = (kind: "approve" | "decline") =>
    start(async () => {
      const r = await decideChange(id, kind, kind === "decline" ? notes : undefined).catch(
        () => ({ ok: false as const, message: "Couldn't reach SponsorX just now — nothing changed." }),
      );
      setResult(r);
      if (r.ok) router.refresh();
    });

  if (result?.ok) {
    return <p role="status" className="text-[11px] font-medium text-success">{result.state === "APPROVED" ? "Approved — the profile is updated." : "Declined — the athlete has your notes."}</p>;
  }

  return (
    <div className="space-y-2">
      {declining && (
        <textarea
          aria-label="Reviewer notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why — the athlete reads this."
          rows={2}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint outline-none focus:border-admin/50"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!declining && (
          <button type="button" onClick={() => run("approve")} disabled={pending} aria-busy={pending} className={`${BTN} bg-admin text-cta-ink`}>
            {pending ? "Saving…" : "Approve"}
          </button>
        )}
        {declining ? (
          <>
            <button type="button" onClick={() => run("decline")} disabled={pending || !notes.trim()} aria-busy={pending} className={`${BTN} bg-danger/90 text-cta-ink`}>
              {pending ? "Saving…" : "Confirm decline"}
            </button>
            <button type="button" onClick={() => setDeclining(false)} disabled={pending} className={`${BTN} border border-line text-muted hover:text-text`}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setDeclining(true)} disabled={pending} className={`${BTN} border border-line text-muted hover:text-text`}>
            Decline…
          </button>
        )}
      </div>
      {result && !result.ok && <p role="alert" className="text-[11px] text-danger">{result.message}</p>}
    </div>
  );
}

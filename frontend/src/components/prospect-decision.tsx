"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import { decideProspectAction } from "@/app/(app)/admin/next/prospects/actions";
import { REJECTION_REASONS } from "@/lib/prospects-live";

/* P9-FE-11 — one held prospect's decision bar on BTG's desk. Accept, or
   refuse with a reason the student is told. The API's refusal (already
   decided, not your tenant) is shown as said. */
export function ProspectDecision({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  const go = (decision: "ACCEPT" | "REJECT") => {
    setMsg(null);
    start(async () => {
      const r = await decideProspectAction(prospectId, decision, decision === "REJECT" ? reason : undefined);
      setMsg(r);
      if (r.ok) {
        setRefusing(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {refusing ? (
        <form
          className="flex w-full max-w-sm flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go("REJECT");
          }}
        >
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Why — the student is told
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs normal-case outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Pick a reason</option>
              {REJECTION_REASONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRefusing(false)} className="px-2 py-1.5 text-xs text-muted hover:text-text">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !reason}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40"
            >
              {pending ? "Saving…" : "Refuse"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={pending} onClick={() => go("ACCEPT")}>
            Accept
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setRefusing(true)}>
            Refuse
          </Button>
        </div>
      )}
      {msg && (
        <p role="status" className={`max-w-sm text-right text-[11px] ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.message}
        </p>
      )}
    </div>
  );
}

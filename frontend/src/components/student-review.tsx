"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import { reviewStudentAction } from "@/app/(app)/advisor/actions";
import { reviewMoves, type ApiStudentState } from "@/lib/students-live";

/* P9-FE-02 — one application's decision bar. A move that needs a reason
   opens a note first (the student reads it); the API's refusal — a minor
   with no verified guardian, a move out of turn — is shown as said. */
export function StudentDecision({ studentId, state }: { studentId: string; state: ApiStudentState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<ApiStudentState | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const moves = reviewMoves(state);
  if (moves.length === 0) return null;

  const go = (to: ApiStudentState, withNote?: string) => {
    setMsg(null);
    start(async () => {
      const r = await reviewStudentAction(studentId, to, withNote);
      setMsg(r);
      if (r.ok) {
        setAsking(null);
        setNote("");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {asking ? (
        <form
          className="flex w-full max-w-sm flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go(asking, note);
          }}
        >
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Note to the student
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              required
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs normal-case outline-none focus-visible:ring-2 focus-visible:ring-next"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAsking(null)} className="px-2 py-1.5 text-xs text-muted hover:text-text">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
              {pending ? "Saving…" : moves.find((m) => m.to === asking)?.label}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {moves.map((m) => (
            <Button
              key={m.to}
              variant={m.tone}
              disabled={pending}
              onClick={() => (m.needsNote ? setAsking(m.to) : go(m.to))}
            >
              {m.label}
            </Button>
          ))}
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { adjustEarningAction, moveEarningAction } from "@/app/(app)/finance/(treasury)/actions";
import { adjustmentProblem, earningMoves, mayAdjust, referenceProblem, type EarningMove } from "@/lib/earning-actions";

/* --------------------------------------------------------------------------
   POL-FE-53 (app review B2) — the actions on one earning row in Finance's
   books: Approve, Hold / Release, Mark paid (asks for the transfer
   reference), Adjust (asks for the amount and the reason).
   -------------------------------------------------------------------------- */

const btn = "min-h-8 rounded-md border border-[color:var(--vault-line,#3a3a3a)] px-2.5 text-[11px] font-medium hover:bg-white/5 disabled:opacity-40";
const primary = "min-h-8 rounded-md bg-[color:var(--vault-gold,#d4af37)] px-2.5 text-[11px] font-semibold text-black hover:opacity-90 disabled:opacity-40";
const input = "min-h-8 w-full rounded-md border border-[color:var(--vault-line,#3a3a3a)] bg-transparent px-2 text-[11px]";

export function EarningRowActions({ id, state }: { id: string; state: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<null | "paid" | "adjust" | "void">(null);
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const moves = earningMoves(state);
  const adjust = mayAdjust(state);
  if (!moves.length && !adjust) return <span className="text-[11px] text-[color:var(--vault-faint)]">—</span>;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      setNote({ ok: r.ok, text: r.message });
      if (r.ok) {
        setForm(null);
        router.refresh();
      }
    });
  const click = (m: EarningMove) =>
    m.needsReference ? setForm("paid") : m.needsConfirm ? setForm(form === "void" ? null : "void") : run(() => moveEarningAction(id, m.to));

  return (
    <div className="flex min-w-[10rem] flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {moves.map((m) => (
          <button key={m.to} type="button" disabled={pending} className={m.primary ? primary : btn} onClick={() => click(m)}>
            {m.label}
          </button>
        ))}
        {adjust && (
          <button type="button" disabled={pending} className={btn} onClick={() => setForm(form === "adjust" ? null : "adjust")}>
            Adjust
          </button>
        )}
      </div>
      {form === "paid" && (
        <form
          aria-label="Mark paid"
          className="flex w-full flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const p = referenceProblem(ref);
            if (p) return setNote({ ok: false, text: p });
            run(() => moveEarningAction(id, "PAID", ref));
          }}
        >
          <input aria-label="Transfer reference" className={input} placeholder="Transfer reference (Zoho or bank)" value={ref} maxLength={200} onChange={(e) => setRef(e.target.value)} />
          <button type="submit" disabled={pending} className={primary}>Mark paid</button>
        </form>
      )}
      {/* POL-FE-87 — voiding is final: say so, then do it. */}
      {form === "void" && (
        <div role="group" aria-label="Void the earning" className="flex w-full flex-col gap-1.5">
          <p className="text-[11px] text-[color:var(--vault-faint)]">Void it? Nothing will be owed on this earning, and it can&apos;t be undone.</p>
          <div className="flex gap-1.5">
            <button type="button" disabled={pending} className={btn} onClick={() => run(() => moveEarningAction(id, "VOIDED"))}>Void it</button>
            <button type="button" disabled={pending} className={btn} onClick={() => setForm(null)}>Keep it</button>
          </div>
        </div>
      )}
      {form === "adjust" && (
        <form
          aria-label="Adjust the earning"
          className="flex w-full flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const p = adjustmentProblem(amount, reason);
            if (p) return setNote({ ok: false, text: p });
            run(() => adjustEarningAction(id, amount, reason));
          }}
        >
          <input aria-label="Change in dollars" className={input} placeholder="Change in dollars, e.g. 25 or -12.50" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input aria-label="Reason" className={input} placeholder="Why (kept on the record)" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
          <button type="submit" disabled={pending} className={btn}>Record adjustment</button>
        </form>
      )}
      {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-[11px] text-[color:var(--vault-good,#4ade80)]" : "text-[11px] text-[color:var(--vault-late,#f87171)]"}>{note.text}</p>}
    </div>
  );
}

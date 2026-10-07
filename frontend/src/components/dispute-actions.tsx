"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { resolveDisputeAction, reviewDisputeAction } from "@/app/(app)/admin/payments/actions";
import { amountWords, isPartial, resolveWords, type ApiDispute } from "@/lib/disputes-live";
import { money } from "@/lib/order-automation-live";
import { DialogError, NoteField, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S5-FE-08 — the two dialogs on a dispute:

   Take for review (OPEN → UNDER_REVIEW; BTG admin or Finance): a required
   note saying what was sent to the provider. reviewDisputeAction →
   POST /disputes/:id/review.

   Resolve (UNDER_REVIEW and the provider has decided — the API's
   `canResolve`; BTG admin only): a required note; when the dispute is for
   less than the order, the lines it was lost on, with checkboxes, at least
   one. resolveDisputeAction → POST /disputes/:id/resolve. A refusal (409
   take for review first / already resolved / provider undecided, 422 the
   lines) is shown in the API's words.
   -------------------------------------------------------------------------- */

const primarySmall =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-cta-ink hover:bg-primary-soft md:min-h-9 md:w-auto md:text-xs";
const quietSmall =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line px-3.5 text-sm font-medium text-text hover:bg-surface-2 md:min-h-9 md:w-auto md:text-xs";

export function TakeForReview({ dispute }: { dispute: ApiDispute }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Take the ${dispute.orderRef} dispute for review`} className={primarySmall}>
        Take for review…
      </button>
      {open && <ReviewDialog dispute={dispute} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ResolveDispute({ dispute }: { dispute: ApiDispute }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Resolve the ${dispute.orderRef} dispute`} className={dispute.canResolve ? primarySmall : quietSmall}>
        Resolve…
      </button>
      {open && <ResolveDialog dispute={dispute} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReviewDialog({ dispute: d, onClose }: { dispute: ApiDispute; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = !note.trim();
  const submit = () => {
    setError(null);
    if (off) return setError("Say what was sent to the provider, or what you're gathering.");
    start(async () => {
      const res = await reviewDisputeAction(d.id, { note: note.trim() });
      if (!res.ok) return setError(res.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id={`dr-${d.id}`} title={`Take the ${d.orderRef} dispute for review?`} onClose={onClose} onSubmit={submit}>
      <p className="text-sm leading-relaxed">{d.sponsorName} · <strong className="tabular-nums">{amountWords(d)}</strong> · {d.provider} dispute {d.providerDisputeRef}</p>
      <NoteField id={`dr-${d.id}-note`} label="What was sent to the provider" value={note} onChange={setNote}
        hint="The evidence sent, or what is still being gathered — the next person reads this." />
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
        <li>The dispute moves to Under review with your name. The order’s money stays frozen.</li>
        <li>Once the provider has decided, a BTG admin resolves it to that outcome.</li>
      </ul>
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={off || pending} className={btn.primary}>{pending ? "Saving…" : "Take for review"}</button>
      </div>
      {off && <p className="text-[11px] text-muted">Write the note to turn on “Take for review”.</p>}
    </OrderDialog>
  );
}

function ResolveDialog({ dispute: d, onClose }: { dispute: ApiDispute; onClose: () => void }) {
  const router = useRouter();
  const partial = isPartial(d) && d.providerOutcome === "LOST";
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<string[]>(d.lineIds.length ? d.lineIds : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const noLines = partial && lines.length === 0;
  const off = !note.trim() || noLines || !d.canResolve;
  const toggle = (id: string) => setLines((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const outcome = d.providerOutcome === "WON" ? "Won" : d.providerOutcome === "LOST" ? "Lost" : "Undecided";
  const submit = () => {
    setError(null);
    if (!note.trim()) return setError("Say how it was resolved — the next person reads this.");
    if (noLines) return setError("Pick at least one line the dispute was lost on.");
    start(async () => {
      const res = await resolveDisputeAction(d.id, { note: note.trim(), ...(partial ? { lineIds: lines } : {}) });
      if (!res.ok) return setError(res.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id={`ds-${d.id}`} title={`Resolve the ${d.orderRef} dispute as ${outcome.toLowerCase()}?`} onClose={onClose} onSubmit={submit}>
      <p className="text-sm leading-relaxed">
        {d.sponsorName} · <strong className="tabular-nums">{amountWords(d)}</strong> · the provider says <strong>{outcome}</strong>
      </p>
      <p className="text-[13px] leading-relaxed text-text/85">{resolveWords(d)}</p>
      {partial && (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 p-0 text-xs font-medium">
            The lines it was lost on <span className="text-warn">(at least one)</span>
          </legend>
          <ul className="space-y-1.5">
            {d.lines.map((l) => (
              <li key={l.id}>
                <label className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-xs ${lines.includes(l.id) ? "border-primary-soft bg-primary/12" : "border-line bg-bg"}`}>
                  <input type="checkbox" checked={lines.includes(l.id)} onChange={() => toggle(l.id)} className="m-0 accent-primary" />
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  <span className="tabular-nums text-muted">{money(l.lineTotalCents)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <NoteField id={`ds-${d.id}-note`} label="How it was resolved" value={note} onChange={setNote}
        hint="What the provider found and what BTG did — the record for whoever looks next." />
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={off || pending} className={btn.primary}>{pending ? "Saving…" : `Resolve as ${outcome.toLowerCase()}`}</button>
      </div>
      {!d.canResolve && <p className="text-[11px] text-muted">{d.state === "OPEN" ? "Take it for review first." : "The provider hasn’t decided yet."}</p>}
      {d.canResolve && off && <p className="text-[11px] text-muted">{noLines ? "Pick the lines and write the note to turn on “Resolve”." : "Write the note to turn on “Resolve”."}</p>}
    </OrderDialog>
  );
}

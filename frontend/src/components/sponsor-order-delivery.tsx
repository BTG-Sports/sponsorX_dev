"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { confirmDeliveryAction, deliveryProofAction, reportProblemAction } from "@/app/(app)/sponsor/orders/[id]/delivery-actions";
import { Badge } from "@/components/ui";
import { deliveryBadge, deliveryNote, stamp, timeLeft, type ApiDeliveryLine } from "@/lib/sponsor-delivery-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   2S4-FE-04 (sponsor half) — "Riley Carter says this was delivered": each
   line's delivery on the sponsor's order page, with the seller's note and
   proof, the time left of the 24 hours, and Confirm / Report a problem.

   Reads  the lines the page fetched (GET /marketplace-orders/:id/deliveries)
   Writes confirmDeliveryAction / reportProblemAction (./delivery-actions.ts)
   A Sponsor Analyst reads; only a Sponsor Admin answers (the API decides).
   -------------------------------------------------------------------------- */

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const quiet =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";

export function SponsorOrderDelivery({ orderId, lines, canWrite, now }: { orderId: string; lines: ApiDeliveryLine[]; canWrite: boolean; now: string }) {
  /* The clock starts at the server's time (so the first render matches) and ticks each minute. */
  const [clock, setClock] = useState(() => new Date(now));
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <section aria-label="Delivery" className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">Delivery</h2>
      <ul className="space-y-2">
        {lines.map((l) => (
          <DeliveryLine key={l.lineId} orderId={orderId} line={l} canWrite={canWrite} clock={clock} />
        ))}
      </ul>
    </section>
  );
}

function DeliveryLine({ orderId, line: l, canWrite, clock }: { orderId: string; line: ApiDeliveryLine; canWrite: boolean; clock: Date }) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const b = deliveryBadge(l);
  const note = deliveryNote(l);
  const left = l.state === "DELIVERED" && l.confirmDueAt ? timeLeft(l.confirmDueAt, clock) : null;
  const open = l.state === "DELIVERED" && l.canAnswer && left !== null;

  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await confirmDeliveryAction(orderId, l.lineId);
      if (!r.ok) return setError(r.message);
      router.refresh();
    });

  return (
    <li className={`rounded-xl border bg-surface px-4 py-3 ${l.state === "DELIVERED" ? "border-warn/40" : l.state === "PROBLEM" ? "border-danger/40" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold">{l.title}</p>
        <Badge tone={b.tone}>
          <span aria-hidden="true" className="mr-1">{b.mark}</span>
          {b.label}
        </Badge>
      </div>

      {l.markedAt && l.note && (
        <div className="mt-2.5 rounded-lg border border-line bg-bg px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {l.markedBy ?? l.seller} says this was delivered · {stamp(l.markedAt)}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed">&ldquo;{l.note}&rdquo;</p>
          {(l.proof.photo || l.proof.link) && (
            <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
              {l.proof.photo && <ProofButton lineId={l.lineId} />}
              {l.proof.link && (
                <a href={l.proof.link} target="_blank" rel="noopener noreferrer" className="break-all text-primary-soft hover:underline">
                  {l.proof.link}
                </a>
              )}
            </p>
          )}
        </div>
      )}

      {l.problem && (
        <p className="mt-2 rounded-lg border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-[13px]">
          You reported: &ldquo;{l.problem.text}&rdquo;
        </p>
      )}
      {l.resolution?.note && (
        <p className="mt-2 rounded-lg border border-line bg-bg px-3.5 py-2.5 text-[13px]">BTG: &ldquo;{l.resolution.note}&rdquo;</p>
      )}

      {note && <p className="mt-2 text-xs text-muted">{note}</p>}

      {open && (
        <div className="mt-3 space-y-2">
          <p role="timer" aria-live="off" className="text-xs font-semibold text-warn">
            {left} to answer
          </p>
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={pending} onClick={confirm}>
                {pending ? "Confirming…" : "Confirm delivered"}
              </button>
              <button type="button" className={quiet} disabled={pending} onClick={() => setReporting(true)}>
                Report a problem
              </button>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              A Sponsor Admin in your organisation confirms or reports a problem.
            </p>
          )}
          {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
        </div>
      )}
      {reporting && <ProblemDialog orderId={orderId} line={l} onClose={() => setReporting(false)} />}
    </li>
  );
}

function ProblemDialog({ orderId, line, onClose }: { orderId: string; line: ApiDeliveryLine; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    setError(null);
    if (!text.trim()) return setError("Say what went wrong — BTG and the seller read this.");
    start(async () => {
      const r = await reportProblemAction(orderId, line.lineId, text);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="rp-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
        <form
          className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 id="rp-title" className="text-base font-semibold tracking-tight">Report a problem with this line?</h2>
          <p className="text-xs text-muted">{line.title} · marked delivered by {line.markedBy ?? line.seller}</p>
          <label htmlFor="rp-note" className="block text-sm font-semibold">
            What went wrong <span className="font-medium text-warn">(required)</span>
          </label>
          <textarea
            id="rp-note"
            data-autofocus
            rows={3}
            required
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="-mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none"
          />
          <p className="text-xs text-muted">BTG looks into it and emails you its decision: confirm the delivery, or refund this line. The seller isn&rsquo;t paid for it until then.</p>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2">
              Cancel
            </button>
            <button type="submit" disabled={pending} className={quiet}>
              {pending ? "Sending…" : "Report the problem"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** The seller's photo: a five-minute, audited link, in a new tab. */
function ProofButton({ lineId }: { lineId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await deliveryProofAction(lineId);
            if (!r.ok) return setError(r.message);
            window.open(r.url, "_blank", "noopener,noreferrer");
          })
        }
        className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold text-text hover:bg-surface-2 disabled:opacity-40"
      >
        {pending ? "Opening…" : "View photo"}
      </button>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </span>
  );
}

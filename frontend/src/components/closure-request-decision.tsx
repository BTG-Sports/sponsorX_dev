"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { closeHeldRequestAction, declineHeldRequestAction } from "@/app/(app)/admin/closed-accounts/actions";
import { possessive, type ApiClosureRequestDetail, type NowView } from "@/lib/closed-accounts-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   BTG's answer on a closure held for it — POL-FE-11 (POL-BE-11).

   - "Close now" posts closeHeldRequestAction (POST /account-closure-
     requests/:id/close) after a confirm: the logins go off, the listings
     pause, the invitations are declined and the earned money is requested.
     A 409 comes back as words naming what is still open — the button is
     offered either way, because `now` is read when the page loads and a
     deal may have settled since.
   - "Decline" asks for the reason, which the API emails to the owner as
     written; the account stays open.
   - Decided (closed, declined, withdrawn): one sentence, no buttons.
   -------------------------------------------------------------------------- */

const PATH = "/admin/closed-accounts";
const SURPRISE = "The API is unreachable — nothing changed. Try again in a minute.";

export function ClosureRequestDecision({ request, now }: { request: ApiClosureRequestDetail; now: NowView }) {
  const [open, setOpen] = useState<null | "close" | "decline">(null);
  const held = request.state === "HELD";
  return (
    <>
      <aside aria-label="Actions" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        {held ? (
          <>
            <button type="button" onClick={() => setOpen("close")} aria-haspopup="dialog"
              className={`min-h-12 rounded-lg px-5 text-sm font-bold ${now.canClose ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line bg-surface-2 text-text hover:bg-surface"}`}>
              Close now
            </button>
            <p className="text-xs leading-relaxed text-muted">
              {now.canClose
                ? "Nothing is left: the logins go off, the listings pause, and the earned money is requested to the account on file."
                : "Refused until nothing is left — settle each deal with the usual tools, then come back. The API lists what is still open."}
            </p>
            <button type="button" onClick={() => setOpen("decline")} aria-haspopup="dialog"
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10">
              Decline
            </button>
            <p className="text-xs leading-relaxed text-muted">The account stays open. Your reason is emailed to {request.accountName || "the owner"} exactly as written.</p>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">
            {request.state === "CLOSED" ? "Closed. Nothing for you to do."
              : request.state === "DECLINED" ? "Kept open — the owner was told why. Nothing for you to do."
              : "The owner withdrew it; the account stays open. Nothing for you to do."}
          </p>
        )}
      </aside>

      {open === "close" && <CloseNowDialog request={request} now={now} onClose={() => setOpen(null)} />}
      {open === "decline" && <DeclineDialog request={request} onClose={() => setOpen(null)} />}
    </>
  );
}

function CloseNowDialog({ request, now, onClose }: { request: ApiClosureRequestDetail; now: NowView; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(null);
      const r = await closeHeldRequestAction(request.id).catch(() => ({ ok: false as const, message: SURPRISE }));
      if (!r.ok) return setError(r.message);
      onClose();
      router.push(`${PATH}?tab=closing`);
      router.refresh();
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cn-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="cn-title" className="text-lg font-semibold">Close {possessive(request.accountName || "this")} account now?</h2>
          {now.canClose ? (
            <p className="text-[13px] leading-relaxed text-muted">
              Nothing is left. Their logins are switched off, their listings pause, open invitations are declined and the money they earned is requested to the payout account on file. They can reactivate within 30 days from the link we email.
            </p>
          ) : (
            <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-[13px] leading-relaxed">
              <p className="font-semibold text-warn">Still open when this page loaded:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {now.reasons.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <p className="mt-2 text-muted">If it settled since, this goes through; otherwise the API refuses and says what is left.</p>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} disabled={pending} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:opacity-50">Not yet</button>
            <button type="button" onClick={go} disabled={pending} aria-busy={pending}
              className="min-h-11 rounded-lg bg-primary px-5 text-[13px] font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? "Closing…" : "Close the account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeclineDialog({ request, onClose }: { request: ApiClosureRequestDetail; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = !why.trim();
  const go = "Send and keep it open";
  const submit = () => {
    setError(null);
    if (off) return setError(`Write a reason to turn on “${go}”.`);
    start(async () => {
      const r = await declineHeldRequestAction(request.id, why).catch(() => ({ ok: false as const, message: SURPRISE }));
      if (!r.ok) return setError(r.message);
      onClose();
      router.push(`${PATH}?tab=closing`);
      router.refresh();
    });
  };
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="dh-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <form
          className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 id="dh-title" className="text-lg font-semibold">Keep {possessive(request.accountName || "this")} account open?</h2>
          <p className="text-[13px] leading-relaxed text-muted">We email your reason to {request.accountName || "the owner"} exactly as written. Nothing closes; they can ask again later.</p>
          <label htmlFor="dh-why" className="text-[13px] font-semibold">Reason <span className="font-medium text-warn">(required)</span></label>
          <textarea id="dh-why" rows={3} required maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} data-autofocus
            placeholder="Let’s set up your payout account first — we’ll call you."
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="submit" disabled={pending || off}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Sending…" : go}
            </button>
          </div>
          {off && <p className="text-[11px] text-faint">Write a reason to turn on &ldquo;{go}&rdquo;.</p>}
        </form>
      </div>
    </div>
  );
}

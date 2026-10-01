"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { declineReturnAction } from "@/app/(app)/admin/closed-accounts/actions";
import { APPLY_AGAIN_TEXT, dayOf, possessive, readOnlyLine, type ApiClosure } from "@/lib/closed-accounts-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   BTG's answer on a closed account — 2S1-FE-08, BTG half (design
   ClosedAccounts.dc.html, the detail's Actions and the decline /
   applyAgain dialog). Live (2S1-BE-13):

   - "Open their page to reinstate →" goes to the account's own page
     (subjectHref from GET /account-closures/:id), where Reinstate is.
   - "Decline" and, for an application, "Tell them to apply again" post
     through declineReturnAction (POST /account-closures/:id/reactivation-
     decision) with the required reason, which the API emails as written.
   - Closed by the owner, ended at coming of age, files deleted: no actions,
     one sentence saying why.
   -------------------------------------------------------------------------- */

const PATH = "/admin/closed-accounts";

export function ClosedAccountDecision({ closure }: { closure: ApiClosure }) {
  const [open, setOpen] = useState<null | "decline" | "apply">(null);
  const readOnly = readOnlyLine(closure);
  return (
    <>
      <aside aria-label="Actions" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        {closure.reinstatable && (
          <div className="flex flex-col gap-2">
            <Link href={closure.subjectHref}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
              Open their page to reinstate →
            </Link>
            <p className="text-xs leading-relaxed text-muted">Reinstate is on their own page, where the rest of their record is.</p>
          </div>
        )}
        {closure.application && closure.state === "CLOSED" && (
          <p className="text-[13px] leading-relaxed">
            This was an application, not an account — they can apply again.{" "}
            <Link href={closure.subjectHref} className="text-xs text-primary-soft hover:underline">See the application →</Link>
          </p>
        )}
        {closure.canDecline && (
          <div className="flex flex-col gap-2">
            {closure.application && (
              <button type="button" onClick={() => setOpen("apply")}
                className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
                Tell them to apply again
              </button>
            )}
            <button type="button" onClick={() => setOpen("decline")}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10">
              Decline
            </button>
          </div>
        )}
        {readOnly && <p className="text-[13px] leading-relaxed text-muted">{readOnly}</p>}
        {!closure.reinstatable && !closure.application && !closure.canDecline && !readOnly && (
          <p className="text-[13px] leading-relaxed text-muted">Nothing for you to do.</p>
        )}
      </aside>

      {open && <DeclineDialog closure={closure} apply={open === "apply"} onClose={() => setOpen(null)} />}
    </>
  );
}

function DeclineDialog({ closure, apply, onClose }: { closure: ApiClosure; apply: boolean; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [why, setWhy] = useState(apply ? APPLY_AGAIN_TEXT : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const title = apply ? "Tell them to apply again?" : `Decline ${possessive(closure.name)} request?`;
  const go = apply ? "Send and close the request" : "Send and decline";
  const off = !why.trim();
  const submit = () => {
    setError(null);
    if (off) return setError(`Write a reason to turn on “${go}”.`);
    start(async () => {
      const r = await declineReturnAction(closure.id, why);
      if (!r.ok) return setError(r.message);
      onClose();
      router.push(PATH);
      router.refresh();
    });
  };
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="dc-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <form
          className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 id="dc-title" className="text-lg font-semibold">{title}</h2>
          <p className="text-[13px] leading-relaxed text-muted">We email your reason to {closure.name} exactly as written. Their account stays closed.</p>
          <label htmlFor="dc-why" className="text-[13px] font-semibold">Reason <span className="font-medium text-warn">(required)</span></label>
          <textarea id="dc-why" rows={3} required maxLength={2000} value={why} onChange={(e) => setWhy(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          <p className="text-[11px] text-faint">Their files are still deleted on {dayOf(closure.retainUntil)}.</p>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
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

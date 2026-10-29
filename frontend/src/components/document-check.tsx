"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui";
import {
  checkBadge, checkFindings, returnedLine, sendBackProblem, SEND_BACK_REASON, type ApiDocumentCheck, type ApiDocumentReturned,
} from "@/lib/document-checks-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   What BTG reads beside a document, and Send back — P8-FE-11, the BTG half.
   Shared by the New sign-ups, organisation, sponsor-request and guardian-
   handoff desks (and the held legal names), each of which has its own
   server action for the send-back route.

   - DocumentCheck: Clear / Flagged (each finding listed) / "Couldn't read —
     check it by eye", or nothing when the document was never read
     (P8-BE-11); and "Sent back <day> — <reason>" once BTG returned it
     (P8-BE-10 — its file is gone, so the desk hides View).
   - SendBackButton + SendBackDialog: a reason box (5–1,000 characters) that
     calls the desk's action; the page then re-reads itself.
   -------------------------------------------------------------------------- */

export type SendBack = (reason: string) => Promise<{ ok: true } | { ok: false; message: string }>;

export function DocumentCheck({ check, returned, className = "" }: { check: ApiDocumentCheck; returned?: ApiDocumentReturned; className?: string }) {
  const badge = checkBadge(check);
  const findings = checkFindings(check);
  const sentBack = returnedLine(returned ?? null);
  if (!badge && !sentBack) return null;
  return (
    <div className={`space-y-1 text-[11px] ${className}`}>
      {sentBack && (
        <p className="break-words text-warn">
          <span aria-hidden="true">↩ </span>
          {sentBack}
        </p>
      )}
      {badge && (
        <p className="flex flex-wrap items-center gap-1.5">
          <Badge tone={badge.tone}>
            <span aria-hidden="true" className="mr-1">{badge.mark}</span>
            {badge.label}
          </Badge>
          {check?.state === "FLAGGED" && findings.length === 0 && <span className="text-muted">Something on it didn&rsquo;t match.</span>}
        </p>
      )}
      {findings.length > 0 && (
        <ul aria-label="What the check found" className="list-disc space-y-0.5 pl-4 text-warn">
          {findings.map((f) => <li key={f} className="break-words">{f}</li>)}
        </ul>
      )}
    </div>
  );
}

export function SendBackButton({ name, who, send, onDone, disabled, label = "Send back" }: {
  /** What the document is — "Government ID", "proof of business". */
  name: string;
  /** Who reads the reason — "Ardinia", "Harbor Coffee". */
  who: string;
  send: SendBack;
  onDone?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} aria-label={`${label}: ${name}`}
        className="min-h-9 rounded-lg border border-warn/50 px-3.5 text-xs font-semibold text-warn hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-40">
        {label}
      </button>
      {open && <SendBackDialog name={name} who={who} send={send} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone?.(); }} />}
    </>
  );
}

export function SendBackDialog({ name, who, send, onClose, onDone, title, lead }: {
  name: string; who: string; send: SendBack; onClose: () => void; onDone: () => void;
  title?: string;
  lead?: string;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problem = sendBackProblem(reason);
  const submit = () => {
    if (problem) return setError(problem);
    start(async () => {
      setError(null);
      const r = await send(reason.trim()).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now — nothing changed. Try again in a minute." }));
      if (!r.ok) return setError(r.message);
      onDone();
    });
  };
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="sb-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-warn/40 bg-surface p-6 shadow-2xl">
          <h2 id="sb-title" className="text-lg font-semibold">{title ?? `Send the ${name.charAt(0).toLowerCase()}${name.slice(1)} back?`}</h2>
          <p className="text-xs leading-relaxed text-muted">
            {lead ?? `The file is deleted and stops counting. ${who} is emailed your reason and the link they already use to upload, and the checks run again on the new one.`}
          </p>
          <label htmlFor="sb-why" className="text-[13px] font-semibold">Reason <span className="font-medium text-warn">(required)</span></label>
          <p id="sb-hint" className="-mt-2 text-[11px] text-muted">{who} reads this exactly as written — say what a better one needs to show.</p>
          <textarea id="sb-why" rows={4} required aria-describedby="sb-hint" value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }}
            maxLength={SEND_BACK_REASON.max} data-autofocus
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={pending || Boolean(problem)} onClick={submit}
              className="min-h-11 rounded-lg border border-warn/50 px-4 text-[13px] font-semibold text-warn hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Sending back…" : "Send back and email reason"}
            </button>
          </div>
          {problem && reason.length > 0 && <p className="text-[11px] text-muted">{problem}</p>}
        </div>
      </div>
    </div>
  );
}

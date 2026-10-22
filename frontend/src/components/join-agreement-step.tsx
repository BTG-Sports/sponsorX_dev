"use client";

import { AGREEMENT, type CollabAgreement } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   Section 10 — click-wrap (P1-ART-07 comp 10). The Content Collaboration
   Agreement in force, as the API serves it (P8-FE-07; v2 approved
   2026-10-22), a real checkbox whose tick draws in, and the recording note.
   The body is rendered verbatim: the application sends back its hash, so
   nothing here may reflow or trim it. The Submit button itself lives in the
   wizard's action bar and is gated on `accepted`.
   -------------------------------------------------------------------------- */

export function JoinAgreementStep({
  agreement,
  accepted,
  onAcceptedChange,
}: {
  agreement: CollabAgreement | null;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  if (!agreement) {
    return (
      <p role="status" className="rounded-xl border border-line bg-surface-2 p-5 text-sm leading-relaxed text-muted">
        {AGREEMENT.unavailable}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-line bg-surface-2 p-5">
        <pre
          data-agreement-body
          tabIndex={0}
          aria-label="Content Collaboration Agreement text"
          className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-muted"
        >
          {agreement.body}
        </pre>
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3.5 rounded-xl border border-line bg-surface-2 p-4">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${
            accepted ? "bg-primary" : "bg-text"
          }`}
        >
          {accepted && (
            <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-cta-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0s" } as React.CSSProperties} />
            </svg>
          )}
        </span>
        <span className="text-sm leading-relaxed text-text">{AGREEMENT.checkbox(agreement.version)}</span>
      </label>

      <p className="text-xs leading-relaxed text-faint">{AGREEMENT.recordNote}</p>
    </div>
  );
}

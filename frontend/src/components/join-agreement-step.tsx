"use client";

import { RULES_WORDS, type ApiRulesWording } from "@/lib/confirmations-live";
import { AGREEMENT, type CollabAgreement } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   Section 10 — click-wrap (P1-ART-07 comp 10). The Content Collaboration
   Agreement in force, as the API serves it (P8-FE-07; v2 approved
   2026-10-22), a real checkbox whose tick draws in, and the recording note.
   The body is rendered verbatim: the application sends back its hash, so
   nothing here may reflow or trim it.

   P8-FE-03 — below it, the applicant's own rules (school, league, local):
   the wording from GET /public/rules-attestation and a second tick box, for
   an adult. A minor is told their guardian confirms this on the guardian's
   own page, and sees no box. Either wording unavailable, its block says so
   and the application waits. The Submit button itself lives in the wizard's
   action bar and is gated on both ticks (one, for a minor).
   -------------------------------------------------------------------------- */

export function JoinAgreementStep({
  agreement,
  accepted,
  onAcceptedChange,
  rules = null,
  minor = false,
  rulesAccepted = false,
  onRulesAcceptedChange,
}: {
  agreement: CollabAgreement | null;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  rules?: ApiRulesWording | null;
  minor?: boolean;
  rulesAccepted?: boolean;
  onRulesAcceptedChange?: (accepted: boolean) => void;
}) {
  return (
    <div className="space-y-7">
      <section aria-label="Content Collaboration Agreement" className="space-y-4">
        {agreement ? (
          <>
            <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line bg-surface-2 p-5">
              <pre
                data-agreement-body
                tabIndex={0}
                aria-label="Content Collaboration Agreement text"
                className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-muted"
              >
                {agreement.body}
              </pre>
            </div>
            <Tick checked={accepted} onChange={onAcceptedChange} label={AGREEMENT.checkbox(agreement.version)} />
            <p className="text-xs leading-relaxed text-faint">{AGREEMENT.recordNote}</p>
          </>
        ) : (
          <p role="status" className="rounded-xl border border-line bg-surface-2 p-5 text-sm leading-relaxed text-muted">
            {AGREEMENT.unavailable}
          </p>
        )}
      </section>

      <section aria-label={RULES_WORDS.title} className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight text-text">{RULES_WORDS.title}</h2>
        {minor ? (
          <p role="status" className="rounded-xl border border-accent/50 border-l-2 border-l-accent bg-surface-2 p-4 text-sm leading-relaxed text-accent">
            {RULES_WORDS.guardianAsks}
          </p>
        ) : rules ? (
          <>
            <div className="max-h-[30vh] overflow-y-auto rounded-xl border border-line bg-surface-2 p-5">
              <pre
                data-rules-body
                tabIndex={0}
                aria-label="Rules wording"
                className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-muted"
              >
                {rules.text}
              </pre>
            </div>
            <Tick checked={rulesAccepted} onChange={(v) => onRulesAcceptedChange?.(v)} label={RULES_WORDS.checkbox(rules.version)} />
            <p className="text-xs leading-relaxed text-faint">{RULES_WORDS.recordNote}</p>
          </>
        ) : (
          <p role="status" className="rounded-xl border border-line bg-surface-2 p-5 text-sm leading-relaxed text-muted">
            {RULES_WORDS.unavailable}
          </p>
        )}
      </section>
    </div>
  );
}

/* A real checkbox (sr-only, so it keeps its role and keyboard) whose visible
   box is drawn beside the words — the tick animates in via sx-join-draw. */
function Tick({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3.5 rounded-xl border border-line bg-surface-2 p-4">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${
          checked ? "bg-primary" : "bg-text"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-cta-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0s" } as React.CSSProperties} />
          </svg>
        )}
      </span>
      <span className="text-sm leading-relaxed text-text">{label}</span>
    </label>
  );
}

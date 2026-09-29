"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decideOnboardingAction } from "@/app/(app)/admin/onboarding/actions";
import {
  DECISION_COPY,
  decisionNeedsNote,
  legalDecisions,
  noDecisionReason,
  type OnboardingDecision,
  type OnboardingState,
} from "@/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-02 — the decision panel on one application. Only the moves the API
   accepts from its state are offered (PENDING_REVIEW → approve / request
   changes / reject; APPROVED → suspend; SUSPENDED → reinstate), a note is
   required where the applicant is told why, and a refusal — e.g. the
   primary contact's email already has an account — is shown in the API's
   own words.
   -------------------------------------------------------------------------- */

const TONE: Record<OnboardingDecision, string> = {
  APPROVE: "border-accent/60 bg-accent/10 text-accent",
  REQUEST_CHANGES: "border-primary/60 bg-primary/10 text-primary-soft",
  REJECT: "border-danger/60 bg-danger/10 text-danger",
  SUSPEND: "border-danger/60 bg-danger/10 text-danger",
  REINSTATE: "border-accent/60 bg-accent/10 text-accent",
};

export function OnboardingDecisionPanel({ id, state }: { id: string; state: OnboardingState }) {
  const router = useRouter();
  const options = legalDecisions(state);
  const [decision, setDecision] = useState<OnboardingDecision | null>(options.length === 1 ? options[0]! : null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (options.length === 0) return <p className="text-xs text-muted">{noDecisionReason(state)}</p>;

  const needNote = decision ? decisionNeedsNote(decision) : false;
  const ready = decision !== null && (!needNote || notes.trim().length > 0);

  const record = () => {
    if (!decision || !ready) return;
    setMessage(null);
    start(async () => {
      const r = await decideOnboardingAction(id, state, decision, notes);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setDone(DECISION_COPY[decision].done);
      setNotes("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
        {options.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={decision === d}
            onClick={() => {
              setDecision(d);
              setMessage(null);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${decision === d ? TONE[d] : "border-line text-muted hover:text-text"}`}
          >
            {DECISION_COPY[d].label}
          </button>
        ))}
      </div>
      {decision && <p className="text-[11px] text-muted">{DECISION_COPY[decision].hint}</p>}
      <label className="block text-xs font-medium">
        Note to the applicant {needNote ? <span className="text-warn">(required)</span> : <span className="text-faint">(optional)</span>}
        <textarea
          rows={3}
          value={notes}
          maxLength={4000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={decision === "REQUEST_CHANGES" ? "What needs to change, and why" : "Why — the applicant reads this"}
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
        />
      </label>
      <button
        type="button"
        disabled={!ready || pending}
        onClick={record}
        className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Recording…" : decision ? `Record: ${DECISION_COPY[decision].label}` : "Pick a decision"}
      </button>
      {done && !message && <p className="text-xs text-accent">{done} — recorded against your account.</p>}
      {message && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

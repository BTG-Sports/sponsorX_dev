"use client";

import { decideOnboardingAction } from "@/app/(app)/admin/onboarding/actions";
import type { UiGlyph } from "@/components/athlete-inventory/glyphs";
import { Decide, type DecideChoice } from "@/components/record-decide";
import {
  decisionCopy,
  decisionNeedsNote,
  legalDecisions,
  type OnboardingDecision,
  type OnboardingState,
} from "@/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-02 — the decision on one application. Only the moves the API
   accepts from its state are offered (PENDING_REVIEW → approve / request
   changes / reject; APPROVED → suspend, or reject (2S1-FE-05: BTG's check
   after the automatic approval); SUSPENDED → reinstate; REJECTED after an
   approval → reinstate), a note is
   required where the applicant is told why, and a refusal — e.g. the
   primary contact's email already has an account — is shown in the API's
   own words.

   POL-FE-108 — nothing about deciding sits on the page any more. It was a
   panel of pills, a note box and a disabled "Pick a decision" button. Now it
   is one button beside the organization's name ("Make a decision", "Suspend
   or reject", "Reinstate"), and the choices, what each does and the note
   live in the popup it opens (record-decide.tsx). A state with nothing to
   decide draws no button. The decisions, the server action and the refusals
   are unchanged.
   -------------------------------------------------------------------------- */

const LOOK: Record<OnboardingDecision, { icon: UiGlyph; kind: "go" | "ask" | "stop" }> = {
  APPROVE: { icon: "check", kind: "go" },
  REQUEST_CHANGES: { icon: "edit", kind: "ask" },
  REJECT: { icon: "ban", kind: "stop" },
  SUSPEND: { icon: "pause", kind: "stop" },
  REINSTATE: { icon: "undo", kind: "go" },
};

export function OnboardingDecisionPanel({ id, name, state, lede, hadProperty = false }: {
  id: string;
  /** The organization's name, for the popup's title. */
  name: string;
  state: OnboardingState;
  /** Where it stands, in a sentence — the popup opens on it. */
  lede: string;
  hadProperty?: boolean;
}) {
  const options = legalDecisions(state, hadProperty);
  const choices: DecideChoice[] = options.map((d) => {
    const c = decisionCopy(d, state);
    return {
      key: d,
      label: c.label,
      text: c.hint,
      ...LOOK[d],
      note: {
        need: decisionNeedsNote(d) ? "required" : "optional",
        label: "Note to the applicant",
        placeholder: d === "REQUEST_CHANGES" ? "What needs to change, and why" : "Why — the applicant reads this",
      },
    };
  });

  return (
    <Decide
      title={`Decide on ${name}`}
      lede={lede}
      choices={choices}
      /* an approved organization: nothing is waiting, so the button is outlined */
      quiet={state === "APPROVED"}
      buttonLabel={state === "APPROVED" ? "Suspend or reject" : undefined}
      submit={(key, note) => decideOnboardingAction(id, state, key as OnboardingDecision, note, hadProperty)}
    />
  );
}

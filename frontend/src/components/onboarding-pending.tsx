"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { approvalTodo, dateLabel, type ApiOnboarding } from "@/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-04 — a submitted application that is not approved yet (2S1-BE-06).
   It shows exactly what is still missing — the API's own reasons — and
   lets the applicant finish it here: upload the missing documents, or send
   the email link again. The answers stay locked; the papers don't. When the
   last check passes the API approves it, and the page reloads to say so.
   -------------------------------------------------------------------------- */

export function OnboardingPending({ token, initial }: { token: string; initial: ApiOnboarding }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const todo = approvalTodo(view);
  /* Reasons the applicant can't fix here — a name already held, an address with a login — are BTG's to settle. */
  const forBtg = view.reviewReasons.filter((r) => !r.startsWith("Missing document") && !r.startsWith("The primary contact hasn't confirmed"));

  const onView = (v: ApiOnboarding) => {
    setView(v);
    if (v.state !== "PENDING_REVIEW") router.refresh();
  };

  return (
    <div className="space-y-4 text-sm text-muted">
      {todo.length > 0 ? (
        <>
          <p className="text-base font-semibold text-text">Almost there — a few things are still missing.</p>
          <p>Submitted {dateLabel(view.submittedAt)}. As soon as everything below is ticked, we approve {view.orgName} automatically and email the primary contact.</p>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-text">BTG is looking at your application.</p>
          <p>Submitted {dateLabel(view.submittedAt)}. Everything you could send is in. You&rsquo;ll hear back by email at the primary contact&rsquo;s address.</p>
        </>
      )}
      {forBtg.length > 0 && (
        <ul aria-label="Why it is with BTG" className="space-y-1.5 rounded-lg border border-warn/40 bg-warn/8 px-3 py-2.5 text-xs text-text">
          {forBtg.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <OnboardingChecklist token={token} view={view} onView={onView} />
      <p className="text-[11px] text-faint">Your answers are locked while this is checked. If BTG asks for changes, this page opens for editing again.</p>
    </div>
  );
}

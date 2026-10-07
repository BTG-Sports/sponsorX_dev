"use client";

import { useState, useTransition } from "react";

import { renewLinkAction } from "@/app/(public)/links/actions";
import { EXPIRED_LINE, renewOutcome } from "@/lib/link-expired";

/* --------------------------------------------------------------------------
   2S8-FE-01 — the one notice every emailed link shows once it is older than
   14 days (2S8-PMO-02, owner decision 4). The pages keep their own shells
   and render this card where their "isn't valid" card goes; `kind` is the
   one the API named in its 410 (or the page's own), `token` the link that
   expired, `what` the link in the person's words ("the sign-up link").

   One button, "Send me a fresh link" → renewLinkAction → POST
   /public/links/renew, then the outcome line. The button is spent after a
   send, whatever the answer: the API sends one email an hour per link
   anyway, and a second press would only count against the address.
   Styled like the pages' Plain notice (onboarding/confirm/page.tsx).
   -------------------------------------------------------------------------- */

export function LinkExpired({ kind, token, what = "this link", level = "h1" }: { kind: string; token: string; what?: string; level?: "h1" | "h2" }) {
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const Heading = level;
  const spent = outcome !== null;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
      <Heading className="text-xl font-semibold tracking-tight">This link has expired</Heading>
      <div className="space-y-2 text-sm text-muted">
        <p>
          {EXPIRED_LINE} We can email you a fresh copy of {what} — it goes to the address we already have, so nothing else is needed.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || spent}
          onClick={() =>
            start(async () => {
              const r = await renewLinkAction(kind, token);
              setOutcome(renewOutcome(r.status));
            })
          }
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send me a fresh link"}
        </button>
        {outcome && (
          <p role={outcome.ok ? "status" : "alert"} className={`text-sm ${outcome.ok ? "text-success" : "text-danger"}`}>
            {outcome.text}
          </p>
        )}
      </div>
    </div>
  );
}

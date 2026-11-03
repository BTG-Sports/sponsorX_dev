"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { changeRequestEmailAction, resendConfirmationAction } from "@/app/(public)/sponsor-request/actions";
import { Button } from "@/components/ui";
import { emailFixRefusal, looksLikeEmail, SPONSORX_UNREACHABLE } from "@/lib/sponsor-request-live";

/* --------------------------------------------------------------------------
   POL-FE-18 (polish.md §18) — on the status page, while the request is NEW
   and the address unconfirmed, the applicant can get the confirmation email
   again or correct a mistyped address, instead of only being told to check
   their inbox. Against POL-BE-18:

     Resend email  → resendConfirmationAction   → "Sent to {email}."
     Change email  → an email field, then changeRequestEmailAction
                     → "Sent to {email}.", the address shown here changes at
                       once, and router.refresh() lets the server page re-read.

   The copy for a refusal is emailFixRefusal (lib/sponsor-request-live.ts):
   422 same address, 429 too many (3 an hour per request and per network
   address — both buttons stay off after one), 409 something changed (the
   address was just confirmed, or the request decided — said, then the page
   refreshes, which takes this island away), 400 not an email (also checked
   here before the call), network unreachable, 5xx our side. Nothing here is
   BTG's — only the applicant's own address.
   -------------------------------------------------------------------------- */

type Busy = "resend" | "change" | null;

export function SponsorEmailFix({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const fieldId = useId();
  const [current, setCurrent] = useState(email);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** After a 429 the API refuses for an hour; the buttons say so instead of inviting a fourth try. */
  const [locked, setLocked] = useState(false);
  /* QA pass 3 (2026-11-03): a double click fired the write twice — React batches the busy state, so each click's closure still saw it idle. A ref flips synchronously. */
  const inFlight = useRef(false);

  const off = busy !== null || locked;

  const refused = (status: number, message: string) => {
    setError(message);
    if (status === 429) setLocked(true);
    /* 409: the request moved on under us (confirmed, decided) — the server page knows; let it re-read. */
    if (status === 409) router.refresh();
  };

  const resend = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setSent(null);
    setBusy("resend");
    try {
      const r = await resendConfirmationAction(token).catch(() => ({ ok: false as const, status: 0, message: SPONSORX_UNREACHABLE }));
      if (!r.ok) return refused(r.status, r.message);
      setSent(r.email);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const change = async () => {
    setError(null);
    setSent(null);
    const next = draft.trim();
    if (!looksLikeEmail(next)) return setError(emailFixRefusal(400));
    if (next.toLowerCase() === current.toLowerCase()) return setError(emailFixRefusal(422));
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("change");
    try {
      const r = await changeRequestEmailAction(token, next).catch(() => ({ ok: false as const, status: 0, message: SPONSORX_UNREACHABLE }));
      if (!r.ok) return refused(r.status, r.message);
      setCurrent(r.email);
      setSent(r.email);
      setDraft("");
      setEditing(false);
      /* The standing card and the heading read the address from the server page: let it re-read. */
      router.refresh();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-text">
        <span className="text-muted">Address on your request: </span>
        <span className="font-medium break-all">{current}</span>
      </p>

      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void resend()} disabled={off} title={locked ? "Try again in an hour." : undefined}>
            {busy === "resend" ? "Sending…" : "Resend email"}
          </Button>
          <Button
            variant="ghost"
            disabled={off}
            title={locked ? "Try again in an hour." : undefined}
            onClick={() => {
              setError(null);
              setSent(null);
              setEditing(true);
            }}
          >
            Change email
          </Button>
        </div>
      )}

      {editing && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void change();
          }}
        >
          <label htmlFor={fieldId} className="block text-[11px] font-medium text-muted">
            The right email address
          </label>
          <input
            id={fieldId}
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            required
            maxLength={100}
            value={draft}
            disabled={off}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="you@yourbusiness.com"
            className="block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          />
          <p className="text-[11px] text-faint">We&rsquo;ll send the confirmation link there instead. Links sent to the old address stop working.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={off || !draft.trim()}
              className="sx-btn-primary inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "change" ? "Sending…" : "Send it there"}
            </button>
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => {
                setEditing(false);
                setDraft("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {busy && (
        <p aria-live="polite" className="text-xs text-muted">
          Sending the confirmation email…
        </p>
      )}
      {sent && !busy && (
        <p aria-live="polite" className="text-sm font-medium text-success">
          Sent to {sent}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

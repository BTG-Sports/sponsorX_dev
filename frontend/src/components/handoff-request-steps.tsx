"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmDocAction, requestDocAction, submitAction } from "@/app/(public)/guardian/handoff/actions";
import { GuardianAgreementText } from "@/components/guardian-agreement";
import { PrivateFileUpload } from "@/components/private-file-upload";
import { PROOF_KINDS, guardianAgreement, handoffReady, type ApiHandoffRequest } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   The rest of the new guardian's request — 2S1-FE-10 (design
   GuardianHandoff.dc.html, "request", steps 3–5), on /guardian/handoff?r=.

   Confirm the email (the link we sent), upload the government ID and the
   proof of guardianship straight to the private bucket, accept the guardian
   agreement, and Send. Send is off until the API says the email is
   confirmed and both files have arrived, and the box is ticked; the API
   checks all of it again (POST …/submit), and only then is the current
   guardian asked. Each confirmed upload re-reads the page.
   -------------------------------------------------------------------------- */

const card = "rounded-xl border border-line bg-surface p-4 sm:p-5";

export function HandoffRequestSteps({ token, request }: { token: string; request: ApiHandoffRequest }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [agreed, setAgreed] = useState(false);
  const [proofKind, setProofKind] = useState<string>(PROOF_KINDS[0].key);
  const [error, setError] = useState<string | null>(null);
  const a = request.athlete.firstName;
  const cur = request.current.firstName;
  const refresh = () => router.refresh();

  const send = () =>
    start(async () => {
      setError(null);
      const r = await submitAction(token).catch(() => ({ ok: false as const, message: "We couldn’t reach SponsorX just now. Nothing was sent — try again." }));
      if (!r.ok) return setError(r.message);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <section aria-label="Your email" className={`${card} space-y-1.5`}>
        <h2 className="text-sm font-semibold">Your email</h2>
        {request.emailConfirmed ? (
          <p className="text-xs text-success"><span aria-hidden="true">✓ </span>Confirmed</p>
        ) : (
          <p className="text-xs leading-relaxed text-warn">
            We emailed you a link. Open it to confirm this is your address — you can keep going here meanwhile.
          </p>
        )}
      </section>

      <section aria-label="Documents" className={`${card} grid gap-3 sm:grid-cols-2`}>
        <PrivateFileUpload
          label="3 · Government ID"
          done={request.idUploaded}
          doneText="ID received"
          request={(f) => requestDocAction(token, "GUARDIAN_ID", null, f)}
          confirm={(id) => confirmDocAction(token, id)}
          onDone={refresh}
        />
        <div className="space-y-2">
          <label className="flex flex-col text-xs font-medium">
            4 · Proof you&rsquo;re the guardian
            <select value={proofKind} onChange={(e) => setProofKind(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text focus:border-primary/60 focus:outline-none">
              {PROOF_KINDS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <PrivateFileUpload
            label="Upload the proof"
            done={request.proofUploaded}
            doneText="Proof received"
            request={(f) => requestDocAction(token, "GUARDIANSHIP_PROOF", proofKind, f)}
            confirm={(id) => confirmDocAction(token, id)}
            onDone={refresh}
          />
        </div>
      </section>

      <section aria-label="Agreement" className={`${card} space-y-2.5`}>
        <h2 className="text-sm font-semibold">5 · Guardian agreement</h2>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-primary-soft hover:underline">
            Read the guardian agreement <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">→</span>
          </summary>
          <div className="mt-2.5">
            <GuardianAgreementText agreement={guardianAgreement(a)} />
          </div>
        </details>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-normal">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--sx-primary)]" />
          I&rsquo;m {a}&rsquo;s guardian and I accept the guardian agreement.
        </label>
      </section>

      {request.missing && request.missing.length > 0 && (
        <p className="text-xs text-muted">Still to do: {request.missing.join(", ")}.</p>
      )}
      <button type="button" onClick={send} disabled={pending || !handoffReady(request, agreed)} aria-busy={pending}
        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink disabled:cursor-not-allowed disabled:opacity-40">
        {pending ? "Sending…" : `Send request to ${cur}`}
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

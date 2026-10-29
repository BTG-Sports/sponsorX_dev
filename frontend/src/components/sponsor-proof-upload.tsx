"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { confirmProofUploadAction, requestProofUploadAction } from "@/app/(public)/sponsor-request/actions";
import { SponsorRequestStanding } from "@/components/sponsor-request-standing";
import { CHECKING_WORDS, confirmFailureKind } from "@/lib/document-checks-live";
import { checkProof, type ApiSponsorRequestStatus } from "@/lib/sponsor-request-live";

/* --------------------------------------------------------------------------
   2S1-FE-11 (form half) — the sponsor's proof of business, uploaded with the
   requestToken. onboarding-wizard.tsx's DocumentsStep, exactly: ask the API
   for a presigned PUT (requestProofUploadAction), send the bytes straight to
   the private bucket from the browser — never through the Next server — then
   confirm (confirmProofUploadAction), which the API counts only if the file
   is really there.

   P8-FE-11 — the confirm step now opens and reads the file (P8-BE-09 /
   -11): "Checking your document…" while it runs; a refused file's reason
   under the upload with Try again (a new file pick). "Check again" (confirm
   the same document once more) is kept for when nothing answered.

   After a confirmed upload: `after="show"` (the brief's submitted screen)
   shows where the request now stands right here; `after="refresh"` (the
   status page) re-renders the server page, which reads the status itself.
   `disabledReason` keeps the control visible but inert, e.g. the demo.
   -------------------------------------------------------------------------- */

export function SponsorProofUpload({
  token,
  after,
  email,
  disabledReason,
  onStatus,
}: {
  token: string;
  after: "show" | "refresh";
  email?: string;
  disabledReason?: string;
  /** Told about every confirmed upload — the wizard keeps "proof sent" in its draft. */
  onStatus?: (s: ApiSponsorRequestStatus) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; kind: "try-again" | "check-again" } | null>(null);
  const [pending, setPending] = useState<{ id: string; filename: string } | null>(null);
  const [status, setStatus] = useState<ApiSponsorRequestStatus | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const confirm = async (id: string) => {
    setBusy(CHECKING_WORDS);
    const c = await confirmProofUploadAction(token, id).catch(() => ({ ok: false as const, status: 0, message: "Couldn't reach SponsorX just now. Use Check again in a moment." }));
    if (!c.ok) {
      const kind = confirmFailureKind(c.status);
      if (kind === "try-again") setPending(null);
      setError({ message: c.message, kind });
      return;
    }
    setPending(null);
    onStatus?.(c.status);
    if (after === "refresh") router.refresh();
    else setStatus(c.status);
  };

  const upload = async (file: File) => {
    setError(null);
    const problem = checkProof({ name: file.name, type: file.type, size: file.size });
    if (problem) return setError({ message: problem, kind: "try-again" });
    setBusy(`Uploading ${file.name}…`);
    try {
      const g = await requestProofUploadAction(token, { filename: file.name, contentType: file.type, bytes: file.size });
      if (!g.ok) return setError({ message: g.message, kind: "try-again" });
      setPending({ id: g.document.id, filename: g.document.filename });
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: file });
      } catch {
        return setError({ message: "The upload didn't reach storage. Check your connection, then use Check again — or upload the file again.", kind: "check-again" });
      }
      if (!put.ok) return setError({ message: "Storage refused the upload. Try the file again.", kind: "try-again" });
      await confirm(g.document.id);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const recheck = async (id: string) => {
    setError(null);
    try {
      await confirm(id);
    } finally {
      setBusy(null);
    }
  };

  if (status && after === "show") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-success">Proof of business received.</p>
        <SponsorRequestStanding status={status} email={email} />
      </div>
    );
  }

  const off = busy !== null || Boolean(disabledReason);
  return (
    <div className="space-y-2">
      <label className="block" title={disabledReason}>
        <span className="text-[11px] font-medium text-muted">Proof of business — PDF, JPEG or PNG</span>
        <input
          ref={input}
          type="file"
          name="proof"
          accept="application/pdf,image/jpeg,image/png"
          disabled={off}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          className="mt-1.5 block w-full text-xs text-muted file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3.5 file:py-2 file:text-xs file:font-medium file:text-text disabled:opacity-60"
        />
      </label>
      {pending && !busy && error?.kind === "check-again" && (
        <p className="flex flex-wrap items-center gap-2 text-[11px] text-warn">
          {pending.filename} — not received yet
          <button type="button" onClick={() => recheck(pending.id)} className="underline">
            Check again
          </button>
        </p>
      )}
      {busy && (
        <p aria-live="polite" className="text-xs text-muted">
          {busy}
        </p>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2.5 text-xs text-danger">
          <span className="min-w-0 break-words">{error.message}</span>
          {error.kind === "try-again" && !off && (
            <button type="button" onClick={() => input.current?.click()}
              className="min-h-9 rounded-lg border border-danger/50 px-3.5 text-xs font-semibold text-danger hover:bg-danger/10">
              Try again
            </button>
          )}
        </div>
      )}
      {disabledReason && <p className="text-[11px] text-faint">{disabledReason}</p>}
      <p className="text-[11px] text-faint">
        It goes straight to private storage. Only BTG reviewers can open it — you can&rsquo;t open it again from here.
      </p>
    </div>
  );
}

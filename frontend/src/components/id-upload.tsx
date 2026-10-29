"use client";

import { useRef, useState } from "react";

import { CHECKING_WORDS, confirmFailureKind, returnedAsk, type ApiDocumentReturned } from "@/lib/document-checks-live";
import { ID_UPLOAD, idFileProblem } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   One ID upload, from the browser straight to the private bucket — 2S1-FE-06
   / -08: the athlete's government or school ID (/join), the guardian's ID and
   proof (/guardian/setup), the government ID that takes over an account on
   coming of age. The sponsor proof upload's flow, generalised:

     1. `request` asks the API (through the page's server action) for a PUT
        URL for exactly this file — PDF, JPEG or PNG, at most 10 MB, checked
        here first so a wrong file never asks;
     2. the browser PUTs the bytes to that URL — never through the Next
        server;
     3. `confirm` tells the API, which counts it only if the file is there.

   P8-FE-11 — the confirm step now opens and reads the file (P8-BE-09 /
   -11), so it shows "Checking your document…" and takes a few seconds. A
   refused file (422) comes back with a plain-words reason, shown under the
   upload with Try again — a new file pick. Only when nothing answered (the
   bytes may well be in storage) does "Check again" confirm the same
   document once more. A document BTG sent back (`returned`) says so over
   the picker. `onDone` hears the page's new status.
   -------------------------------------------------------------------------- */

type Grant = { ok: true; documentId: string; filename: string; uploadUrl: string; contentType: string } | { ok: false; message: string };
type Confirmed<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

export function IdUpload<T>({
  title,
  hint,
  request,
  confirm,
  onDone,
  disabledReason,
  doneLabel,
  returned,
}: {
  title: string;
  hint?: string;
  request: (file: { filename: string; contentType: string; bytes: number }) => Promise<Grant>;
  confirm: (documentId: string) => Promise<Confirmed<T>>;
  onDone: (status: T) => void;
  disabledReason?: string;
  /** Shown instead of the picker once something is in. */
  doneLabel?: string | null;
  /** P8-FE-11 — BTG sent the last one back, and why. */
  returned?: ApiDocumentReturned;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; kind: "try-again" | "check-again" } | null>(null);
  const [pending, setPending] = useState<{ id: string; filename: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const finish = async (id: string) => {
    setBusy(CHECKING_WORDS);
    const c = await confirm(id).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now. Use Check again in a moment.", status: 0 }));
    if (!c.ok) {
      const kind = confirmFailureKind(c.status);
      if (kind === "try-again") setPending(null);
      return setError({ message: c.message, kind });
    }
    setPending(null);
    onDone(c.data);
  };

  const upload = async (file: File) => {
    setError(null);
    const problem = idFileProblem({ type: file.type, size: file.size });
    if (problem) return setError({ message: problem, kind: "try-again" });
    setBusy(`Uploading ${file.name}…`);
    try {
      const g = await request({ filename: file.name, contentType: file.type, bytes: file.size });
      if (!g.ok) return setError({ message: g.message, kind: "try-again" });
      setPending({ id: g.documentId, filename: g.filename });
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: file });
      } catch {
        return setError({ message: "The upload didn't reach storage. Check your connection, then use Check again — or upload the file again.", kind: "check-again" });
      }
      if (!put.ok) return setError({ message: "Storage refused the upload. Try the file again.", kind: "try-again" });
      await finish(g.documentId);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const off = busy !== null || Boolean(disabledReason);
  const ask = returnedAsk(returned ?? null);
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
      <span className="text-sm font-medium text-text">{title}</span>
      <span>{hint ?? ID_UPLOAD.label}</span>
      {ask && !doneLabel && (
        <span role="status" className="break-words rounded-lg border border-warn/40 bg-warn/8 px-3 py-2 text-left text-[12px] leading-relaxed text-text">
          <span aria-hidden="true">↩ </span>{ask}
        </span>
      )}
      {doneLabel && <span className="font-semibold text-success">✓ {doneLabel}</span>}
      <label title={disabledReason} className={`mt-1 inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2 ${off ? "pointer-events-none opacity-40" : ""}`}>
        {doneLabel ? "Replace file" : ask ? "Upload a new one" : "Choose file"}
        <input
          ref={input}
          type="file"
          accept={ID_UPLOAD.accept}
          disabled={off}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      {pending && !busy && error?.kind === "check-again" && (
        <span className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-warn">
          {pending.filename} — not received yet
          <button type="button" className="underline" onClick={() => { setError(null); void finish(pending.id).finally(() => setBusy(null)); }}>
            Check again
          </button>
        </span>
      )}
      {busy && <span aria-live="polite">{busy}</span>}
      {error && (
        <span role="alert" className="flex flex-col items-center gap-1.5 text-danger">
          <span className="break-words">{error.message}</span>
          {error.kind === "try-again" && !off && (
            <button type="button" onClick={() => input.current?.click()}
              className="min-h-9 rounded-lg border border-danger/50 px-3.5 text-xs font-semibold text-danger hover:bg-danger/10">
              Try again
            </button>
          )}
        </span>
      )}
      {disabledReason && <span className="text-[11px] text-faint">{disabledReason}</span>}
      <span className="text-[11px] text-faint">It goes straight to private storage. Only BTG&rsquo;s reviewers can open it, and each view is recorded.</span>
    </div>
  );
}

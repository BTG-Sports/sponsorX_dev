"use client";

import { useRef, useState } from "react";

import { idFileProblem, ID_UPLOAD } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   A file that goes straight to the PRIVATE bucket — 2S1-FE-09 (the ID for a
   new legal name) and 2S1-FE-10 (the new guardian's ID and proof). The
   pattern of sponsor-proof-upload.tsx and the onboarding wizard: ask the API
   for a presigned PUT (`request`), send the bytes from the browser — never
   through the Next server — then `confirm`, which the API counts only if the
   file is really there. A PUT that worked but a confirm that didn't leaves
   "Check again" rather than a second upload.

   PDF, JPEG or PNG, at most 10 MB (agreed 2026-10-01), checked here first so
   a wrong file is refused before anything is sent.
   -------------------------------------------------------------------------- */

export type UploadGrant = { ok: true; id: string; uploadUrl: string; contentType: string } | { ok: false; message: string };
export type UploadDone = { ok: true } | { ok: false; message: string };

export function PrivateFileUpload({
  label, hint, done, doneText, request, confirm, onDone, disabledReason,
}: {
  label: string;
  hint?: string;
  /** Already received — the control says so and offers a replacement. */
  done?: boolean;
  doneText?: string;
  request: (file: { filename: string; contentType: string; bytes: number }) => Promise<UploadGrant>;
  confirm: (id: string) => Promise<UploadDone>;
  onDone?: () => void;
  disabledReason?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; filename: string } | null>(null);
  const [received, setReceived] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pendingName = useRef<string | null>(null);

  const finish = async (id: string) => {
    const c = await confirm(id).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now. Use Check again in a moment." }));
    if (!c.ok) return setError(c.message);
    setPending(null);
    setReceived(pendingName.current ?? "File");
    onDone?.();
  };

  const upload = async (file: File) => {
    setError(null);
    const problem = idFileProblem({ type: file.type, size: file.size });
    if (problem) return setError(problem);
    setBusy(`Uploading ${file.name}…`);
    try {
      const g = await request({ filename: file.name, contentType: file.type, bytes: file.size })
        .catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now. Nothing was sent — try again." }));
      if (!g.ok) return setError(g.message);
      setPending({ id: g.id, filename: file.name });
      pendingName.current = file.name;
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: file });
      } catch {
        return setError("The upload didn't reach storage. Check your connection, then use Check again — or choose the file again.");
      }
      if (!put.ok) return setError("Storage refused the upload. Choose the file again.");
      await finish(g.id);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const recheck = async (id: string) => {
    setError(null);
    setBusy("Checking the upload…");
    try {
      await finish(id);
    } finally {
      setBusy(null);
    }
  };

  const shownDone = received ?? (done ? doneText ?? "Uploaded" : null);
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
      <span className="text-sm font-medium text-text">{label}</span>
      {hint && <span>{hint}</span>}
      <span>{ID_UPLOAD.label}. Only BTG&rsquo;s reviewers can open it, and each view is recorded.</span>
      {shownDone && (
        <span className="font-medium text-success">
          <span aria-hidden="true">✓ </span>
          {received ? `${received} received` : shownDone}
        </span>
      )}
      <label title={disabledReason} className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2 has-disabled:cursor-not-allowed has-disabled:opacity-40">
        {shownDone ? "Replace file" : "Choose file"}
        <input
          ref={input}
          type="file"
          accept={ID_UPLOAD.accept}
          disabled={busy !== null || Boolean(disabledReason)}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      {pending && !busy && error && (
        <span className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-warn">
          {pending.filename} — not received yet
          <button type="button" onClick={() => recheck(pending.id)} className="underline">
            Check again
          </button>
        </span>
      )}
      {busy && <span aria-live="polite">{busy}</span>}
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
      {disabledReason && <span className="text-[11px] text-faint">{disabledReason}</span>}
    </div>
  );
}

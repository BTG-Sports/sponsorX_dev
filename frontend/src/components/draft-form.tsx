"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { draftFileAction, presignDraftAction, submitDraftAction } from "@/app/(app)/next/assignments/actions";
import { fileSizeWords, putFile, UploadError } from "@/lib/direct-upload";
import { DRAFT_FILE_WORDS, draftProblem, MAX_DRAFT_TEXT } from "@/lib/student-assignments-live";
import type { AssignmentRow } from "./student-assignments";
import { Button } from "./ui";

/* --------------------------------------------------------------------------
   P9-FE-12 — the student's draft, in the assignment drawer. Words, a file
   (straight to the private bucket on a signed PUT), or both. Submitting
   sends it to the advisor (who is emailed); while they review it, it can't
   change. A change request reopens it, prefilled with the last draft, and
   the last file is kept unless the student unticks it or attaches a new one.

   P9-FE-13 (P9-BE-25) — the file is any format, up to 2 GB: a photo, a
   video, a PDF, a design file. The PUT carries the Content-Type the grant
   ANSWERED, not `file.type` — the grant is signed for it, and a file the
   browser can't name (an .indd) has no type of its own. A big file shows its
   progress, and can be cancelled.
   -------------------------------------------------------------------------- */

/* The primary Button's look, on a real submit button (Button is type="button"). */
const submitCls = "sx-btn-primary inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40";
const field = "w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs leading-relaxed text-text placeholder:text-faint focus:border-next focus:outline-none";

export function DraftForm({ id, live }: { id: string; live: NonNullable<AssignmentRow["live"]> }) {
  const router = useRouter();
  const [text, setText] = useState(live.draftText ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [keepFile, setKeepFile] = useState(live.hasFile);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /* A ref, flipped at once: a double click must not send the draft twice. */
  const sending = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const openFile = async () => {
    const r = await draftFileAction(id);
    if (r.ok) window.open(r.url, "_blank", "noopener");
    else setMessage({ ok: false, text: r.message });
  };

  if (!live.canSubmit) {
    return (
      <div className="space-y-2">
        {live.draftText && (
          <details className="rounded-lg border border-line-soft p-3 text-xs">
            <summary className="cursor-pointer text-muted">Your submitted draft (version {live.version})</summary>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-text">{live.draftText}</p>
          </details>
        )}
        {live.hasFile && <Button variant="secondary" full onClick={openFile}>Open your file</Button>}
        <p className="text-center text-[11px] text-muted">
          {live.stage === "APPROVED" ? "Approved — it's in the edition." : "Your advisor is reviewing it. You can change it if they ask for changes."}
        </p>
        {message && <p role="alert" className="text-[11px] text-danger">{message.text}</p>}
      </div>
    );
  }

  const submit = async () => {
    if (sending.current) return;
    const problem = draftProblem({ text, file: file ? { type: file.type, size: file.size } : null, keepFile: live.hasFile && keepFile });
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      let key: string | null = null;
      if (file) {
        const g = await presignDraftAction(id, file.type, file.size).catch(() => ({ ok: false as const, message: "SponsorX couldn't be reached. Nothing was sent — try again in a minute." }));
        if (!g.ok) {
          setMessage({ ok: false, text: g.message });
          return;
        }
        abort.current = new AbortController();
        setProgress(0);
        try {
          /* The type the grant answered — what it was signed for. */
          await putFile(g.url, file, g.contentType, { onProgress: setProgress, signal: abort.current.signal });
        } catch (e) {
          const cancelled = e instanceof UploadError && e.failure.kind === "cancelled";
          setMessage({ ok: false, text: cancelled ? "Upload cancelled. Your draft wasn't sent." : "Your file didn't upload — check your connection and try again." });
          return;
        } finally {
          abort.current = null;
          setProgress(null);
        }
        key = g.key;
      }
      /* No new file: the last version's file stays unless the student unticked it. */
      const r = await submitDraftAction(id, text, key, keepFile).catch(() => ({ ok: false as const, message: "SponsorX couldn't be reached, so your draft wasn't sent. Try again in a minute." }));
      if (!r.ok) {
        setMessage({ ok: false, text: r.message });
        return;
      }
      setMessage({ ok: true, text: "Sent to your advisor." });
      router.refresh();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="Your draft"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block text-[11px] font-medium text-muted" htmlFor={`draft-${id}`}>
        {live.version > 0 ? `Your draft (version ${live.version + 1})` : "Your draft"}
      </label>
      <textarea
        id={`draft-${id}`}
        name="text"
        rows={8}
        maxLength={MAX_DRAFT_TEXT}
        className={field}
        placeholder="Write your piece here, or attach its file below."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label className="block text-[11px] font-medium text-muted" htmlFor={`file-${id}`}>
        File ({DRAFT_FILE_WORDS}) — optional
      </label>
      <input
        id={`file-${id}`}
        name="file"
        type="file"
        disabled={busy}
        className="block w-full text-[11px] text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <p className="text-[11px] text-muted [overflow-wrap:anywhere]">
          {file.name} · {fileSizeWords(file.size)}
        </p>
      )}
      {progress !== null && (
        <div aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
            <span className="min-w-0 truncate">Uploading your file — {progress}%</span>
            <button type="button" className="shrink-0 underline" onClick={() => abort.current?.abort()}>Cancel</button>
          </div>
          <div
            role="progressbar"
            aria-label="Uploading your file"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-next transition-[width] duration-200 ease-out" style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
        </div>
      )}
      {live.hasFile && !file && (
        <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" name="keepFile" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} />
            Keep the file from your last version
          </label>
          <button type="button" className="underline" onClick={openFile}>Open it</button>
        </p>
      )}
      {live.hasFile && file && <p className="text-[11px] text-muted">Your new file replaces the one from your last version.</p>}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-[11px] text-accent" : "text-[11px] text-danger"}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className={submitCls}>
        {progress !== null ? "Uploading…" : busy ? "Sending…" : live.version > 0 ? "Send the new version" : "Submit draft"}
      </button>
    </form>
  );
}

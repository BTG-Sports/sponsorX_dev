"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { draftFileAction, presignDraftAction, submitDraftAction } from "@/app/(app)/next/assignments/actions";
import { DRAFT_FILE_TYPES, draftProblem, MAX_DRAFT_TEXT } from "@/lib/student-assignments-live";
import type { AssignmentRow } from "./student-assignments";
import { Button } from "./ui";

/* --------------------------------------------------------------------------
   P9-FE-12 — the student's draft, in the assignment drawer. Words, a file
   (JPG, PNG or PDF — straight to the private bucket on a signed PUT), or
   both. Submitting sends it to the advisor; while they review it, it can't
   change. A change request reopens it, prefilled with the last draft.
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
    const problem = draftProblem({ text, file: file ? { type: file.type, size: file.size } : null, keepFile });
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    let key: string | null = null;
    if (file) {
      const g = await presignDraftAction(id, file.type, file.size);
      if (!g.ok) {
        setBusy(false);
        setMessage({ ok: false, text: g.message });
        return;
      }
      const put = await fetch(g.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(() => null);
      if (!put || !put.ok) {
        setBusy(false);
        setMessage({ ok: false, text: "Your file didn't upload — check your connection and try again." });
        return;
      }
      key = g.key;
    }
    /* The advisor reviews exactly what is sent: words only drops an earlier
       file (the API's rule), which is why the form asks to attach it again. */
    const r = await submitDraftAction(id, text, key);
    setBusy(false);
    if (!r.ok) {
      setMessage({ ok: false, text: r.message });
      return;
    }
    setMessage({ ok: true, text: "Sent to your advisor." });
    router.refresh();
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
        File (JPG, PNG or PDF, up to 20 MB) — optional
      </label>
      <input
        id={`file-${id}`}
        name="file"
        type="file"
        accept={DRAFT_FILE_TYPES.join(",")}
        className="block w-full text-[11px] text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-text"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setKeepFile(false);
        }}
      />
      {keepFile && !file && (
        <p className="text-[11px] text-muted">
          Your last version had a file. <button type="button" className="underline" onClick={openFile}>Open it</button> — attach it again to keep it in this version.
        </p>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-[11px] text-accent" : "text-[11px] text-danger"}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className={submitCls}>
        {busy ? "Sending…" : live.version > 0 ? "Send the new version" : "Submit draft"}
      </button>
    </form>
  );
}

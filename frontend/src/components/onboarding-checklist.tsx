"use client";

import { useRef, useState, useTransition } from "react";

import {
  confirmDocumentAction,
  readOnboardingAction,
  requestDocumentAction,
  resendConfirmationAction,
} from "@/app/(public)/onboarding/actions";
import { CHECKING_WORDS, confirmFailureKind, returnedAsk } from "@/lib/document-checks-live";
import {
  DOCUMENT_KINDS,
  checkDocument,
  dateLabel,
  documentKindLabel,
  fileSize,
  returnedFor,
  type ApiChecklistItem,
  type ApiOnboarding,
} from "@/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-04 — the applicant's live checklist (2S1-BE-06). One row per
   document this organisation type and state must have, ticked by the API
   from what has arrived in the private bucket — never by this screen — and
   the contact's email confirmation, with "send the link again".

   Used by the wizard's Documents and Review steps and by the "we're
   checking" page after submit: a submitted application still takes the
   documents it is missing, and the API approves it the moment the last
   check passes (the page then refreshes to the approved state).

   Each upload: POST …/documents (a private-bucket PUT for one key) → the
   browser PUTs the bytes straight to storage → POST …/confirm (counted only
   once it is really there) → GET the application again for the new ticks.

   P8-FE-11 — the confirm step now opens and reads the file (P8-BE-09 /
   -11): "Checking your document…" while it runs; a refused file's reason
   under the list with Try again (a new file pick for the same row). A
   document BTG sent back (P8-BE-10, `returnedAt` / `returnedReason` on the
   applicant's own list) says so on its row, over the Upload.
   -------------------------------------------------------------------------- */

type Target = { kind: string; stateCode: string | null; label: string };
type Problem = { message: string; kind: "try-again" | "check-again"; target: Target | null };

const btn = "inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3.5 text-xs font-semibold outline-none focus-within:ring-2 focus-within:ring-primary";

export function OnboardingChecklist({
  token,
  view,
  onView,
  showEmail = true,
}: {
  token: string;
  view: ApiOnboarding;
  onView: (v: ApiOnboarding) => void;
  showEmail?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [extraKind, setExtraKind] = useState("OTHER");
  const [pending, start] = useTransition();

  const refresh = async () => {
    const r = await readOnboardingAction(token);
    if (r.ok) onView(r.view);
  };

  const fail = (message: string, kind: Problem["kind"], target: Target | null) => setError({ message, kind, target });

  const upload = async (file: File, target: Target) => {
    setError(null);
    setNote(null);
    const { kind, stateCode } = target;
    const problem = checkDocument({ name: file.name, type: file.type, size: file.size }, 0, kind, Number.POSITIVE_INFINITY);
    if (problem) return fail(problem, "try-again", target);
    setBusy(`Uploading ${file.name}…`);
    try {
      const g = await requestDocumentAction(token, { kind, filename: file.name, contentType: file.type, bytes: file.size, stateCode });
      if (!g.ok) return fail(g.message, "try-again", target);
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: file });
      } catch {
        await refresh();
        return fail("The upload didn't reach storage. Check your connection, then use Check again — or upload the file again.", "check-again", target);
      }
      if (!put.ok) return fail("Storage refused the upload. Try the file again.", "try-again", target);
      setBusy(CHECKING_WORDS);
      const c = await confirmDocumentAction(token, g.document.id);
      if (!c.ok) fail(c.message, confirmFailureKind(c.status), target);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const recheck = async (id: string) => {
    setError(null);
    setBusy(CHECKING_WORDS);
    try {
      const c = await confirmDocumentAction(token, id);
      if (!c.ok) fail(c.message, confirmFailureKind(c.status), null);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const resend = () => {
    setError(null);
    start(async () => {
      const r = await resendConfirmationAction(token);
      if (!r.ok) return fail(r.message, "check-again", null);
      onView(r.view);
      setNote(`We sent the link again to ${r.view.contactEmail ?? "the primary contact"}.`);
    });
  };

  const notArrived = view.documents.filter((d) => !d.uploadedAt);
  const extras = view.documents.filter((d) => d.uploadedAt && !d.returnedAt && !view.checklist.some((c) => c.documentId === d.id));
  const disabled = busy !== null || pending;

  return (
    <div className="space-y-4">
      <ul aria-label="Required documents" className="divide-y divide-line-soft rounded-lg border border-line-soft">
        {view.checklist.map((c) => (
          <ChecklistRow key={c.key} item={c} view={view} disabled={disabled} onFile={(f) => void upload(f, { kind: c.kind, stateCode: c.stateCode, label: c.label })} />
        ))}
        {showEmail && (
          <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <Tick done={view.emailConfirmed} />
            <span className="min-w-0 grow basis-48">
              <span className="block text-sm font-medium">Confirm the primary contact&rsquo;s email</span>
              <span className="block break-words text-[11px] text-muted">
                {view.emailConfirmed
                  ? `Confirmed — ${view.contactEmail ?? ""}`
                  : view.contactEmail
                    ? `Open the link we emailed to ${view.contactEmail}.`
                    : "Add your contacts first — the link goes to the primary contact."}
              </span>
            </span>
            {!view.emailConfirmed && view.contactEmail && (
              <button type="button" onClick={resend} disabled={disabled} className={`${btn} border border-line text-text hover:bg-surface-2 disabled:opacity-40`}>
                Send the link again
              </button>
            )}
          </li>
        )}
      </ul>

      {notArrived.length > 0 && (
        <ul aria-label="Uploads not received" className="space-y-1.5">
          {notArrived.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-[11px] text-warn">
              <span className="min-w-0 break-words">{d.filename} — not received yet.</span>
              <button type="button" disabled={disabled} onClick={() => void recheck(d.id)} className="underline disabled:opacity-40">
                Check again
              </button>
            </li>
          ))}
        </ul>
      )}

      {extras.length > 0 && (
        <div>
          <p className="text-xs font-medium">Also on file</p>
          <ul className="mt-1 space-y-1 text-[11px] text-muted">
            {extras.map((d) => (
              <li key={d.id} className="break-words">
                {documentKindLabel(d.kind)}
                {d.stateCode ? ` (${d.stateCode})` : ""} · {d.filename} · {fileSize(d.bytes)} · received {dateLabel(d.uploadedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="block text-xs font-medium">
          Something else that helps BTG
          <select
            className="mt-1 block min-h-9 rounded-lg border border-line bg-surface px-2.5 text-xs text-text"
            value={extraKind}
            disabled={disabled}
            onChange={(e) => setExtraKind(e.target.value)}
          >
            {DOCUMENT_KINDS.filter((k) => k.key !== "BUSINESS_REGISTRATION").map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <FileButton label="Add a document" disabled={disabled} onFile={(f) => void upload(f, { kind: extraKind, stateCode: null, label: documentKindLabel(extraKind) })} quiet />
      </div>

      {busy && <p className="text-xs text-muted" role="status">{busy}</p>}
      {note && <p className="text-xs text-accent" role="status">{note}</p>}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2.5 text-xs text-danger">
          <span className="min-w-0 break-words">{error.message}</span>
          {error.kind === "try-again" && error.target && (
            <FileButton label="Try again" ariaLabel={`Try again: upload ${error.target.label}`} disabled={disabled} onFile={(f) => void upload(f, error.target!)} danger />
          )}
        </div>
      )}
      <p className="text-[11px] text-faint">PDF, JPEG or PNG — up to 20 MB, an ID up to 10 MB. Only BTG&rsquo;s reviewers can open them, and each view is recorded.</p>
    </div>
  );
}

function Tick({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${done ? "border-accent/50 bg-accent/12 text-accent" : "border-warn/50 text-warn"}`}
    >
      {done ? "✓" : "!"}
    </span>
  );
}

function ChecklistRow({ item, view, disabled, onFile }: { item: ApiChecklistItem; view: ApiOnboarding; disabled: boolean; onFile: (f: File) => void }) {
  const doc = item.documentId ? view.documents.find((d) => d.id === item.documentId) : undefined;
  const ask = returnedAsk(returnedFor(item, view.documents));
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <Tick done={item.done} />
      <span className="min-w-0 grow basis-48">
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="block break-words text-[11px] text-muted">
          {doc ? `${doc.filename} · received ${dateLabel(doc.uploadedAt)}` : "Still needed"}
        </span>
        {ask && (
          <span role="status" className="mt-1 block break-words rounded-lg border border-warn/40 bg-warn/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-text">
            <span aria-hidden="true">↩ </span>{ask}
          </span>
        )}
      </span>
      <span className="sr-only">{item.done ? "Done" : "Missing"}</span>
      {!item.done && <FileButton label={ask ? "Upload a new one" : "Upload"} ariaLabel={`Upload ${item.label}`} disabled={disabled} onFile={onFile} />}
    </li>
  );
}

function FileButton({ label, ariaLabel, disabled, onFile, quiet, danger }: {
  label: string; ariaLabel?: string; disabled: boolean; onFile: (f: File) => void; quiet?: boolean; danger?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label
      className={`${btn} ${danger ? "border border-danger/50 text-danger hover:bg-danger/10" : quiet ? "border border-line text-text hover:bg-surface-2" : "bg-primary text-cta-ink hover:bg-primary-soft"} ${disabled ? "pointer-events-none opacity-40" : ""}`}
    >
      {label}
      <input
        ref={input}
        type="file"
        aria-label={ariaLabel ?? label}
        accept="application/pdf,image/jpeg,image/png"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (input.current) input.current.value = "";
        }}
      />
    </label>
  );
}

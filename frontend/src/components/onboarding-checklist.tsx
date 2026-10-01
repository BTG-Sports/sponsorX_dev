"use client";

import { useRef, useState, useTransition } from "react";

import {
  confirmDocumentAction,
  readOnboardingAction,
  requestDocumentAction,
  resendConfirmationAction,
} from "@/app/(public)/onboarding/actions";
import {
  DOCUMENT_KINDS,
  checkDocument,
  dateLabel,
  documentKindLabel,
  fileSize,
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
   -------------------------------------------------------------------------- */

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
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [extraKind, setExtraKind] = useState("OTHER");
  const [pending, start] = useTransition();

  const refresh = async () => {
    const r = await readOnboardingAction(token);
    if (r.ok) onView(r.view);
  };

  const upload = async (file: File, kind: string, stateCode: string | null) => {
    setError(null);
    setNote(null);
    const problem = checkDocument({ name: file.name, type: file.type, size: file.size }, 0, kind, Number.POSITIVE_INFINITY);
    if (problem) return setError(problem);
    setBusy(`Uploading ${file.name}…`);
    try {
      const g = await requestDocumentAction(token, { kind, filename: file.name, contentType: file.type, bytes: file.size, stateCode });
      if (!g.ok) return setError(g.message);
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: file });
      } catch {
        await refresh();
        return setError("The upload didn't reach storage. Check your connection, then use Check again — or upload the file again.");
      }
      if (!put.ok) return setError("Storage refused the upload. Try the file again.");
      const c = await confirmDocumentAction(token, g.document.id);
      if (!c.ok) setError(c.message);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const recheck = async (id: string) => {
    setError(null);
    setBusy("Checking the upload…");
    try {
      const c = await confirmDocumentAction(token, id);
      if (!c.ok) setError(c.message);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const resend = () => {
    setError(null);
    start(async () => {
      const r = await resendConfirmationAction(token);
      if (!r.ok) return setError(r.message);
      onView(r.view);
      setNote(`We sent the link again to ${r.view.contactEmail ?? "the primary contact"}.`);
    });
  };

  const notArrived = view.documents.filter((d) => !d.uploadedAt);
  const extras = view.documents.filter((d) => d.uploadedAt && !view.checklist.some((c) => c.documentId === d.id));
  const disabled = busy !== null || pending;

  return (
    <div className="space-y-4">
      <ul aria-label="Required documents" className="divide-y divide-line-soft rounded-lg border border-line-soft">
        {view.checklist.map((c) => (
          <ChecklistRow key={c.key} item={c} view={view} disabled={disabled} onFile={(f) => void upload(f, c.kind, c.stateCode)} />
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
        <FileButton label="Add a document" disabled={disabled} onFile={(f) => void upload(f, extraKind, null)} quiet />
      </div>

      {busy && <p className="text-xs text-muted" role="status">{busy}</p>}
      {note && <p className="text-xs text-accent" role="status">{note}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
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
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <Tick done={item.done} />
      <span className="min-w-0 grow basis-48">
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="block break-words text-[11px] text-muted">
          {doc ? `${doc.filename} · received ${dateLabel(doc.uploadedAt)}` : "Still needed"}
        </span>
      </span>
      <span className="sr-only">{item.done ? "Done" : "Missing"}</span>
      {!item.done && <FileButton label="Upload" ariaLabel={`Upload ${item.label}`} disabled={disabled} onFile={onFile} />}
    </li>
  );
}

function FileButton({ label, ariaLabel, disabled, onFile, quiet }: { label: string; ariaLabel?: string; disabled: boolean; onFile: (f: File) => void; quiet?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label
      className={`${btn} ${quiet ? "border border-line text-text hover:bg-surface-2" : "bg-primary text-cta-ink hover:bg-primary-soft"} ${disabled ? "pointer-events-none opacity-40" : ""}`}
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

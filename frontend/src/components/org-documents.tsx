"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmOrgUploadAction, removeOrgDocumentAction, requestOrgUploadAction } from "@/app/(app)/property/documents/actions";
import { Badge } from "@/components/ui";
import { US_STATES } from "@/lib/onboarding-live";
import {
  ADDABLE_KINDS, checkFile, dayOf, dialogCopy, documentAction, documentBadge, documentLine, historyLine, needsYou, removeWarning, uploadHint,
  type ApiOrgDocument, type ApiOrgDocuments,
} from "@/lib/org-documents-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   The organization's documents — 2S1-FE-04, documents half (design
   OrgDocuments.dc.html, list + replace), live on 2S1-BE-07. One island:
   a row's button opens the replace / upload dialog, and "Add a document"
   opens it for a new paper.

   Each upload: the server action asks the API for a private-bucket PUT,
   this browser sends the bytes straight to storage, then the action
   confirms — the API counts it only once it has arrived, keeps the earlier
   file as history, re-runs the checklist and tells BTG. Remove keeps the
   file in the history too; a required one missing flags the organization
   for BTG and suspends nothing.
   -------------------------------------------------------------------------- */

type Open = { mode: "row"; doc: ApiOrgDocument } | { mode: "add" };

export function OrgDocumentsPage({ initial }: { initial: ApiOrgDocuments }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState<Open | null>(null);
  const banner = needsYou(data.documents);

  const update = (next: ApiOrgDocuments) => {
    setData(next);
    setOpen(null);
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            What {data.organizationName} needs on file to keep selling. BTG is told when you change a document.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen({ mode: "add" })}
          className="min-h-11 rounded-lg border border-line px-4 text-xs font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add a document
        </button>
      </div>

      {banner && (
        <p role="status" className="rounded-lg border border-warn/45 bg-warn/8 px-3.5 py-2.5 text-xs leading-relaxed">
          <strong className="text-warn">{banner.title}</strong> {banner.body}
        </p>
      )}
      {data.flags.length > 0 && (
        <p className="text-[11px] text-muted">BTG has been told: {data.flags.join("; ")}.</p>
      )}

      <OrgDocumentsList data={data} onOpen={(doc) => setOpen({ mode: "row", doc })} />

      {data.pending.length > 0 && <PendingUploads data={data} onDone={update} />}

      {open && <DocumentDialog open={open} data={data} onClose={() => setOpen(null)} onDone={update} />}
    </>
  );
}

export function OrgDocumentsList({ data, onOpen, disabled }: { data: ApiOrgDocuments; onOpen: (d: ApiOrgDocument) => void; disabled?: boolean }) {
  return (
    <section aria-label="Required documents" className="overflow-hidden rounded-xl border border-line bg-surface">
      <ul className="divide-y divide-line-soft">
        {data.documents.map((d) => {
          const badge = documentBadge(d.state);
          const action = documentAction(d);
          return (
            <li key={d.key} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 grow basis-52">
                  <strong className="block text-sm font-semibold">
                    {d.label}
                    {!d.required && <span className="ml-1.5 text-[11px] font-normal text-faint">extra</span>}
                  </strong>
                  <span className="block break-words text-xs text-muted">{documentLine(d)}</span>
                </span>
                <Badge tone={badge.tone}>
                  <span aria-hidden="true" className="mr-1">{badge.mark}</span>
                  {badge.label}
                </Badge>
                <button
                  type="button"
                  onClick={() => onOpen(d)}
                  disabled={disabled}
                  aria-label={`${action.label} ${d.label}`}
                  className={`min-h-9 rounded-lg px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${action.primary ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}
                >
                  {action.label}
                </button>
              </div>
              {d.history.length > 0 && (
                <details className="mt-2.5">
                  <summary className="cursor-pointer text-xs text-muted">Earlier files ({d.history.length})</summary>
                  <ul className="mt-2">
                    {d.history.map((h) => (
                      <li key={h.documentId} className="flex flex-wrap gap-x-3 border-t border-line-soft py-1.5 text-xs">
                        <span className="min-w-0 grow break-words">{h.filename}</span>
                        <span className="text-muted">{historyLine(h)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Uploads that were granted but never confirmed — the bytes may have arrived after all. */
function PendingUploads({ data, onDone }: { data: ApiOrgDocuments; onDone: (d: ApiOrgDocuments) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-label="Unfinished uploads" className="space-y-1.5 text-xs">
      {data.pending.map((p) => (
        <p key={p.documentId} className="flex flex-wrap items-center gap-2 text-warn">
          <span className="min-w-0 break-words">{p.filename} — not received yet.</span>
          <button
            type="button"
            disabled={pending}
            className="underline disabled:opacity-40"
            onClick={() =>
              start(async () => {
                const r = await confirmOrgUploadAction(p.documentId);
                if (!r.ok) return setError(r.message);
                onDone(r.data);
              })
            }
          >
            Check again
          </button>
        </p>
      ))}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </section>
  );
}

function DocumentDialog({ open, data, onClose, onDone }: { open: Open; data: ApiOrgDocuments; onClose: () => void; onDone: (d: ApiOrgDocuments) => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const row = open.mode === "row" ? open.doc : null;
  const [kind, setKind] = useState<string>(row?.kind ?? "OTHER");
  const [stateCode, setStateCode] = useState<string>(row?.stateCode ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const added = ADDABLE_KINDS.find((k) => k.kind === kind)?.label ?? "Document";
  const copy = row
    ? dialogCopy(row)
    : dialogCopy({ kind, label: stateCode && kind === "BUSINESS_REGISTRATION" ? `${added} (${stateCode})` : added, file: null, state: "MISSING" });
  const needsState = kind === "BUSINESS_REGISTRATION" && !row?.file;

  const send = async () => {
    if (!file) return setError("Choose the file first.");
    const problem = checkFile(data.upload, kind, file);
    if (problem) return setError(problem);
    if (needsState && !stateCode) return setError("Pick the state this registration is for.");
    setError(null);
    setBusy(`Uploading ${file.name}…`);
    try {
      const g = await requestOrgUploadAction({
        kind, filename: file.name, contentType: file.type, bytes: file.size,
        stateCode: kind === "BUSINESS_REGISTRATION" ? stateCode || null : null,
        replacesId: row?.file?.documentId ?? null, expiresOn: validUntil || null,
      });
      if (!g.ok) return setError(g.message);
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: file });
      } catch {
        return setError("The upload didn't reach storage. Check your connection and try again — it's listed under the documents to check again.");
      }
      if (!put.ok) return setError("Storage refused the upload. Try the file again.");
      const c = await confirmOrgUploadAction(g.documentId);
      if (!c.ok) return setError(c.message);
      onDone(c.data);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!row?.file) return;
    setBusy("Removing…");
    try {
      const r = await removeOrgDocumentAction(row.file.documentId);
      if (!r.ok) return setError(r.message);
      onDone(r.data);
    } finally {
      setBusy(null);
    }
  };

  const field = "h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm";

  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="rp-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-3.5 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl sm:p-6">
          <h2 id="rp-title" className="text-base font-semibold tracking-tight">{copy.title}</h2>
          <p className="text-xs leading-relaxed text-muted">{copy.lead}</p>

          {!row && (
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              <span>What is it?</span>
              <select className={field} value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy !== null}>
                {ADDABLE_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>{k.label}</option>
                ))}
              </select>
            </label>
          )}
          {needsState && (
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              <span>State it&rsquo;s registered in</span>
              <select className={field} value={stateCode} onChange={(e) => setStateCode(e.target.value)} disabled={busy !== null}>
                <option value="">Choose a state…</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface p-4 text-center text-xs text-muted focus-within:ring-2 focus-within:ring-primary">
            <span className="text-sm font-medium text-text">{file ? file.name : copy.drop}</span>
            <span>{uploadHint(data.upload, kind)}</span>
            <span className="mt-1 inline-flex min-h-9 items-center rounded-lg border border-line px-3.5 text-xs font-semibold text-text">Choose file</span>
            <input
              type="file"
              accept={data.upload.types.join(",")}
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium">
            <span>Valid until <span className="font-normal text-muted">(if it has a date)</span></span>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={busy !== null} className={field} />
          </label>

          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs leading-relaxed">{copy.note}</p>

          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-xs font-medium text-text hover:bg-surface-2">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy !== null}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ?? copy.submit}
            </button>
          </div>

          {row?.file && (
            <div className="border-t border-line-soft pt-3 text-xs">
              {confirmRemove ? (
                <div className="space-y-2">
                  <p className="leading-relaxed text-muted">{removeWarning(row)}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void remove()} disabled={busy !== null} className="min-h-9 rounded-lg border border-danger/60 px-3.5 font-semibold text-danger disabled:opacity-40">
                      Remove {row.file.filename}
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(false)} className="min-h-9 rounded-lg px-3 text-muted hover:text-text">
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmRemove(true)} className="text-muted underline hover:text-danger">
                  Remove this document instead
                </button>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
          {row?.file?.uploadedAt && <p className="text-[11px] text-faint">On file since {dayOf(row.file.uploadedAt)}.</p>}
        </div>
      </div>
    </div>
  );
}

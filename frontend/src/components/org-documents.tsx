"use client";

import { useState } from "react";

import { Badge } from "@/components/ui";
import {
  DOCUMENTS_NOT_LIVE, dayOf, dialogCopy, documentAction, documentBadge, documentLine, uploadHint,
  type ApiOrgDocument, type ApiOrgDocuments,
} from "@/lib/org-documents-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   The organization's documents — 2S1-FE-04, documents half (design
   OrgDocuments.dc.html, list + replace). One island because a row's button
   opens the replace / upload dialog.

   Scaffold: the dialog shows the form 2S1-BE-07 will take, but its file
   chooser, date and Replace button stay disabled with the reason written
   under them — nothing is uploaded and nothing pretends to be.
   -------------------------------------------------------------------------- */

export function OrgDocumentsList({ data }: { data: ApiOrgDocuments }) {
  const [open, setOpen] = useState<ApiOrgDocument | null>(null);

  return (
    <>
      <section aria-label="Required documents" className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line-soft">
          {data.documents.map((d) => {
            const badge = documentBadge(d.state);
            const action = documentAction(d);
            return (
              <li key={d.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 grow basis-52">
                    <strong className="block text-sm font-semibold">{d.name}</strong>
                    <span className="block break-words text-xs text-muted">{documentLine(d)}</span>
                  </span>
                  <Badge tone={badge.tone}>
                    <span aria-hidden="true" className="mr-1">{badge.mark}</span>
                    {badge.label}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setOpen(d)}
                    aria-label={`${action.label} ${d.name}`}
                    className={`min-h-9 rounded-lg px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary ${action.primary ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}
                  >
                    {action.label}
                  </button>
                </div>
                {d.history.length > 0 && (
                  <details className="mt-2.5">
                    <summary className="cursor-pointer text-xs text-muted">Earlier files ({d.history.length})</summary>
                    <ul className="mt-2">
                      {d.history.map((h) => (
                        <li key={h.filename + h.replacedAt} className="flex flex-wrap gap-x-3 border-t border-line-soft py-1.5 text-xs">
                          <span className="min-w-0 grow break-words">{h.filename}</span>
                          <span className="text-muted">Replaced {dayOf(h.replacedAt)}</span>
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

      {open && <ReplaceDialog doc={open} upload={data.upload} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReplaceDialog({ doc, upload, onClose }: { doc: ApiOrgDocument; upload: ApiOrgDocuments["upload"]; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const copy = dialogCopy(doc);
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="rp-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-3.5 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl sm:p-6">
          <h2 id="rp-title" className="text-base font-semibold tracking-tight">{copy.title}</h2>
          <p className="text-xs leading-relaxed text-muted">{copy.lead}</p>

          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface p-4 text-center text-xs text-muted">
            <span className="text-sm font-medium text-text">{copy.drop}</span>
            <span>{uploadHint(upload)}</span>
            <button type="button" disabled title={DOCUMENTS_NOT_LIVE} aria-describedby="rp-why"
              className="mt-1 min-h-9 cursor-not-allowed rounded-lg border border-line px-3.5 text-xs font-semibold text-text opacity-40">
              Choose file
            </button>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium">
            <span>Valid until <span className="font-normal text-muted">(if it has a date)</span></span>
            <input type="date" disabled title={DOCUMENTS_NOT_LIVE} aria-describedby="rp-why"
              className="h-11 w-full cursor-not-allowed rounded-lg border border-line bg-surface px-3 text-sm opacity-60" />
          </label>

          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs leading-relaxed">{copy.note}</p>

          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-xs font-medium text-text hover:bg-surface-2">
              Cancel
            </button>
            <button type="button" disabled title={DOCUMENTS_NOT_LIVE} aria-describedby="rp-why"
              className="min-h-11 cursor-not-allowed rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink opacity-40">
              {copy.submit}
            </button>
          </div>
          <p id="rp-why" className="text-[11px] text-warn">{DOCUMENTS_NOT_LIVE}</p>
        </div>
      </div>
    </div>
  );
}

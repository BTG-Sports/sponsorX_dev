"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendBackOrgDocumentAction, viewOrgDocumentAction } from "@/app/(app)/admin/onboarding/actions";
import { DocumentCheck, SendBackButton } from "@/components/document-check";
import type { ApiDocumentCheck, ApiDocumentReturned } from "@/lib/document-checks-live";

/* --------------------------------------------------------------------------
   2S1-FE-05 — open one verification document. The link is asked for only
   when BTG clicks: the API signs a five-minute read of the private bucket
   and records the view against this reviewer, so no page load mints links
   nobody opens. Shown as a plain link once it exists (no pop-up), with how
   long it lasts.

   P8-FE-11 — beside it, what reading the document found (Clear / Flagged
   with each finding / "Couldn't read — check it by eye"), and Send back,
   which asks for a reason and calls POST /onboarding/:id/documents/:documentId/
   send-back. A document BTG sent back has no file left: no View, just when
   and why it went back.
   -------------------------------------------------------------------------- */

export function OrgDocumentOpen({ onboardingId, documentId, filename, check = null, returned = null, who, canSendBack = true }: {
  onboardingId: string; documentId: string; filename: string;
  check?: ApiDocumentCheck; returned?: ApiDocumentReturned;
  /** Who reads a send-back reason — the organisation's name. */
  who?: string;
  /** False for an earlier file (replaced or removed): nothing to send back. */
  canSendBack?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await viewOrgDocumentAction(onboardingId, documentId);
      if (!r.ok) return setError(r.message);
      setUrl(r.url);
    });

  return (
    <span className="flex min-w-0 flex-col items-end gap-1.5">
      <span className="flex flex-wrap items-center justify-end gap-2">
        {returned ? (
          <span className="text-[11px] text-muted">File deleted</span>
        ) : url ? (
          <>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">
              Open {filename} →
            </a>
            <span className="text-[11px] text-faint">the link lasts 5 minutes ·</span>
            <button type="button" onClick={ask} disabled={pending} className="text-[11px] text-muted underline disabled:opacity-40">
              new link
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            aria-label={`View ${filename}`}
            onClick={ask}
            className="min-h-8 rounded-lg border border-line px-3 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40"
          >
            {pending ? "Opening…" : "View"}
          </button>
        )}
        {!returned && canSendBack && (
          <SendBackButton
            name={filename}
            who={who ?? "The organisation"}
            send={(reason) => sendBackOrgDocumentAction(onboardingId, documentId, reason)}
            onDone={() => router.refresh()}
          />
        )}
      </span>
      <DocumentCheck check={check} returned={returned} className="text-right" />
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

"use client";

import { useState, useTransition } from "react";

import { viewOrgDocumentAction } from "@/app/(app)/admin/onboarding/actions";

/* --------------------------------------------------------------------------
   2S1-FE-05 — open one verification document. The link is asked for only
   when BTG clicks: the API signs a five-minute read of the private bucket
   and records the view against this reviewer, so no page load mints links
   nobody opens. Shown as a plain link once it exists (no pop-up), with how
   long it lasts.
   -------------------------------------------------------------------------- */

export function OrgDocumentOpen({ onboardingId, documentId, filename }: { onboardingId: string; documentId: string; filename: string }) {
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
    <span className="flex flex-wrap items-center gap-2">
      {url ? (
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
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

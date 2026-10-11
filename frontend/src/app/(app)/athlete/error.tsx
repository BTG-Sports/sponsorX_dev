"use client";

import { ErrorPanel } from "@/components/states";

/* The athlete portal's error boundary. P1-ART-22 (2026-10-11): the retry
   is the Arena's primary pill (globals.css `.sx-arena .sx-btn-primary`),
   with a visible keyboard focus ring; the ErrorPanel itself is the shared
   one. */
export default function GroupError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      refCode={error.digest}
      action={
        <button
          type="button"
          onClick={retry}
          className="sx-btn-primary mt-1 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-cta-ink outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Try again
        </button>
      }
    />
  );
}

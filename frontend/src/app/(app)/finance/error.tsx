"use client";

/* The Finance portal's error page (P1-ART-25 restructure) — admin's
   (admin/error.tsx), drawn in the Vault: a double-ruled panel, the engraved
   title, the support reference, and "Try again". An outage is never
   dressed as an empty desk (QA pass 4 rule). */
import { VaultPanel } from "@/components/vault-stage";

export default function FinanceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div role="alert">
      <VaultPanel tone="late" className="flex flex-col items-center gap-2 py-10 text-center">
        <h1 className="sx-page-title text-lg">Something broke on our side</h1>
        <p className="max-w-xs text-xs text-[color:var(--vault-muted)]">
          The rest of the portal still works. Try again, or come back to this screen in a minute.
        </p>
        {error.digest && (
          <code className="border border-[color:var(--vault-line-soft)] px-2 py-0.5 text-[10px] text-[color:var(--vault-faint)]">
            ref: {error.digest}
          </code>
        )}
        <button
          type="button"
          onClick={retry}
          className="mt-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
        >
          Try again
        </button>
      </VaultPanel>
    </div>
  );
}

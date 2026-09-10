"use client";

import { ErrorPanel } from "@/components/states";

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
          className="mt-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-soft"
        >
          Try again
        </button>
      }
    />
  );
}

"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-cta-ink">
      Print
    </button>
  );
}

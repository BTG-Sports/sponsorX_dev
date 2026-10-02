"use client";

import { useEffect, useState } from "react";

import { printInLight } from "@/lib/print-light";

/* P1-FE-26 — the schools page is forwarded and printed, so it offers both.
   While it is mounted, any print of the page (this button or Ctrl+P) uses
   the light theme — see lib/print-light.ts. */
export function ShareActions() {
  const [copied, setCopied] = useState(false);
  useEffect(() => printInLight(document.documentElement, window), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the address bar still has it */
    }
  };
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="rounded-lg border border-line px-3 py-2 text-xs font-medium hover:bg-surface-2">
        Print or save as PDF
      </button>
      <button type="button" onClick={copy} className="rounded-lg border border-line px-3 py-2 text-xs font-medium hover:bg-surface-2">
        {copied ? "Link copied" : "Copy link to forward"}
      </button>
    </div>
  );
}

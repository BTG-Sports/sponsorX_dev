"use client";

/* --------------------------------------------------------------------------
   /contact — POL-FE-100. The one client island the otherwise server-rendered
   contact stage (contact-stage.tsx) needs besides the form: copy the BTG
   support address. Where the clipboard is refused (an old browser, an
   insecure origin) it opens the person's mail app at the address instead,
   so the button always gets them somewhere.
   -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";

function CopyIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function TickIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const LOOK = {
  hero:
    "sx-sheen group relative inline-flex h-12 w-full items-center justify-center gap-2.5 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:h-[52px] sm:w-auto sm:px-8 sm:text-[15px]",
  chip:
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#9cc7ff]/30 bg-[#07132a]/60 px-3 text-[12px] font-semibold text-on-media/85 transition-colors hover:border-[#bfe0ff] hover:text-on-media",
} as const;

/** Copies the support address; "Copied" for a moment, then back. */
export function CopyEmail({ email, label = "Copy", variant = "chip" }: { email: string; label?: string; variant?: keyof typeof LOOK }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      window.location.href = `mailto:${email}`;
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button type="button" onClick={copy} className={LOOK[variant]} aria-label={copied ? `Copied ${email}` : `${label}: ${email}`}>
      {copied ? <TickIcon className="size-4 text-[#22c98d]" /> : <CopyIcon />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

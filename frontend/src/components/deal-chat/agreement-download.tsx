"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { agreementHref } from "@/lib/deal-chat";

/* --------------------------------------------------------------------------
   AgreementDownload — the deal agreement's "Download PDF" link, with a loud
   "it's working" state (owner, 2026-11-20: the plain link looked hung).

   The PDF is rendered on demand by Chromium on the API, which takes a few
   seconds, and a plain <a href> shows nothing meanwhile. So a plain click is
   taken over: the link spins and says "Preparing PDF…", the file is fetched
   through the same route, and saved under the API's own filename. After a
   few seconds it says "Still preparing…", so a slow render never looks
   frozen; a failure says so on the link and the next click retries.

   It stays a real link: a modified click (new tab, save link as) or no
   JavaScript at all goes straight to the route, as before. Props are plain
   values and ReactNode only — server pages render it too.
   -------------------------------------------------------------------------- */

type State = "idle" | "busy" | "slow" | "failed";

const SLOW_AFTER_MS = 4000;
const FAILED_FOR_MS = 5000;

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-[1em] shrink-0 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

/** The filename the API named in Content-Disposition, or a sensible one. */
function filenameOf(res: Response): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]!) : "SponsorX-deal-agreement.pdf";
}

export function AgreementDownload({
  id,
  className,
  children,
  variant = "inline",
}: {
  id: string;
  className?: string;
  /** The idle label, icon included. */
  children: ReactNode;
  /** "quick" — the chat's round icon chip: the spinner sits in the circle, short words under it. */
  variant?: "inline" | "quick";
}) {
  const compact = variant === "quick";
  const href = agreementHref(id);
  const [state, setState] = useState<State>("idle");
  /* A ref, not the state: two quick clicks must not start two downloads. */
  const running = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  async function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (running.current) return;
    running.current = true;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setState("busy");
    later(() => setState((s) => (s === "busy" ? "slow" : s)), SLOW_AFTER_MS);
    try {
      const res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameOf(res);
      document.body.appendChild(a);
      a.click();
      a.remove();
      later(() => URL.revokeObjectURL(url), 1500);
      setState("idle");
    } catch {
      setState("failed");
      later(() => setState((s) => (s === "failed" ? "idle" : s)), FAILED_FOR_MS);
    } finally {
      running.current = false;
    }
  }

  const busy = state === "busy" || state === "slow";
  const words =
    state === "busy" ? (compact ? "Preparing…" : "Preparing PDF…")
    : state === "slow" ? (compact ? "Still going…" : "Still preparing…")
    : state === "failed" ? (compact ? "Retry" : "Couldn't download — try again")
    : null;

  return (
    <a
      href={href}
      onClick={onClick}
      className={className}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      data-state={state}
      style={busy ? { cursor: "progress", opacity: 0.85 } : undefined}
    >
      {!words ? (
        children
      ) : compact ? (
        <>
          {/* The chip styles every inner <span> as its icon circle, so the words are an <i>. */}
          <span>{busy ? <Spinner /> : <b className="text-warn">!</b>}</span>
          <i role="status" aria-live="polite" className={busy ? "not-italic" : "not-italic text-warn"}>{words}</i>
        </>
      ) : (
        <>
          {busy ? <Spinner /> : null}
          <span role="status" aria-live="polite" className={busy ? "ml-1.5" : "text-warn"}>{words}</span>
        </>
      )}
    </a>
  );
}

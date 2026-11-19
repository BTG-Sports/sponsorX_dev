"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { DRAFT_KEY, SECTIONS, isMinor, parseDraft, visibleSections } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   The /join landing's "start" panel (POL-FE-115, 2026-11-19).

   The application used to run inside this panel. It has its own page now,
   /join/apply (join-wizard.tsx), and the panel keeps what it showed before
   anyone started: the ten sections on their rail. What is new is the button
   at the top, which goes to the application. It reads this device's draft,
   so it says "Start application", "Resume — section 4 of 9" (with "Start
   over" under it) or, once sent, "See your application".

   The server and the first client render show "Start application"; the
   stored draft swaps in after hydration (join-wizard.tsx's rule).
   -------------------------------------------------------------------------- */

/* The stage's primary button (join-stage.tsx / packages-stage.tsx): the
   brand gradient with its glow. Keeps the dark CTA ink — white on #2e9bf5
   is 2.95:1 (P1-QA-02), and this is the button the whole page leads to. */
const CTA =
  "sx-join-sheen group flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-5 py-3.5 text-base font-semibold text-cta-ink shadow-[0_0_24px_-2px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(46,155,245,.75)]";

/* Two-digit HUD numerals: 01, 02 … */
const pad = (n: number) => String(n).padStart(2, "0");
const d = (s: number) => ({ "--sx-d": `${s}s` }) as CSSProperties;

const emptySubscribe = () => () => {};

export function JoinStart() {
  const storedRaw = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return localStorage.getItem(DRAFT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  /* "Start over" empties the stored draft; this only makes the panel read it again. */
  const [, setCleared] = useState(0);
  const draft = parseDraft(storedRaw);
  const sent = draft?.phase === "submitted";
  const total = visibleSections(isMinor(draft?.answers.dob ?? "")).length;
  const at = Math.max(0, Math.min(draft?.step ?? 0, total - 1)) + 1;
  const started = !!draft && !sent && (Object.values(draft.answers).some((v) => v.trim()) || draft.step > 0);

  const startOver = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* private mode — there was nothing stored to remove */
    }
    setCleared((n) => n + 1);
  };

  return (
    <div className="px-6 py-9 sm:px-8">
      <p className="sx-join-rise flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.32em] text-[#7fc4ff]">
        <span aria-hidden className="h-px w-8 bg-[#7fc4ff]/80" />
        Athlete application
        <span aria-hidden className="sx-hud-dashes ml-1" />
      </p>
      <div className="sx-join-rise mt-3 flex items-end justify-between gap-4" style={d(0.05)}>
        <h1 className="text-3xl font-semibold tracking-tight">{sent ? "Application sent" : "Ten sections"}</h1>
        <span className="mb-1 shrink-0 rounded border border-[#9cc7ff]/30 px-2 py-0.5 font-mono text-[11px] tracking-wider text-on-media/75">~8 MIN</span>
      </div>
      <p className="sx-join-rise mt-2 text-sm leading-relaxed text-muted" style={d(0.1)}>
        {sent
          ? "Your application is in from this device. Open it to see what is left to do."
          : "About 8 minutes, on its own page. Your answers are saved as you go, so you can leave and come back."}
      </p>

      {/* the way in — at the top, so nobody has to read the list to find it */}
      <div className="sx-join-rise mt-6" style={d(0.16)}>
        <Link href="/join/apply" className={CTA}>
          {sent ? "See your application" : started ? `Resume — section ${at} of ${total}` : "Start application"}
          <svg viewBox="0 0 16 16" className="size-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </Link>
        {started && (
          <button type="button" onClick={startOver} className="mt-2 min-h-11 w-full rounded-xl px-5 py-2.5 text-sm text-muted transition-colors hover:text-text">
            Start over
          </button>
        )}
      </div>

      <p className="sx-join-rise mt-8 text-[11px] font-medium uppercase tracking-[0.24em] text-muted" style={d(0.2)}>
        What it asks
      </p>
      <div className="relative mt-4">
        <span
          aria-hidden
          className="sx-join-rail absolute bottom-4 left-[15px] top-4 w-[2px] rounded-full bg-gradient-to-b from-[#7fd0ff]/60 via-[#2e9bf5]/50 to-[#fb923c]/60 shadow-[0_0_10px_rgba(46,155,245,.45)]"
        />
        <ol className="space-y-1">
          {SECTIONS.map((s, i) => {
            const enforced = s.id === "restrictions";
            const conditional = s.minorOnly === true;
            return (
              <li key={s.id} className="sx-join-rise relative flex items-start gap-4 py-2.5" style={d(0.24 + i * 0.045)}>
                <span
                  className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${
                    enforced
                      ? "border border-accent bg-[#140b05] text-accent shadow-[0_0_12px_rgba(249,122,31,.55)]"
                      : conditional
                        ? "border border-dashed border-accent/70 bg-[#140b05] text-accent"
                        : i === 0
                          ? "sx-ping border border-primary bg-[#06101f] text-primary-soft shadow-[0_0_14px_rgba(46,155,245,.7)]"
                          : "border border-[#9cc7ff]/20 bg-[#06101f] text-muted"
                  }`}
                  style={i === 0 ? ({ "--ping": "#4fb0ff", "--ping-cycle": "3.2s" } as CSSProperties) : undefined}
                >
                  {pad(i + 1)}
                </span>
                {conditional ? (
                  <div className="flex-1 rounded-xl border border-dashed border-accent/45 bg-accent/[0.06] p-3.5 shadow-[inset_0_0_24px_-10px_rgba(249,122,31,.45)]">
                    <p className="text-base font-medium text-text">{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-accent">
                      The one branch. Appears only if the date of birth on section 1 is under 18. Nothing else changes.
                    </p>
                  </div>
                ) : (
                  <div className="pt-1">
                    <p className="text-base font-medium text-text">{s.title}</p>
                    {s.railNote && <p className={`mt-0.5 text-sm ${enforced ? "text-accent" : "text-muted"}`}>{s.railNote}</p>}
                  </div>
                )}
              </li>
            );
          })}
          <li className="sx-join-rise relative flex items-center gap-4 py-2.5" style={d(0.24 + SECTIONS.length * 0.045)}>
            <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-success/50 bg-[#06151a] shadow-[0_0_12px_rgba(34,201,141,.4)]">
              <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={d(0.9)} />
              </svg>
            </span>
            <p className="text-base text-muted">Submitted — reviewed by hand</p>
          </li>
        </ol>
      </div>
    </div>
  );
}

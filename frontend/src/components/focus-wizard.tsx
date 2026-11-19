"use client";

/* --------------------------------------------------------------------------
   The full-screen wizard's shared frame — used by the sponsor brief
   (/brief, POL-FE-114) and the athlete application (/join/apply,
   POL-FE-115). One copy of the page around the questions, so the two read
   as the same product:

   - FocusShell   the page: the fixed-dark stage and its ground (two lights
                  that travel per step, the pointer's light, the floor, the
                  step's number rolling like a counter), the top bar (logo,
                  one way out) and the progress line. `tone` picks the
                  wizard's colour: sponsor orange, or athlete blue.
   - FocusRail    (lg+) the steps down the left, a tick on the finished
                  ones, an answer under a name where there is one. A step
                  that may be opened is a button.
   - LineField    a typed answer on a line that fills when focused.
   - Problem      what is wrong with an answer, in words.

   Styled by app/brief/brief.css (`.sx-brief`, `.bx-*`), which both pages
   import; moved by brief-fx.tsx. Nothing here knows what is being asked.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { BriefStage } from "@/components/brief-fx";
import { Logo } from "@/components/logo";

/* Where the two lights sit on each step, [x vw, y vh] for blue then orange.
   A wizard with more steps than places goes round again. */
const LIGHTS: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> = [
  [[18, 12], [88, 90]],
  [[72, 6], [10, 86]],
  [[86, 46], [18, 18]],
  [[28, 92], [82, 14]],
  [[8, 40], [92, 62]],
  [[50, 4], [50, 100]],
];
const LIGHTS_DONE = [[50, 26], [50, 78]] as const;

export const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export function FocusShell({
  tone = "sponsor",
  step,
  count,
  done = false,
  progress,
  progressLabel,
  progressText,
  exit,
  children,
}: {
  tone?: "sponsor" | "athlete";
  /** The step on screen, from 0. */
  step: number;
  count: number;
  /** Past the last step: the lights settle and the number steps away. */
  done?: boolean;
  /** 0 to 1. */
  progress: number;
  progressLabel: string;
  progressText: string;
  exit: { href: string; label: string };
  children: ReactNode;
}) {
  const lights = done ? LIGHTS_DONE : LIGHTS[step % LIGHTS.length];
  return (
    <BriefStage
      data-tone={tone === "athlete" ? "athlete" : undefined}
      className="sx-stage sx-brief relative isolate flex min-h-svh flex-col overflow-x-clip"
    >
      <div className="bx-ground" aria-hidden>
        <span className="bx-orb bx-orb-a" style={{ transform: `translate3d(${lights[0][0]}vw, ${lights[0][1]}vh, 0)` }}>
          <i />
        </span>
        <span className="bx-orb bx-orb-b" style={{ transform: `translate3d(${lights[1][0]}vw, ${lights[1][1]}vh, 0)` }}>
          <i />
        </span>
        <div className="sx-stage-floor bx-floor" />
        <div className="bx-light" />
        <div className="bx-num" data-off={done ? "" : undefined}>
          <div className="bx-num-strip" style={{ "--n": step } as CSSProperties}>
            {Array.from({ length: count }, (_, i) => (
              <span key={i}>{String(i + 1).padStart(2, "0")}</span>
            ))}
          </div>
        </div>
      </div>

      <header className="bx-chrome relative z-10">
        <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10 lg:py-5">
          <Link href="/" className="shrink-0 leading-none" aria-label="SponsorX home">
            <Logo className="h-7 sm:h-8" />
          </Link>
          <Link
            href={exit.href}
            className="group inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            {exit.label}
            <svg viewBox="0 0 16 16" className="size-4 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </Link>
        </div>
        <div
          className="bx-bar"
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={count}
          aria-valuenow={done ? count : step}
          aria-valuetext={progressText}
        >
          <span className="bx-bar-fill" style={{ "--p": progress } as CSSProperties} />
        </div>
      </header>

      {children}
    </BriefStage>
  );
}

/* -------------------------------------------------------------------- rail */

export type RailStep = {
  id: string;
  label: string;
  state: "done" | "now" | "next";
  /** A few words under the name; shown on every step but the current one. */
  answer?: string;
  /** May be opened from here. */
  open?: boolean;
};

export function FocusRail({
  title,
  label,
  steps,
  onOpen,
  note,
  compact = false,
}: {
  title: string;
  /** The list's accessible name. */
  label: string;
  steps: RailStep[];
  onOpen: (index: number) => void;
  note?: string;
  /** A long list: less room between the steps. */
  compact?: boolean;
}) {
  return (
    <nav aria-label={label} className="bx-chrome hidden self-center pb-28 lg:block">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{title}</p>
      <ol className={`bx-rail ${compact ? "mt-5" : "mt-6"}`}>
        {steps.map((s, i) => {
          const body = (
            <>
              <span className="bx-node" aria-hidden>
                {s.state === "done" ? (
                  <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.1s" } as CSSProperties} />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className={`block text-sm font-semibold ${s.state === "next" ? "text-muted" : "text-text"}`}>{s.label}</span>
                {s.state !== "now" && s.answer && <span className="bx-rise mt-0.5 block truncate text-[13px] text-muted">{s.answer}</span>}
              </span>
            </>
          );
          return (
            <li key={s.id} data-state={s.state} className={`${compact ? "pb-3.5" : "pb-6"} last:pb-0`} aria-current={s.state === "now" ? "step" : undefined}>
              {i < steps.length - 1 && <span className="bx-link" aria-hidden />}
              {s.open ? (
                <button
                  type="button"
                  onClick={() => onOpen(i)}
                  className="flex w-full items-start gap-3.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {body}
                  <span className="sr-only">Go to this step</span>
                </button>
              ) : (
                <div className="flex items-start gap-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {note && <p className="mt-8 max-w-[220px] text-[12px] leading-relaxed text-faint">{note}</p>}
    </nav>
  );
}

/* ------------------------------------------------------------------ fields */

export function Problem({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="bx-rise mt-3 flex items-center gap-2 text-sm font-medium text-danger">
      <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 4.8v3.6M8 11v.2" />
      </svg>
      {text}
    </p>
  );
}

export type LineFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "email" | "tel" | "date";
  /** Carried by the flows' own field lists; the caller says `optional`. */
  required?: boolean;
};

/** A typed answer on a line. `prefix` keeps two wizards' field ids apart. */
export function LineField({
  def,
  value,
  error,
  hint,
  optional = false,
  maxLength,
  autoComplete = "off",
  prefix = "f",
  className = "",
  style,
  onChange,
}: {
  def: LineFieldDef;
  value: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  maxLength?: number;
  autoComplete?: string;
  prefix?: string;
  className?: string;
  style?: CSSProperties;
  onChange: (value: string) => void;
}) {
  const id = `${prefix}-${def.key}`;
  return (
    <div className={className} style={style}>
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-medium text-muted">
        {def.label}
        {optional && <span className="text-[12px] font-normal text-faint">Optional</span>}
      </label>
      <div className="bx-field mt-1" data-error={error ? "" : undefined}>
        <input
          id={id}
          type={def.type ?? "text"}
          name={def.key}
          data-field={def.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={/^Optional\b/.test(def.placeholder) ? def.placeholder.replace(/^Optional(\s*[—-]\s*)?/, "") : def.placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `err-${def.key}` : hint ? `hint-${def.key}` : undefined}
          className="bx-input"
        />
      </div>
      {hint && !error && (
        <p id={`hint-${def.key}`} className="mt-2 text-[12px] text-faint">
          {hint}
        </p>
      )}
      <Problem id={`err-${def.key}`} text={error} />
    </div>
  );
}

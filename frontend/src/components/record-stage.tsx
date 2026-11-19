/* --------------------------------------------------------------------------
   record-stage — the server pieces of a BTG record page (POL-FE-108): one
   organization (/admin/onboarding/:id) or one sign-up
   (/admin/new-signups/{athletes|guardians}/:id), on the admin shell's
   Mission Control stage. The words are lib/record-ui.ts; the tabs are
   record-kit.tsx; the styles are `.sx-rec-*` in admin/record.css (each page
   imports it after the applications desk's sheet, for `.sx-ap-*`).

   - RecordHeader    back link, a kind mark, the name, one line, ONE pill,
                     and ONE button (`action`: record-decide.tsx's Decide).
                     Nothing else about deciding is on the page: the owner
                     found a "Your next step" card beside it too much to
                     meet on arrival, so that lives in the button's popup.
   - FactTiles       the four answers a reviewer looks for first.
   - RecordSection   one titled block inside a tab.
   - CheckRows / ReasonRows / FactRows / Timeline   what those blocks hold.
   - RecordSkeleton  the page's loading screen.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { StatusPill } from "@/components/desk-kit";
import type { RecordFact, RecordPill } from "@/lib/record-ui";

const at = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

/* ----------------------------------------------------------------- header */

export function RecordHeader({ back, icon, kind, title, meta, pill, action }: {
  back: { href: string; label: string };
  icon: UiGlyph;
  /** ORGANIZATION / ATHLETE / GUARDIAN — tints the mark like the list's. */
  kind: string;
  title: string;
  /** The one line under the name; empty parts are dropped. */
  meta: (string | null | undefined | false)[];
  pill: RecordPill;
  /** The page's one button (it opens the decision popup); absent when there is nothing to decide. */
  action?: ReactNode;
}) {
  return (
    <header className="sx-rec-head sx-ap-rise" style={at(0.02)}>
      <Link href={back.href} className="sx-rec-back">
        <Glyph ui="back" className="size-3.5" />
        {back.label}
      </Link>
      <div className="sx-rec-id">
        <span className="sx-rec-mark" data-kind={kind} aria-hidden="true">
          <Glyph ui={icon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          {/* the status sits beside the name it describes, not across the page */}
          <div className="sx-rec-name">
            <h1 className="sx-rec-title">{title}</h1>
            <StatusPill tone={pill.tone} act={pill.act}>{pill.label}</StatusPill>
          </div>
          <p className="sx-rec-meta">{meta.filter(Boolean).join(" · ")}</p>
        </div>
        {action && <div className="sx-rec-action">{action}</div>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ tiles */

export function FactTiles({ facts }: { facts: RecordFact[] }) {
  return (
    <dl aria-label="At a glance" className="sx-rec-facts">
      {facts.map((f, i) => (
        <div key={f.key} className="sx-rec-fact sx-ap-rise" data-tone={f.tone} style={at(0.14 + i * 0.05)}>
          <dt className="sx-rec-fact-k">{f.label}</dt>
          <dd className="sx-rec-fact-v">{f.value}</dd>
          {f.note && <dd className="sx-rec-fact-n">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------------- sections */

/** One titled block inside a tab. `tone="amber"` gives it the orange edge
 *  (something here is BTG's to look at). */
export function RecordSection({ title, hint, icon, tone, action, id, children }: {
  title: string;
  hint?: ReactNode;
  icon?: UiGlyph;
  tone?: "amber" | "green";
  action?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="sx-rec-sec" data-tone={tone}>
      <div className="sx-rec-sec-head">
        {icon && (
          <span className="sx-rec-sec-icon" aria-hidden="true">
            <Glyph ui={icon} className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="sx-rec-sec-title">{title}</h2>
          {hint && <p className="sx-rec-sec-hint">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A checklist: a green tick for what passed, an amber mark for what hasn't. */
export function CheckRows({ items }: { items: { key: string; label: string; ok: boolean }[] }) {
  return (
    <ul className="sx-rec-rows">
      {items.map((c) => (
        <li key={c.key} className="sx-rec-row" data-ok={c.ok ? "" : undefined}>
          <span className="sx-rec-tick" aria-hidden="true">
            <Glyph ui={c.ok ? "check" : "alert"} className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 break-words">{c.label}</span>
          <span className="sx-rec-row-word">{c.ok ? "Passed" : "Not yet"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Reasons something is held or flagged, each with the amber mark. */
export function ReasonRows({ items, children }: { items: string[]; children?: ReactNode }) {
  return (
    <ul className="sx-rec-rows">
      {items.map((r) => (
        <li key={r} className="sx-rec-row">
          <span className="sx-rec-tick" aria-hidden="true">
            <Glyph ui="alert" className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 break-words">{r}</span>
        </li>
      ))}
      {children}
    </ul>
  );
}

/** Label / value pairs. */
export function FactRows({ rows }: { rows: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <dl className="sx-rec-dl">
      {rows.map((r) => (
        <div key={r.label} className="sx-rec-dl-row">
          <dt>{r.label}</dt>
          <dd>
            {r.value}
            {r.note && <span className="sx-rec-dl-note">{r.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const notGiven = <span className="sx-rec-none">Not given</span>;

/** What happened, newest as the API sends it, on a rail. */
export function Timeline({ items, empty = "Nothing recorded yet." }: { items: { at: string; text: ReactNode }[]; empty?: string }) {
  if (items.length === 0) return <p className="sx-rec-empty">{empty}</p>;
  return (
    <ol className="sx-rec-time">
      {items.map((a, i) => (
        <li key={i}>
          <span className="sx-rec-time-dot" aria-hidden="true" />
          <span className="sx-rec-time-at">{a.at}</span>
          <span className="min-w-0 break-words">{a.text}</span>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------------- skeleton */

/** The record page while it loads, in its own shape: the header with its
 *  button, four tiles, the tab bar and a block of rows. */
export function RecordSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="sx-rec">
      <div aria-hidden="true">
        <div className="sx-ops-ghost h-3.5 w-36 rounded" />
        <div className="mt-4 flex items-center gap-4">
          <div className="sx-ops-ghost size-14 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="sx-ops-ghost h-7 w-64 max-w-full rounded-md" />
            <div className="sx-ops-ghost h-3.5 w-80 max-w-full rounded" />
          </div>
          <div className="sx-ops-ghost hidden h-[42px] w-44 rounded-md sm:block" />
        </div>
        <div className="sx-rec-main">
          <div className="sx-rec-facts">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sx-ops-panel sx-ops-ghost relative h-[5.75rem]" />
            ))}
          </div>
          <div className="sx-ops-ghost mt-6 h-10 w-80 max-w-full rounded-md" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="sx-ops-panel sx-ops-ghost relative h-12" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

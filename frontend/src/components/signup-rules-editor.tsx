"use client";

import { useRef, useState, useTransition, type CSSProperties } from "react";

import { setSignupFlagAction, type RuleResult } from "@/app/(app)/admin/new-signups/rules/actions";
import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import type { SignupFlag } from "@/lib/signup-flags";

/* --------------------------------------------------------------------------
   2S1-FE-07 — the sign-up rules' switches (2S1-BE-10 / -12). Every change is
   the API's to accept (BTG admin only) and audit; the page re-reads after
   each.

   Redrawn 2026-11-21 (owner: "too much information at once … not easily
   understandable"). Each switch is a RuleCard: one question-like title, the
   switch, and a three-step PATH — where a sign-up or a deal starts, the gate
   this rule controls, where it ends. On, a runner travels the path and stops
   at the lit gate (a person, or a confirmation, is waited for); off, the gate
   is crossed out and the runner goes straight through. Under it, what
   happens NOW in one sentence, and the other way in a quieter line — the old
   Off / On box pair said the same thing twice as loud. Styles: `.sx-sr-*` in
   admin/new-signups/rules/rules.css.

   P8-FE-04 / P8-FE-07 — the same card draws all three settings flags: staff
   confirm minors, athletes confirm their own rules, athletes accept the
   current Content Collaboration Agreement. The age table lives in
   rules-board.tsx.
   -------------------------------------------------------------------------- */

export function useRun() {
  const [result, setResult] = useState<RuleResult | null>(null);
  const [pending, start] = useTransition();
  /* Two clicks in one tick both see pending=false; the ref stops the second PUT (QA round, 2026-10-23). */
  const busy = useRef(false);
  const run = (f: () => Promise<RuleResult>) => {
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        setResult(await f());
      } finally {
        busy.current = false;
      }
    });
  };
  return { result, pending, run, clear: () => setResult(null) };
}

export function Said({ r }: { r: RuleResult | null }) {
  if (!r) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={`sx-pop text-xs ${r.ok ? "text-[#86efac]" : "text-[#fca5a5]"}`}>
      {r.message}
    </p>
  );
}

export type FlagWords = {
  /** The chapter tag over the title: "Minors", "Before a deal". */
  tag: string;
  icon: UiGlyph;
  label: string;
  /** What happens with the switch off / on — one sentence each. */
  off: string;
  on: string;
  /** The path: where it starts, the gate this rule controls, where it ends. */
  path: { start: string; gate: string; end: string; startIcon: UiGlyph; gateIcon: UiGlyph };
  /** The badge for each state. */
  badge: { on: string; off: string };
};

export const STAFF_CONFIRM_WORDS: FlagWords = {
  tag: "Minors",
  icon: "users",
  label: "BTG staff confirm minors before approval",
  off: "A minor and their guardian are approved once every check passes.",
  on: "A complete minor waits under Needs review for a person.",
  path: { start: "Minor signs up", gate: "A person checks", end: "Approved", startIcon: "users", gateIcon: "eye" },
  badge: { on: "A person decides", off: "Automatic" },
};

export const RULES_REQUIRED_WORDS: FlagWords = {
  tag: "Before a deal",
  icon: "school",
  label: "Athletes confirm their own rules",
  off: "Asked on sign-up and in the portal; not enforced.",
  on: "Accepting a deal or listing an item waits until a confirmation that counts is on file — for a minor, the guardian's.",
  path: { start: "Deal or listing", gate: "Rules confirmed", end: "Goes ahead", startIcon: "tag", gateIcon: "school" },
  badge: { on: "Enforced", off: "Asked, not enforced" },
};

export const COLLAB_REQUIRED_WORDS: FlagWords = {
  tag: "Before a deal",
  icon: "shield",
  label: "Athletes accept the current Content Collaboration Agreement",
  off: "Asked on sign-up and in the portal; not enforced.",
  on: "Accepting a deal or listing an item waits until the current agreement is accepted — for a minor, by the guardian.",
  path: { start: "Deal or listing", gate: "Agreement accepted", end: "Goes ahead", startIcon: "tag", gateIcon: "shield" },
  badge: { on: "Enforced", off: "Asked, not enforced" },
};

export function RuleCard({ flag, on, words, delay = 0 }: { flag: SignupFlag; on: boolean; words: FlagWords; delay?: number }) {
  const { result, pending, run } = useRun();
  /* Count the flips the server confirms, so the flash and the burst replay
     on each one and never on arrival (adjusting state during render). */
  const [seen, setSeen] = useState(on);
  const [flips, setFlips] = useState(0);
  if (on !== seen) {
    setSeen(on);
    setFlips((n) => n + 1);
  }
  const { path } = words;
  return (
    <article
      data-spot=""
      data-on={on ? "" : undefined}
      data-busy={pending ? "" : undefined}
      aria-label={words.label}
      className="sx-sr-rule sx-ap-rise"
      style={{ "--d": `${delay}s` } as CSSProperties}
    >
      <span aria-hidden="true" className="sx-sr-rule-edge" />
      {flips > 0 && <span key={`f${flips}`} aria-hidden="true" className="sx-sr-rule-flash" />}

      <div className="sx-sr-rule-head">
        <span className="sx-sr-rule-icon" aria-hidden="true">
          <Glyph ui={words.icon} className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="sx-sr-rule-tag">{words.tag}</p>
          <h3 className="sx-sr-rule-title">{words.label}</h3>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={words.label}
          data-flag={flag}
          disabled={pending}
          onClick={() => run(() => setSignupFlagAction(flag, !on))}
          className="sx-sr-switch"
        >
          {flips > 0 && <span key={`b${flips}`} aria-hidden="true" className="sx-sr-burst" />}
          <span aria-hidden="true" className="sx-sr-knob">
            <Glyph ui={on ? "pause" : "bolt"} className="size-3.5" />
          </span>
        </button>
      </div>

      {/* The path — a picture of the sentence below it. */}
      <div className="sx-sr-path" aria-hidden="true">
        <span className="sx-sr-track">
          <span className="sx-sr-runner" />
        </span>
        <span className="sx-sr-node">
          <span className="sx-sr-dot">
            <Glyph ui={path.startIcon} className="size-4" />
          </span>
          <span className="sx-sr-node-label">{path.start}</span>
        </span>
        <span className="sx-sr-node sx-sr-gate">
          <span className="sx-sr-dot">
            <Glyph ui={path.gateIcon} className="size-4" />
          </span>
          <span className="sx-sr-node-label">{path.gate}</span>
          <span className="sx-sr-gate-tag">{on ? "Waits here" : "Skipped"}</span>
        </span>
        <span className="sx-sr-node" data-end="">
          <span className="sx-sr-dot">
            <Glyph ui="check" className="size-4" />
          </span>
          <span className="sx-sr-node-label">{path.end}</span>
        </span>
      </div>

      <div>
        <p className="sx-sr-now-k">{pending ? "Saving…" : "What happens now"}</p>
        <p className="sx-sr-now">{on ? words.on : words.off}</p>
        <p className="sx-sr-else">
          <b>Switch it {on ? "off" : "on"}:</b> {on ? words.off : words.on}
        </p>
      </div>

      <div className="sx-sr-rule-foot">
        <span className="sx-sr-badge">
          <i aria-hidden="true" />
          {on ? words.badge.on : words.badge.off}
        </span>
        <div className="sx-sr-said">
          <Said r={result} />
        </div>
      </div>
    </article>
  );
}

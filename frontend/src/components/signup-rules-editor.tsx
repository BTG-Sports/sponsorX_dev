"use client";

import { useRef, useState, useTransition } from "react";

import { setSignupFlagAction, type RuleResult } from "@/app/(app)/admin/new-signups/rules/actions";
import type { SignupFlag } from "@/lib/signup-flags";

/* --------------------------------------------------------------------------
   2S1-FE-07 — the sign-up rules' controls (2S1-BE-10 / -12). Every change is
   the API's to accept (BTG admin only) and audit; the page re-reads after
   each.

   P1-ART-17 (the Control Panel): each rule is a designed switch
   (`role="switch"`, not a native checkbox) over an Off / On pair that
   spells out both behaviours, the current one lit. The age table's form and
   grid live in rules-board.tsx.

   P8-FE-04 / P8-FE-07 — FlagSwitch is the switch for any of the three
   settings flags; StaffConfirmSwitch stays as the minors one. The two
   confirmation switches (rules, Content Collaboration Agreement) are
   FlagSwitch with their own words.
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
  label: string;
  /** The one-line state under the label. */
  state: { on: string; off: string };
  /** The Off / On pair that spells out both behaviours. */
  off: string;
  on: string;
};

export const STAFF_CONFIRM_WORDS: FlagWords = {
  label: "BTG staff confirm minors before approval",
  state: { on: "On — a person at BTG decides each complete minor.", off: "Off — the checks decide." },
  off: "A minor and their guardian are approved once every check passes.",
  on: "A complete minor waits under Needs review for a person.",
};

export const RULES_REQUIRED_WORDS: FlagWords = {
  label: "Athletes confirm their own rules",
  state: { on: "On — a new deal or listing waits for a confirmation that counts.", off: "Off — asked, not enforced." },
  off: "Asked on sign-up and in the portal; not enforced.",
  on: "Accepting a deal or listing an item waits until a confirmation that counts is on file — for a minor, the guardian's.",
};

export const COLLAB_REQUIRED_WORDS: FlagWords = {
  label: "Athletes accept the current Content Collaboration Agreement",
  state: { on: "On — a new deal or listing waits for the current agreement.", off: "Off — asked, not enforced." },
  off: "Asked on sign-up and in the portal; not enforced.",
  on: "Accepting a deal or listing an item waits until the current agreement is accepted — for a minor, by the guardian.",
};

export function StaffConfirmSwitch({ on }: { on: boolean }) {
  return <FlagSwitch flag="staffConfirmMinors" on={on} words={STAFF_CONFIRM_WORDS} />;
}

export function FlagSwitch({ flag, on, words }: { flag: SignupFlag; on: boolean; words: FlagWords }) {
  const { result, pending, run } = useRun();
  const label = words.label;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          data-flag={flag}
          disabled={pending}
          onClick={() => run(() => setSignupFlagAction(flag, !on))}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/70 disabled:opacity-50 ${
            on
              ? "border-[#fb923c] bg-[#f97a1f]/35 shadow-[0_0_16px_rgba(249,122,31,.45)]"
              : "border-[#63b4f8]/45 bg-[#2e9bf5]/15"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 size-[18px] rounded-full transition-[left,background-color] duration-300 ${on ? "left-[25px] bg-[#ffd1a6]" : "left-1 bg-[#cfe9ff]"}`}
          />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-xs text-[#8a96a3]">{pending ? "Saving…" : on ? words.state.on : words.state.off}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:max-w-3xl" aria-hidden="true">
        {[
          { key: false, title: "Off", body: words.off },
          { key: true, title: "On", body: words.on },
        ].map((s) => {
          const lit = s.key === on;
          return (
            <div
              key={s.title}
              className={`rounded-lg border px-3 py-2.5 text-xs transition-colors duration-300 ${
                lit
                  ? s.key
                    ? "border-[#fb923c]/60 bg-[#f97a1f]/12 text-[#ffd1a6]"
                    : "border-[#63b4f8]/60 bg-[#2e9bf5]/15 text-[#cfe9ff]"
                  : "border-white/10 bg-white/[0.02] text-[#7e88a0]"
              }`}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                <span className={`size-1.5 rounded-full ${lit ? (s.key ? "bg-[#fb923c]" : "bg-[#63b4f8]") : "bg-[#4b5563]"}`} />
                {s.title}
              </span>
              <span className="mt-1 block leading-relaxed">{s.body}</span>
            </div>
          );
        })}
      </div>
      <Said r={result} />
    </div>
  );
}

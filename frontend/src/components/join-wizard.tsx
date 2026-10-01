"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DRAFT_KEY,
  NEVER_ASKED,
  SECTIONS,
  draftToApplication,
  emptyDraft,
  isMinor,
  parseDraft,
  validateSection,
  visibleSections,
  type FieldDef,
  type JoinDraft,
} from "@/lib/join-flow";
import { submitJoinApplication } from "@/app/(public)/join/actions";
import { JoinAgreementStep } from "./join-agreement-step";
import { JoinRestrictionsStep } from "./join-restrictions-step";
import { JoinSubmitted } from "./join-submitted";

/* --------------------------------------------------------------------------
   The /join wizard island (P1-ART-07, wired by P3-FE-01). intro → steps →
   submitted, one §11 section per screen, the §4 guardian branch inserted live
   by the DOB on section 1, drafts in localStorage after every commit ("saved
   after every section" — actually true). Submit POSTs the real application
   through the server action in app/(public)/join/actions.ts; only where the
   answers go changed, exactly as this header always promised.

   Motion rides the sx-join-* system in globals.css; direction is a CSS var;
   focus moves to the step heading on every transition so screen readers
   track the step change.
   -------------------------------------------------------------------------- */

type Demo = "submitted" | "minor" | null;

/* The stage's primary button (join-stage.tsx / packages-stage.tsx): the
   brand gradient with its glow. Keeps the dark CTA ink — white on #2e9bf5
   is 2.95:1 (P1-QA-02), and this is the button the whole form hangs on. */
const CTA =
  "sx-join-sheen min-h-12 w-full rounded-xl bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-5 py-3.5 text-base font-semibold text-cta-ink shadow-[0_0_24px_-2px_rgba(46,155,245,.55)] transition-[box-shadow,transform,opacity] hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(46,155,245,.75)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0";

/* Two-digit HUD numerals: 01, 02 … */
const pad = (n: number) => String(n).padStart(2, "0");

function seed(demo: Demo): JoinDraft {
  const d = emptyDraft();
  if (demo === "minor") {
    d.phase = "steps";
    d.answers.dob = "2009-03-14";
    d.answers.firstName = "Maya";
    d.answers.lastName = "Okonkwo";
  }
  if (demo === "submitted") {
    d.phase = "submitted";
    d.answers = {
      firstName: "Maya", lastName: "Okonkwo", dob: "2009-03-14",
      email: "maya.okonkwo@example.com", guardianName: "Adaeze Okonkwo",
      guardianRelation: "Parent", guardianEmail: "adaeze@example.com",
    };
    d.accepted = true;
    d.submittedAt = "2026-09-17T16:12:00";
  }
  return d;
}

/* SSR renders the seeded state; after hydration the client snapshot swaps in
   the stored draft without a setState-in-effect (journey-strip.tsx precedent).
   getItem returns a stable string, so Object.is dedupes re-renders. */
const emptySubscribe = () => () => {};

export function JoinWizard({ demo }: { demo: Demo }) {
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
  const [touched, setTouched] = useState<JoinDraft | null>(null);
  const draft: JoinDraft =
    touched ?? (demo ? seed(demo) : (parseDraft(storedRaw) ?? emptyDraft()));
  const [dir, setDir] = useState<1 | -1>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");
  const [reviewing, setReviewing] = useState(false);
  const [editingRestrictions, setEditingRestrictions] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  const setDraft = (next: JoinDraft) => setTouched(next);

  /* Persist + saved-indicator theatre. */
  const persist = (next: JoinDraft) => {
    setDraft(next);
    if (!demo) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        /* private mode — the in-memory draft still works this session */
      }
    }
    setSave("saving");
    window.setTimeout(() => setSave("saved"), 350);
  };

  const minor = isMinor(draft.answers.dob ?? "");
  const sections = visibleSections(minor);
  const section = sections[Math.min(draft.step, sections.length - 1)];
  const restrictionsIdx = sections.findIndex((s) => s.id === "restrictions");
  const pastEnforced = draft.step > restrictionsIdx;

  /* The page stage shows its phone hero on the intro only (globals.css,
     .sx-join[data-phase]) — DOM state React never owns, like the glow. Declared first:
     effects run in order, and the scroll below must measure the page
     without the hero. */
  useEffect(() => {
    document.querySelector<HTMLElement>(".sx-join")?.setAttribute("data-phase", draft.phase);
  }, [draft.phase]);

  /* Focus the heading on step / phase changes. The intro is a long list, so
     "Start application" sits a screen below the panel's top: bring the
     panel back up when a change leaves its top above the viewport or under
     the 72px header (a no-op on first render, where it never is). */
  useEffect(() => {
    if (draft.phase === "steps") headingRef.current?.focus({ preventScroll: true });
    const panel = document.getElementById("apply");
    if (panel && panel.getBoundingClientRect().top < 72) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    }
  }, [draft.step, draft.phase]);

  /* Glow crossfade: the ::before lives on the page-level .sx-join-stage
     ancestor, so write the var there directly (reveal.tsx precedent). */
  useEffect(() => {
    document
      .querySelector<HTMLElement>(".sx-join-stage")
      ?.style.setProperty(
        "--sx-join-glow-b",
        draft.phase === "steps" && pastEnforced ? "1" : "0",
      );
  }, [draft.phase, pastEnforced]);

  const setAnswer = (key: string, value: string) =>
    setDraft({ ...draft, answers: { ...draft.answers, [key]: value } });

  /* P3-FE-01 — the real submission. The action runs on the server (API_URL
     never reaches the browser); success carries the reference and intake
     token into the draft, failure lands field messages on the inputs they
     mean and jumps back to the earliest offending step. The draft survives
     every failure — nothing typed is ever lost to a network blip. */
  const [submitting, setSubmitting] = useState(false);
  const [submitMsgs, setSubmitMsgs] = useState<string[]>([]);

  const submit = async () => {
    /* Demo renders never reach the API — a shared ?demo=minor link walked to
       the end would otherwise file a genuine application full of fixture
       names. Simulate the success path locally instead. */
    if (demo) {
      persist({ ...draft, phase: "submitted", submittedAt: new Date().toISOString() });
      return;
    }
    setSubmitting(true);
    setSubmitMsgs([]);
    const result = await submitJoinApplication(draftToApplication(draft));
    setSubmitting(false);
    if (result.ok) {
      persist({
        ...draft,
        phase: "submitted",
        submittedAt: new Date().toISOString(),
        refId: result.id,
        intakeToken: result.token,
      });
      return;
    }
    setSubmitMsgs(result.messages);
    if (Object.keys(result.fields).length > 0) {
      setErrors(result.fields);
      const idx = sections.findIndex((s) =>
        s.fields.some((f) => result.fields[f.key]),
      );
      if (idx >= 0 && idx !== draft.step) {
        setDir(-1);
        persist({ ...draft, step: idx });
      }
    }
  };

  /* Replace only this section's marks; API-reported errors on sections the
     user hasn't revisited yet must survive navigation, or a failed submit's
     guidance evaporates one step at a time. */
  const mergeErrors = (errs: Record<string, string>) =>
    setErrors((prev) => ({
      ...Object.fromEntries(
        Object.entries(prev).filter(
          ([key]) => !section.fields.some((f) => f.key === key),
        ),
      ),
      ...errs,
    }));

  const goNext = () => {
    const errs = validateSection(section, draft.answers);
    mergeErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = section.fields.find((f) => errs[f.key]);
      if (first)
        stepRef.current
          ?.querySelector<HTMLInputElement>(`[name="${first.key}"]`)
          ?.focus();
      return;
    }
    setDir(1);
    if (section.kind === "agreement") {
      void submit();
    } else {
      persist({ ...draft, step: draft.step + 1 });
    }
  };

  const goBack = () => {
    mergeErrors({});
    setDir(-1);
    if (draft.step === 0) persist({ ...draft, phase: "intro" });
    else persist({ ...draft, step: draft.step - 1 });
  };

  /* Leaving the steps clears the marks — otherwise a failed submit's red
     errors and banner survive "finish later"/"start over" and decorate a
     pristine section 1. */
  const finishLater = () => {
    setErrors({});
    setSubmitMsgs([]);
    persist({ ...draft, phase: "intro" });
  };

  const startOrResume = () => {
    setDir(1);
    persist({ ...draft, phase: "steps" });
  };

  const startOver = () => {
    setDir(1);
    setErrors({});
    setSubmitMsgs([]);
    persist({ ...emptyDraft(), phase: "steps" });
  };

  /* ------------------------------------------------------------ submitted */
  if (draft.phase === "submitted") {
    /* Restrictions edit in place — deliberately NOT re-entering the step flow.
       That path used to end at "Submit application", which POSTed a second,
       duplicate application (restrictions aren't even part of the intake
       payload). Edits persist with the local draft; BTG confirms restrictions
       during review either way. */
    if (editingRestrictions) {
      return (
        <div className="px-6 py-10">
          <button
            type="button"
            onClick={() => setEditingRestrictions(false)}
            className="flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
            Back
          </button>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Restrictions &amp; conflicts
          </h1>
          <p className="mt-1 text-sm text-muted">
            Changes save with your application on this device — nothing is
            re-submitted. BTG confirms restrictions during review.
          </p>
          <div className="mt-6">
            <JoinRestrictionsStep
              deals={draft.deals}
              excluded={draft.excluded}
              onDealsChange={(deals) => persist({ ...draft, deals })}
              onExcludedChange={(excluded) => persist({ ...draft, excluded })}
            />
          </div>
          <button
            type="button"
            onClick={() => setEditingRestrictions(false)}
            className={`mt-8 ${CTA}`}
          >
            Done — back to your application
          </button>
        </div>
      );
    }
    if (reviewing) {
      return (
        <div className="px-6 py-10">
          <button
            type="button"
            onClick={() => setReviewing(false)}
            className="flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
            Back
          </button>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Your answers</h1>
          <p className="mt-1 text-sm text-muted">Read-only — the application is with BTG.</p>
          <div className="mt-6 space-y-6">
            {sections
              .filter((s) => s.fields.length > 0)
              .map((s) => (
                <div key={s.id} className="rounded-xl border border-line bg-surface-2 p-4">
                  <h2 className="text-sm font-semibold">{s.title}</h2>
                  <dl className="mt-3 space-y-2">
                    {s.fields.map((f) => (
                      <div key={f.key} className="flex justify-between gap-4 text-sm">
                        <dt className="text-muted">{f.label}</dt>
                        <dd className="text-right text-text">
                          {(draft.answers[f.key] ?? "").trim() || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            {(draft.deals.length > 0 || draft.excluded.length > 0) && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <h2 className="text-sm font-semibold">Restrictions &amp; conflicts</h2>
                {draft.deals.map((deal, i) => (
                  <p key={`${deal.name}-${i}`} className="mt-2 text-sm text-muted">
                    {deal.name} — {deal.category} · {deal.terms}
                  </p>
                ))}
                {draft.excluded.length > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    Will not promote: {draft.excluded.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <JoinSubmitted
        minor={minor}
        guardianName={draft.answers.guardianName ?? ""}
        submittedAt={draft.submittedAt ?? ""}
        refId={draft.refId}
        intakeToken={draft.intakeToken}
        onReviewAnswers={() => setReviewing(true)}
        onUpdateRestrictions={() => setEditingRestrictions(true)}
      />
    );
  }

  /* ---------------------------------------------------------------- intro */
  if (draft.phase === "intro") {
    const hasDraft =
      Object.values(draft.answers).some((v) => v.trim()) || draft.step > 0;
    return (
      <div className="px-6 py-9 sm:px-8">
        <p className="sx-join-rise flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.32em] text-[#7fc4ff]">
          <span aria-hidden className="h-px w-8 bg-[#7fc4ff]/80" />
          Athlete application
          <span aria-hidden className="sx-hud-dashes ml-1" />
        </p>
        <div className="sx-join-rise mt-3 flex items-end justify-between gap-4" style={{ "--sx-d": "0.05s" } as React.CSSProperties}>
          <h1 className="text-3xl font-semibold tracking-tight">Ten sections</h1>
          <span className="mb-1 shrink-0 rounded border border-[#9cc7ff]/30 px-2 py-0.5 font-mono text-[11px] tracking-wider text-on-media/75">
            ~8 MIN
          </span>
        </div>
        <p className="sx-join-rise mt-2 text-sm leading-relaxed text-muted" style={{ "--sx-d": "0.1s" } as React.CSSProperties}>
          About 8 minutes. Progress is saved after every section — leave and
          come back.
        </p>

        <div className="relative mt-8">
          <span
            aria-hidden
            className="sx-join-rail absolute bottom-4 left-[15px] top-4 w-[2px] rounded-full bg-gradient-to-b from-[#7fd0ff]/60 via-[#2e9bf5]/50 to-[#fb923c]/60 shadow-[0_0_10px_rgba(46,155,245,.45)]"
          />
          <ol className="space-y-1">
            {SECTIONS.map((s, i) => {
              const enforced = s.id === "restrictions";
              const conditional = s.minorOnly === true;
              return (
                <li
                  key={s.id}
                  className="sx-join-rise relative flex items-start gap-4 py-2.5"
                  style={{ "--sx-d": `${0.15 + i * 0.045}s` } as React.CSSProperties}
                >
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
                    style={i === 0 ? ({ "--ping": "#4fb0ff", "--ping-cycle": "3.2s" } as React.CSSProperties) : undefined}
                  >
                    {pad(i + 1)}
                  </span>
                  {conditional ? (
                    <div className="flex-1 rounded-xl border border-dashed border-accent/45 bg-accent/[0.06] p-3.5 shadow-[inset_0_0_24px_-10px_rgba(249,122,31,.45)]">
                      <p className="text-base font-medium text-text">{s.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-accent">
                        The one branch. Appears only if the date of birth on
                        section 1 is under 18. Nothing else changes.
                      </p>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <p className="text-base font-medium text-text">{s.title}</p>
                      {s.railNote && (
                        <p className={`mt-0.5 text-sm ${enforced ? "text-accent" : "text-muted"}`}>
                          {s.railNote}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            <li className="sx-join-rise relative flex items-center gap-4 py-2.5" style={{ "--sx-d": `${0.15 + SECTIONS.length * 0.045}s` } as React.CSSProperties}>
              <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-success/50 bg-[#06151a] shadow-[0_0_12px_rgba(34,201,141,.4)]">
                <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.9s" } as React.CSSProperties} />
                </svg>
              </span>
              <p className="text-base text-muted">Submitted — reviewed by hand</p>
            </li>
          </ol>
        </div>

        <div className="sx-join-rise mt-8" style={{ "--sx-d": "0.75s" } as React.CSSProperties}>
          <button
            type="button"
            onClick={startOrResume}
            className={CTA}
          >
            {hasDraft ? `Resume — section ${draft.step + 1} of ${sections.length}` : "Start application"}
          </button>
          {hasDraft && (
            <button
              type="button"
              onClick={startOver}
              className="mt-3 min-h-11 w-full rounded-xl px-5 py-2.5 text-sm text-muted transition-colors hover:text-text"
            >
              Start over
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- steps */
  const n = draft.step + 1;
  const total = sections.length;
  const armed = section.kind !== "agreement" || draft.accepted;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      {/* chrome */}
      <div className="border-b border-[#9cc7ff]/15 bg-gradient-to-b from-[#0b1b35]/50 to-transparent px-6 pb-4 pt-5 sm:px-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            disabled={submitting}
            className="grid size-11 -ml-2.5 place-items-center rounded-lg text-muted transition-colors hover:bg-[#2e9bf5]/12 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 16 16" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
          </button>
          <p aria-live="polite" className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted">
            <span className="sr-only">
              Section {n} of {total}
            </span>
            <span aria-hidden>
              Section <span className="font-mono text-[13px] font-bold tracking-normal text-text">{pad(n)}</span>
              <span className="mx-1 text-faint">/</span>
              <span className="font-mono tracking-normal">{pad(total)}</span>
            </span>
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-success">
            <span className={`size-1.5 rounded-full bg-success shadow-[0_0_8px_var(--sx-success)] ${save === "saving" ? "sx-pop" : ""}`} />
            {save === "saving" ? "Saving…" : "Saved"}
          </p>
        </div>
        <div className="sx-join-segs mt-3.5 flex gap-1.5">
          {sections.map((s, i) => (
            <span
              key={s.id}
              className={`sx-join-seg h-1 flex-1 rounded-full ${
                i < draft.step
                  ? `sx-join-seg--fill ${s.id === "restrictions" ? "text-accent" : "text-primary"} bg-surface-2`
                  : i === draft.step
                    ? `sx-join-seg--active ${s.id === "restrictions" ? "text-accent" : "text-primary"} bg-surface-2`
                    : "bg-surface-2"
              }`}
            />
          ))}
        </div>
      </div>

      {/* body */}
      <div
        key={`${section.id}-${dir}`}
        ref={stepRef}
        className="sx-join-step relative flex-1 px-6 py-7 sm:px-8"
        style={{ "--sx-from": dir === 1 ? "24px" : "-24px" } as React.CSSProperties}
      >
        {/* the section's number, outlined behind the heading (the /packages
            cards' tier numeral) */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-1 select-none font-mono text-[104px] font-bold leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(158,208,255,.13)]"
        >
          {pad(n)}
        </span>
        {section.kind === "restrictions" && (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4l5-2z" />
            </svg>
            Enforced
          </span>
        )}
        {section.kind === "agreement" && (
          <span className="mb-3 inline-flex items-center rounded-lg border border-warn/60 bg-warn/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-warn">
            Draft
          </span>
        )}
        <h1 ref={headingRef} tabIndex={-1} className="relative text-3xl font-semibold tracking-tight outline-none">
          {section.heading}
        </h1>
        <p className="relative mt-2 text-sm leading-relaxed text-muted">{section.sub}</p>

        <div className="relative mt-6">
          {section.kind === "fields" && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {section.fields.map((f, i) => (
                <Field
                  key={f.key}
                  def={f}
                  index={i}
                  value={draft.answers[f.key] ?? ""}
                  error={errors[f.key]}
                  onChange={(v) => setAnswer(f.key, v)}
                />
              ))}
              {section.id === "identity" && (
                <div className="sx-expand col-span-2" data-open={minor}>
                  <div>
                    <div className="rounded-xl border border-accent/50 border-l-2 border-l-accent bg-surface-2 p-4">
                      <p className="flex items-center gap-2.5 text-sm font-semibold text-text">
                        <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="var(--sx-accent)" strokeWidth="1.5" strokeLinecap="round">
                          <circle cx="8" cy="8" r="6.5" />
                          <path d="M8 5v3.5M8 11h.01" />
                        </svg>
                        One extra section is added
                      </p>
                      <p className="mt-1.5 pl-[26px] text-sm leading-relaxed text-accent">
                        Because you&apos;re under 18, section 8 asks for a parent,
                        guardian or authorized representative. Everything else in
                        the application is the same.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {section.id === "payment" && (
                <p className="col-span-2 rounded-xl border border-line bg-surface-2 p-4 text-sm leading-relaxed text-muted">
                  {NEVER_ASKED}
                </p>
              )}
            </div>
          )}
          {section.kind === "restrictions" && (
            <JoinRestrictionsStep
              deals={draft.deals}
              excluded={draft.excluded}
              onDealsChange={(deals) => setDraft({ ...draft, deals })}
              onExcludedChange={(excluded) => setDraft({ ...draft, excluded })}
            />
          )}
          {section.kind === "agreement" && (
            <JoinAgreementStep
              accepted={draft.accepted}
              onAcceptedChange={(accepted) => setDraft({ ...draft, accepted })}
            />
          )}
        </div>
      </div>

      {/* action bar */}
      <div className="sticky bottom-0 border-t border-[#9cc7ff]/20 bg-[#040a16]/85 px-6 py-4 shadow-[0_-1px_0_rgba(127,208,255,.12),0_-18px_40px_-20px_rgba(46,155,245,.35)] backdrop-blur-xl sm:px-8">
        {submitMsgs.length > 0 && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {submitMsgs.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={goNext}
          disabled={!armed || submitting}
          data-armed={section.kind === "agreement" && draft.accepted}
          className={CTA}
        >
          {section.kind === "agreement"
            ? submitting
              ? "Submitting…"
              : "Submit application"
            : "Save and continue"}
        </button>
        {section.kind !== "agreement" && (
          <button
            type="button"
            onClick={finishLater}
            className="mt-1 min-h-11 w-full rounded-xl px-5 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Save and finish later
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  def,
  index,
  value,
  error,
  onChange,
}: {
  def: FieldDef;
  index: number;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={`sx-join-rise block ${def.half ? "col-span-1" : "col-span-2"}`}
      style={{ "--sx-d": `${index * 0.035}s` } as React.CSSProperties}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{def.label}</span>
      <input
        type={def.type}
        name={def.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        aria-invalid={!!error}
        className={`mt-1.5 min-h-11 w-full rounded-xl border bg-[#07132a]/70 px-3.5 py-3 text-base text-text shadow-[inset_0_1px_0_rgba(158,208,255,.06)] placeholder:text-faint transition-[border-color,box-shadow] focus:outline-none ${
          error
            ? "border-danger shadow-[0_0_0_3px_rgba(255,77,79,.14)]"
            : "border-[#9cc7ff]/20 hover:border-[#9cc7ff]/35 focus:border-[#7fd0ff] focus:shadow-[0_0_0_3px_rgba(46,155,245,.18),0_0_20px_-4px_rgba(46,155,245,.6)]"
        }`}
      />
      {def.hint && !error && <span className="mt-1 block text-[11px] text-faint">{def.hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-danger">{error}</span>}
    </label>
  );
}

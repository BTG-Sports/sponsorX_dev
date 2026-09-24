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

  /* Focus the heading on step / phase changes. */
  useEffect(() => {
    if (draft.phase === "steps") headingRef.current?.focus({ preventScroll: true });
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

  const goNext = () => {
    const errs = validateSection(section, draft.answers);
    setErrors(errs);
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
    setErrors({});
    setDir(-1);
    if (draft.step === 0) persist({ ...draft, phase: "intro" });
    else persist({ ...draft, step: draft.step - 1 });
  };

  const finishLater = () => persist({ ...draft, phase: "intro" });

  const startOrResume = () => {
    setDir(1);
    persist({ ...draft, phase: "steps" });
  };

  const startOver = () => {
    setDir(1);
    persist({ ...emptyDraft(), phase: "steps" });
  };

  /* ------------------------------------------------------------ submitted */
  if (draft.phase === "submitted") {
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
                {draft.deals.map((deal) => (
                  <p key={deal.name} className="mt-2 text-sm text-muted">
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
        onReviewAnswers={() => setReviewing(true)}
        onUpdateRestrictions={() => {
          setDir(1);
          persist({ ...draft, phase: "steps", step: restrictionsIdx });
        }}
      />
    );
  }

  /* ---------------------------------------------------------------- intro */
  if (draft.phase === "intro") {
    const hasDraft =
      Object.values(draft.answers).some((v) => v.trim()) || draft.step > 0;
    return (
      <div className="px-6 py-10">
        <p className="sx-join-rise text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Athlete application
        </p>
        <h1 className="sx-join-rise mt-2 text-3xl font-semibold tracking-tight" style={{ "--sx-d": "0.05s" } as React.CSSProperties}>
          Ten sections
        </h1>
        <p className="sx-join-rise mt-2 text-sm leading-relaxed text-muted" style={{ "--sx-d": "0.1s" } as React.CSSProperties}>
          About 8 minutes. Progress is saved after every section — leave and
          come back.
        </p>

        <div className="relative mt-8">
          <span aria-hidden className="sx-join-rail absolute bottom-4 left-[15px] top-4 w-px bg-line" />
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
                    className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      enforced
                        ? "border border-accent bg-bg text-accent"
                        : conditional
                          ? "border border-dashed border-accent/70 bg-bg text-accent"
                          : i === 0
                            ? "border border-primary bg-bg text-primary"
                            : "bg-surface-2 text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {conditional ? (
                    <div className="flex-1 rounded-xl border border-line border-l-2 border-l-accent bg-surface-2 p-3.5">
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
              <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2">
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
            className="sx-join-sheen min-h-12 w-full rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-cta-ink transition-colors hover:bg-primary-soft"
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
      <div className="border-b border-line px-6 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid size-11 -ml-2.5 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <svg viewBox="0 0 16 16" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
          </button>
          <p aria-live="polite" className="text-sm text-muted">
            Section {n} of {total}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-success">
            <span className={`size-1.5 rounded-full bg-success ${save === "saving" ? "sx-pop" : ""}`} />
            {save === "saving" ? "Saving…" : "Progress saved"}
          </p>
        </div>
        <div className="mt-3.5 flex gap-1.5">
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
        className="sx-join-step flex-1 px-6 py-7"
        style={{ "--sx-from": dir === 1 ? "24px" : "-24px" } as React.CSSProperties}
      >
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
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
          {section.heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{section.sub}</p>

        <div className="mt-6">
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
      <div className="sticky bottom-0 border-t border-line bg-bg/95 px-6 py-4 backdrop-blur lg:rounded-b-2xl">
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
          className="sx-join-sheen min-h-12 w-full rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-cta-ink transition-all hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
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
      <span className="text-[11px] font-medium text-muted">{def.label}</span>
      <input
        type={def.type}
        name={def.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        aria-invalid={!!error}
        className={`mt-1.5 min-h-11 w-full rounded-xl border bg-surface-2 px-3.5 py-3 text-base text-text placeholder:text-faint transition-colors focus:outline-none ${
          error ? "border-danger" : "border-line focus:border-primary/60"
        }`}
      />
      {def.hint && !error && <span className="mt-1 block text-[11px] text-faint">{def.hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-danger">{error}</span>}
    </label>
  );
}

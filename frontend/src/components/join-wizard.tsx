"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { COLLAB_WORDS, RULES_WORDS, wordingMoved, type ApiRulesWording } from "@/lib/confirmations-live";
import {
  DRAFT_KEY,
  NEVER_ASKED,
  draftToApplication,
  emptyDraft,
  isMinor,
  parseDraft,
  rulesTickCounts,
  validateSection,
  visibleSections,
  type CollabAgreement,
  type JoinDraft,
} from "@/lib/join-flow";
import { submitJoinApplication } from "@/app/(public)/join/actions";
import { Confetti, Words, reducedMotion } from "@/components/brief-fx";
import { FocusRail, FocusShell, LineField, delay } from "@/components/focus-wizard";
import { JoinAgreementStep } from "./join-agreement-step";
import { JoinRestrictionsStep } from "./join-restrictions-step";
import { JoinSubmitted } from "./join-submitted";

/* --------------------------------------------------------------------------
   The athlete application — the whole /join/apply page (P1-ART-07, wired by
   P3-FE-01; POL-FE-115, 2026-11-19).

   It used to sit inside the /join landing, in a 460px panel beside the hero.
   The landing keeps its hero and now has a button that comes here
   (join-start.tsx); this page is nothing but the application, drawn on the
   same full-screen frame as the sponsor brief (focus-wizard.tsx, athlete
   blue): one §11 section per screen, the steps down the left from lg, a
   progress line and "Step 3 of 9" below it.

   The sections, their fields, the §4 guardian branch (inserted live by the
   date of birth on step 1) and what is sent are unchanged (join-flow.ts).
   Every edit is kept on this device as it is made, so "Save and finish
   later" is simply the way out. Submit POSTs the real application through
   the server action in app/(public)/join/actions.ts; the draft survives
   every failure.

   A finished step can be opened from the list. Going forward that way
   checks the step being left first, the same as "Save and continue".

   P8-FE-03 / P8-FE-07 — the last step carries two wordings read by the page
   (the agreement and, for an adult, the rules). Each tick counts only for
   the version on screen. When the API refuses because a wording moved on
   (confirmations-live.ts: wordingMoved), the tick is cleared, the page is
   refreshed so the new wording comes down, and the step asks again.

   Demo modes never reach the API: ?demo=minor lands on step 1 with an
   under-18 date of birth, ?demo=submitted on the after-submit state.
   -------------------------------------------------------------------------- */

type Demo = "submitted" | "minor" | null;

const STEP_MS = 200;

/* What a browser may fill in by itself. The guardian's fields are never
   filled: the browser would offer the athlete's own name and email. */
const AUTOCOMPLETE: Record<string, string> = {
  firstName: "given-name",
  lastName: "family-name",
  dob: "bday",
  email: "email",
  phone: "tel",
  city: "address-level2",
  region: "address-level1",
  country: "country-name",
};

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

export function JoinWizard({
  demo,
  agreement = null,
  rules = null,
}: {
  demo: Demo;
  agreement?: CollabAgreement | null;
  rules?: ApiRulesWording | null;
}) {
  const router = useRouter();
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
  const draft: JoinDraft = touched ?? (demo ? seed(demo) : (parseDraft(storedRaw) ?? emptyDraft()));
  const sent = draft.phase === "submitted";

  const minor = isMinor(draft.answers.dob ?? "");
  const sections = visibleSections(minor);
  const step = Math.max(0, Math.min(Number.isInteger(draft.step) ? draft.step : 0, sections.length - 1));
  const section = sections[step];
  const n = step + 1;
  const total = sections.length;

  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /* The furthest step opened in this visit; the list lets you back to any of them. */
  const [furthest, setFurthest] = useState(0);
  const reached = Math.max(furthest, step);
  const [reviewing, setReviewing] = useState(false);
  const [editingRestrictions, setEditingRestrictions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsgs, setSubmitMsgs] = useState<string[]>([]);
  /* A wording moved on under the applicant: not an error of theirs, a note
     above the step asking them to read and tick the new text. */
  const [notice, setNotice] = useState<string | null>(null);
  /* Only an application sent in this visit gets the burst. */
  const [celebrate, setCelebrate] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  /* A step change or a submit in flight. Refs, not state: a second click in
     the same tick must see the first (a state flag is still false there). */
  const moving = useRef(false);
  const posting = useRef(false);
  const landed = useRef(false);

  /* Every edit is kept on this device as it is made. Being on this page is
     being in the steps, so a draft that had not started yet now has. */
  const write = (next: JoinDraft) => {
    const out: JoinDraft = next.phase === "intro" ? { ...next, phase: "steps" } : next;
    setTouched(out);
    if (demo) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(out));
    } catch {
      /* private mode — the in-memory draft still works this session */
    }
  };
  const setAnswer = (key: string, value: string) => {
    if (errors[key]) setErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key)));
    write({ ...draft, answers: { ...draft.answers, [key]: value } });
  };

  /* The tick counts only for the agreement on screen; a demo never reaches the API. */
  const acceptedCurrent = draft.accepted && (demo !== null || (agreement !== null && draft.acceptedAgreementId === agreement.agreementId));
  /* P8-FE-03 — likewise the rules tick, for the wording on screen. A minor
     has no box: their guardian confirms on the set-up page. */
  const rulesCurrent = Boolean(draft.rulesAccepted) && (demo !== null || rulesTickCounts(draft, rules));
  /* An adult's application confirms their own rules too; a minor's needs
     only the agreement tick (the guardian's page asks about the rules). */
  const ticked = acceptedCurrent && (minor || rulesCurrent);
  const armed = section.kind !== "agreement" || ticked;

  /* Replace only this section's marks; API-reported errors on sections the
     user hasn't revisited yet must survive navigation, or a failed submit's
     guidance evaporates one step at a time. */
  const mergeErrors = (errs: Record<string, string>) =>
    setErrors((prev) => ({
      ...Object.fromEntries(Object.entries(prev).filter(([key]) => !section.fields.some((f) => f.key === key))),
      ...errs,
    }));

  /* Checks the step on screen, marks what is missing and goes to the first gap. */
  const passes = () => {
    const errs = validateSection(section, draft.answers);
    mergeErrors(errs);
    const first = section.fields.find((f) => errs[f.key]);
    if (first) stepRef.current?.querySelector<HTMLElement>(`[data-field="${first.key}"]`)?.focus();
    return Object.keys(errs).length === 0;
  };

  /* The step leaves, then the next one arrives. While it leaves it is inert,
     so nothing typed in those 200ms is lost to the step change. */
  const go = (to: number) => {
    if (moving.current || to === step) return;
    moving.current = true;
    setDir(to > step ? 1 : -1);
    setLeaving(true);
    window.setTimeout(
      () => {
        write({ ...draft, step: to });
        setFurthest((f) => Math.max(f, to, step));
        setLeaving(false);
        moving.current = false;
      },
      reducedMotion() ? 0 : STEP_MS,
    );
  };

  /* P3-FE-01 — the real submission. The action runs on the server (API_URL
     never reaches the browser); success carries the reference and intake
     token into the draft, failure lands field messages on the inputs they
     mean and jumps back to the earliest offending step. The draft survives
     every failure — nothing typed is ever lost to a network blip. */
  const submit = async () => {
    if (posting.current) return;
    /* Demo renders never reach the API — a shared ?demo=minor link walked to
       the end would otherwise file a genuine application full of fixture
       names. Simulate the success path locally instead. */
    if (demo) {
      write({ ...draft, phase: "submitted", submittedAt: new Date().toISOString() });
      return;
    }
    posting.current = true;
    setSubmitting(true);
    setSubmitMsgs([]);
    setNotice(null);
    try {
      /* P8-FE-07 — the agreement ticked travels with the application, so the
         acceptance is recorded with the text's fingerprint (P8-BE-04).
         P8-FE-03 — and, for an adult, the rules wording version they confirmed
         (draftToApplication adds it; never for a minor). */
      const result = await submitJoinApplication({
        ...draftToApplication(draft, rules),
        ...(agreement && acceptedCurrent ? { agreement: { agreementId: agreement.agreementId, bodyHashShown: agreement.bodyHash } } : {}),
      });
      if (result.ok) {
        setCelebrate(true);
        write({ ...draft, phase: "submitted", submittedAt: new Date().toISOString(), refId: result.id, intakeToken: result.token });
        window.scrollTo({ top: 0 });
        return;
      }
      /* A wording moved on since the page loaded: clear that tick, pull the
         current text down (the page re-reads both on refresh), and ask again
         on the agreement step. Nothing typed is lost — the draft stays. */
      const moved = result.status !== undefined ? wordingMoved(result.status, { error: { code: result.code, message: result.messages.join(" ") } }) : null;
      if (moved) {
        const agreementStep = sections.findIndex((s) => s.kind === "agreement");
        write(
          moved === "rules"
            ? { ...draft, rulesAccepted: false, rulesVersion: undefined, step: agreementStep }
            : { ...draft, accepted: false, acceptedAgreementId: undefined, step: agreementStep },
        );
        setNotice(moved === "rules" ? RULES_WORDS.stale : COLLAB_WORDS.changed);
        router.refresh();
        return;
      }
      setSubmitMsgs(result.messages);
      if (Object.keys(result.fields).length > 0) {
        setErrors(result.fields);
        const idx = sections.findIndex((s) => s.fields.some((f) => result.fields[f.key]));
        if (idx >= 0 && idx !== step) {
          setDir(-1);
          write({ ...draft, step: idx });
        }
      }
    } catch {
      setSubmitMsgs(["Something went wrong and the application was not sent. Your answers are saved. Try again."]);
    } finally {
      posting.current = false;
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (moving.current || !passes()) return;
    if (section.kind === "agreement") {
      if (armed) void submit();
      return;
    }
    go(step + 1);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    goNext();
  };

  /* A new step takes the focus on its heading, so a screen reader reads it.
     Not on arrival: the page's first focus is the visitor's. */
  useEffect(() => {
    if (!landed.current) {
      landed.current = true;
      return;
    }
    if (!sent) headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [step, sent]);

  /* ------------------------------------------------------------ submitted */
  if (sent) {
    return (
      <FocusShell
        tone="athlete"
        step={step}
        count={total}
        done
        progress={1}
        progressLabel="Application progress"
        progressText="Application submitted"
        exit={{ href: "/", label: "Back to site" }}
      >
        <main className="relative mx-auto w-full max-w-2xl flex-1 px-5 pb-16 pt-8 sm:px-8 lg:pt-12">
          {celebrate && <Confetti />}
          {/* Restrictions edit in place — deliberately NOT re-entering the step flow.
              That path used to end at "Submit application", which POSTed a second,
              duplicate application (restrictions aren't even part of the intake
              payload). Edits persist with the local draft; BTG confirms restrictions
              during review either way. */}
          {editingRestrictions ? (
            <>
              <BackLink onClick={() => setEditingRestrictions(false)} />
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Restrictions &amp; conflicts</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Changes save with your application on this device. Nothing is sent again. BTG confirms restrictions during review.
              </p>
              <div className="mt-6">
                <JoinRestrictionsStep
                  deals={draft.deals}
                  excluded={draft.excluded}
                  onDealsChange={(deals) => write({ ...draft, deals })}
                  onExcludedChange={(excluded) => write({ ...draft, excluded })}
                />
              </div>
              <button type="button" onClick={() => setEditingRestrictions(false)} className="bx-cta sx-join-sheen mt-8 inline-flex items-center justify-center px-7 text-base">
                Done, back to your application
              </button>
            </>
          ) : reviewing ? (
            <>
              <BackLink onClick={() => setReviewing(false)} />
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Your answers</h1>
              <p className="mt-2 text-sm text-muted">This is what you sent. It can&rsquo;t be changed here because it&rsquo;s with BTG now.</p>
              <div className="mt-6 space-y-4">
                {sections
                  .filter((s) => s.fields.length > 0)
                  .map((s) => (
                    <div key={s.id} className="bx-panel p-5">
                      <h2 className="text-sm font-semibold">{s.title}</h2>
                      <dl className="mt-3 space-y-2">
                        {s.fields.map((f) => (
                          <div key={f.key} className="flex justify-between gap-4 text-sm">
                            <dt className="text-muted">{f.label}</dt>
                            <dd className="min-w-0 break-words text-right text-text">{(draft.answers[f.key] ?? "").trim() || "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                {(draft.deals.length > 0 || draft.excluded.length > 0) && (
                  <div className="bx-panel p-5">
                    <h2 className="text-sm font-semibold">Restrictions &amp; conflicts</h2>
                    {draft.deals.map((deal, i) => (
                      <p key={`${deal.name}-${i}`} className="mt-2 text-sm text-muted">
                        {deal.name} — {deal.category} · {deal.terms}
                      </p>
                    ))}
                    {draft.excluded.length > 0 && <p className="mt-2 text-sm text-muted">Will not promote: {draft.excluded.join(", ")}</p>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <JoinSubmitted
              minor={minor}
              guardianName={draft.answers.guardianName ?? ""}
              submittedAt={draft.submittedAt ?? ""}
              refId={draft.refId}
              intakeToken={draft.intakeToken}
              onReviewAnswers={() => setReviewing(true)}
              onUpdateRestrictions={() => setEditingRestrictions(true)}
            />
          )}
        </main>
      </FocusShell>
    );
  }

  /* ---------------------------------------------------------------- steps */
  const guardianStep = visibleSections(true).findIndex((s) => s.id === "guardian") + 1;
  const tall = section.kind !== "fields";

  return (
    <FocusShell
      tone="athlete"
      step={step}
      count={total}
      progress={(step + 0.35) / total}
      progressLabel="Application progress"
      progressText={`Step ${n} of ${total}: ${section.title}`}
      exit={{ href: "/join", label: "Save and finish later" }}
    >
      <div className="relative mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14 lg:px-10 xl:gap-20">
        <FocusRail
          compact
          title="Your application"
          label="Application steps"
          steps={sections.map((s, i) => ({
            id: s.id,
            label: s.title,
            state: i === step ? "now" : i <= reached ? "done" : "next",
            open: i !== step && i <= reached && !submitting,
          }))}
          onOpen={(i) => {
            /* Forward is "Save and continue" by another door: the same check. */
            if (i > step && !passes()) return;
            go(i);
          }}
          note="Your answers are saved on this device as you go."
        />

        <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col">
          <div
            key={section.id}
            ref={stepRef}
            inert={leaving}
            data-leaving={leaving ? "" : undefined}
            className="bx-step flex flex-1 flex-col px-5 pb-6 pt-7 sm:px-8 lg:justify-center lg:px-0 lg:pt-4"
            style={{ "--bx-dir": dir } as CSSProperties}
          >
            <p className="bx-rise flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-soft">
              <span>
                Step {n} of {total}
                <span className="text-muted"> · {section.title}</span>
              </span>
              {section.kind === "restrictions" && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/12 px-2.5 py-1 tracking-[0.14em] text-accent">
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
                    <path d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4l5-2z" />
                  </svg>
                  Enforced
                </span>
              )}
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className={`mt-4 font-semibold leading-[1.04] tracking-tight outline-none ${
                /* The agreement and the restrictions fill the screen; their heading steps back. */
                tall ? "text-[clamp(1.8rem,3.4vw,2.6rem)]" : "max-w-[20ch] text-[clamp(2rem,5.2vw,3.7rem)]"
              }`}
            >
              <Words text={section.heading} />
            </h1>
            <p className="bx-rise mt-4 max-w-xl text-base leading-relaxed text-muted" style={delay(0.22)}>
              {section.kind === "agreement" && agreement ? `${section.sub} · version ${agreement.version}` : section.sub}
            </p>

            <div className="mt-8 max-w-[760px]">
              {section.kind === "fields" && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-10">
                  {section.fields.map((f, i) => (
                    <LineField
                      key={f.key}
                      prefix="join"
                      def={f}
                      hint={f.hint}
                      /* "At least one handle": the three are not each optional. */
                      optional={!f.required && !(section.id === "social" && f.key !== "followers")}
                      autoComplete={AUTOCOMPLETE[f.key] ?? "off"}
                      className={`bx-rise ${f.half ? "col-span-1" : "col-span-2"}`}
                      style={delay(0.3 + i * 0.06)}
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
                            <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="var(--sx-accent)" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                              <circle cx="8" cy="8" r="6.5" />
                              <path d="M8 5v3.5M8 11h.01" />
                            </svg>
                            One extra step is added
                          </p>
                          <p className="mt-1.5 pl-[26px] text-sm leading-relaxed text-accent">
                            Because you&apos;re under 18, step {guardianStep} asks for a parent, guardian or authorized representative. Everything else in the
                            application is the same.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {section.id === "payment" && (
                    <p className="bx-rise bx-panel col-span-2 p-4 text-sm leading-relaxed text-muted" style={delay(0.42)}>
                      {NEVER_ASKED}
                    </p>
                  )}
                </div>
              )}
              {section.kind === "restrictions" && (
                /* Its own small form (add a deal) has no <form> of its own: keep
                   Enter in one of its boxes from submitting this step. */
                <div
                  className="bx-rise"
                  style={delay(0.3)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
                  }}
                >
                  <JoinRestrictionsStep
                    deals={draft.deals}
                    excluded={draft.excluded}
                    onDealsChange={(deals) => write({ ...draft, deals })}
                    onExcludedChange={(excluded) => write({ ...draft, excluded })}
                  />
                </div>
              )}
              {section.kind === "agreement" && (
                <div className="bx-rise" style={delay(0.3)}>
                  {notice && (
                    <p role="status" className="mb-5 rounded-xl border border-accent/50 border-l-2 border-l-accent bg-surface-2 p-4 text-sm leading-relaxed text-accent">
                      {notice}
                    </p>
                  )}
                  <JoinAgreementStep
                    agreement={agreement}
                    accepted={acceptedCurrent}
                    onAcceptedChange={(accepted) => write({ ...draft, accepted, acceptedAgreementId: accepted ? agreement?.agreementId : undefined })}
                    rules={rules}
                    minor={minor}
                    rulesAccepted={rulesCurrent}
                    onRulesAcceptedChange={(rulesAccepted) => write({ ...draft, rulesAccepted, rulesVersion: rulesAccepted ? rules?.version : undefined })}
                  />
                </div>
              )}
            </div>
          </div>

          {/* action bar — pinned, except on a short screen (a phone in
              landscape, ~390px tall), where it covered most of the step */}
          <div className="bx-actions bx-chrome sticky bottom-0 z-10 px-5 pb-5 pt-8 sm:px-8 lg:px-0 lg:pb-8 [@media(max-height:500px)]:static">
            {submitMsgs.length > 0 && (
              <div role="alert" className="mb-3 max-w-[760px] rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger">
                {submitMsgs.map((m) => (
                  <p key={m}>{m}</p>
                ))}
              </div>
            )}
            <div className="flex max-w-[760px] items-center gap-3">
              {step > 0 && (
                <button type="button" onClick={() => go(step - 1)} disabled={submitting} className="bx-ghost inline-flex items-center gap-2 px-4 sm:px-5">
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 3.5L5.5 8l4.5 4.5" />
                  </svg>
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={!armed || submitting}
                aria-busy={submitting}
                data-armed={section.kind === "agreement" && ticked}
                className="bx-cta sx-join-sheen inline-flex flex-1 items-center justify-center gap-2.5 px-6 text-base sm:flex-none sm:px-9"
              >
                {section.kind === "agreement" ? (
                  submitting ? (
                    <>
                      <span className="bx-spin" aria-hidden />
                      Submitting…
                    </>
                  ) : (
                    "Submit application"
                  )
                ) : (
                  "Save and continue"
                )}
                {!submitting && (
                  <svg viewBox="0 0 16 16" className="bx-arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                )}
              </button>
              {section.kind === "fields" && <p className="bx-keys ml-2 text-[13px] text-faint">or press Enter</p>}
            </div>
            <p className="mt-3 text-[12px] text-faint">
              {section.kind === "agreement"
                ? armed
                  ? "This sends your application to BTG."
                  : minor
                    ? "Tick the box above to submit."
                    : "Tick both boxes above to submit."
                : "Nothing is sent until you submit on the last step."}
            </p>
          </div>
        </form>
      </div>
    </FocusShell>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-text">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 3.5L5.5 8l4.5 4.5" />
      </svg>
      Back
    </button>
  );
}

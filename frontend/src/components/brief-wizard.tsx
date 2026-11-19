"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AUDIENCES,
  BRIEF_DRAFT_KEY,
  BRIEF_STEPS,
  BUDGET_BANDS,
  COMMON_BUSINESS_TYPES,
  GOALS,
  GOAL_HINTS,
  MORE_BUSINESS_TYPES,
  OTHER_BUSINESS_TYPE,
  TIMINGS,
  businessTypeText,
  emptyBriefDraft,
  packageOption,
  parseBriefDraft,
  resumeStep,
  stepAnswer,
  validateBriefStep,
  type BriefDraft,
  type BriefStepId,
  type BusinessType,
} from "@/lib/brief-flow";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { submitBriefRequest } from "@/app/brief/actions";
import { Confetti, SpotGroup, Words, reducedMotion } from "@/components/brief-fx";
import { FocusRail, FocusShell, LineField, Problem, delay } from "@/components/focus-wizard";
import { SponsorProofUpload } from "@/components/sponsor-proof-upload";
import { SponsorRequestStanding } from "@/components/sponsor-request-standing";
import type { ApiSponsorRequestStatus } from "@/lib/sponsor-request-live";

/* --------------------------------------------------------------------------
   The /brief wizard — the whole page (POL-FE-114, 2026-11-19).

   It was a 430px card beside a marketing panel, inside the site's header and
   footer, with two or three unrelated questions on each of four steps. It is
   now its own full-screen page that asks one thing at a time:

     goal → business → budget → where → contact → review and send

   Each screen has one question that must be answered and at most one
   optional follow-up, which appears once the question is answered. From lg
   the steps run down the left with each answer under its name, so the brief
   is always in view; below lg a line and "Step 2 of 6" stand in. The last
   screen is the brief on one card, every part with an Edit that comes
   straight back. Then "Brief sent" and the two things that open the sponsor
   account.

   What is collected and what is sent did not change (brief-flow.ts,
   brief-inquiry.ts): submit goes to BTG through POST /public/inquiries
   (brief/actions.ts, P2-FE-01) and only then shows "sent"; a failure keeps
   the draft and says what happened. Every edit is kept on this device as it
   is made. ?demo=submitted never posts.

   2S1-FE-11: the API's requestToken is kept in the draft, so the sent screen
   can take the proof of business (sponsor-proof-upload.tsx, straight to the
   private bucket) and link to /sponsor-request/<token>.

   Motion lives in app/brief/brief.css and brief-fx.tsx.
   -------------------------------------------------------------------------- */

/* What happens after the brief is sent, in order. POL-FE-71: the account
   opens once the email and the proof are in, and matching starts from the
   first request filed in the portal, not from this form. */
const AFTER = [
  { title: "Confirm your email", sub: "We email you a link. Open it to show the address is yours." },
  { title: "Upload proof of business", sub: "A registration, permit or license in the business's name." },
  { title: "Your first request", sub: "Your sponsor account opens. Pick a package and send a request, and BTG matches athletes from there." },
] as const;

const AUTOCOMPLETE: Record<string, string> = {
  company: "organization",
  market: "address-level2",
  name: "name",
  email: "email",
  phone: "tel",
};

const STEP_MS = 200;
const REVIEW = BRIEF_STEPS.length - 1;
const emptySubscribe = () => () => {};

/** A type's name on its choice: the category, or "Something else" for OTHER. */
function typeName(t: BusinessType): string {
  return t === OTHER_BUSINESS_TYPE ? "Something else" : categoryLabel(t as BrandCategory);
}

/* The WAI-ARIA radio-group keyboard pattern (QA pass 8, F-13): one tab stop
   per group, arrow keys move AND select, Home/End jump. The options are
   buttons, so a click still selects. Enter on the chosen one continues. */
function onRadioKeys(e: React.KeyboardEvent<HTMLDivElement>) {
  const target = e.target as HTMLElement;
  if (e.key === "Enter" && target.getAttribute("aria-checked") === "true") {
    e.preventDefault();
    target.closest("form")?.requestSubmit();
    return;
  }
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step === undefined && e.key !== "Home" && e.key !== "End") return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  if (radios.length === 0) return;
  e.preventDefault();
  const at = radios.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    e.key === "Home" ? 0 : e.key === "End" ? radios.length - 1 : (Math.max(at, 0) + (step ?? 0) + radios.length) % radios.length;
  radios[next].focus();
  radios[next].click();
}

export function BriefWizard({
  pkg,
  demo,
  fresh = false,
}: {
  /** Validated ?package= id (or undefined). */
  pkg?: string;
  demo: "submitted" | null;
  /** ?new=1 — "Send the form again": start a blank brief instead of resuming. */
  fresh?: boolean;
}) {
  const storedRaw = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return localStorage.getItem(BRIEF_DRAFT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [touched, setTouched] = useState<BriefDraft | null>(null);
  const seeded = (): BriefDraft => {
    if (demo === "submitted") {
      const d = emptyBriefDraft("pk4");
      d.phase = "submitted";
      d.goal = GOALS[1];
      d.budget = BUDGET_BANDS[2];
      d.businessType = "RESTAURANT";
      d.answers = {
        market: "Silver Spring, MD",
        company: "Cafe Milo", name: "Jordan Avery", email: "jordan@cafemilo.com",
      };
      d.submittedAt = "2026-09-21T10:30:00";
      d.requestToken = "demo";
      return d;
    }
    /* A ?package= visit intentionally starts fresh on that package; a bare
       visit resumes any stored draft. */
    if (pkg || fresh) return emptyBriefDraft(pkg);
    return parseBriefDraft(storedRaw) ?? emptyBriefDraft();
  };
  const draft = touched ?? seeded();
  const sent = draft.phase === "submitted";
  const step = resumeStep(draft);
  const def = BRIEF_STEPS[step];

  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /* Set by an Edit on the review: Continue then goes straight back to it. */
  const [toReview, setToReview] = useState(false);
  const [moreTypes, setMoreTypes] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /* Only a brief sent in this visit gets the burst, not one found already sent. */
  const [celebrate, setCelebrate] = useState(false);
  /* Where the request stands after this session's upload — the API's answer to the confirm. */
  const [proofStatus, setProofStatus] = useState<ApiSponsorRequestStatus | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  /* A step change or a send in flight. Refs, not state: a second click in the
     same tick must see the first (a state flag is still false there). */
  const moving = useRef(false);
  const posting = useRef(false);
  const landed = useRef(false);

  /* Every edit is kept on this device as it's made, not only on Continue
     (QA pass 7, F-2: a failed send used to lose the contact step on reload). */
  const write = (next: BriefDraft) => {
    setTouched(next);
    if (demo) return;
    try {
      localStorage.setItem(BRIEF_DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* private mode — in-memory still works this session */
    }
  };
  const setAnswer = (key: string, value: string) => write({ ...draft, answers: { ...draft.answers, [key]: value } });
  const clearError = (...keys: string[]) => {
    if (keys.some((k) => errors[k])) setErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => !keys.includes(k))));
  };

  /* The step leaves, then the next one arrives. While it leaves it is inert,
     so nothing typed in those 200ms is lost to the step change. */
  const go = (to: number) => {
    if (moving.current || to === step) return;
    moving.current = true;
    setErrors({});
    setSendError(null);
    setDir(to > step ? 1 : -1);
    setLeaving(true);
    window.setTimeout(
      () => {
        write({ ...draft, step: to });
        setLeaving(false);
        moving.current = false;
      },
      reducedMotion() ? 0 : STEP_MS,
    );
  };

  const send = () => {
    if (posting.current) return;
    if (demo) {
      write({ ...draft, phase: "submitted", submittedAt: new Date().toISOString() });
      return;
    }
    posting.current = true;
    setSending(true);
    setSendError(null);
    void submitBriefRequest(draft)
      .then((r) => {
        if (r.ok) {
          setCelebrate(true);
          write({ ...draft, phase: "submitted", submittedAt: new Date().toISOString(), requestToken: r.requestToken });
          window.scrollTo({ top: 0 });
        } else setSendError(r.message);
      })
      .catch(() => setSendError("Something went wrong and nothing was sent. Your answers are saved. Try again."))
      .finally(() => {
        posting.current = false;
        setSending(false);
      });
  };

  const goNext = () => {
    if (moving.current) return;
    if (step === REVIEW) return send();
    const errs = validateBriefStep(step, draft);
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      /* The first gap, in the order the step is drawn. */
      const order = ["goal", "company", "businessType", "businessTypeOther", "budget", ...def.fields.map((f) => f.key)];
      const key = order.find((k) => errs[k]) ?? first;
      const at = stepRef.current?.querySelector<HTMLElement>(`[data-field="${key}"]`);
      (at?.matches("input, button") ? at : at?.querySelector<HTMLElement>('[tabindex="0"], button'))?.focus();
      return;
    }
    const to = toReview ? REVIEW : step + 1;
    setToReview(false);
    go(to);
  };

  const edit = (id: BriefStepId) => {
    setToReview(true);
    go(BRIEF_STEPS.findIndex((s) => s.id === id));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    goNext();
  };

  /* A new step takes the focus on its heading, so a screen reader reads the
     question. Not on arrival: the page's first focus is the visitor's. */
  useEffect(() => {
    if (!landed.current) {
      landed.current = true;
      return;
    }
    if (!sent) headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [step, sent]);

  /* 1–5 picks a choice on the two steps that are a choice. */
  const pickable = !sent && (def.id === "goal" || def.id === "budget");
  useEffect(() => {
    if (!pickable) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const choice = stepRef.current?.querySelectorAll<HTMLButtonElement>("[data-choice]")[Number(e.key) - 1];
      if (!choice) return;
      choice.focus();
      choice.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickable, step]);

  const chosen = packageOption(draft.package);
  const progress = sent ? 1 : (step + (step === REVIEW ? 0.6 : 0.35)) / BRIEF_STEPS.length;

  return (
    <FocusShell
      step={step}
      count={BRIEF_STEPS.length}
      done={sent}
      progress={progress}
      progressLabel="Brief progress"
      progressText={sent ? "Brief sent" : `Step ${step + 1} of ${BRIEF_STEPS.length}: ${def.label}`}
      exit={sent ? { href: "/", label: "Back to site" } : { href: "/packages", label: "Save and exit" }}
    >
      {sent ? (
        <Sent
          draft={draft}
          demo={!!demo}
          celebrate={celebrate}
          reviewing={reviewing}
          setReviewing={setReviewing}
          proofStatus={proofStatus}
          onProof={(s) => {
            setProofStatus(s);
            if (s.proofUploaded) write({ ...draft, proofUploaded: true });
          }}
        />
      ) : (
        <div className="relative mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14 lg:px-10 xl:gap-20">
          {/* ------------------------------------------------- steps (lg+) */}
          <FocusRail
            title="Your brief"
            label="Brief steps"
            steps={BRIEF_STEPS.map((s, i) => ({
              id: s.id,
              label: s.label,
              state: i < step ? "done" : i === step ? "now" : "next",
              answer: stepAnswer(s.id, draft),
              open: i < step,
            }))}
            onOpen={(i) => {
              /* From the review, a change comes straight back to it. */
              if (step === REVIEW) setToReview(true);
              go(i);
            }}
            note="Your answers are saved on this device as you go."
          />

          {/* ------------------------------------------------------ the step */}
          <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col">
            <div
              key={def.id}
              ref={stepRef}
              inert={leaving}
              data-leaving={leaving ? "" : undefined}
              className="bx-step flex flex-1 flex-col px-5 pb-6 pt-7 sm:px-8 lg:justify-center lg:px-0 lg:pt-4"
              style={{ "--bx-dir": dir } as CSSProperties}
            >
              <p className="bx-rise text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Step {step + 1} of {BRIEF_STEPS.length}
                <span className="text-muted"> · {def.label}</span>
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className={`mt-4 font-semibold leading-[1.04] tracking-tight outline-none ${
                  /* The review's card is the screen; its heading steps back to leave it room. */
                  def.id === "review" ? "text-[clamp(1.8rem,3.4vw,2.6rem)]" : "max-w-[20ch] text-[clamp(2rem,5.2vw,3.7rem)]"
                }`}
              >
                <Words text={def.heading} />
              </h1>
              <p className="bx-rise mt-4 max-w-xl text-base leading-relaxed text-muted" style={delay(0.22)}>
                {def.sub}
              </p>

              <div className="mt-8 max-w-[760px]">
                {/* ------------------------------------------------- goal */}
                {def.id === "goal" && (
                  <>
                    <SpotGroup
                      role="radiogroup"
                      aria-label="Campaign goal"
                      data-field="goal"
                      data-picked={draft.goal ? "" : undefined}
                      onKeyDown={onRadioKeys}
                      className="bx-group grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {GOALS.map((g, i) => {
                        const on = draft.goal === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            tabIndex={on || (!draft.goal && i === 0) ? 0 : -1}
                            data-choice=""
                            data-spot=""
                            onClick={() => {
                              clearError("goal");
                              write({ ...draft, goal: g });
                            }}
                            className="bx-card bx-rise flex items-center gap-4 p-4 sm:p-5"
                            style={delay(0.3 + i * 0.06)}
                          >
                            <span className="bx-ring" aria-hidden />
                            <span className="bx-icon" aria-hidden>
                              <GoalIcon goal={g} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-lg font-semibold leading-tight">{g}</span>
                              <span className="mt-1 block text-sm leading-snug text-muted">{GOAL_HINTS[g]}</span>
                            </span>
                            <span className="bx-key" aria-hidden>
                              {i + 1}
                            </span>
                            <Tick />
                          </button>
                        );
                      })}
                    </SpotGroup>
                    <Problem id="err-goal" text={errors.goal} />
                    <div className="sx-expand" data-open={!!draft.goal}>
                      <div inert={!draft.goal}>
                        <Field
                          def={def.fields[0]}
                          optional
                          className="pt-8"
                          value={draft.answers.success ?? ""}
                          onChange={(v) => setAnswer("success", v)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* --------------------------------------------- business */}
                {def.id === "business" && (
                  <div className="space-y-8">
                    <Field
                      def={def.fields[0]}
                      className="bx-rise"
                      style={delay(0.3)}
                      value={draft.answers.company ?? ""}
                      error={errors.company}
                      onChange={(v) => {
                        clearError("company");
                        setAnswer("company", v);
                      }}
                    />
                    <div className="bx-rise" style={delay(0.38)}>
                      <p id="kind-label" className="text-sm font-medium text-muted">
                        What kind of business is it?
                      </p>
                      <div
                        role="radiogroup"
                        aria-labelledby="kind-label"
                        aria-describedby={errors.businessType ? "err-businessType" : undefined}
                        data-field="businessType"
                        onKeyDown={onRadioKeys}
                        className="mt-3 flex flex-wrap gap-2.5"
                      >
                        {(() => {
                          const inMore = MORE_BUSINESS_TYPES.includes(draft.businessType as BusinessType);
                          const open = moreTypes || inMore;
                          const shown: BusinessType[] = [...COMMON_BUSINESS_TYPES, ...(open ? MORE_BUSINESS_TYPES : []), OTHER_BUSINESS_TYPE];
                          return (
                            <>
                              {shown.map((t, i) => {
                                const on = draft.businessType === t;
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    tabIndex={on || (!draft.businessType && i === 0) ? 0 : -1}
                                    onClick={() => {
                                      clearError("businessType", "businessTypeOther");
                                      write({ ...draft, businessType: t });
                                    }}
                                    className="bx-chip"
                                  >
                                    {typeName(t)}
                                  </button>
                                );
                              })}
                              {!inMore && (
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  onClick={() => setMoreTypes(!moreTypes)}
                                  className="bx-chip"
                                  data-quiet=""
                                >
                                  {open ? "Fewer types" : `More types (${MORE_BUSINESS_TYPES.length})`}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <Problem id="err-businessType" text={errors.businessType} />
                    </div>
                    <div className="sx-expand" data-open={draft.businessType === OTHER_BUSINESS_TYPE}>
                      <div inert={draft.businessType !== OTHER_BUSINESS_TYPE}>
                        <Field
                          def={{ key: "businessTypeOther", label: "What does your business do?", placeholder: "e.g. Family-run bike repair shop", required: true }}
                          maxLength={200}
                          value={draft.businessTypeOther ?? ""}
                          error={errors.businessTypeOther}
                          onChange={(v) => {
                            clearError("businessTypeOther");
                            write({ ...draft, businessTypeOther: v });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ----------------------------------------------- budget */}
                {def.id === "budget" && (
                  <>
                    <SpotGroup
                      role="radiogroup"
                      aria-label="Budget range"
                      data-field="budget"
                      data-picked={draft.budget ? "" : undefined}
                      onKeyDown={onRadioKeys}
                      className="bx-group grid grid-cols-1 gap-3 sm:grid-cols-5"
                    >
                      {BUDGET_BANDS.map((b, i) => {
                        const on = draft.budget === b;
                        return (
                          <button
                            key={b}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            tabIndex={on || (!draft.budget && i === 0) ? 0 : -1}
                            data-choice=""
                            data-spot=""
                            onClick={() => {
                              clearError("budget");
                              write({ ...draft, budget: b });
                            }}
                            className="bx-card bx-rise flex items-center gap-4 p-4 sm:flex-col sm:items-start sm:gap-5 sm:p-5"
                            style={delay(0.3 + i * 0.05)}
                          >
                            <span className="bx-ring" aria-hidden />
                            <span className="flex items-center justify-between gap-3 sm:w-full">
                              <span className="bx-meter" aria-hidden>
                                {BUDGET_BANDS.map((x, j) => (
                                  <i key={x} data-on={j <= i ? "" : undefined} style={{ height: `${36 + j * 16}%` }} />
                                ))}
                              </span>
                              <span className="hidden sm:block">
                                <Tick />
                              </span>
                            </span>
                            <span className="flex-1 whitespace-nowrap text-lg font-semibold leading-tight sm:flex-none sm:text-xl">{b}</span>
                            <span className="sm:hidden" aria-hidden>
                              <span className="bx-key">{i + 1}</span>
                            </span>
                            <span className="sm:hidden">
                              <Tick />
                            </span>
                          </button>
                        );
                      })}
                    </SpotGroup>
                    <Problem id="err-budget" text={errors.budget} />
                    {chosen.id !== "unsure" && (
                      <p className="bx-rise mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" style={delay(0.55)}>
                        <span>
                          Package you picked: <span className="font-semibold text-text">{chosen.name}</span>
                          {chosen.price ? ` (${chosen.price})` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => write({ ...draft, package: "unsure" })}
                          className="min-h-11 rounded text-accent-soft underline-offset-4 hover:underline"
                        >
                          Remove
                        </button>
                      </p>
                    )}
                    <div className="sx-expand" data-open={!!draft.budget}>
                      <div inert={!draft.budget}>
                        <Chips
                          label="When do you want to start?"
                          options={TIMINGS}
                          value={draft.answers.timing ?? ""}
                          onChange={(v) => setAnswer("timing", v)}
                          className="pt-8"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* ----------------------------------------------- market */}
                {def.id === "market" && (
                  <>
                    <Field
                      def={def.fields[0]}
                      className="bx-rise"
                      style={delay(0.3)}
                      value={draft.answers.market ?? ""}
                      error={errors.market}
                      onChange={(v) => {
                        clearError("market");
                        setAnswer("market", v);
                      }}
                    />
                    <div className="sx-expand" data-open={!!(draft.answers.market ?? "").trim()}>
                      <div inert={!(draft.answers.market ?? "").trim()}>
                        <Chips
                          label="Who do you want to reach?"
                          options={AUDIENCES}
                          value={draft.answers.audience ?? ""}
                          onChange={(v) => setAnswer("audience", v)}
                          className="pt-8"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* ---------------------------------------------- contact */}
                {def.id === "contact" && (
                  <div className="grid gap-8 sm:grid-cols-2">
                    {def.fields.map((f, i) => (
                      <Field
                        key={f.key}
                        def={f}
                        optional={!f.required}
                        className={`bx-rise ${f.key === "name" ? "sm:col-span-2" : ""}`}
                        style={delay(0.3 + i * 0.07)}
                        value={draft.answers[f.key] ?? ""}
                        error={errors[f.key]}
                        onChange={(v) => {
                          clearError(f.key);
                          setAnswer(f.key, v);
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* ----------------------------------------------- review */}
                {def.id === "review" && (
                  <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_240px] xl:items-start">
                    <div className="bx-rise" style={delay(0.3)}>
                      <Ticket draft={draft} onEdit={edit} />
                    </div>
                    <div className="bx-rise" style={delay(0.42)}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">After you send it</p>
                      <ol className="mt-4 space-y-4">
                        {AFTER.map((a, i) => (
                          <li key={a.title} className="flex gap-3">
                            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-accent/50 text-xs font-semibold text-accent-soft">
                              {i + 1}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-text">{a.title}</span>
                              <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{a.sub}</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* action bar — pinned, except on a short screen (a phone in
                landscape, ~390px tall), where it covered most of the step */}
            <div className="bx-actions bx-chrome sticky bottom-0 z-10 px-5 pb-5 pt-8 sm:px-8 lg:px-0 lg:pb-8 [@media(max-height:500px)]:static">
              {sendError && step === REVIEW && (
                <p role="alert" className="mb-3 max-w-[760px] rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {sendError}
                </p>
              )}
              <div className="flex max-w-[760px] items-center gap-3">
                {step > 0 && (
                  <button type="button" onClick={() => go(step - 1)} disabled={sending} className="bx-ghost inline-flex items-center gap-2 px-4 sm:px-5">
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10 3.5L5.5 8l4.5 4.5" />
                    </svg>
                    Back
                  </button>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  aria-busy={sending}
                  className="bx-cta sx-join-sheen inline-flex flex-1 items-center justify-center gap-2.5 px-6 text-base sm:flex-none sm:px-9"
                >
                  {step === REVIEW ? (
                    sending ? (
                      <>
                        <span className="bx-spin" aria-hidden />
                        Sending…
                      </>
                    ) : (
                      "Send to BTG"
                    )
                  ) : toReview ? (
                    "Back to review"
                  ) : (
                    "Continue"
                  )}
                  {!sending && (
                    <svg viewBox="0 0 16 16" className="bx-arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  )}
                </button>
                <p className="bx-keys ml-2 text-[13px] text-faint">
                  {pickable ? `Press 1 to ${def.id === "goal" ? GOALS.length : BUDGET_BANDS.length} to pick, Enter to continue` : "or press Enter"}
                </p>
              </div>
              <p className="mt-3 text-[12px] text-faint">No card and no payment. Nothing is signed.</p>
            </div>
          </form>
        </div>
      )}
    </FocusShell>
  );
}

/* ---------------------------------------------------------------- the sent screen */

function Sent({
  draft,
  demo,
  celebrate,
  reviewing,
  setReviewing,
  proofStatus,
  onProof,
}: {
  draft: BriefDraft;
  demo: boolean;
  celebrate: boolean;
  reviewing: boolean;
  setReviewing: (v: boolean) => void;
  proofStatus: ApiSponsorRequestStatus | null;
  onProof: (s: ApiSponsorRequestStatus) => void;
}) {
  const email = (draft.answers.email ?? "").trim();
  const when = new Date(draft.submittedAt ?? "");
  const stamp = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  if (reviewing) {
    return (
      <main className="relative mx-auto w-full max-w-2xl flex-1 px-5 pb-16 pt-8 sm:px-8">
        <button
          type="button"
          onClick={() => setReviewing(false)}
          className="flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 3.5L5.5 8l4.5 4.5" />
          </svg>
          Back
        </button>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Your brief</h1>
        <p className="mt-2 text-sm text-muted">This is what you sent. It can&rsquo;t be changed here because it&rsquo;s with BTG now.</p>
        <div className="bx-rise mt-6">
          <Ticket draft={draft} />
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-2xl flex-1 px-5 pb-16 pt-10 sm:px-8 lg:pt-14">
      {celebrate && <Confetti />}
      <div className="bx-check">
        <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="var(--sx-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 12.5l4 4 8-9" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.35s" } as CSSProperties} />
        </svg>
      </div>
      <h1 className="mt-7 text-[clamp(2.2rem,6vw,3.6rem)] font-semibold leading-[1.04] tracking-tight">
        <Words text="Brief sent." />
      </h1>
      <p className="bx-rise mt-4 max-w-xl text-base leading-relaxed text-muted" style={delay(0.2)}>
        BTG has it{stamp ? ` (${stamp})` : ""}. Two things are left, and then your sponsor account opens. No card, no payment, nothing signed.
      </p>

      {/* 2S1-FE-11 — the two things that open the sponsor account. */}
      <ol className="mt-9 space-y-4" aria-label="What is left to do">
        <li className="bx-panel bx-rise flex gap-4 p-5" style={delay(0.3)}>
          <StepBadge n={1} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text">Check your email and confirm it</h2>
            <p className="mt-1 break-words text-sm leading-relaxed text-muted">
              We sent a link to {email || "your email"}. Open it to show the address is yours.
            </p>
          </div>
        </li>
        <li className="bx-panel bx-rise flex gap-4 p-5" style={delay(0.38)}>
          <StepBadge n={2} done={!!proofStatus || !!draft.proofUploaded} />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-base font-semibold text-text">Upload your proof of business</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Your business registration, permit or license in the business&rsquo;s name. Every sponsor is asked for it.
              </p>
            </div>
            {proofStatus ? (
              <>
                <p className="text-sm font-medium text-success">Proof of business received.</p>
                <SponsorRequestStanding status={proofStatus} email={email || undefined} heading="h3" />
              </>
            ) : draft.proofUploaded ? (
              <p className="text-sm font-medium text-success">Proof of business received.</p>
            ) : draft.requestToken ? (
              <SponsorProofUpload
                token={draft.requestToken}
                after="show"
                email={email || undefined}
                disabledReason={demo ? "Sample screen — nothing is uploaded from the demo." : undefined}
                onStatus={onProof}
              />
            ) : (
              <p className="text-sm text-muted">
                This device doesn&rsquo;t have the upload link for this brief.{" "}
                <Link href="/brief?new=1" className="text-accent hover:underline">
                  Send the form again
                </Link>{" "}
                to upload it.
              </p>
            )}
          </div>
        </li>
        <li className="bx-rise flex gap-4 px-5 pt-2" style={delay(0.46)}>
          <StepBadge n={3} quiet />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-muted">Then: {AFTER[2].title.toLowerCase()}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{AFTER[2].sub}</p>
          </div>
        </li>
      </ol>

      <div className="bx-rise mt-10 flex flex-wrap items-center gap-3" style={delay(0.56)}>
        {draft.requestToken && !demo && (
          <Link
            href={`/sponsor-request/${encodeURIComponent(draft.requestToken)}`}
            className="bx-cta sx-join-sheen inline-flex items-center justify-center gap-2.5 px-6 text-sm"
          >
            See where your request stands
            <svg viewBox="0 0 16 16" className="bx-arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
        )}
        <button type="button" onClick={() => setReviewing(true)} className="bx-ghost px-5 text-sm">
          Read what you sent
        </button>
        <Link href="/packages" className="bx-ghost inline-flex items-center px-5 text-sm">
          Back to packages
        </Link>
      </div>
      {draft.requestToken && !demo && (
        <p className="bx-rise mt-3 text-[12px] text-faint" style={delay(0.6)}>
          Bookmark that page to come back later. It works without signing in.
        </p>
      )}
    </main>
  );
}

function StepBadge({ n, done = false, quiet = false }: { n: number; done?: boolean; quiet?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${
        done ? "border-success/60 bg-success/15 text-success" : quiet ? "border-line text-muted" : "border-accent/60 bg-accent/12 text-accent-soft"
      }`}
    >
      {done ? (
        <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- the brief on one card */

function Ticket({ draft, onEdit }: { draft: BriefDraft; onEdit?: (id: BriefStepId) => void }) {
  const a = (k: string) => (draft.answers[k] ?? "").trim();
  const pack = packageOption(draft.package);
  const rows: { id: BriefStepId; label: string; value: string; more: string[] }[] = [
    { id: "goal", label: "Goal", value: draft.goal, more: [a("success")] },
    { id: "business", label: "Business", value: a("company"), more: [businessTypeText(draft) || a("category")] },
    { id: "budget", label: "Budget", value: draft.budget, more: [a("timing"), pack.id === "unsure" ? "" : `Package: ${pack.name}`] },
    { id: "market", label: "Where", value: a("market"), more: [a("audience")] },
    { id: "contact", label: "Contact", value: a("name"), more: [a("email"), a("phone")] },
  ];

  return (
    <div className="bx-ticket">
      <div className="flex items-end justify-between gap-4 px-5 pb-4 pt-5 sm:px-7">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-soft">Sponsor brief</p>
          <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight">{a("company") || "Your business"}</p>
        </div>
        <p className="shrink-0 text-right text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          To
          <span className="mt-0.5 block text-sm font-semibold tracking-normal text-text">BTG SponsorX</span>
        </p>
      </div>
      <div className="bx-perf" aria-hidden />
      <dl className="divide-y divide-line-soft px-5 sm:px-7">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-4 py-3">
            <dt className="w-[76px] shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1">
              <span className="block break-words text-base font-semibold text-text">{r.value || "—"}</span>
              {r.more.filter(Boolean).map((m) => (
                <span key={m} className="mt-0.5 block break-words text-sm text-muted">
                  {m}
                </span>
              ))}
            </dd>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(r.id)}
                className="-mr-2 min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-accent-soft underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Edit<span className="sr-only"> {r.label.toLowerCase()}</span>
              </button>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---------------------------------------------------------------- small parts */

function Tick() {
  return (
    <span className="bx-tick" aria-hidden>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="#0a0c10" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} />
      </svg>
    </span>
  );
}

/** The shared field, with this form's ids and the browser's autofill hints. */
function Field(props: Omit<Parameters<typeof LineField>[0], "prefix" | "autoComplete">) {
  return <LineField prefix="brief" autoComplete={AUTOCOMPLETE[props.def.key] ?? "off"} {...props} />;
}

/** An optional pick: one of a few, and picking it again clears it. */
function Chips({
  label,
  options,
  value,
  className = "",
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  className?: string;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className={className} role="group" aria-label={label}>
      <p className="flex items-baseline gap-2 text-sm font-medium text-muted">
        {label}
        <span className="text-[12px] font-normal text-faint">Optional</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {options.map((o) => {
          const on = value === o;
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? "" : o)} className="bx-chip">
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GoalIcon({ goal }: { goal: (typeof GOALS)[number] }) {
  const common = { viewBox: "0 0 24 24", className: "size-[22px]", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (goal) {
    case "Awareness":
      /* a megaphone */
      return (
        <svg {...common}>
          <path d="M4 10v4a1 1 0 001 1h2l7 4V5L7 9H5a1 1 0 00-1 1z" />
          <path d="M17.5 9.5a3.5 3.5 0 010 5M19.8 7a7 7 0 010 10" />
        </svg>
      );
    case "Foot traffic":
      /* a shop front */
      return (
        <svg {...common}>
          <path d="M4 10l1.5-5h13L20 10M4 10a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 10M5.5 12.5V19h13v-6.5" />
          <path d="M10 19v-4h4v4" />
        </svg>
      );
    case "Product launch":
      /* a rocket */
      return (
        <svg {...common}>
          <path d="M8 12c1-4 4-7.5 11-8-.5 7-4 10-8 11z" />
          <path d="M8.5 11.5H5l2.5-3.5 2.6.6M12.5 15.5V19l3.5-2.5-.6-2.6" />
          <path d="M6.5 15.5c-1.2.8-2 4-2 4s3.2-.8 4-2" />
          <circle cx="14.5" cy="9.5" r="1.3" />
        </svg>
      );
    default:
      /* a calendar with a day marked */
      return (
        <svg {...common}>
          <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
          <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M9.5 15l2 2 3.5-4" />
        </svg>
      );
  }
}

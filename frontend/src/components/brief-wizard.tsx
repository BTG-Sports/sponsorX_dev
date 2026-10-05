"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AUDIENCES,
  BRIEF_DRAFT_KEY,
  BRIEF_STEPS,
  BUDGET_BANDS,
  BUSINESS_TYPES,
  GOALS,
  OTHER_BUSINESS_TYPE,
  PACKAGE_OPTIONS,
  businessTypeLabel,
  businessTypeText,
  emptyBriefDraft,
  packageOption,
  parseBriefDraft,
  validateBriefStep,
  type BriefDraft,
  type BriefFieldDef,
} from "@/lib/brief-flow";
import { submitBriefRequest } from "@/app/(public)/brief/actions";
import { SponsorProofUpload } from "@/components/sponsor-proof-upload";
import { SponsorRequestStanding } from "@/components/sponsor-request-standing";
import type { ApiSponsorRequestStatus } from "@/lib/sponsor-request-live";

/* --------------------------------------------------------------------------
   The /brief island — sponsor twin of join-wizard.tsx, led by sponsor
   orange (--sx-accent). Four steps, no intro (the /packages catalog IS the
   intro) and no agreement (nothing is signed — it's a request). Motion
   rides the same sx-join-* system; drafts and hydration follow the same
   useSyncExternalStore discipline. Submit sends the brief to BTG through
   POST /public/inquiries (brief/actions.ts, P2-FE-01) and only then shows
   "received"; a failure keeps the draft and says what happened. The
   ?demo=submitted state never posts.

   2S1-FE-11: step one asks what the business is from the brand-category
   list, or "Other" in its own words — the free-text "Brand category" field
   it replaces is gone (the message still carries the answer in words, see
   brief-inquiry.ts). The API's requestToken is kept in the draft, so the
   submitted screen can take the proof of business (sponsor-proof-upload.tsx,
   straight to the private bucket) and link to /sponsor-request/<token>,
   where the applicant can come back to see what's left.
   -------------------------------------------------------------------------- */

const TIMELINE = [
  { key: "received", title: "Received", tone: "success" as const },
  { key: "matching", title: "Matching", sub: "BTG staff filter eligible athletes and check conflicts (§13, §26).", tone: "warn" as const },
  { key: "proposal", title: "Proposal", sub: "A priced shortlist to react to — no card, no commitment.", tone: "muted" as const },
];

const emptySubscribe = () => () => {};

/* The WAI-ARIA radio-group keyboard pattern (QA pass 8, F-13): one tab stop
   per group, arrow keys move AND select, Home/End jump. The options are
   buttons, so a click still selects. */
function onRadioKeys(e: React.KeyboardEvent<HTMLDivElement>) {
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
  const [dir, setDir] = useState<1 | -1>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /* Where the request stands after this session's upload — the API's answer to the confirm. */
  const [proofStatus, setProofStatus] = useState<ApiSponsorRequestStatus | null>(null);
  /* Lifted so the ancestor chain can out-stack the later-DOM siblings while
     a listbox is open — the sx-join-* fill animations keep every sibling a
     stacking context, so a panel's own z-index can't win from inside. One
     key for all selects; opening one closes any other. */
  const [openSelect, setOpenSelect] = useState<"businessType" | "package" | "audience" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  const persist = (next: BriefDraft) => {
    setTouched(next);
    if (!demo) {
      try {
        localStorage.setItem(BRIEF_DRAFT_KEY, JSON.stringify(next));
      } catch {
        /* private mode — in-memory still works this session */
      }
    }
    setSave("saving");
    window.setTimeout(() => setSave("saved"), 350);
  };

  const step = Math.min(draft.step, BRIEF_STEPS.length - 1);
  const def = BRIEF_STEPS[step];

  useEffect(() => {
    if (draft.phase === "steps") headingRef.current?.focus({ preventScroll: true });
  }, [draft.step, draft.phase]);

  /* Every edit is kept on this device as it's made, not only on Continue —
     "Progress saved" and the send-failure copy both promise it (QA pass 7,
     F-2: a failed send used to lose the contact step on reload). No save
     flash here: that belongs to step changes, not keystrokes. */
  const edit = (next: BriefDraft) => {
    setTouched(next);
    if (!demo) {
      try {
        localStorage.setItem(BRIEF_DRAFT_KEY, JSON.stringify(next));
      } catch {
        /* private mode — in-memory still works this session */
      }
    }
  };
  const setAnswer = (key: string, value: string) =>
    edit({ ...draft, answers: { ...draft.answers, [key]: value } });

  const goNext = () => {
    const errs = validateBriefStep(step, draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      /* In the order they're on screen: the business type sits above the fields. */
      const first = ["businessType", "businessTypeOther", ...def.fields.map((f) => f.key)].find((k) => errs[k]);
      if (first)
        stepRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setDir(1);
    if (step === BRIEF_STEPS.length - 1) {
      if (demo) {
        persist({ ...draft, phase: "submitted", submittedAt: new Date().toISOString() });
        return;
      }
      if (sending) return;
      setSending(true);
      setSendError(null);
      void submitBriefRequest(draft)
        .then((r) => {
          if (r.ok) persist({ ...draft, phase: "submitted", submittedAt: new Date().toISOString(), requestToken: r.requestToken });
          else setSendError(r.message);
        })
        .catch(() => setSendError("Something went wrong — nothing was sent. Your answers are saved; try again."))
        .finally(() => setSending(false));
    } else {
      persist({ ...draft, step: step + 1 });
    }
  };

  const goBack = () => {
    if (step === 0) return;
    setErrors({});
    setDir(-1);
    persist({ ...draft, step: step - 1 });
  };

  /* ------------------------------------------------------------ submitted */
  if (draft.phase === "submitted") {
    const when = new Date(draft.submittedAt ?? "");
    const stamp = Number.isNaN(when.getTime())
      ? ""
      : when.toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const chosen = packageOption(draft.package);

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
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Your request</h1>
          <p className="mt-1 text-sm text-muted">Read-only — it&apos;s with BTG now.</p>
          <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
            <dl className="space-y-2 text-sm">
              {[
                ["Goal", draft.goal],
                ["Business type", businessTypeText(draft) || draft.answers.category],
                ["Budget", draft.budget],
                ["Package", chosen.name],
                ["Timing", draft.answers.timing],
                ["Market", draft.answers.market],
                ["Audience", draft.answers.audience],
                ["Company", draft.answers.company],
                ["Contact", draft.answers.name],
                ["Email", draft.answers.email],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right text-text">{(value ?? "").trim() || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      );
    }

    return (
      <div className="px-6 py-10">
        <div className="sx-join-rise grid size-16 place-items-center rounded-full border-2 border-success/50">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="var(--sx-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12.5l4 4 8-9" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.15s" } as React.CSSProperties} />
          </svg>
        </div>
        <h1 className="sx-join-rise mt-6 text-3xl font-semibold tracking-tight" style={{ "--sx-d": "0.1s" } as React.CSSProperties}>
          Brief received
        </h1>
        <p className="sx-join-rise mt-3 text-sm leading-relaxed text-muted" style={{ "--sx-d": "0.18s" } as React.CSSProperties}>
          Confirm your email and upload proof of business below — your sponsor
          account then opens automatically. No card, no checkout, no commitment.
        </p>

        {/* 2S1-FE-11 — the two things that open the sponsor account. */}
        <section
          aria-labelledby="brief-next-steps"
          className="sx-join-rise mt-8 rounded-xl border border-line bg-surface-2 p-4"
          style={{ "--sx-d": "0.24s" } as React.CSSProperties}
        >
          <h2 id="brief-next-steps" className="text-base font-semibold text-text">
            Next steps
          </h2>
          <p className="mt-1 text-sm text-muted">Your sponsor account opens once both are done.</p>
          <ol className="mt-4 space-y-5">
            <li className="flex gap-3">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-accent/50 text-xs font-semibold text-accent">
                1
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">Check your email to confirm it</p>
                <p className="mt-0.5 break-words text-sm text-muted">
                  We sent a link to {(draft.answers.email ?? "").trim() || "your email"}. Open it to show the address is yours.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-accent/50 text-xs font-semibold text-accent">
                2
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-text">Upload your proof of business</p>
                  <p className="mt-0.5 text-sm text-muted">
                    Your business registration, permit or license in the business&rsquo;s name — required of every sponsor.
                  </p>
                </div>
                {proofStatus ? (
                  <>
                    <p className="text-sm font-medium text-success">Proof of business received.</p>
                    <SponsorRequestStanding status={proofStatus} email={(draft.answers.email ?? "").trim() || undefined} heading="h3" />
                  </>
                ) : draft.proofUploaded ? (
                  <p className="text-sm font-medium text-success">Proof of business received.</p>
                ) : draft.requestToken ? (
                  <SponsorProofUpload
                    token={draft.requestToken}
                    after="show"
                    email={(draft.answers.email ?? "").trim() || undefined}
                    disabledReason={demo ? "Sample screen — nothing is uploaded from the demo." : undefined}
                    onStatus={(s) => {
                      setProofStatus(s);
                      if (s.proofUploaded) persist({ ...draft, proofUploaded: true });
                    }}
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
          </ol>
          {draft.requestToken && !demo && (
            <p className="mt-5 border-t border-line pt-4 text-sm">
              <Link href={`/sponsor-request/${encodeURIComponent(draft.requestToken)}`} className="text-accent hover:underline">
                See where your request stands →
              </Link>
              <span className="mt-1 block text-[11px] text-faint">Bookmark it to come back later — it works without signing in.</span>
            </p>
          )}
        </section>

        <div className="mt-8 border-t border-line pt-8">
          <ol className="space-y-7">
            {TIMELINE.map((t, i) => (
              <li key={t.key} className="sx-join-rise relative flex gap-5 pl-1" style={{ "--sx-d": `${0.3 + i * 0.12}s` } as React.CSSProperties}>
                {i < TIMELINE.length - 1 && (
                  <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%+8px)] w-px bg-line" />
                )}
                <span
                  aria-hidden
                  className={`relative z-10 mt-1 size-[21px] shrink-0 rounded-full ${
                    t.tone === "success" ? "bg-success" : t.tone === "warn" ? "border-2 border-warn bg-bg" : "border-2 border-line bg-bg"
                  }`}
                />
                <div>
                  <p className={`text-base font-semibold ${t.tone === "warn" ? "text-warn" : t.tone === "muted" ? "text-muted" : "text-text"}`}>
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{t.key === "received" ? stamp : t.sub}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 space-y-3">
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="sx-join-rise flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-4 text-left text-sm font-medium text-text transition-colors hover:bg-surface"
            style={{ "--sx-d": "0.7s" } as React.CSSProperties}
          >
            Review your request
            <svg viewBox="0 0 16 16" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5L10.5 8 6 12.5" />
            </svg>
          </button>
          <Link
            href="/packages"
            className="sx-join-rise flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-4 text-left text-sm font-medium text-text transition-colors hover:bg-surface"
            style={{ "--sx-d": "0.78s" } as React.CSSProperties}
          >
            Back to packages
            <svg viewBox="0 0 16 16" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5L10.5 8 6 12.5" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- steps */
  const chosen = packageOption(draft.package);

  return (
    <div className="flex flex-col">
      {/* chrome */}
      <div className="border-b border-line px-6 pb-4 pt-5">
        <div className="flex items-center justify-between">
          {step > 0 ? (
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
          ) : (
            <Link
              href="/packages"
              aria-label="Back to packages"
              className="grid size-11 -ml-2.5 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <svg viewBox="0 0 16 16" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3.5L5.5 8l4.5 4.5" />
              </svg>
            </Link>
          )}
          <p aria-live="polite" className="text-sm text-muted">
            Step {step + 1} of {BRIEF_STEPS.length}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-success">
            <span className={`size-1.5 rounded-full bg-success ${save === "saving" ? "sx-pop" : ""}`} />
            {save === "saving" ? "Saving…" : "Progress saved"}
          </p>
        </div>
        <div className="mt-3.5 flex gap-1.5">
          {BRIEF_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`sx-join-seg h-1 flex-1 rounded-full text-accent ${
                i < step ? "sx-join-seg--fill bg-surface-2" : i === step ? "sx-join-seg--active bg-surface-2" : "bg-surface-2"
              }`}
            />
          ))}
        </div>
      </div>

      {/* body */}
      <div
        key={`${def.id}-${dir}`}
        ref={stepRef}
        className={`sx-join-step flex-1 px-6 py-7 ${openSelect ? "relative z-20" : ""}`}
        style={{ "--sx-from": dir === 1 ? "24px" : "-24px" } as React.CSSProperties}
      >
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
          {def.heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{def.sub}</p>

        <div className="mt-6 space-y-5">
          {def.id === "goal" && (
            <div className="sx-join-rise">
              <p className="text-[11px] font-medium text-muted">Campaign goal</p>
              <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Campaign goal" onKeyDown={onRadioKeys}>
                {GOALS.map((g, i) => {
                  const on = draft.goal === g;
                  const stop = on || (!draft.goal && i === 0);
                  return (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={stop ? 0 : -1}
                      onClick={() => edit({ ...draft, goal: g })}
                      className={`min-h-11 rounded-xl border px-3.5 py-3 text-sm font-medium transition-colors ${
                        on
                          ? "sx-pop border-accent/60 bg-accent/12 text-text"
                          : "border-line bg-surface-2 text-text hover:bg-surface"
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
              {errors.goal && <p className="mt-1.5 text-[11px] text-danger">{errors.goal}</p>}
            </div>
          )}

          {def.id === "budget" && (
            <>
              <div className="sx-join-rise">
                <p className="text-[11px] font-medium text-muted">Budget band</p>
                <div className="mt-2 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Budget band" onKeyDown={onRadioKeys}>
                  {BUDGET_BANDS.map((b, i) => {
                    const on = draft.budget === b;
                    const stop = on || (!draft.budget && i === 0);
                    return (
                      <button
                        key={b}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={stop ? 0 : -1}
                        onClick={() => edit({ ...draft, budget: b })}
                        className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                          on
                            ? "sx-pop border-accent/60 bg-accent/12 text-text"
                            : "border-line bg-surface-2 text-text hover:bg-surface"
                        }`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
                {errors.budget && <p className="mt-1.5 text-[11px] text-danger">{errors.budget}</p>}
              </div>
              <div
                className={`sx-join-rise ${openSelect === "package" ? "relative z-30" : ""}`}
                style={{ "--sx-d": "0.05s" } as React.CSSProperties}
              >
                <WizardSelect
                  label="Starting package"
                  placeholder="Pick a package"
                  options={PACKAGE_OPTIONS.map((p) => ({ id: p.id, name: p.name, meta: p.price }))}
                  value={chosen.id}
                  onChange={(id) => edit({ ...draft, package: id })}
                  open={openSelect === "package"}
                  onOpenChange={(o) => setOpenSelect(o ? "package" : null)}
                />
                <p className="mt-1 text-[11px] text-faint">
                  A starting point, not a commitment — BTG shapes the final scope.
                </p>
              </div>
            </>
          )}

          {def.id === "goal" && (
            <>
              <div
                className={`sx-join-rise ${openSelect === "businessType" ? "relative z-30" : ""}`}
                style={{ "--sx-d": "0.05s" } as React.CSSProperties}
              >
                <WizardSelect
                  label="What is your business?"
                  name="businessType"
                  placeholder="Pick the closest fit"
                  options={BUSINESS_TYPES.map((t) => ({ id: t, name: businessTypeLabel(t) }))}
                  value={draft.businessType ?? ""}
                  error={errors.businessType}
                  onChange={(id) => edit({ ...draft, businessType: id })}
                  open={openSelect === "businessType"}
                  onOpenChange={(o) => setOpenSelect(o ? "businessType" : null)}
                />
                {errors.businessType && <p className="mt-1 text-[11px] text-danger">{errors.businessType}</p>}
              </div>
              {draft.businessType === OTHER_BUSINESS_TYPE && (
                <BriefField
                  def={{ key: "businessTypeOther", label: "What does your business do?", placeholder: "e.g. Family-run bike repair shop", required: true }}
                  index={0}
                  value={draft.businessTypeOther ?? ""}
                  error={errors.businessTypeOther}
                  maxLength={200}
                  onChange={(v) => edit({ ...draft, businessTypeOther: v })}
                />
              )}
            </>
          )}

          {def.fields.map((f, i) => (
            <BriefField
              key={f.key}
              def={f}
              index={i}
              value={draft.answers[f.key] ?? ""}
              error={errors[f.key]}
              onChange={(v) => setAnswer(f.key, v)}
            />
          ))}

          {def.id === "market" && (
            <div
              className={`sx-join-rise ${openSelect === "audience" ? "relative z-30" : ""}`}
              style={{ "--sx-d": "0.05s" } as React.CSSProperties}
            >
              <WizardSelect
                label="Audience"
                placeholder="Optional — pick the closest fit"
                options={AUDIENCES.map((a) => ({ id: a, name: a }))}
                value={draft.answers.audience ?? ""}
                onChange={(id) => setAnswer("audience", id)}
                open={openSelect === "audience"}
                onOpenChange={(o) => setOpenSelect(o ? "audience" : null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* action bar */}
      <div className="sticky bottom-0 z-10 border-t border-line bg-bg/95 px-6 py-4 backdrop-blur lg:rounded-b-2xl">
        {sendError && step === BRIEF_STEPS.length - 1 && (
          <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
            {sendError}
          </p>
        )}
        <button
          type="button"
          onClick={goNext}
          disabled={sending}
          aria-busy={sending}
          className="sx-join-sheen min-h-12 w-full rounded-xl bg-accent px-5 py-3.5 text-base font-semibold text-cta-ink transition-colors hover:bg-accent-soft disabled:opacity-70"
        >
          {step === BRIEF_STEPS.length - 1 ? (sending ? "Sending…" : "Send to BTG") : "Continue"}
        </button>
        <p className="mt-2.5 text-center text-[11px] text-faint">
          No card, no checkout — BTG replies with a proposal.
        </p>
      </div>
    </div>
  );
}

/* Custom listbox — the native <select> popup is OS-rendered and unstylable
   (export-report.tsx dropdown precedent for the outside-click/Escape
   discipline). Real buttons take focus, so Enter/Tab behave natively;
   arrows rove between options. Open state is controlled by the wizard so
   ancestors can raise their z-index while a panel is out. */
type SelectOption = { id: string; name: string; meta?: string };

function WizardSelect({
  label,
  name,
  placeholder,
  options,
  value,
  error,
  onChange,
  open,
  onOpenChange,
}: {
  label: string;
  /** Set on the trigger, so a failed Continue can focus it. */
  name?: string;
  placeholder: string;
  options: SelectOption[];
  value: string;
  error?: string;
  onChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setOpen = onOpenChange;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chosen = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(
          rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
        );
        if (items.length === 0) return;
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === "ArrowDown"
            ? items[Math.min(at + 1, items.length - 1)]
            : items[Math.max(at - 1, 0)];
        next?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  return (
    <div ref={rootRef} className="relative">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        name={name}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`mt-1.5 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-surface-2 px-3.5 py-3 text-left text-base transition-colors focus:outline-none ${
          error
            ? "border-danger text-text"
            : open
              ? "border-accent/60 text-text"
              : "border-line text-text hover:border-line/80 focus:border-accent/60"
        }`}
      >
        <span className={`truncate ${chosen ? "" : "text-faint"}`}>
          {chosen ? chosen.name : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {chosen?.meta && <span className="text-sm text-faint">{chosen.meta}</span>}
          <svg
            viewBox="0 0 16 16"
            className={`size-4 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3.5 6L8 10.5 12.5 6" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="sx-pop absolute z-20 mt-2 max-h-80 w-full origin-top overflow-y-auto rounded-xl border border-line bg-surface shadow-[0_16px_48px_-16px_rgba(0,0,0,0.6)]"
        >
          {options.map((p, i) => {
            const on = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`sx-join-rise flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm transition-colors ${
                  on ? "bg-accent/10 text-text" : "text-text hover:bg-surface-2"
                }`}
                style={{ "--sx-d": `${i * 0.025}s` } as React.CSSProperties}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`grid size-4 shrink-0 place-items-center ${on ? "" : "invisible"}`}
                    aria-hidden
                  >
                    <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0s" } as React.CSSProperties} />
                    </svg>
                  </span>
                  <span className={`truncate ${on ? "font-semibold" : "font-medium"}`}>{p.name}</span>
                </span>
                {p.meta && <span className="shrink-0 text-xs text-faint">{p.meta}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BriefField({
  def,
  index,
  value,
  error,
  maxLength,
  onChange,
}: {
  def: BriefFieldDef;
  index: number;
  value: string;
  error?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className="sx-join-rise block"
      style={{ "--sx-d": `${0.1 + index * 0.035}s` } as React.CSSProperties}
    >
      <span className="text-[11px] font-medium text-muted">{def.label}</span>
      <input
        type={def.type ?? "text"}
        name={def.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        maxLength={maxLength}
        aria-invalid={!!error}
        className={`mt-1.5 min-h-11 w-full rounded-xl border bg-surface-2 px-3.5 py-3 text-base text-text placeholder:text-faint transition-colors focus:outline-none ${
          error ? "border-danger" : "border-line focus:border-accent/60"
        }`}
      />
      {error && <span className="mt-1 block text-[11px] text-danger">{error}</span>}
    </label>
  );
}

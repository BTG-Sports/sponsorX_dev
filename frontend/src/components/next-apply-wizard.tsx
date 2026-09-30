"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";

import { submitNextApplication } from "@/app/(public)/next/apply/actions";
import {
  EMPTY_DRAFT,
  RELATIONSHIPS,
  ROLES,
  birthDateOf,
  gradYears,
  isMinor,
  problems,
  stepsFor,
  toApplicationBody,
  type ApplyDraft,
  type ApplySchool,
  type StepKey,
} from "@/lib/next-apply";

/* --------------------------------------------------------------------------
   P1-FE-25 / P9-FE-06 — "Become the Media", phone-first. Five short steps
   (four for an adult: the guardian step appears only under 18, on the API's
   own rule), then a real application for the school's advisor.

   Progress saves on THIS device (localStorage) — "Save & exit" and coming
   back to the page resumes it. An emailed resume link is not built yet, so
   the page doesn't promise one.
   -------------------------------------------------------------------------- */

const KEY = "sx-next-apply-v1";
const TITLES: Record<StepKey, string> = {
  about: "About you",
  school: "Your school",
  roles: "Your roles",
  guardian: "Parent or guardian",
  review: "Check it over",
};

const noSubscribe = () => () => {};
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function parse(raw: string | null): { draft: ApplyDraft; step: StepKey } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { draft: ApplyDraft; step: StepKey };
    return { draft: { ...EMPTY_DRAFT, ...v.draft }, step: v.step };
  } catch {
    return null;
  }
}
function save(v: { draft: ApplyDraft; step: StepKey } | null) {
  try {
    if (v) window.localStorage.setItem(KEY, JSON.stringify(v));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private window: progress just isn't kept */
  }
}

const field =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none aria-[invalid=true]:border-danger";

export function NextApplyWizard({ schools }: { schools: ApplySchool[] }) {
  /* Saved progress, read without a set-state-in-effect (the join-wizard
     pattern): the server snapshot is null, the client's is the stored draft. */
  const storedRaw = useSyncExternalStore(noSubscribe, readRaw, () => null);
  const stored = useMemo(() => parse(storedRaw), [storedRaw]);
  const [touchedDraft, setTouchedDraft] = useState<ApplyDraft | null>(null);
  const [touchedStep, setTouchedStep] = useState<StepKey | null>(null);
  const draft = touchedDraft ?? stored?.draft ?? EMPTY_DRAFT;
  const step = touchedStep ?? stored?.step ?? "about";
  const restored = stored !== null && touchedStep === null;
  const setDraft = (next: ApplyDraft) => setTouchedDraft(next);
  const setStep = (next: StepKey) => setTouchedStep(next);
  const [showErrors, setShowErrors] = useState(false);
  const [phase, setPhase] = useState<"form" | "saved" | "done">("form");
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  const steps = stepsFor(draft);
  const idx = Math.max(0, steps.indexOf(step));
  const errs = problems(step, draft);
  const minor = isMinor(birthDateOf(draft));
  const set = <K extends keyof ApplyDraft>(k: K, v: ApplyDraft[K]) => setDraft({ ...draft, [k]: v });
  const shownSchools = useMemo(
    () => schools.filter((s) => `${s.name} ${s.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
    [schools, q],
  );
  const school = schools.find((s) => s.slug === draft.schoolSlug) ?? null;
  const invalid = (k: string) => (showErrors && errs[k] ? "true" : "false");

  const next = () => {
    if (Object.keys(errs).length) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    const to = steps[idx + 1] ?? "review";
    setStep(to);
    save({ draft, step: to });
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    setShowErrors(false);
    setStep(steps[Math.max(0, idx - 1)] ?? "about");
  };
  const saveAndExit = () => {
    save({ draft, step });
    setPhase("saved");
  };
  const submit = () => {
    if (Object.keys(errs).length) {
      setShowErrors(true);
      return;
    }
    setMessage(null);
    start(async () => {
      const r = await submitNextApplication(toApplicationBody(draft));
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      save(null);
      setPhase("done");
      window.scrollTo({ top: 0 });
    });
  };

  if (phase === "done") {
    return (
      <div className="space-y-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">Application sent</p>
        <h1 className="text-3xl font-semibold tracking-tight">Nice one, {draft.legalName.trim().split(/\s+/)[0] || draft.displayName.replace(/\.+$/, "")}.</h1>
        <p className="text-sm text-muted">Your faculty advisor reviews your application; you’ll hear back by email.</p>
        <ol className="space-y-3">
          {minor && (
            <li className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold">1 · Guardian consent</p>
              <p className="mt-1 text-xs text-muted">BTG will contact {draft.guardianName} to confirm their consent before you join.</p>
            </li>
          )}
          <li className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold">{minor ? "2" : "1"} · Advisor review</p>
            <p className="mt-1 text-xs text-muted">Your faculty advisor at {school?.name ?? "your school"}.</p>
          </li>
          <li className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold">{minor ? "3" : "2"} · You’re on the team</p>
            <p className="mt-1 text-xs text-muted">
              {draft.email ? `We email ${draft.email} with your first steps.` : "Your advisor tells you your first steps."}
            </p>
          </li>
        </ol>
        <Link href="/next/about" className="inline-block rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface-2">
          Back to NEXT
        </Link>
      </div>
    );
  }

  if (phase === "saved") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Saved. Come back any time.</h1>
        <p className="text-sm text-muted">
          You got as far as <b className="text-text">{TITLES[step]}</b>. Your answers are kept on this device — open this page again here to pick up.
        </p>
        <p className="text-xs text-faint">
          Progress: {idx} of {steps.length} steps done
        </p>
        <button type="button" onClick={() => setPhase("form")} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-cta-ink">
          Keep going now
        </button>
      </div>
    );
  }

  const errorList = showErrors ? Object.entries(errs) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-muted">
          Step {idx + 1} of {steps.length}
        </p>
        <button type="button" onClick={saveAndExit} className="text-xs font-medium text-primary hover:underline">
          Save &amp; exit
        </button>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-surface-2"}`} />
        ))}
      </div>

      {restored && idx > 0 && (
        <p className="rounded-lg bg-primary/12 px-3 py-2 text-xs text-primary-soft">Welcome back — you’re picking up where you left off.</p>
      )}

      <h2 className="text-2xl font-semibold tracking-tight">{TITLES[step]}</h2>

      {errorList.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs">
          <p className="font-semibold text-danger">
            {errorList.length} {errorList.length === 1 ? "thing" : "things"} to fix before you continue
          </p>
          <ul className="mt-1 list-disc pl-4 text-text">
            {errorList.map(([k, m]) => (
              <li key={k}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {step === "about" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">Hey! Let’s start with the basics.</p>
          <label className="block text-xs font-medium">
            Your full name
            <input className={field} autoComplete="name" value={draft.legalName} aria-invalid={invalid("legalName")} onChange={(e) => set("legalName", e.target.value)} />
          </label>
          <label className="block text-xs font-medium">
            Display name
            <input className={field} value={draft.displayName} aria-invalid={invalid("displayName")} onChange={(e) => set("displayName", e.target.value)} placeholder="e.g. Jordan R." />
            <span className="mt-1 block text-[11px] font-normal text-faint">The name on your bylines and credits.</span>
          </label>
          <label className="block text-xs font-medium">
            Email (optional)
            <input className={field} type="email" autoComplete="email" value={draft.email} aria-invalid={invalid("email")} onChange={(e) => set("email", e.target.value)} />
            <span className="mt-1 block text-[11px] font-normal text-faint">Any email works. It doesn’t have to be a school email.</span>
          </label>
          <label className="block text-xs font-medium">
            Graduation year
            <select className={field} value={draft.gradYear} aria-invalid={invalid("gradYear")} onChange={(e) => set("gradYear", e.target.value)}>
              <option value="">Choose…</option>
              {gradYears().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="text-xs font-medium">Date of birth</legend>
            <div className="mt-1 grid grid-cols-[1fr_1fr_1.4fr] gap-2">
              {(
                [
                  ["dobMonth", "Month", "MM"],
                  ["dobDay", "Day", "DD"],
                  ["dobYear", "Year", "YYYY"],
                ] as const
              ).map(([k, label, ph]) => (
                <label key={k} className="text-[11px] text-muted">
                  {label}
                  <input className={field} inputMode="numeric" placeholder={ph} value={draft[k]} aria-invalid={invalid("dob")} onChange={(e) => set(k, e.target.value.replace(/\D/g, "").slice(0, k === "dobYear" ? 4 : 2))} />
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-faint">Never shown publicly. Under 18? A parent or guardian step comes next.</p>
          </fieldset>
        </div>
      )}

      {step === "school" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Pick the school whose NEXT team you want to join.</p>
          <label className="block text-xs font-medium">
            <span className="sr-only">Search schools</span>
            <input className={field} type="search" placeholder="Search your school" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {shownSchools.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="sr-only">Schools</legend>
              {shownSchools.map((s) => (
                <label key={s.slug} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${draft.schoolSlug === s.slug ? "border-primary/60 bg-primary/10" : "border-line bg-surface"}`}>
                  <input type="radio" name="school" checked={draft.schoolSlug === s.slug} onChange={() => set("schoolSlug", s.slug)} />
                  <span>
                    <span className="block text-sm font-semibold">{s.name}</span>
                    <span className="block text-[11px] text-muted">{[s.city, s.stateCode].filter(Boolean).join(", ")} · NEXT team active</span>
                  </span>
                </label>
              ))}
              <p className="text-[11px] text-faint">Only schools that have adopted NEXT are listed.</p>
            </fieldset>
          ) : (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold">NEXT isn’t at your school yet</p>
              <p className="mt-1 text-xs text-muted">
                {q ? `No NEXT schools match “${q}”. ` : ""}Show a teacher or your principal the page for schools.
              </p>
              <Link href="/next/schools" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                Share the schools page →
              </Link>
            </div>
          )}
        </div>
      )}

      {step === "roles" && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-muted">Pick one or more. You can change this later with your advisor.</legend>
          {ROLES.map((r) => {
            const on = draft.roles.includes(r.key);
            return (
              <label key={r.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${on ? "border-primary/60 bg-primary/10" : "border-line bg-surface"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={on}
                  onChange={() => set("roles", on ? draft.roles.filter((k) => k !== r.key) : [...draft.roles, r.key])}
                />
                <span>
                  <span className="block text-sm font-semibold">{r.name}</span>
                  <span className="block text-[11px] text-muted">{r.text}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {step === "guardian" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">You’re under 18, so a parent or guardian needs to say yes before you join. This step only appears for students under 18.</p>
          <label className="block text-xs font-medium">
            Guardian’s full name
            <input className={field} value={draft.guardianName} aria-invalid={invalid("guardianName")} onChange={(e) => set("guardianName", e.target.value)} />
          </label>
          <label className="block text-xs font-medium">
            Guardian’s email
            <input className={field} type="email" value={draft.guardianEmail} aria-invalid={invalid("guardianEmail")} onChange={(e) => set("guardianEmail", e.target.value)} />
          </label>
          <label className="block text-xs font-medium">
            Relationship to you
            <select className={field} value={draft.guardianRelationship} onChange={(e) => set("guardianRelationship", e.target.value)}>
              {RELATIONSHIPS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-xl border border-line bg-surface p-4 text-xs text-muted">
            <p className="font-semibold text-text">How their consent works</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>When you submit, your guardian’s details go to BTG with your application.</li>
              <li>BTG contacts {draft.guardianName || "your guardian"} to confirm consent, and explains what NEXT keeps and what’s public.</li>
              <li>You join the team only once they’ve said yes.</li>
            </ol>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={draft.guardianAware} aria-invalid={invalid("guardianAware")} onChange={(e) => set("guardianAware", e.target.checked)} />
            {draft.guardianName || "My guardian"} knows I’m applying and expects to hear from BTG.
          </label>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Everything look right? Tap Edit to change anything.</p>
          {message && (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger">
              {message}
            </p>
          )}
          {(
            [
              ["about", "You", `${draft.legalName} · “${draft.displayName}”`, `Class of ${draft.gradYear}${draft.email ? ` · ${draft.email}` : ""}`],
              ["school", "School", school?.name ?? "—", [school?.city, school?.stateCode].filter(Boolean).join(", ")],
              ["roles", "Roles", ROLES.filter((r) => draft.roles.includes(r.key)).map((r) => r.name).join(", "), ""],
              ...(minor ? ([["guardian", "Guardian", draft.guardianName, draft.guardianEmail]] as const) : []),
            ] as const
          ).map(([s, label, main, sub]) => (
            <div key={s} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-faint">{label}</span>
                <span className="block truncate text-sm font-semibold">{main}</span>
                {sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}
              </span>
              <button type="button" onClick={() => setStep(s as StepKey)} className="text-xs font-medium text-primary hover:underline">
                Edit
              </button>
            </div>
          ))}
          <p className="text-[11px] text-faint">
            What we keep: your name, display name, graduation year, date of birth, school, roles{minor ? ", and your guardian’s name and email" : ""}. We never sell it. Your date of birth is never shown publicly.
          </p>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={draft.codeAccepted} aria-invalid={invalid("codeAccepted")} onChange={(e) => set("codeAccepted", e.target.checked)} />
            I’ll follow the NEXT student code: accurate reporting, respect for the athletes I cover, and my advisor approves what’s published.
          </label>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {idx > 0 && (
          <button type="button" onClick={back} className="rounded-lg border border-line px-4 py-3 text-sm font-medium hover:bg-surface-2">
            Back
          </button>
        )}
        {step === "review" ? (
          <button type="button" onClick={submit} disabled={pending} className="flex-1 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-cta-ink disabled:opacity-50">
            {pending ? "Sending…" : "Submit application"}
          </button>
        ) : (
          <button type="button" onClick={next} className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-cta-ink">
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

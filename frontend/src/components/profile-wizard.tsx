"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import { saveSocials, submitProfileChange } from "@/app/(app)/athlete/profile/edit/actions";
import { AthletePhotoEditor } from "@/components/athlete-photo-editor";
import { PlacePicker } from "@/components/place-picker";
import { Arrow, Eye, Flag, Lock, Medal, Shield, Tick, d } from "@/components/wizard-kit";
import { BRAND_CATEGORIES, EVERYDAY_CATEGORIES, categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { CONTENT_CAPABILITIES, capabilityLabel } from "@/lib/content-capabilities";
import type { ApiMyProfile } from "@/lib/profile-live";
import {
  NO_RESTRICTIONS_NOTE,
  WIZARD_STEPS,
  changeBody,
  everythingSelected,
  formFrom,
  metaLine,
  minutesLeft,
  nextOpen,
  placeLine,
  rowsFrom,
  selectEverything,
  stepChanged,
  stepNeeds,
  type SocialRow,
  type WizardForm,
  type WizardKey,
} from "@/lib/profile-wizard";

/* --------------------------------------------------------------------------
   ProfileWizard — /athlete/profile while the profile is unfinished
   (POL-FE-80, 2026-11-16). The owner found the nine-plate dashboard "so
   confusing for a human" and asked for a step-by-step wizard with
   animation, in the Arena's theme; once the profile is complete, no
   wizard and no "Open public page" link: the public page itself.

   One step per section the athlete can answer (lib/profile-wizard.ts):
   a track of numbered stops across the top, a ring for how far along,
   then the step: what it is, who sees it (an eye or a lock), a big
   friendly form, and a footer with "Step N of 7", Previous, Skip for now
   and Save & continue. Beside it, a live preview of the public page that
   changes as you type and lights the part you're filling in. A save plays
   a medal + confetti and moves to the next open step; the last one opens
   the finale, then the public page, revealed.

   Every save is the full editor's own write (edit/actions.ts): the same
   bodies, the same API, nothing new on the server. Sensitive fields (legal
   name, date of birth, guardian) stay in the full editor, which asks for
   what they need. The agreement is accepted on Confirmations, which comes
   back here (`?return=`).

   The island stays mounted across `router.refresh()`, so finishing the last
   step can celebrate before the page (now complete) shows the public page.
   The showcase arrives as a rendered node (memory: no-render-props-into-
   client-islands). The double-submit ref is the house rule
   (memory: double-submit-needs-a-ref).
   -------------------------------------------------------------------------- */

type Phase = number | "done";
const rank = (p: Phase) => (p === "done" ? 99 : p);

const PLATFORMS: SocialRow["platform"][] = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X"];
const PLATFORM_LABEL: Record<SocialRow["platform"], string> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube", X: "X" };
const LEVELS = ["HIGH_SCHOOL", "COLLEGE", "SEMI_PRO", "PRO", "AMATEUR"] as const;
const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = {
  HIGH_SCHOOL: "High school", COLLEGE: "College", SEMI_PRO: "Semi-pro", PRO: "Pro", AMATEUR: "Amateur",
};
const UNREACHABLE = "Couldn't reach SponsorX just now. Nothing changed. Try again in a minute.";

export type ProfileWizardProps = {
  profile: ApiMyProfile;
  /** Each step done, from the server's section states, in WIZARD_STEPS order. */
  done: boolean[];
  /** Every step done: the page opens on the public page. */
  complete: boolean;
  /** After approval, edits save at once; before it, the application at /join is what changes. */
  editable: boolean;
  /** Under the age of majority now (worked out on the server). */
  minor: boolean;
  /** The public page, owner-framed — shown once the profile is complete. */
  children: ReactNode;
};

export function ProfileWizard({ profile, done, complete, editable, minor, children }: ProfileWizardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"wizard" | "showcase">(complete ? "showcase" : "wizard");
  const [revealed, setRevealed] = useState(false);
  const [ribbon, setRibbon] = useState(false);

  /* Saved here, before the refreshed page arrives with it. */
  const [justDone, setJustDone] = useState<WizardKey[]>([]);
  const doneNow = useMemo(() => WIZARD_STEPS.map((s, i) => done[i] || justDone.includes(s.key)), [done, justDone]);
  const allDone = doneNow.every(Boolean);
  const count = doneNow.filter(Boolean).length;

  const [phase, setPhase] = useState<Phase>(() => {
    const first = nextOpen(done);
    return first === -1 ? "done" : first;
  });
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [cheer, setCheer] = useState<{ key: WizardKey; last: boolean } | null>(null);
  const [said, setSaid] = useState<Partial<Record<WizardKey, { ok: boolean; text: string } | null>>>({});
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heads = useRef<Record<string, HTMLHeadingElement | null>>({});
  const moved = useRef(false);

  /* The forms, seeded once; "changed" is measured against what's saved now. */
  const base = useMemo(() => formFrom(profile), [profile]);
  const baseRows = useMemo(() => rowsFrom(profile.socials), [profile.socials]);
  const [form, setForm] = useState<WizardForm>(() => formFrom(profile));
  const [rows, setRows] = useState<SocialRow[]>(() => rowsFrom(profile.socials));
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "contentCapabilities" | "brandInterests" | "restrictedCategories", v: string) =>
    setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /* One celebration for a profile finished elsewhere (the agreement, on
     Confirmations): this browser saw the wizard, and now the page is done.
     Per-viewer convenience only, so a blocked storage just skips it. */
  useEffect(() => {
    const key = `sx-pw-open:${profile.id}`;
    try {
      if (!complete) {
        window.localStorage.setItem(key, "1");
        return;
      }
      if (mode !== "showcase" || !window.localStorage.getItem(key)) return;
    } catch {
      return; /* storage blocked: no ribbon */
    }
    /* The key goes when the ribbon shows, so a dev double-run of this effect still shows it once. */
    const t = window.setTimeout(() => {
      try { window.localStorage.removeItem(key); } catch { /* blocked */ }
      setRibbon(true);
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  /* After a move: the new panel's heading takes focus, and the page scrolls
     back up if the top went out of view. */
  useEffect(() => {
    if (!moved.current) return;
    heads.current[String(phase)]?.focus({ preventScroll: true });
    const top = root.current?.getBoundingClientRect().top ?? 0;
    if (top < 72) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: top - 96, behavior: still ? "auto" : "smooth" });
    }
  }, [phase]);

  const go = (to: Phase) => {
    moved.current = true;
    setDir(rank(to) < rank(phase) ? "prev" : "next");
    setPhase(to);
  };

  const reveal = () => {
    try { window.localStorage.removeItem(`sx-pw-open:${profile.id}`); } catch { /* blocked */ }
    setRevealed(true);
    setMode("showcase");
    router.refresh();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  };

  const save = (i: number) => {
    const s = WIZARD_STEPS[i];
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        setSaid((p) => ({ ...p, [s.key]: null }));
        let notes: string[] = [];
        if (s.key === "socials") {
          const r = await saveSocials(
            profile.id,
            rows.map((x) => ({ platform: x.platform, handle: x.handle, ...(x.followers ? { followers: Number(x.followers) } : {}) })),
          ).catch(() => ({ ok: false as const, message: UNREACHABLE }));
          if (!r.ok) return setSaid((p) => ({ ...p, [s.key]: { ok: false, text: r.message } }));
        } else {
          const body = changeBody(s.key, form);
          if (!body) return;
          const r = await submitProfileChange(profile.id, body).catch(() => ({ ok: false as const, message: UNREACHABLE }));
          if (!r.ok) return setSaid((p) => ({ ...p, [s.key]: { ok: false, text: r.message } }));
          notes = r.checkNotes;
        }
        if (notes.length) setSaid((p) => ({ ...p, [s.key]: { ok: true, text: notes.join(" ") } }));
        router.refresh();
        const after = doneNow.map((v, k) => (k === i ? true : v));
        setJustDone((p) => (p.includes(s.key) ? p : [...p, s.key]));
        const next = nextOpen(after, i);
        setCheer({ key: s.key, last: next === -1 });
        timer.current = setTimeout(() => {
          setCheer(null);
          go(next === -1 ? "done" : next);
        }, 1500);
      } finally {
        busy.current = false;
      }
    });
  };

  /* ------------------------------------------------------- the public page */
  if (mode === "showcase") {
    return (
      <div className="sx-pw-showwrap" data-reveal={revealed ? "" : undefined}>
        {ribbon && (
          <div className="sx-arena-plate sx-pw-ribbon" role="status">
            <Medal size="md" burst={18} />
            <div className="min-w-0 flex-1">
              <p className="sx-pw-ribbon-title">Your profile is complete</p>
              <p className="mt-1 text-sm text-muted">Below is your public page: what sponsors and BTG see.</p>
            </div>
            <button type="button" onClick={() => setRibbon(false)} className="sx-cw-ghost">Got it</button>
          </div>
        )}
        {children}
      </div>
    );
  }

  /* ------------------------------------------------------------- the wizard */
  const here = typeof phase === "number" ? WIZARD_STEPS[phase] : null;
  const left = WIZARD_STEPS.length - count;

  return (
    <div ref={root} className="sx-cw sx-pw" data-dir={dir}>
      {/* the intro: how far along, in one glance */}
      <div className="sx-arena-plate sx-pw-intro">
        <Ring value={count} of={WIZARD_STEPS.length} />
        <div className="min-w-0 flex-1">
          <p className="sx-cw-kicker">Your public profile</p>
          <p className="sx-pw-intro-title">
            {allDone ? "Every step is done" : count === 0 ? "Let's build your public page" : "Let's finish your public page"}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {allDone
              ? "Your public page is ready."
              : `${left} ${left === 1 ? "step" : "steps"} to go · about ${minutesLeft(doneNow)} min. Each step saves as you go, so you can stop and come back any time.`}
          </p>
        </div>
      </div>

      {/* the track: every step, numbered, joined by a line that fills */}
      <nav className="sx-pw-track" aria-label="Profile steps">
        <ol>
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.key} className="sx-pw-stop" data-state={doneNow[i] ? "done" : "todo"} data-here={phase === i ? "" : undefined}>
              <button type="button" onClick={() => go(i)} aria-current={phase === i ? "step" : undefined} className="sx-pw-stop-btn">
                <span className="sx-pw-node">{doneNow[i] ? <Tick /> : i + 1}</span>
                <span className="sx-pw-stop-label">{s.short}</span>
                <span className="sr-only"> — {doneNow[i] ? "done" : "to do"}</span>
              </button>
            </li>
          ))}
          <li className="sx-pw-stop" data-state={allDone ? "done" : "todo"} data-here={phase === "done" ? "" : undefined}>
            <button type="button" disabled={!allDone} onClick={() => go("done")} aria-current={phase === "done" ? "step" : undefined} className="sx-pw-stop-btn">
              <span className="sx-pw-node"><Flag /></span>
              <span className="sx-pw-stop-label">Finish</span>
            </button>
          </li>
        </ol>
      </nav>

      <div className="sx-pw-body">
        <div className="sx-pw-stage">
          {WIZARD_STEPS.map((s, i) => {
            const isDone = doneNow[i];
            const changed = stepChanged(s.key, form, base, rows, baseRows);
            const needs = s.key === "agreements" ? null : stepNeeds(s.key, form, rows);
            const msg = said[s.key];
            const id = `sx-pw-h-${s.key}`;
            const skipTo = nextOpen(doneNow, i);
            const canSkip = !isDone && skipTo !== -1 && skipTo !== i;
            const forward: Phase = i + 1 < WIZARD_STEPS.length ? i + 1 : allDone ? "done" : nextOpen(doneNow);
            const wantsSave = editable && s.key !== "agreements" && (!isDone || changed);
            return (
              <section key={s.key} hidden={phase !== i} className="sx-cw-panel" aria-labelledby={id}>
                <div className="sx-arena-plate sx-cw-plate sx-pw-plate" data-state={isDone ? "done" : "todo"}>
                  <header className="max-w-2xl">
                    <p className="sx-pw-head-row sx-cw-rise" style={d(0.04)}>
                      <span className="sx-cw-kicker">Step {i + 1} of {WIZARD_STEPS.length}</span>
                      <Where where={s.where} />
                    </p>
                    <h2 id={id} ref={(el) => { heads.current[String(i)] = el; }} tabIndex={-1} className="sx-cw-title sx-cw-rise outline-none" style={d(0.08)}>
                      {s.title}
                    </h2>
                    <p className="sx-cw-lede sx-cw-rise" style={d(0.13)}>{s.tagline}</p>
                  </header>

                  <div className="mt-7 space-y-6">
                    {isDone && !changed && s.key !== "agreements" && (
                      <p className="sx-cw-banner sx-cw-rise" data-tone="win" style={d(0.18)}>
                        <span className="sx-cw-banner-icon" aria-hidden="true"><Tick /></span>
                        <span>
                          <strong className="block text-sm">Done. You can change it any time.</strong>
                          <span className="block text-xs opacity-90">Edit below and save, or go to the next step.</span>
                        </span>
                      </p>
                    )}
                    {!editable && s.key !== "agreements" && (
                      <p className="sx-cw-banner sx-cw-rise" data-tone="blue" style={d(0.18)}>
                        <span className="sx-cw-banner-icon" aria-hidden="true"><Shield /></span>
                        <span>
                          <strong className="block text-sm">Your application is still with BTG</strong>
                          <span className="block text-xs opacity-90">Until it&rsquo;s approved, changes go through the application itself. You can look through every step.</span>
                        </span>
                      </p>
                    )}

                    <div className="sx-cw-rise" style={d(0.22)}>
                      <fieldset disabled={!editable || pending} className="min-w-0 space-y-6 disabled:opacity-90">
                        <StepForm
                          k={s.key}
                          form={form}
                          rows={rows}
                          set={set}
                          toggle={toggle}
                          setRows={setRows}
                          profile={profile}
                          minor={minor}
                        />
                      </fieldset>
                      {s.key === "identity" && editable && (
                        <div className="sx-pw-photo mt-6">
                          <p className="sx-cw-label">Add a photo <span className="font-normal text-faint">(optional)</span></p>
                          <AthletePhotoEditor athleteId={profile.id} name={profile.displayName} photoUrl={profile.photoUrl ?? null} minor={minor} />
                        </div>
                      )}
                      {msg && (
                        <p role={msg.ok ? "status" : "alert"} className="sx-cw-msg mt-4" data-tone={msg.ok ? "win" : "danger"}>{msg.text}</p>
                      )}
                    </div>
                  </div>

                  {/* the footer: where you are · Previous · Skip · the one thing to do */}
                  <footer className="sx-cw-foot sx-cw-rise" style={d(0.3)}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">Step {i + 1} of {WIZARD_STEPS.length}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed" data-tone={needs && wantsSave ? "warn" : undefined}>
                        <span className={needs && wantsSave ? "text-warn" : "text-faint"}>
                          {s.key === "agreements"
                            ? isDone ? "Accepted. Nothing to do here." : "Opens Confirmations, then brings you back here."
                            : wantsSave ? needs ?? "Ready. Saving puts it live straight away." : isDone ? "Saved." : "Look through, then go on."}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {i > 0 && <button type="button" onClick={() => go(i - 1)} className="sx-cw-ghost">Previous</button>}
                      {canSkip && editable && (
                        <button type="button" onClick={() => go(skipTo)} className="sx-pw-skip">Skip for now</button>
                      )}
                      {s.key === "agreements" && !isDone ? (
                        <Link href="/athlete/confirmations?return=/athlete/profile" className="sx-cw-go" data-ready="">
                          Open Confirmations <Arrow />
                        </Link>
                      ) : wantsSave ? (
                        <button type="button" disabled={Boolean(needs) || pending} onClick={() => save(i)} className="sx-cw-go" data-ready={!needs && !pending ? "" : undefined}>
                          {pending ? "Saving…" : "Save & continue"} {!pending && <Arrow />}
                        </button>
                      ) : (
                        <button type="button" onClick={() => go(forward === -1 ? "done" : forward)} className="sx-cw-go" data-ready="">
                          {forward === "done" ? "Finish" : "Next"} <Arrow />
                        </button>
                      )}
                    </div>
                  </footer>

                  {cheer?.key === s.key && (
                    <div className="sx-cw-cheer" role="status">
                      <div className="flex flex-col items-center text-center">
                        <Medal size="md" burst={18} />
                        <p className="sx-cw-cheer-word mt-5">Saved!</p>
                        <p className="sx-cw-cheer-sub mt-1 text-sm text-muted">{cheer.last ? "That was the last step. One moment…" : "Nice. On to the next step…"}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {/* ------------------------------------------------------- finale */}
          <section hidden={phase !== "done"} className="sx-cw-panel" aria-labelledby="sx-pw-h-done">
            <div className="sx-arena-plate sx-cw-plate sx-cw-done" data-state="done">
              <div className="flex flex-col items-center text-center">
                <Medal size="lg" burst={phase === "done" ? 30 : 0} />
                <h2
                  id="sx-pw-h-done"
                  ref={(el) => { heads.current.done = el; }}
                  tabIndex={-1}
                  className="sx-cw-title sx-cw-shimmer sx-cw-rise mt-7 outline-none"
                  style={d(0.5)}
                >
                  Your profile is complete
                </h2>
                <p className="sx-cw-lede sx-cw-rise max-w-md" style={d(0.58)}>
                  {profile.state === "ACTIVE"
                    ? "Your public page is live. Sponsors and BTG see it now."
                    : "Your public page is ready. It goes live as soon as BTG activates your profile."}
                </p>
                <ul className="mt-7 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
                  {WIZARD_STEPS.map((s, i) => (
                    <li key={s.key} className="sx-cw-record sx-cw-rise" style={d(0.66 + i * 0.06)}>
                      <span className="sx-cw-banner-icon" aria-hidden="true"><Tick /></span>
                      <span className="min-w-0 text-sm font-semibold text-text">{s.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <footer className="sx-cw-foot sx-cw-rise" style={d(1.1)}>
                <p className="text-sm font-semibold text-text">All {WIZARD_STEPS.length} steps done</p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button type="button" onClick={() => go(WIZARD_STEPS.length - 1)} className="sx-cw-ghost">Previous</button>
                  <button type="button" onClick={reveal} className="sx-cw-go" data-ready="">
                    See your public page <Arrow />
                  </button>
                </div>
              </footer>
            </div>
          </section>
        </div>

        {/* the live preview: the public page, as you type */}
        <Preview form={form} rows={rows} focus={here?.key ?? null} where={here?.where ?? "public"} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- forms */

function StepForm({
  k, form, rows, set, toggle, setRows, profile, minor,
}: {
  k: WizardKey;
  form: WizardForm;
  rows: SocialRow[];
  set: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
  toggle: (k: "contentCapabilities" | "brandInterests" | "restrictedCategories", v: string) => void;
  setRows: (r: SocialRow[]) => void;
  profile: ApiMyProfile;
  minor: boolean;
}) {
  switch (k) {
    case "identity":
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" hint="The name on your public page." wide>
              <input className="sx-pw-input" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={120} placeholder="e.g. Jordan Reyes" autoComplete="off" />
            </Field>
            {/* POL-FE-117 — where they're from is picked: Country → Region → City, each searchable. */}
            <PlacePicker
              idPrefix="sx-pw-place"
              value={{ countryCode: form.countryCode, regionCode: form.stateCode, city: form.city }}
              onChange={(p) => {
                set("countryCode", p.countryCode);
                set("stateCode", p.regionCode);
                set("city", p.city);
              }}
              hints={{ country: "Where you live and compete." }}
              field={({ key, id, label, hint, error, children }) => (
                <div key={key} className="sx-pw-field">
                  <label htmlFor={id} className="sx-pw-field-label">{label}</label>
                  {children}
                  {(error || hint) && <span className="sx-pw-field-hint">{error ?? hint}</span>}
                </div>
              )}
            />
          </div>
          <div className="sx-pw-aside">
            <Lock />
            <p>
              <span className="font-semibold text-text">Legal name: {profile.legalName || "not on file"}.</span>{" "}
              Private, never on your public page. To change it (it needs a matching ID){minor && !profile.guardian ? " or to name your guardian" : ""},
              use <Link href="/athlete/profile/edit?section=identity" className="font-semibold text-athlete hover:underline">the full editor</Link>.
            </p>
          </div>
          {minor && !profile.guardian && (
            <p className="sx-cw-banner" data-tone="blue">
              <span className="sx-cw-banner-icon" aria-hidden="true"><Shield /></span>
              <span>
                <strong className="block text-sm">You&rsquo;re under 18, so a guardian approves for you</strong>
                <span className="block text-xs opacity-90">
                  Name them in <Link href="/athlete/profile/edit?section=identity" className="font-semibold underline">the full editor</Link>. They&rsquo;re emailed to complete their page.
                </span>
              </span>
            </p>
          )}
        </>
      );
    case "sport":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sport">
            <input className="sx-pw-input" value={form.sport} onChange={(e) => set("sport", e.target.value)} maxLength={60} placeholder="e.g. Basketball" autoComplete="off" />
          </Field>
          <Field label="Position" hint="Optional.">
            <input className="sx-pw-input" value={form.position} onChange={(e) => set("position", e.target.value)} maxLength={60} placeholder="e.g. Point guard" autoComplete="off" />
          </Field>
          <Field label="School or team" hint="Optional.">
            <input className="sx-pw-input" value={form.school} onChange={(e) => set("school", e.target.value)} maxLength={120} placeholder="e.g. Lincoln High" autoComplete="off" />
          </Field>
          <Field label="Class of" hint="Optional. Your graduation year.">
            <input className="sx-pw-input" inputMode="numeric" value={form.gradYear} onChange={(e) => set("gradYear", e.target.value.replace(/[^\d]/g, "").slice(0, 4))} placeholder="e.g. 2027" autoComplete="off" />
          </Field>
          <div className="sm:col-span-2">
            <p className="sx-pw-field-label">Level</p>
            <div className="sx-pw-seg" role="radiogroup" aria-label="Level">
              {LEVELS.map((l) => (
                <label key={l} className="sx-pw-seg-item" data-on={form.level === l ? "" : undefined}>
                  <input type="radio" name="sx-pw-level" className="sr-only" checked={form.level === l} onChange={() => set("level", l)} />
                  {LEVEL_LABEL[l]}
                </label>
              ))}
            </div>
          </div>
          <Field label="Achievements" hint="Optional. Titles, records, honours. Shown on your public page." wide>
            <textarea className="sx-pw-input sx-pw-area" value={form.achievements} onChange={(e) => set("achievements", e.target.value)} maxLength={2000} rows={3} placeholder="e.g. All-State first team, 2025" />
          </Field>
        </div>
      );
    case "socials": {
      const on = new Set(rows.map((r) => r.platform));
      const flip = (p: SocialRow["platform"]) =>
        setRows(on.has(p) ? rows.filter((r) => r.platform !== p) : PLATFORMS.filter((x) => on.has(x) || x === p).map((x) => rows.find((r) => r.platform === x) ?? { platform: x, handle: "", followers: "" }));
      const edit = (p: SocialRow["platform"], patch: Partial<SocialRow>) => setRows(rows.map((r) => (r.platform === p ? { ...r, ...patch } : r)));
      return (
        <div>
          <p className="sx-cw-label"><span className="sx-cw-label-n" aria-hidden="true">1</span>Tap the platforms you&rsquo;re on</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map((p) => {
              const row = rows.find((r) => r.platform === p);
              return (
                <div key={p} className="sx-pw-social" data-on={row ? "" : undefined}>
                  <button type="button" onClick={() => flip(p)} aria-pressed={Boolean(row)} className="sx-pw-social-head">
                    <span className="sx-pw-social-mark" aria-hidden="true"><PlatformGlyph p={p} /></span>
                    <span className="flex-1 text-left text-sm font-semibold text-text">{PLATFORM_LABEL[p]}</span>
                    <span className="sx-pw-social-check" aria-hidden="true"><Tick /></span>
                  </button>
                  {row && (
                    <div className="sx-pw-social-body">
                      <Field label="Handle">
                        <input className="sx-pw-input" value={row.handle} onChange={(e) => edit(p, { handle: e.target.value })} placeholder="@yourname" autoComplete="off" />
                      </Field>
                      <Field label="Followers" hint="Optional.">
                        <input className="sx-pw-input" inputMode="numeric" value={row.followers} onChange={(e) => edit(p, { followers: e.target.value.replace(/[^\d]/g, "") })} placeholder="e.g. 12400" autoComplete="off" />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-faint">Numbers you enter show as self-reported until BTG verifies them.</p>
        </div>
      );
    }
    case "capabilities":
      return (
        <Picks
          label="Pick everything you're happy to do"
          items={CONTENT_CAPABILITIES}
          name={capabilityLabel}
          picked={form.contentCapabilities}
          onToggle={(v) => toggle("contentCapabilities", v)}
          tone="blue"
        />
      );
    case "interests":
      return (
        <Picks
          label="Pick the kinds of brands you'd like"
          items={BRAND_CATEGORIES}
          name={(c) => categoryLabel(c as BrandCategory)}
          picked={form.brandInterests}
          onToggle={(v) => toggle("brandInterests", v)}
          tone="blue"
          bulk={{
            everyday: EVERYDAY_CATEGORIES,
            onSet: (v) => set("brandInterests", v),
            note: "“Select everything” leaves out the age-restricted kinds (alcohol, tobacco and vape, cannabis, gambling, firearms, adult). Tap any of those yourself if you want them.",
          }}
        />
      );
    case "restrictions": {
      const none = form.restrictedCategories.length === 0 && form.restrictionNotes.trim() === NO_RESTRICTIONS_NOTE;
      return (
        <>
          <label className="sx-cw-agree" data-on={none ? "" : undefined}>
            <input
              type="checkbox"
              className="sr-only"
              checked={none}
              autoComplete="off"
              onChange={(e) => {
                if (e.target.checked) {
                  set("restrictedCategories", []);
                  set("restrictionNotes", NO_RESTRICTIONS_NOTE);
                } else set("restrictionNotes", "");
              }}
            />
            <span className="sx-cw-box" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-4"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-text">Nothing&rsquo;s off-limits for me</span>
              <span className="mt-0.5 block text-[12px] text-muted">Recorded as your answer, so BTG knows it was asked.</span>
            </span>
          </label>
          {!none && (
            <>
              <Picks
                label="Or pick what you can never promote"
                items={BRAND_CATEGORIES}
                name={(c) => categoryLabel(c as BrandCategory)}
                picked={form.restrictedCategories}
                onToggle={(v) => toggle("restrictedCategories", v)}
                tone="danger"
              />
              <Field label="Anything else BTG should know" hint="Optional. Only BTG reads this." wide>
                <textarea className="sx-pw-input sx-pw-area" value={form.restrictionNotes} onChange={(e) => set("restrictionNotes", e.target.value)} maxLength={2000} rows={2} placeholder="e.g. My school bans energy drinks" />
              </Field>
            </>
          )}
        </>
      );
    }
    case "agreements":
      return profile.agreementsSigned > 0 ? (
        <p className="sx-cw-banner" data-tone="win">
          <span className="sx-cw-banner-icon" aria-hidden="true"><Tick /></span>
          <span>
            <strong className="block text-sm">Accepted</strong>
            <span className="block text-xs opacity-90">
              {profile.agreementsSigned} {profile.agreementsSigned === 1 ? "agreement" : "agreements"} on record. They&rsquo;re all on Confirmations.
            </span>
          </span>
        </p>
      ) : (
        <ol className="sx-pw-howto">
          <li><span className="sx-cw-label-n" aria-hidden="true">1</span><span><strong>Open Confirmations.</strong> It&rsquo;s its own short step-by-step.</span></li>
          <li><span className="sx-cw-label-n" aria-hidden="true">2</span><span><strong>Read the agreement</strong> section by section. About 3 minutes.</span></li>
          <li><span className="sx-cw-label-n" aria-hidden="true">3</span><span><strong>Tick and accept.</strong> You come straight back here.</span></li>
        </ol>
      );
  }
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`sx-pw-field ${wide ? "sm:col-span-2" : ""}`}>
      <span className="sx-pw-field-label">{label}</span>
      {children}
      {hint && <span className="sx-pw-field-hint">{hint}</span>}
    </label>
  );
}

function Picks({
  label, items, name, picked, onToggle, tone, bulk,
}: {
  label: string;
  items: readonly string[];
  name: (c: string) => string;
  picked: string[];
  onToggle: (v: string) => void;
  tone: "blue" | "danger";
  /**
   * POL-FE-122 — "Select everything" and "Clear". "Select everything" is a
   * toggle: on, it adds every `everyday` item (keeping anything else already
   * picked); pressed again, it clears every pick. "Clear" clears every pick.
   */
  bulk?: { everyday: readonly string[]; onSet: (v: string[]) => void; note?: string };
}) {
  const allEveryday = !!bulk && everythingSelected(bulk.everyday, picked);
  return (
    <div>
      <p className="sx-cw-label">
        {label}
        <span className="sx-pw-count" data-on={picked.length > 0 ? "" : undefined}>{picked.length} picked</span>
      </p>
      {bulk && (
        <div className="sx-pw-bulk">
          <button type="button" className="sx-pw-bulk-btn" aria-pressed={allEveryday} data-on={allEveryday ? "" : undefined} onClick={() => bulk.onSet(selectEverything(items, bulk.everyday, picked))}>
            <span className="sx-pw-pick-dot" aria-hidden="true"><Tick /></span>
            Select everything
          </button>
          <button type="button" className="sx-pw-bulk-btn" disabled={picked.length === 0} onClick={() => bulk.onSet([])}>
            Clear
          </button>
          {bulk.note && <p className="sx-pw-bulk-note">{bulk.note}</p>}
        </div>
      )}
      <div className="sx-pw-picks" role="group" aria-label={label}>
        {items.map((c, k) => {
          const on = picked.includes(c);
          return (
            <label key={c} className="sx-pw-pick" data-on={on ? "" : undefined} data-tone={tone} style={d(0.02 * k)}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(c)} />
              <span className="sx-pw-pick-dot" aria-hidden="true"><Tick /></span>
              {name(c)}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Where({ where }: { where: "public" | "private" }) {
  return where === "public" ? (
    <span className="sx-pw-where" data-where="public"><Eye /> Shows on your public page</span>
  ) : (
    <span className="sx-pw-where" data-where="private"><Lock /> Only you and BTG see this</span>
  );
}

/** How far along: a ring that fills as steps are done. */
function Ring({ value, of }: { value: number; of: number }) {
  const share = of === 0 ? 0 : value / of;
  return (
    <span className="sx-pw-ring" aria-label={`${value} of ${of} steps done`} role="img">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="sx-pw-ring-track" cx="50" cy="50" r="42" />
        <circle className="sx-pw-ring-fill" cx="50" cy="50" r="42" pathLength={1} style={{ strokeDashoffset: 1 - share }} data-full={share === 1 ? "" : undefined} />
      </svg>
      <span className="sx-pw-ring-num" aria-hidden="true">
        <strong>{value}</strong>
        <span>of {of}</span>
      </span>
    </span>
  );
}

/* ---------------------------------------------------------- live preview */

const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

function Preview({ form, rows, focus, where }: { form: WizardForm; rows: SocialRow[]; focus: WizardKey | null; where: "public" | "private" }) {
  const meta = metaLine({ sport: form.sport.trim(), position: form.position.trim() || null, level: form.level || null });
  const place = placeLine({ school: form.school.trim() || null, city: form.city.trim() || null, stateCode: form.stateCode.trim() || null, countryCode: form.countryCode });
  const name = form.displayName.trim();
  const reach = rows.reduce((n, r) => n + (r.followers ? Number(r.followers) : 0), 0);
  return (
    <aside className="sx-pw-preview" aria-label="Live preview of your public page" data-focus={focus ?? undefined} data-where={where}>
      <p className="sx-pw-preview-kicker">
        <span className="sx-pw-live-dot" aria-hidden="true" /> Live preview · your public page
      </p>
      <div className="sx-pw-mini">
        <div className="sx-pw-mini-hero" data-block="identity">
          <span className="sx-pw-mono" aria-hidden="true">{initials(name)}</span>
          <div className="min-w-0">
            <p className="sx-pw-mini-name" data-empty={name ? undefined : ""}>{name || "Your name"}</p>
            <p className="sx-pw-mini-meta" data-empty={meta ? undefined : ""}>{meta || "Your sport · position · level"}</p>
            {(place || focus === "identity" || focus === "sport") && (
              <p className="sx-pw-mini-place" data-empty={place ? undefined : ""}>{place || "School · City, ST"}</p>
            )}
          </div>
        </div>
        {form.achievements.trim() && (
          <p className="sx-pw-mini-quote" data-block="sport">{form.achievements.trim()}</p>
        )}

        <div className="sx-pw-mini-block" data-block="socials">
          <p className="sx-pw-mini-label">Social reach{reach > 0 && <span> · {reach.toLocaleString("en-US")} followers</span>}</p>
          {rows.length === 0 ? (
            <p className="sx-pw-mini-ghost">No accounts yet</p>
          ) : (
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={r.platform} className="flex items-center gap-2 text-[12px]">
                  <span className="sx-pw-mini-glyph" aria-hidden="true"><PlatformGlyph p={r.platform} /></span>
                  <span className="min-w-0 flex-1 truncate text-muted">@{r.handle.trim().replace(/^@/, "") || "handle"}</span>
                  {r.followers && <span className="font-semibold tabular-nums text-text">{Number(r.followers).toLocaleString("en-US")}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sx-pw-mini-block" data-block="capabilities">
          <p className="sx-pw-mini-label">Content they deliver</p>
          <MiniChips items={form.contentCapabilities.map(capabilityLabel)} empty="Nothing picked yet" />
        </div>
        <div className="sx-pw-mini-block" data-block="interests">
          <p className="sx-pw-mini-label">Brand interests</p>
          <MiniChips items={form.brandInterests.map((c) => categoryLabel(c as BrandCategory))} empty="Nothing picked yet" />
        </div>

        {where === "private" && (
          <div className="sx-pw-veil">
            <span className="sx-pw-veil-icon" aria-hidden="true"><Lock /></span>
            <p className="text-sm font-semibold text-text">This step stays private</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">Nothing here shows on your public page. Only you and BTG see it.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function MiniChips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="sx-pw-mini-ghost">{empty}</p>;
  return (
    <p className="flex flex-wrap gap-1">
      {items.map((x) => <span key={x} className="sx-pw-mini-chip">{x}</span>)}
    </p>
  );
}

/** Plain marks for the four platforms — shapes, not the brands' logos. */
function PlatformGlyph({ p }: { p: SocialRow["platform"] }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "size-4" };
  switch (p) {
    case "INSTAGRAM":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>;
    case "TIKTOK":
      return <svg {...common}><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.5 2.6 2.4 4.4 5 4.6" /></svg>;
    case "YOUTUBE":
      return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" /></svg>;
    case "X":
      return <svg {...common}><path d="M4 4l16 16M20 4L4 20" /></svg>;
  }
}

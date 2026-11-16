"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";

import { acceptCollabAction, confirmRulesAction } from "@/app/(app)/athlete/confirmations/actions";
import { agreementSections, nextStep, sectionChip, type ConfirmResult, type StepState } from "@/lib/athlete-confirmations";

/* --------------------------------------------------------------------------
   ConfirmationsWizard — /athlete/confirmations as a step-by-step wizard
   (redesign 2026-11-16; owner: the two stacked cards were "so confusing
   for a human", then a reference: a numbered stepper joined by a line,
   "Step 1", a title, one paragraph, the content, and a footer with
   "Step 1 of 3" left and Previous / Next right). P8-FE-04 / P8-FE-07
   underneath, unchanged:

     Step 1     Your own rules                    POST /me/rules-attestation
     Step 2     Content Collaboration Agreement   POST /agreements/accept
     All set    the record of both, and the way back (`?return=`)

   The stepper is the overview: a vertical rail at the left on a wide
   screen, dots across the top on a phone. Inside a step: read it, tick the
   box, confirm. A confirm that lands plays a burst, then the next open
   step slides in by itself.

   Every panel is rendered and the inactive ones are `hidden`: the wording
   is in the markup without JS, and a panel's entrance animation replays
   each time it's shown (display:none → block restarts a CSS animation).
   The page (server) decides every word and state; this only walks them.
   No function props cross in (memory: no-render-props-into-client-islands).
   The double-submit ref and autoComplete="off" are the old form's QA fixes
   (2026-10-23), kept.
   -------------------------------------------------------------------------- */

export type ConfirmationTarget =
  | { kind: "rules"; version: string }
  | { kind: "collab"; agreementId: string; bodyHash: string };

export type WizardStep = {
  kind: "rules" | "collab";
  state: StepState;
  title: string;
  /** The stepper's label on a phone. */
  short: string;
  /** One plain sentence: what this is and what you're agreeing to. */
  tagline: string;
  /** "A new deal waits until you confirm this." — or null when not enforced. */
  why: string | null;
  /** "Wording 2026-10-20" / "Version 2". */
  version: string;
  minutes: number;
  /** Verbatim. */
  text: string;
  /** The tick line, by seat. */
  tick: string;
  cta: string;
  /** "Confirmed on Oct 3, 2026 · …" when done. */
  record: string;
  /** What a minor's own login reads instead of the tick box. */
  guardianLine: string;
  target: ConfirmationTarget;
};

export type WizardWords = {
  eyebrow: string;
  heading: string;
  sub: string;
  /** Only the guardian can act on what's left (a minor's own login). */
  guardianOnly: boolean;
  doneHeading: string;
  doneSub: string;
  back: string;
  backLabel: string;
  recordNote: string;
};

type Phase = number | "done";
const rank = (p: Phase) => (p === "done" ? 99 : p);

export function ConfirmationsWizard({ steps, words }: { steps: WizardStep[]; words: WizardWords }) {
  const router = useRouter();
  /* Confirmed here, before the refreshed page arrives with it. */
  const [justDone, setJustDone] = useState<string[]>([]);
  const states = useMemo(() => steps.map((s) => (justDone.includes(s.kind) ? "done" : s.state)), [steps, justDone]);
  const allDone = states.every((s) => s === "done");

  const [phase, setPhase] = useState<Phase>(() => {
    const first = nextStep(steps.map((s) => s.state));
    return first === -1 ? "done" : first;
  });
  const [dir, setDir] = useState<"next" | "prev">("next");
  /* Did the viewer finish here (the full confetti) or arrive already done? */
  const [fresh, setFresh] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [said, setSaid] = useState<Record<string, ConfirmResult | null>>({});
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heads = useRef<Record<string, HTMLHeadingElement | null>>({});
  const moved = useRef(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /* After a move: the new panel's heading takes focus (a screen reader hears
     where it landed), and the page scrolls back up if the top went out of view. */
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

  const submit = (s: WizardStep, i: number) => {
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        setSaid((p) => ({ ...p, [s.kind]: null }));
        const r =
          s.target.kind === "rules"
            ? await confirmRulesAction(s.target.version)
            : await acceptCollabAction(s.target.agreementId, s.target.bodyHash);
        if (r.ok || r.reload) {
          setTicked((p) => ({ ...p, [s.kind]: false }));
          router.refresh();
        }
        if (!r.ok) {
          setSaid((p) => ({ ...p, [s.kind]: r }));
          return;
        }
        if (r.message) setSaid((p) => ({ ...p, [s.kind]: r }));
        setJustDone((p) => (p.includes(s.kind) ? p : [...p, s.kind]));
        const next = nextStep(states.map((st, k) => (k === i ? "done" : st)), i);
        setCheer(s.kind);
        timer.current = setTimeout(() => {
          setCheer(null);
          if (next === -1) setFresh(true);
          go(next === -1 ? "done" : next);
        }, 1700);
      } finally {
        busy.current = false;
      }
    });
  };

  const left = states.filter((s) => s !== "done").length;
  const minutes = steps.reduce((n, s, i) => n + (states[i] === "done" ? 0 : s.minutes), 0);

  return (
    <div ref={root} className="sx-cw" data-dir={dir}>
      {/* ----------------------------------------------- the stepper (overview) */}
      <nav className="sx-cw-rail" aria-label="Confirmation steps">
        <div className="sx-cw-rail-head">
          <p className="sx-cw-kicker">{words.eyebrow}</p>
          <p className="sx-cw-rail-title">{allDone ? words.doneHeading : words.heading}</p>
          {!allDone && (
            <p className="sx-cw-rail-sub">
              {words.sub}
              {left > 0 && !words.guardianOnly && <span className="mt-1.5 block text-faint">About {minutes} min in all.</span>}
            </p>
          )}
        </div>
        <ol className="sx-cw-stepper">
          {steps.map((s, i) => {
            const here = phase === i;
            return (
              <li key={s.kind} className="sx-cw-stop" data-state={states[i]} data-here={here ? "" : undefined}>
                <button type="button" onClick={() => go(i)} aria-current={here ? "step" : undefined} className="sx-cw-stop-btn">
                  <span className="sx-cw-node">{states[i] === "done" ? <Tick /> : i + 1}</span>
                  <span className="sx-cw-stop-text">
                    <span className="sx-cw-stop-kicker">Step {i + 1}</span>
                    <span className="sx-cw-stop-title" data-long="">{s.title}</span>
                    <span className="sx-cw-stop-title" data-short="">{s.short}</span>
                    <span className="sx-cw-stop-state"><StateLabel state={states[i]} /></span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="sx-cw-stop" data-state={allDone ? "done" : "todo"} data-here={phase === "done" ? "" : undefined}>
            <button type="button" disabled={!allDone} onClick={() => go("done")} aria-current={phase === "done" ? "step" : undefined} className="sx-cw-stop-btn">
              <span className="sx-cw-node"><Flag /></span>
              <span className="sx-cw-stop-text">
                <span className="sx-cw-stop-kicker">Finish</span>
                <span className="sx-cw-stop-title">All set</span>
              </span>
            </button>
          </li>
        </ol>
      </nav>

      <div className="sx-cw-stage">
        {/* ------------------------------------------------------------ steps */}
        {steps.map((s, i) => {
          const state = states[i];
          const on = Boolean(ticked[s.kind]);
          const msg = said[s.kind];
          const id = `sx-cw-h-${s.kind}`;
          const record = s.state === "done" ? s.record : `Confirmed just now · ${s.version}`;
          const after = nextStep(states, i);
          const forward: Phase = after === -1 ? "done" : after === i ? (i + 1 < steps.length ? i + 1 : "done") : after;
          return (
            <section key={s.kind} hidden={phase !== i} className="sx-cw-panel" aria-labelledby={id}>
              <div className="sx-arena-plate sx-cw-plate" data-state={state}>
                <header className="max-w-2xl">
                  <p className="sx-cw-kicker sx-cw-rise" style={d(0.04)}>Step {i + 1}</p>
                  <h2 id={id} ref={(el) => { heads.current[String(i)] = el; }} tabIndex={-1} className="sx-cw-title sx-cw-rise outline-none" style={d(0.08)}>
                    {s.title}
                  </h2>
                  <p className="sx-cw-lede sx-cw-rise" style={d(0.13)}>{s.tagline}</p>
                  <p className="sx-cw-meta sx-cw-rise" style={d(0.17)}>
                    <span>About {s.minutes} min to read</span>
                    {s.version && <span>{s.version}</span>}
                    {state === "todo" && s.why && <span className="sx-cw-why"><span aria-hidden="true" className="sx-cw-why-dot" />{s.why}</span>}
                  </p>
                </header>

                {state === "unavailable" ? (
                  <div className="sx-cw-rise mt-7 space-y-3" style={d(0.22)}>
                    <p className="text-sm text-muted">This can&rsquo;t be loaded right now. Try again in a moment.</p>
                    <button type="button" onClick={() => router.refresh()} className="sx-cw-ghost">Try again</button>
                  </div>
                ) : (
                  <div className="mt-7 space-y-6">
                    {state === "done" && (
                      <p className="sx-cw-banner sx-cw-rise" data-tone="win" style={d(0.2)} role="status">
                        <span className="sx-cw-banner-icon" aria-hidden="true"><Tick /></span>
                        <span>
                          <strong className="block text-sm">Done — nothing to do here.</strong>
                          <span className="block text-xs opacity-90">{record}</span>
                        </span>
                      </p>
                    )}
                    {state === "guardian" && (
                      <p className="sx-cw-banner sx-cw-rise" data-tone="blue" style={d(0.2)}>
                        <span className="sx-cw-banner-icon" aria-hidden="true"><Shield /></span>
                        <span>
                          <strong className="block text-sm">Your guardian does this one</strong>
                          <span className="block text-xs opacity-90">{s.guardianLine}</span>
                        </span>
                      </p>
                    )}

                    <div className="sx-cw-rise" style={d(0.24)}>
                      <Label n={state === "todo" ? 1 : null}>{state === "todo" ? "Read it" : "The wording"}</Label>
                      {s.kind === "rules" ? (
                        <blockquote tabIndex={0} aria-label="Your own rules wording" className="sx-cw-quote">{s.text}</blockquote>
                      ) : (
                        <Reader body={s.text} />
                      )}
                    </div>

                    {state === "todo" && (
                      <div className="sx-cw-rise" style={d(0.32)}>
                        <Label n={2}>Tick the box to agree</Label>
                        <label htmlFor={`confirm-${s.kind}`} className="sx-cw-agree" data-on={on ? "" : undefined}>
                          <input
                            id={`confirm-${s.kind}`}
                            type="checkbox"
                            checked={on}
                            /* Back/forward must not restore a tick React doesn't hold (QA 2026-10-23). */
                            autoComplete="off"
                            disabled={pending}
                            onChange={(e) => setTicked((p) => ({ ...p, [s.kind]: e.target.checked }))}
                            className="sr-only"
                          />
                          <span className="sx-cw-box" aria-hidden="true">
                            <svg viewBox="0 0 24 24" className="size-4"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                          </span>
                          <span className="text-[13px] font-medium leading-relaxed text-text sm:text-sm">{s.tick}</span>
                        </label>
                        <p className="mt-2 text-[11px] leading-relaxed text-faint">{words.recordNote}</p>
                        {msg && msg.message && (
                          <p role={msg.ok ? "status" : "alert"} className="sx-cw-msg mt-3" data-tone={msg.ok ? "win" : "danger"}>{msg.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* the footer: where you are, Previous, the one thing to do */}
                <footer className="sx-cw-foot sx-cw-rise" style={d(0.38)}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">Step {i + 1} of {steps.length}</p>
                    {state === "todo" && <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{on ? "Ready — press the button to finish this step." : "Tick the box, then confirm."}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {i > 0 && (
                      <button type="button" onClick={() => go(i - 1)} className="sx-cw-ghost">Previous</button>
                    )}
                    {state === "todo" ? (
                      <button type="button" disabled={!on || pending} onClick={() => submit(s, i)} className="sx-cw-go" data-ready={on && !pending ? "" : undefined}>
                        {pending ? "Saving…" : s.cta} {!pending && <Arrow />}
                      </button>
                    ) : (
                      <button type="button" onClick={() => go(forward)} disabled={forward === "done" && !allDone} className="sx-cw-go" data-ready={forward === "done" && !allDone ? undefined : ""}>
                        {forward === "done" ? "Finish" : "Next"} <Arrow />
                      </button>
                    )}
                  </div>
                </footer>

                {cheer === s.kind && <Cheer last={nextStep(states, i) === -1} />}
              </div>
            </section>
          );
        })}

        {/* ------------------------------------------------------------- done */}
        <section hidden={phase !== "done"} className="sx-cw-panel" aria-labelledby="sx-cw-h-done">
          <div className="sx-arena-plate sx-cw-plate sx-cw-done" data-state="done" data-fresh={fresh ? "" : undefined}>
            <div className="flex flex-col items-center text-center">
              <Medal size="lg" burst={fresh ? 30 : 0} />
              <h2
                id="sx-cw-h-done"
                ref={(el) => { heads.current.done = el; }}
                tabIndex={-1}
                className="sx-cw-title sx-cw-shimmer sx-cw-rise mt-7 outline-none"
                style={d(0.5)}
              >
                {words.doneHeading}
              </h2>
              <p className="sx-cw-lede sx-cw-rise max-w-md" style={d(0.58)}>{words.doneSub}</p>

              <ul className="mt-7 w-full max-w-lg space-y-2 text-left">
                {steps.map((s, i) => (
                  <li key={s.kind} className="sx-cw-record sx-cw-rise" style={d(0.66 + i * 0.08)}>
                    <span className="sx-cw-banner-icon" aria-hidden="true"><Tick /></span>
                    <span className="min-w-0">
                      <strong className="block text-sm text-text">{s.title}</strong>
                      <span className="block text-xs text-muted">{s.state === "done" ? s.record : `Confirmed just now · ${s.version}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <footer className="sx-cw-foot sx-cw-rise" style={d(0.85)}>
              <p className="text-sm font-semibold text-text">All {steps.length} steps done</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button type="button" onClick={() => go(steps.length - 1)} className="sx-cw-ghost">Previous</button>
                <Link href={words.back} className="sx-cw-go" data-ready="">
                  {words.backLabel} <Arrow />
                </Link>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

function Label({ n, children }: { n: number | null; children: string }) {
  return (
    <p className="sx-cw-label">
      {n !== null && <span className="sx-cw-label-n" aria-hidden="true">{n}</span>}
      {children}
    </p>
  );
}

function StateLabel({ state }: { state: StepState }) {
  const label = state === "done" ? "Done" : state === "todo" ? "To do" : state === "guardian" ? "Your guardian" : "Unavailable";
  return <span data-tone={state}>{label}</span>;
}

/** The agreement, section by section, with a reading lane and chips that jump. */
function Reader({ body }: { body: string }) {
  const sections = useMemo(() => agreementSections(body), [body]);
  const box = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [read, setRead] = useState(0);
  const [at, setAt] = useState(0);
  const headed = sections.filter((s) => s.heading).length;

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setRead(max <= 0 ? 1 : Math.min(1, el.scrollTop / max));
    let cur = 0;
    refs.current.forEach((s, k) => { if (s && s.offsetTop - 24 <= el.scrollTop) cur = k; });
    if (max > 0 && el.scrollTop >= max - 2) cur = sections.length - 1;
    if (cur !== at) {
      setAt(cur);
      const c = chips.current?.querySelector<HTMLElement>(`[data-k="${cur}"]`);
      if (c && chips.current) chips.current.scrollTo({ left: c.offsetLeft - chips.current.clientWidth / 2 + c.clientWidth / 2, behavior: "smooth" });
    }
  };
  const jump = (k: number) => {
    const el = box.current;
    const s = refs.current[k];
    if (el && s) el.scrollTo({ top: s.offsetTop - 8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const pct = Math.round(read * 100);
  return (
    <div className="sx-cw-reader">
      {headed > 0 && (
        <div className="sx-cw-reader-head">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-muted">
              {at === 0 && !sections[0]?.heading ? "Start" : `Section ${sections[at]?.heading?.match(/^\d+/)?.[0] ?? ""} of ${headed}`}
            </span>
            <span className={pct >= 98 ? "font-semibold text-success" : "text-faint"}>{pct >= 98 ? "✓ Read to the end" : `${pct}% read`}</span>
          </div>
          <span className="sx-cw-progress mt-2" aria-hidden="true">
            <i style={{ transform: `scaleX(${read})` }} data-full={pct >= 98 ? "" : undefined} />
          </span>
          <div ref={chips} className="sx-cw-chips mt-2.5" role="toolbar" aria-label="Jump to a section">
            {sections.map((s, k) =>
              s.heading ? (
                <button key={k} type="button" data-k={k} data-on={k === at ? "" : undefined} onClick={() => jump(k)} className="sx-cw-chip-btn">
                  {s.heading.match(/^\d+/)?.[0]}. {sectionChip(s.heading)}
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}
      <div ref={box} onScroll={onScroll} tabIndex={0} aria-label="Content Collaboration Agreement text" className="sx-cw-scroll">
        {sections.map((s, k) => (
          <section key={k} ref={(el) => { refs.current[k] = el; }}>
            {s.heading && <h3>{s.heading}</h3>}
            {s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
          </section>
        ))}
      </div>
    </div>
  );
}

/* Burst particles — fixed, so the server and client draw the same. */
const COLORS = ["var(--sx-athlete)", "var(--sx-accent)", "var(--sx-success)", "var(--sx-primary-soft)", "var(--sx-warn)"];
function Burst({ n, reach }: { n: number; reach: number }) {
  return (
    <span aria-hidden="true" className="sx-cw-burst">
      {Array.from({ length: n }, (_, k) => (
        <i
          key={k}
          style={{
            "--a": `${Math.round((k * 360) / n + ((k * 37) % 17) - 8)}deg`,
            "--r": `${reach * (0.62 + ((k * 53) % 40) / 100)}px`,
            "--s": `${((k * 97) % 300) - 150}deg`,
            "--t": `${0.35 + ((k * 13) % 10) / 100}s`,
            "--c": COLORS[k % COLORS.length],
            width: k % 3 === 0 ? 6 : 8,
            height: k % 3 === 0 ? 6 : 13,
            borderRadius: k % 3 === 0 ? 9999 : 3,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}

function Medal({ size, burst }: { size: "md" | "lg"; burst: number }) {
  return (
    <span className="sx-cw-medal" data-size={size}>
      {burst > 0 && <Burst n={burst} reach={size === "lg" ? 210 : 120} />}
      <span aria-hidden="true" className="sx-cw-orbit" />
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="sx-cw-disc" cx="50" cy="50" r="44" />
        <circle className="sx-cw-ring" cx="50" cy="50" r="44" pathLength={1} />
        <path className="sx-cw-tick" pathLength={1} d="M31 51.5l12.5 12.5L70 37.5" />
      </svg>
    </span>
  );
}

function Cheer({ last }: { last: boolean }) {
  return (
    <div className="sx-cw-cheer" role="status">
      <div className="flex flex-col items-center text-center">
        <Medal size="md" burst={18} />
        <p className="sx-cw-cheer-word mt-5">Confirmed!</p>
        <p className="sx-cw-cheer-sub mt-1 text-sm text-muted">{last ? "That's everything — one moment…" : "Nice. On to the next step…"}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ glyphs */

function Tick() {
  return <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
function Arrow() {
  return <svg viewBox="0 0 24 24" className="sx-cw-arrow size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
function Flag() {
  return <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg>;
}
function Shield() {
  return <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /></svg>;
}

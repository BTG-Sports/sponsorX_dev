"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from "react";

import { ArenaRing } from "./arena-ring";
import {
  PLAN_CLEARED_COOKIE, PLAN_HIDE_AFTER_MS, firstOpen, isSettled, needsYou, planCleared, planHeadline, type PlanIcon, type PlanState, type PlanStepMeta,
} from "@/lib/athlete-game-plan";

/* --------------------------------------------------------------------------
   AthleteGamePlan — the top of /athlete as a step-by-step wizard (POL-FE-81,
   2026-11-16). The owner found the dashboard "so confusing for a human":
   eleven blocks and no first move. This is the first move.

   Left, the overview: a score ring ("4 of 6 squared away"), a headline that
   says how many things need you, and the six steps from sign-up to paid as
   numbered stops joined by a line — a rail on a wide screen, a row of dots
   on a phone. Right, ONE step at a time: "Step 2 of 6", a title, one plain
   sentence, what's in it (the server drew it), and a footer with Previous,
   the one thing to do, and Next / Skip for now. It opens on the first step
   that needs the athlete; when nothing does, on the finish line (a medal,
   confetti once per browser session). The first time EVERYTHING is squared
   away, the finish line counts down (paused while hovered or focused; a
   "Hide now" button) and folds the plan away; the page leaves it out after
   that until a step needs the athlete again (owner, 2026-11-16).

   Steps move with the stepper, Previous/Next, the arrow keys on the stepper
   and a swipe on a phone. Every panel is in the markup and the inactive
   ones are `hidden` (no-JS reads it all; display:none → block replays each
   panel's entrance). The page decides every word and state
   (lib/athlete-game-plan.ts); the bodies arrive as ReactNode — never a
   function (memory: no-render-props-into-client-islands).
   -------------------------------------------------------------------------- */

export type GamePlanStep = PlanStepMeta & { body: ReactNode };

type Phase = number | "finish";
const rank = (p: Phase) => (p === "finish" ? 999 : p);
const CHEER_KEY = "sx-gp-cheered";

export function AthleteGamePlan({ steps, name, clearKey }: { steps: GamePlanStep[]; name: string | null; clearKey: string }) {
  const states = steps.map((s) => s.state);
  const settled = states.filter(isSettled).length;
  const open = states.filter(needsYou).length;
  const canFinish = open === 0;
  const head = planHeadline(states);
  /* Everything squared away (no guardian step pending): the first time, the
     finish line celebrates, counts down and tucks the plan away; the server
     leaves it out after that (lib/athlete-game-plan.ts, PLAN_CLEARED_COOKIE). */
  const cleared = planCleared(states);

  const [phase, setPhase] = useState<Phase>(() => {
    const first = firstOpen(states);
    return first === -1 ? "finish" : first;
  });
  const [dir, setDir] = useState<"next" | "prev">("next");
  const medal = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLElement>(null);
  const heads = useRef<Record<string, HTMLHeadingElement | null>>({});
  const stops = useRef<(HTMLButtonElement | null)[]>([]);
  const list = useRef<HTMLOListElement>(null);
  const moved = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  /* show → folding (the plan shrinks away) → gone (nothing rendered). */
  const [tuck, setTuck] = useState<"show" | "folding" | "gone">("show");
  /* The countdown waits while the athlete is pointing at or inside the card. */
  const [paused, setPaused] = useState(false);
  /* Went back to look at the steps: they chose to look, so no auto-hide. */
  const [stay, setStay] = useState(false);
  const left = useRef(PLAN_HIDE_AFTER_MS);
  const counting = cleared && phase === "finish" && tuck === "show" && !paused && !stay;

  /* Remember (or forget) that this browser saw the plan cleared. */
  useEffect(() => {
    try {
      if (cleared) document.cookie = `${PLAN_CLEARED_COOKIE}=${clearKey}; path=/athlete; max-age=31536000; samesite=lax`;
      else if (document.cookie.includes(`${PLAN_CLEARED_COOKIE}=`)) document.cookie = `${PLAN_CLEARED_COOKIE}=; path=/athlete; max-age=0; samesite=lax`;
    } catch {
      /* cookies blocked: the plan simply shows again next time */
    }
  }, [cleared, clearKey]);

  /* The countdown: what's left of it survives a pause. */
  useEffect(() => {
    if (!counting) return;
    const since = performance.now();
    const t = window.setTimeout(() => setTuck("folding"), left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(0, left.current - (performance.now() - since));
    };
  }, [counting]);

  /* Folding → gone once the shrink has played (at once with reduced motion). */
  useEffect(() => {
    if (tuck !== "folding") return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setTuck("gone"), still ? 0 : 850);
    return () => clearTimeout(t);
  }, [tuck]);

  /* Confetti on the finish line once per visit, not on every dashboard load. */
  useEffect(() => {
    if (phase !== "finish") return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(CHEER_KEY) === "1";
      sessionStorage.setItem(CHEER_KEY, "1");
    } catch {
      /* storage blocked: cheer anyway */
    }
    /* An attribute, not state: the burst is drawn already and shown by CSS. */
    if (!seen || cleared) medal.current?.setAttribute("data-cheer", "");
  }, [phase, cleared]);

  /* After a move the new step's title takes focus (a screen reader hears
     where it landed) and the plan scrolls back into view on a phone. */
  useEffect(() => {
    if (!moved.current) return;
    heads.current[String(phase)]?.focus({ preventScroll: true });
    const top = root.current?.getBoundingClientRect().top ?? 0;
    if (top < 64) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: top - 88, behavior: still ? "auto" : "smooth" });
    }
  }, [phase]);

  /* Below lg the stepper is a row of chips that scrolls sideways: keep the
     current chip in the middle of it (on arrival too). The page itself never
     scrolls for this: it moves the row only. A wide screen's rail doesn't
     overflow, so this does nothing there. */
  useEffect(() => {
    const row = list.current;
    const chip = stops.current[phase === "finish" ? steps.length : phase]?.parentElement;
    if (!row || !chip || row.scrollWidth <= row.clientWidth + 1) return;
    const still = !moved.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: still ? "auto" : "smooth" });
  }, [phase, steps.length]);

  const go = (to: Phase) => {
    if (to === "finish" && !canFinish) return;
    if (to === phase) return;
    moved.current = true;
    if (phase === "finish" && cleared) setStay(true);
    setDir(rank(to) < rank(phase) ? "prev" : "next");
    setPhase(to);
  };
  const order: Phase[] = [...steps.map((_, i) => i), ...(canFinish ? (["finish"] as const) : [])];
  const at = order.indexOf(phase);
  const step = (by: 1 | -1) => {
    const to = order[at + by];
    if (to !== undefined) go(to);
  };

  /* Arrow keys walk the stepper (roving focus); the panel keeps its own keys. */
  const onStopKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const max = steps.length - (canFinish ? 0 : 1);
    let to = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") to = Math.min(max, i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = Math.max(0, i - 1);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = max;
    if (to === -1) return;
    e.preventDefault();
    stops.current[to]?.focus();
    go(to === steps.length ? "finish" : to);
  };

  /* A sideways swipe on a phone moves a step; a scroll doesn't. */
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.6) step(dx < 0 ? 1 : -1);
  };

  if (tuck === "gone") return null;
  return (
    <div className="sx-gp-wrap sx-arena-in" data-tuck={tuck} style={{ "--sx-reveal-delay": "0.08s" } as CSSProperties}>
    <div className="sx-gp-wrap-inner">
    <section ref={root} className="sx-gp sx-arena-plate" data-dir={dir} aria-labelledby="sx-gp-head">
      <span aria-hidden="true" className="sx-gp-aurora" />
      <span aria-hidden="true" className="sx-gp-grain" />

      <div className="sx-gp-grid">
        {/* ------------------------------------------------ the overview */}
        <div className="sx-gp-side">
          <div className="sx-gp-score">
            <ArenaRing id="sx-gp-score" value={steps.length ? settled / steps.length : 1} size={92} stroke={8} tone={canFinish ? "win" : "blue"} delay={0.2}>
              <span className="sx-gp-score-n">
                {settled}
                <small>/{steps.length}</small>
              </span>
            </ArenaRing>
            <div className="min-w-0">
              <p className="sx-gp-kicker">{name ? `${name}'s game plan` : "Your game plan"}</p>
              <h2 id="sx-gp-head" className="sx-gp-headline">{head.title}</h2>
              <p className="sx-gp-sub">{settled} of {steps.length} squared away</p>
            </div>
          </div>
          <p className="sx-gp-explain">{head.sub}</p>

          <ol ref={list} className="sx-gp-steps" aria-label="Game plan steps">
            {steps.map((s, i) => {
              const here = phase === i;
              return (
                <li key={s.key} className="sx-gp-stop" data-state={s.state} data-here={here ? "" : undefined} style={{ "--i": i } as CSSProperties}>
                  <button
                    ref={(el) => { stops.current[i] = el; }}
                    type="button"
                    onClick={() => go(i)}
                    onKeyDown={(e) => onStopKey(e, i)}
                    tabIndex={here || (phase === "finish" && i === 0) ? 0 : -1}
                    aria-current={here ? "step" : undefined}
                    className="sx-gp-stop-btn"
                  >
                    <span className="sx-gp-node">
                      {isSettled(s.state) ? <Tick /> : s.state === "guardian" ? <Glyph name="shield" /> : i + 1}
                    </span>
                    <span className="sx-gp-stop-text">
                      <span className="sx-gp-stop-title" data-long="">{s.title}</span>
                      <span className="sx-gp-stop-title" data-short="">{s.short}</span>
                      <span className="sx-gp-stop-status">{s.status}</span>
                    </span>
                    {here && <span className="sx-gp-here">You&rsquo;re here</span>}
                  </button>
                </li>
              );
            })}
            <li className="sx-gp-stop" data-state={canFinish ? "done" : "locked"} data-here={phase === "finish" ? "" : undefined} data-finish="" style={{ "--i": steps.length } as CSSProperties}>
              <button
                ref={(el) => { stops.current[steps.length] = el; }}
                type="button"
                disabled={!canFinish}
                onClick={() => go("finish")}
                onKeyDown={(e) => onStopKey(e, steps.length)}
                tabIndex={phase === "finish" ? 0 : -1}
                aria-current={phase === "finish" ? "step" : undefined}
                className="sx-gp-stop-btn"
              >
                <span className="sx-gp-node"><Flag /></span>
                <span className="sx-gp-stop-text">
                  <span className="sx-gp-stop-title" data-long="">All caught up</span>
                  <span className="sx-gp-stop-title" data-short="">Done</span>
                  <span className="sx-gp-stop-status">{canFinish ? "You made it" : `${open} to go`}</span>
                </span>
              </button>
            </li>
          </ol>
        </div>

        {/* ------------------------------------------------- one step */}
        <div className="sx-gp-stage" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { swipe.current = null; }}>
          {steps.map((s, i) => {
            const id = `sx-gp-h-${s.key}`;
            const last = i === steps.length - 1;
            const nextIsFinish = last && canFinish;
            return (
              <section key={s.key} hidden={phase !== i} className="sx-gp-panel" data-state={s.state} aria-labelledby={id}>
                <span aria-hidden="true" className="sx-gp-jersey">{String(i + 1).padStart(2, "0")}</span>
                <header className="relative max-w-2xl">
                  <p className="sx-gp-rise sx-gp-step-kicker" style={d(0.02)}>
                    <span className="sx-gp-icon"><Glyph name={s.icon} /></span>
                    Step {i + 1} of {steps.length}
                    <StateTag state={s.state} />
                  </p>
                  <h3 id={id} ref={(el) => { heads.current[String(i)] = el; }} tabIndex={-1} className="sx-gp-rise sx-gp-title outline-none" style={d(0.07)}>
                    {s.title}
                  </h3>
                  <p className="sx-gp-rise sx-gp-lede" style={d(0.12)}>{s.lede}</p>
                </header>

                <div className="sx-gp-rise sx-gp-body" style={d(0.18)}>{s.body}</div>

                <footer className="sx-gp-rise sx-gp-foot" style={d(0.26)}>
                  <Dots n={steps.length} at={i} />
                  <div className="flex flex-wrap items-center gap-2.5">
                    {i > 0 && (
                      <button type="button" onClick={() => go(i - 1)} className="sx-gp-ghost">
                        <Arrow back /> Previous
                      </button>
                    )}
                    {(!last || nextIsFinish) && (
                      <button type="button" onClick={() => go(nextIsFinish ? "finish" : i + 1)} className="sx-gp-ghost">
                        {needsYou(s.state) ? "Skip for now" : nextIsFinish ? "Finish" : "Next step"} <Arrow />
                      </button>
                    )}
                    {s.cta && (
                      <Link href={s.cta.href} className="sx-gp-go" data-hot={needsYou(s.state) ? "" : undefined}>
                        <span aria-hidden="true" className="sx-gp-go-shine" />
                        {s.cta.label} <Arrow />
                      </Link>
                    )}
                  </div>
                </footer>
              </section>
            );
          })}

          {/* -------------------------------------------- the finish line */}
          <section
            hidden={phase !== "finish"}
            className="sx-gp-panel sx-gp-finish"
            aria-labelledby="sx-gp-h-finish"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false); }}
          >
            <div className="flex flex-col items-center text-center">
              <Medal ref={medal} />
              <h3 id="sx-gp-h-finish" ref={(el) => { heads.current.finish = el; }} tabIndex={-1} className="sx-gp-rise sx-gp-title sx-gp-shimmer mt-6 outline-none" style={d(0.45)}>
                {head.title}
              </h3>
              <p className="sx-gp-rise sx-gp-lede max-w-md" style={d(0.52)}>{head.sub}</p>
              <ul className="mt-6 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
                {steps.map((s, i) => (
                  <li key={s.key} className="sx-gp-rise sx-gp-record" data-state={s.state} style={d(0.58 + i * 0.05)}>
                    <span className="sx-gp-record-icon" aria-hidden="true">{s.state === "guardian" ? <Glyph name="shield" /> : <Tick />}</span>
                    <span className="min-w-0">
                      <strong className="block truncate text-[13px] text-text">{s.title}</strong>
                      <span className="block truncate text-[11px] text-muted">{s.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <footer className="sx-gp-rise sx-gp-foot" style={d(0.9)}>
              {cleared && !stay ? (
                <div className="sx-gp-tuck min-w-0 flex-1" data-paused={paused ? "" : undefined}>
                  <p className="text-[13px] font-semibold text-text">Every step checked</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                    {paused ? "Paused while you look." : "This card tucks itself away in a moment. It comes back when something needs you."}
                  </p>
                  <span aria-hidden="true" className="sx-gp-tuck-lane" style={{ "--ms": `${PLAN_HIDE_AFTER_MS}ms` } as CSSProperties}><i /></span>
                </div>
              ) : (
                <p className="text-[13px] font-semibold text-text">Every step checked</p>
              )}
              <div className="flex flex-wrap items-center gap-2.5">
                <button type="button" onClick={() => go(steps.length - 1)} className="sx-gp-ghost">
                  <Arrow back /> Back to the steps
                </button>
                {cleared && (
                  <button type="button" onClick={() => setTuck("folding")} className="sx-gp-go" data-hot="">
                    <span aria-hidden="true" className="sx-gp-go-shine" />
                    Hide now
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      </div>
    </section>
    </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

const TAG: Record<PlanState, string> = {
  done: "Done",
  clear: "Nothing waiting",
  todo: "Needs you",
  warn: "Late",
  guardian: "Your guardian",
};
function StateTag({ state }: { state: PlanState }) {
  return <span className="sx-gp-tag" data-state={state}>{TAG[state]}</span>;
}

function Dots({ n, at }: { n: number; at: number }) {
  return (
    <span className="sx-gp-dots" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => (
        <i key={k} data-on={k === at ? "" : undefined} data-past={k < at ? "" : undefined} />
      ))}
    </span>
  );
}

/* Burst particles — fixed, so the server and client draw the same. */
const COLORS = ["var(--sx-athlete)", "var(--sx-accent)", "var(--sx-success)", "var(--sx-primary-soft)", "var(--sx-warn)"];
function Medal({ ref }: { ref: Ref<HTMLSpanElement> }) {
  return (
    <span ref={ref} className="sx-gp-medal">
      <span aria-hidden="true" className="sx-gp-burst">
          {Array.from({ length: 32 }, (_, k) => (
            <i
              key={k}
              style={{
                "--a": `${Math.round((k * 360) / 32 + ((k * 37) % 17) - 8)}deg`,
                "--r": `${200 * (0.6 + ((k * 53) % 40) / 100)}px`,
                "--s": `${((k * 97) % 300) - 150}deg`,
                "--c": COLORS[k % COLORS.length],
                width: k % 3 === 0 ? 7 : 8,
                height: k % 3 === 0 ? 7 : 14,
                borderRadius: k % 3 === 0 ? 9999 : 3,
              } as CSSProperties}
            />
          ))}
      </span>
      <span aria-hidden="true" className="sx-gp-orbit" />
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="sx-gp-disc" cx="50" cy="50" r="44" />
        <circle className="sx-gp-medal-ring" cx="50" cy="50" r="44" pathLength={1} />
        <path className="sx-gp-medal-tick" pathLength={1} d="M31 51.5l12.5 12.5L70 37.5" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ glyphs */

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function Tick() {
  return <svg {...svg} strokeWidth={2.8} className="size-4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
function Flag() {
  return <svg {...svg} strokeWidth={2.2} className="size-4"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg>;
}
function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg {...svg} strokeWidth={2.4} className={`sx-gp-arrow size-4 ${back ? "rotate-180" : ""}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function Glyph({ name }: { name: PlanIcon }) {
  const paths: Record<PlanIcon, ReactNode> = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
    shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />,
    card: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
    inbox: <><path d="M4 13l2.5-7h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
    wallet: <><path d="M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M4 7l11-3v3M16 13.5h.01" /></>,
  };
  return <svg {...svg} className="size-4">{paths[name]}</svg>;
}

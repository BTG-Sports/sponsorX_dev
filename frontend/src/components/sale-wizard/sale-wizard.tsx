"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Arrow, Flag, Medal, Tick, d } from "@/components/wizard-kit";
import type { JourneyStop, StopStatus, Turn } from "@/lib/sale-journey";

/* --------------------------------------------------------------------------
   POL-FE-96 — one sale as a step-by-step wizard (the athlete's
   /athlete/sales/<id>), in the confirmations wizard's hand: its rail,
   panels, buttons and medal (`.sx-cw-*`, confirmations.css) plus this
   page's own pieces (`.sx-sl-*`, app/(app)/athlete/sales/[id]/sale.css).

     the rail     the four steps — Sponsor pays · You deliver it · Sponsor
                  checks it · You get paid — each with its date or what
                  it waits on; any step can be opened to look at
     the stage    one step at a time, sliding in from the side it came
                  from; it opens on the step the sale is at
     the footer   "Step 2 of 4", what to do here, Previous / Next

   The server page decides every word and builds each panel's body (the
   deliver steps, the problem answer, the cancel box are their own client
   islands, passed in as ReactNode — memory: no-render-props-into-client-
   islands). When the sale moves on while the page is open (marked
   delivered here → the refreshed read says DELIVERED), the stage plays a
   burst with the server's words, then slides to the new step.
   -------------------------------------------------------------------------- */

export type SalePanel = {
  title: string;
  lede: string;
  body: ReactNode;
  /** The footer's small line: what to do here, or what happens next. */
  hint: string;
};

export type SaleCheer = { word: string; sub: string } | null;

const STATE_WORD: Record<StopStatus, string> = { done: "Done", now: "Now", later: "Coming up", stopped: "Stopped", off: "Won't happen" };

export function SaleWizard({
  stops, current, turn, panels, cheers, finish,
}: {
  stops: JourneyStop[];
  current: number;
  turn: Turn;
  panels: SalePanel[];
  /** The burst for arriving at step i while the page is open (index = the new step). */
  cheers: SaleCheer[];
  /** The last step's way out: Sales, or Payouts once the share is confirmed. */
  finish: { href: string; label: string };
}) {
  const [phase, setPhase] = useState(current);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [cheer, setCheer] = useState<SaleCheer>(null);
  const seen = useRef(current);
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const go = (to: number) => {
    moved.current = true;
    setDir(to < phase ? "prev" : "next");
    setPhase(to);
  };

  /* The sale moved on (a refresh after marking it delivered): cheer, then follow it. */
  useEffect(() => {
    const from = seen.current;
    seen.current = current;
    if (current === from) return;
    const c = current > from ? cheers[current] ?? null : null;
    if (!c) {
      moved.current = true;
      setDir(current < from ? "prev" : "next");
      setPhase(current);
      return;
    }
    setCheer(c);
    timer.current = setTimeout(() => {
      setCheer(null);
      moved.current = true;
      setDir("next");
      setPhase(current);
    }, 1800);
  }, [current, cheers]);

  /* After a move: the new panel's heading takes focus, and the page scrolls back up if the top left view. */
  useEffect(() => {
    if (!moved.current) return;
    heads.current[phase]?.focus({ preventScroll: true });
    const top = root.current?.getBoundingClientRect().top ?? 0;
    if (top < 72) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: top - 96, behavior: still ? "auto" : "smooth" });
    }
  }, [phase]);

  const last = stops.length - 1;

  return (
    <div ref={root} className="sx-cw sx-sl" data-dir={dir}>
      {/* ------------------------------------------------- the rail (overview) */}
      <nav className="sx-cw-rail" aria-label="Steps of this sale">
        <div className="sx-cw-rail-head">
          <p className="sx-cw-kicker">From sale to payout</p>
          <p className="sx-cw-rail-title">{stops.length} steps</p>
          <p className="sx-cw-rail-sub">Open any step to see it. The ringed one is where this sale is now.</p>
        </div>
        <ol className="sx-cw-stepper">
          {stops.map((s, i) => {
            const here = phase === i;
            return (
              <li key={s.key} className="sx-cw-stop" data-state={s.status === "done" ? "done" : s.status} data-here={here ? "" : undefined} data-turn={s.status === "now" ? turn.who : undefined}>
                <button type="button" onClick={() => go(i)} aria-current={here ? "step" : undefined} className="sx-cw-stop-btn">
                  <span className="sx-cw-node">{s.status === "done" ? <Tick /> : s.status === "stopped" ? <Cross /> : s.status === "off" ? "–" : i === last ? <Flag /> : s.n}</span>
                  <span className="sx-cw-stop-text">
                    <span className="sx-cw-stop-kicker">Step {s.n}</span>
                    <span className="sx-cw-stop-title" data-long="">{s.title}</span>
                    <span className="sx-cw-stop-title" data-short="">{s.short}</span>
                    <span className="sx-cw-stop-state">
                      <span data-tone={s.status === "now" && turn.who === "you" ? "you" : s.status}>
                        {s.status === "now" && turn.who === "you" ? "Your move" : STATE_WORD[s.status]}
                      </span>
                      {s.note && <span className="sx-sl-stop-note">{s.note}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="sx-cw-stage relative">
        {panels.map((p, i) => {
          const s = stops[i]!;
          const id = `sx-sl-h-${s.key}`;
          return (
            <section key={s.key} hidden={phase !== i} className="sx-cw-panel" aria-labelledby={id}>
              <div className="sx-arena-plate sx-cw-plate sx-sl-plate" data-state={s.status} data-turn={s.status === "now" ? turn.who : undefined}>
                <span aria-hidden="true" className="sx-sl-plate-num">{s.n}</span>
                <header className="relative max-w-2xl">
                  <p className="sx-cw-kicker sx-cw-rise flex flex-wrap items-center gap-2" style={d(0.04)}>
                    <span>Step {s.n} of {stops.length}</span>
                    <StatusTag status={s.status} you={s.status === "now" && turn.who === "you"} />
                  </p>
                  <h2 id={id} ref={(el) => { heads.current[i] = el; }} tabIndex={-1} className="sx-cw-title sx-cw-rise outline-none" style={d(0.08)}>
                    {p.title}
                  </h2>
                  <p className="sx-cw-lede sx-cw-rise" style={d(0.13)}>{p.lede}</p>
                </header>

                <div className="relative mt-7 space-y-5">{p.body}</div>

                <footer className="sx-cw-foot sx-cw-rise" style={d(0.42)}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">Step {s.n} of {stops.length}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{p.hint}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {i > 0 && <button type="button" onClick={() => go(i - 1)} className="sx-cw-ghost">Previous</button>}
                    {i < last ? (
                      <button type="button" onClick={() => go(i + 1)} className={i === current && s.status === "now" ? "sx-cw-ghost" : "sx-cw-go"} data-ready={i === current && s.status === "now" ? undefined : ""}>
                        {i < current || s.status === "done" ? "Next" : "See what's next"} <Arrow />
                      </button>
                    ) : (
                      <Link href={finish.href} className="sx-cw-go" data-ready="">
                        {finish.label} <Arrow />
                      </Link>
                    )}
                  </div>
                </footer>
              </div>
            </section>
          );
        })}

        {cheer && (
          <div className="sx-cw-cheer sx-sl-cheer" role="status">
            <div className="flex flex-col items-center text-center">
              <Medal size="md" burst={22} />
              <p className="sx-cw-cheer-word mt-5">{cheer.word}</p>
              <p className="sx-cw-cheer-sub mt-1 text-sm text-muted">{cheer.sub}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTag({ status, you }: { status: StopStatus; you: boolean }) {
  const word = you ? "Your move" : status === "now" ? "Happening now" : STATE_WORD[status];
  return (
    <span className="sx-sl-tag" data-tone={you ? "you" : status}>
      {(you || status === "now") && <span aria-hidden="true" className="sx-sl-tag-dot" />}
      {word}
    </span>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

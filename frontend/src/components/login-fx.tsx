"use client";

/* --------------------------------------------------------------------------
   /login effects — the client islands the otherwise server-rendered sign-in
   stage (login-stage.tsx) needs. None of them changes layout.

   - LoginStage    the page root. Arms the stage entrance (`data-armed`,
                   the /packages `.sx-stage-in` / `.sx-stage-line` rules, as
                   StageReveal does); the entrance itself is released by
                   whoever brought the page in — the boot screen on a hard
                   load (LandingLoader, mounted by the page) or the page
                   transition on an arrival from the site — when it sets
                   `html[data-sx-loaded]`. Without JS nothing is armed, so
                   nothing is hidden. With a fine pointer it also writes the
                   pointer onto itself — `--px` / `--py` (px) for the ground's
                   follow-light and `--tx` / `--ty` (-1..1) for the parallax
                   layers — one write a frame. Reduced motion: nothing follows
                   the pointer (the entrance rules stand down in CSS).
   - SpotRing      the sign-in panel's outline spotlight: `--mx` / `--my` /
                   `--spot` on itself (the impact card's `.sx-impact-spot`),
                   with no tilt — a form that leans under the cursor is a
                   form that is hard to click.
   - PortalCycler  "Where you'll land": the five workspaces one sign-in
                   opens, as tabs that advance on their own. The progress
                   bar under the active tab is a CSS animation and its
                   `animationend` is the clock, so hover / focus pausing it
                   (`animation-play-state`) pauses the cycle too, and with
                   reduced motion there is no animation and so no cycling.
                   Purely informative — the role comes from Postgres after
                   sign-in (/portal), never from this choice, and it says so.
   -------------------------------------------------------------------------- */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function finePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/* ------------------------------------------------------------------ stage */

export function LoginStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const html = document.documentElement;
    root.dataset.armed = "";
    if (reducedMotion() || !finePointer()) return;

    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      root.style.setProperty("--px", `${px.toFixed(0)}px`);
      root.style.setProperty("--py", `${(py + window.scrollY).toFixed(0)}px`);
      root.style.setProperty("--tx", ((px / w) * 2 - 1).toFixed(3));
      root.style.setProperty("--ty", ((py / h) * 2 - 1).toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      root.dataset.lit = "";
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      delete root.dataset.lit;
      root.style.setProperty("--tx", "0");
      root.style.setProperty("--ty", "0");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    html.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      html.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} data-sx-stage="" className={className}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- spotlight */

export function SpotRing({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer()) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${(px - r.left).toFixed(0)}px`);
      el.style.setProperty("--my", `${(py - r.top).toFixed(0)}px`);
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      el.style.setProperty("--spot", "1");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => el.style.setProperty("--spot", "0");
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function SponsorIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  );
}

function AthleteIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="14" cy="4.5" r="2" />
      <path d="m6.5 21 3.5-6 3 2.5V22" />
      <path d="m7 11 3.5-3.5 3.5 2 2.5 3.5H20" />
      <path d="m10.5 7.5 2.5 6.5" />
    </svg>
  );
}

function PropertyIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
      <ellipse cx="12" cy="12" rx="4.5" ry="2.2" />
      <path d="M12 6.5v11" />
    </svg>
  );
}

function NextIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
      <path d="M7 8h1.5M7 11h1.5M15.5 8H17M15.5 11H17" />
    </svg>
  );
}

function TeamIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M12 3 19.5 6v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

function CheckIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2.4} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/* ----------------------------------------------------------------- portals */

/** The workspaces one sign-in can open — the portal route groups under
 *  app/(app) and what each one's nav actually holds. */
const PORTALS = [
  {
    key: "sponsor",
    tab: "Sponsor",
    name: "Sponsor portal",
    tone: "#4fb0ff",
    icon: SponsorIcon,
    lines: ["Campaigns from brief to report", "The athlete marketplace", "Orders and delivery proof"],
  },
  {
    key: "athlete",
    tab: "Athlete",
    name: "Athlete portal",
    tone: "#fb923c",
    icon: AthleteIcon,
    lines: ["Invitations to accept or decline", "Deliverables and due dates", "Earnings, deliverable by deliverable"],
  },
  {
    key: "property",
    tab: "Property",
    name: "Property portal",
    tone: "#7fd0ff",
    icon: PropertyIcon,
    lines: ["Your roster and listings", "Branding and documents", "Analytics and earnings"],
  },
  {
    key: "next",
    tab: "NEXT",
    name: "SponsorX NEXT",
    tone: "#ffd12b",
    icon: NextIcon,
    lines: ["Assignments and your share code", "Ad sales and points", "Advisor review desk"],
  },
  {
    key: "btg",
    tab: "BTG",
    name: "BTG workspaces",
    tone: "#22c98d",
    icon: TeamIcon,
    lines: ["Applications and onboarding", "Briefs, matching and approvals", "Finance and payouts"],
  },
] as const;

/** One tab's dwell. The progress bar's animation is the clock. */
const DWELL_S = 4.6;

export function PortalCycler({ className = "" }: { className?: string }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const p = PORTALS[at];
  const Icon = p.icon;

  return (
    <div
      className={className}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div role="tablist" aria-label="Workspaces" className="grid grid-cols-5 gap-1">
        {PORTALS.map((q, i) => {
          const on = i === at;
          const TabIcon = q.icon;
          return (
            <button
              key={q.key}
              type="button"
              role="tab"
              id={`sx-portal-tab-${q.key}`}
              aria-selected={on}
              aria-controls="sx-portal-panel"
              onClick={() => setAt(i)}
              className={`group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-md px-1 pb-2.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${on ? "bg-white/[.06] text-on-media" : "text-on-media/55 hover:bg-white/[.04] hover:text-on-media/85"}`}
              style={{ "--tone": q.tone } as CSSProperties}
            >
              <TabIcon className={`size-[18px] transition-[color,filter] ${on ? "text-[var(--tone)] [filter:drop-shadow(0_0_6px_var(--tone))]" : ""}`} />
              {q.tab}
              <span aria-hidden="true" className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-white/10">
                {on && (
                  <span
                    key={at}
                    className="sx-login-dwell absolute inset-y-0 left-0 rounded-full bg-[var(--tone)] shadow-[0_0_8px_var(--tone)]"
                    style={{ animationDuration: `${DWELL_S}s`, animationPlayState: paused ? "paused" : "running" }}
                    onAnimationEnd={() => setAt((n) => (n + 1) % PORTALS.length)}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="sx-portal-panel"
        role="tabpanel"
        aria-labelledby={`sx-portal-tab-${p.key}`}
        className="mt-4 flex items-start gap-4"
        style={{ "--tone": p.tone } as CSSProperties}
      >
        <span
          key={`i-${at}`}
          className="sx-login-swap relative grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] border-[var(--tone)] bg-[#08172f]/60 text-[var(--tone)] shadow-[0_0_16px_color-mix(in_srgb,var(--tone)_55%,transparent),inset_0_0_10px_color-mix(in_srgb,var(--tone)_18%,transparent)]"
        >
          <span aria-hidden="true" className="sx-orbit absolute -inset-1.5 rounded-full border border-dashed border-[var(--tone)] opacity-40" />
          <Icon className="size-[22px]" />
        </span>
        <div key={`t-${at}`} className="min-w-0">
          <p className="sx-login-swap text-[15px] font-semibold tracking-tight">{p.name}</p>
          <ul className="mt-1.5 space-y-1">
            {p.lines.map((line, i) => (
              <li
                key={line}
                className="sx-login-swap flex items-center gap-2 text-[12.5px] text-on-media/75"
                style={{ animationDelay: `${0.06 + i * 0.06}s` }}
              >
                <CheckIcon className="size-3 shrink-0 text-[var(--tone)]" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Contact stage — the 2D UI of /contact, POL-FE-100 (the programme owner,
   2026-11-16: "big visual redesign for /contact … make sure its easy to
   understand because what you did before is so confusing for a human but
   make sure not to remove the current theme"). Server components; the
   copy button is contact-fx.tsx, the form contact-form.tsx.

   Like /about, /packages and /how-it-works it is a fixed-dark "media"
   ground in both themes, so every ink is `on-media` or a fixed-dark literal
   (the --sx-on-media rule).

   Top to bottom, the way the references read (a headline, three ways in,
   then one panel with the form beside what happens):
   - ContactHero   the way back to a portal (?back=), the HUD eyebrow, the
                   two-line headline, Write to us + Copy our email, and the
                   envelope: a letter rising out of it, a plane in orbit and
                   the mailbox's real state (open, or being set up).
   - ContactWays   three cards: write here, email us, guardians and minors.
   - ContactPanel  the glass panel (#write): on the left why it is safe to
                   write and what happens after Send, on the right the form.
   Every promise on it is the form's own or the API's (a person reads every
   message, the reply is by email, files are stored privately, a signed-in
   message is linked to the account, a guardianship always reaches a person).
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { CopyEmail } from "./contact-fx";
import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { Glass } from "./landing-sponsors";
import { StepRule, chamfer } from "./packages-stage";

/* ----------------------------------------------------------------- shapes */

const CARD = chamfer(14);
const CARD_RING = CARD.ring(1);
const PANEL = chamfer(22);
const PANEL_RING = PANEL.ring(1);
const PANEL_GLOW = PANEL.ring(2);

const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;
const slot = (i: number) => ({ "--i": i }) as CSSProperties;

const TONE = {
  btg: "#7fd0ff",
  athlete: "#2e9bf5",
  sponsor: "#f97a1f",
  fan: "#facc15",
  property: "#22c98d",
} as const;

/* ------------------------------------------------------------------ icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function DownIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M12 4v16M6 14l6 6 6-6" />
    </svg>
  );
}

function ArrowIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

function BackIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M20 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function PenIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function MailIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function GuardianIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
      <circle cx="12" cy="10" r="2.2" />
      <path d="M8.5 16a3.8 3.8 0 0 1 7 0" />
    </svg>
  );
}

function PlaneIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
    </svg>
  );
}

/* --------------------------------------------------------------- the art */

/** The hero's envelope: a letter rising out of it, a plane in orbit, a chat
 *  bubble typing — and the mailbox's real state, read from the API. */
function ContactArt({ ready }: { ready: boolean }) {
  const orbit = "M48 222a192 74 0 1 0 384 0a192 74 0 1 0 -384 0";
  return (
    <TiltSpot max={6} className="mx-auto w-full max-w-[520px]">
      <div className="relative">
        <p
          className="absolute left-2 top-2 z-10 inline-flex items-center gap-2 rounded-full border bg-[#06101f]/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md sm:left-4 sm:top-4"
          style={{ borderColor: ready ? `${TONE.property}66` : `${TONE.fan}66`, color: ready ? TONE.property : TONE.fan }}
        >
          <span aria-hidden="true" className="sx-ct-live size-2 rounded-full bg-current" />
          {ready ? "Inbox open" : "Inbox being set up"}
        </p>

        <svg viewBox="0 0 480 420" className="h-auto w-full overflow-visible" role="img" aria-label="A letter rising out of an envelope, with a paper plane circling it">
          <defs>
            <radialGradient id="ct-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2e9bf5" stopOpacity="0.32" />
              <stop offset="70%" stopColor="#2e9bf5" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#2e9bf5" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ct-edge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d6ecff" />
              <stop offset="55%" stopColor="#7fd0ff" />
              <stop offset="100%" stopColor="#2e9bf5" />
            </linearGradient>
            <linearGradient id="ct-back" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#163463" />
              <stop offset="100%" stopColor="#0a1630" />
            </linearGradient>
            <linearGradient id="ct-front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d4a8a" />
              <stop offset="100%" stopColor="#0b1a36" />
            </linearGradient>
            <linearGradient id="ct-paper" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4faff" />
              <stop offset="100%" stopColor="#cfe5ff" />
            </linearGradient>
            <filter id="ct-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* halo, turning rings, pulses */}
          <circle cx="240" cy="222" r="200" fill="url(#ct-halo)" />
          <circle className="sx-ct-spin" cx="240" cy="222" r="170" fill="none" stroke="#7fd0ff" strokeOpacity="0.35" strokeDasharray="2 11" />
          <circle className="sx-ct-spin-rev" cx="240" cy="222" r="136" fill="none" stroke="#7fd0ff" strokeOpacity="0.18" strokeDasharray="70 16" />
          <circle className="sx-ct-pulse" cx="240" cy="230" r="96" fill="none" stroke="#7fd0ff" strokeWidth="1.5" />
          <circle className="sx-ct-pulse" style={{ "--d": "2s" } as CSSProperties} cx="240" cy="230" r="96" fill="none" stroke="#2e9bf5" strokeWidth="1.5" />

          {/* the orbit, drawn faint; the plane rides it */}
          <path d={orbit} fill="none" stroke="#9cc7ff" strokeOpacity="0.16" strokeDasharray="4 8" />

          {/* floor glow */}
          <ellipse cx="240" cy="356" rx="118" ry="12" fill="#2e9bf5" opacity="0.22" filter="url(#ct-glow)" />

          {/* the envelope */}
          <g className="sx-ct-float">
            <rect x="146" y="204" width="188" height="124" rx="14" fill="url(#ct-back)" stroke="url(#ct-edge)" strokeOpacity="0.7" />
            <path d="M146 212 240 140l94 72" fill="#0f2547" stroke="url(#ct-edge)" strokeOpacity="0.55" strokeLinejoin="round" />

            <g className="sx-ct-letter">
              <rect x="166" y="150" width="148" height="134" rx="9" fill="url(#ct-paper)" />
              <rect x="182" y="170" width="74" height="8" rx="4" fill="#2e9bf5" />
              <circle cx="292" cy="174" r="9" fill="#f97a1f" />
              <rect x="182" y="192" width="116" height="5" rx="2.5" fill="#9cc7ff" />
              <rect x="182" y="205" width="104" height="5" rx="2.5" fill="#9cc7ff" />
              <rect x="182" y="218" width="112" height="5" rx="2.5" fill="#9cc7ff" />
              <rect x="182" y="231" width="70" height="5" rx="2.5" fill="#9cc7ff" />
            </g>

            <path
              d="M146 220 240 274l94-54v94a14 14 0 0 1-14 14H160a14 14 0 0 1-14-14Z"
              fill="url(#ct-front)"
              stroke="url(#ct-edge)"
              strokeLinejoin="round"
            />
            <path d="M150 324 222 268M330 324l-72-56" stroke="#7fd0ff" strokeOpacity="0.3" />
            <g filter="url(#ct-glow)">
              <circle cx="240" cy="274" r="14" fill="#f97a1f" />
              <path d="m233.5 274 4.5 4.5 8.5-9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>

          {/* the chat bubble, typing */}
          <g transform="translate(46 86)">
            <g className="sx-ct-bob">
              <rect width="100" height="58" rx="18" fill="#0b1a36" stroke="#7fd0ff" strokeOpacity="0.7" />
              <path d="M24 58 18 74l20-16" fill="#0b1a36" stroke="#7fd0ff" strokeOpacity="0.7" strokeLinejoin="round" />
              <rect x="21" y="56" width="18" height="4" fill="#0b1a36" />
              {[30, 50, 70].map((cx, i) => (
                <circle key={cx} className="sx-ct-dot" style={slot(i)} cx={cx} cy="29" r="6" fill="#bfe6ff" />
              ))}
            </g>
          </g>

          {/* the @ */}
          <g transform="translate(398 104)">
            <g className="sx-ct-bob" style={{ "--d": "1.2s" } as CSSProperties}>
              <circle r="28" fill="#f97a1f" fillOpacity="0.14" stroke="#f97a1f" strokeOpacity="0.8" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="700" fill="#ffb27a">
                @
              </text>
            </g>
          </g>

          {/* a reply, ticked */}
          <g transform="translate(90 322)">
            <g className="sx-ct-bob" style={{ "--d": "2.2s" } as CSSProperties}>
              <circle r="21" fill="#22c98d" fillOpacity="0.14" stroke="#22c98d" strokeOpacity="0.85" />
              <path d="m-8 0 5.5 5.5L9-6" fill="none" stroke="#5be3b0" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>

          {/* sparkles */}
          {(
            [
              [372, 300, TONE.fan, 0],
              [118, 196, TONE.btg, 1],
              [330, 70, TONE.btg, 2],
              [420, 230, TONE.sponsor, 3],
              [200, 92, TONE.fan, 4],
              [62, 260, TONE.property, 5],
            ] as const
          ).map(([x, y, c, i]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <path className="sx-ct-twinkle" style={slot(i)} d="M0-7v14M-7 0h14" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
            </g>
          ))}

          {/* the plane: in orbit, or still for reduced motion */}
          <g className="sx-ct-orbit" filter="url(#ct-glow)">
            <path d="M-15-9 17 0-15 9-8 0Z" fill="#f97a1f">
              <animateMotion dur="10s" repeatCount="indefinite" rotate="auto" path={orbit} />
            </path>
          </g>
          <g className="sx-ct-plane-still" transform="translate(408 196) rotate(-24)" filter="url(#ct-glow)">
            <path d="M-15-9 17 0-15 9-8 0Z" fill="#f97a1f" />
          </g>
        </svg>
      </div>
    </TiltSpot>
  );
}

/* ------------------------------------------------------------------- hero */

export function ContactHero({ back, email, ready }: { back: string | null; email: string; ready: boolean }) {
  return (
    <section className="relative isolate overflow-hidden pt-[72px]">
      {/* ground: brand glows, receding grid floor, horizon, outlined word */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_16%_14%,rgba(46,155,245,.24),transparent_62%),radial-gradient(50%_45%_at_86%_60%,rgba(249,122,31,.14),transparent_60%),radial-gradient(40%_40%_at_60%_100%,rgba(127,208,255,.1),transparent_65%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[46%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.18em] left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(90px,19vw,300px)] font-black uppercase leading-none tracking-tighter">
          Contact
        </p>
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#04080f]/85 via-[#04080f]/40 to-transparent lg:w-[55%]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] grid-cols-1 items-center gap-6 px-5 pb-10 pt-8 sm:px-[6vw] lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:gap-12 lg:pb-14 lg:pt-12 2xl:px-0">
        <div className="max-w-2xl">
          {back && (
            <div className="sx-stage-in mb-6" style={reveal(0)}>
              <Link
                href={back}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[#9cc7ff]/30 bg-[#07132a]/60 pl-3 pr-4 text-[12px] font-semibold text-on-media/85 backdrop-blur-md transition-colors hover:border-[#bfe0ff] hover:text-on-media"
              >
                <BackIcon className="size-4" />
                Back to your portal
              </Link>
            </div>
          )}

          <div className="sx-stage-in" style={reveal(0.05)}>
            <p className="flex items-center gap-4 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]">
              <span>
                <ScrambleText text="Contact" delay={0.1} />
                <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
                <ScrambleText text="BTG Sports Group" delay={0.35} />
              </span>
              <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
            </p>
          </div>

          <h1 className="mt-5 text-[clamp(38px,8.6vw,54px)] font-bold leading-[1.02] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:text-[clamp(48px,4.6vw,76px)]">
            <span className="sx-stage-line block" style={reveal(0.12)}>Talk to</span>
            <span className="sx-stage-line block" style={reveal(0.24)}>
              <span className="sx-hero-gradient sx-hero-shimmer" data-text="a real person.">a real person.</span>
            </span>
          </h1>

          <p
            className="sx-stage-in mt-6 max-w-[540px] text-[15px] leading-[1.55] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:text-[17px]"
            style={reveal(0.3)}
          >
            Pick what it&rsquo;s about, tick what&rsquo;s wrong and press Send. A person at BTG reads every message and
            replies by email.
          </p>

          <div className="sx-stage-in mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4" style={reveal(0.42)}>
            <Magnetic className="max-sm:w-full">
              <a
                href="#write"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[14px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                Write to us
                <DownIcon className="size-[18px] transition-transform group-hover:translate-y-0.5" />
              </a>
            </Magnetic>
            <Magnetic className="max-sm:w-full">
              <CopyEmail email={email} label="Copy our email" variant="hero" />
            </Magnetic>
          </div>
        </div>

        <div className="sx-stage-in w-full lg:justify-self-end" style={reveal(0.35)}>
          <ContactArt ready={ready} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- ways */

function WayCard({ i, tone, icon, title, children, foot }: { i: number; tone: string; icon: ReactNode; title: string; children: ReactNode; foot: ReactNode }) {
  return (
    <li data-reveal="" style={slot(i)} className="flex">
      <div className="sx-ct-way relative flex w-full flex-col">
        <Glass plate={CARD.plate} ringClip={CARD_RING} fill="bg-gradient-to-b from-[#0d1f3d]/60 via-[#07122a]/65 to-[#04091a]/80" outline="bg-gradient-to-br from-[#bfe6ff]/70 via-[#7fd0ff]/40 to-[#7fd0ff]/15" />
        <span aria-hidden="true" className="sx-ct-way-ring pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_6px_var(--tone))]" style={{ "--tone": tone } as CSSProperties}>
          <span className="absolute inset-0" style={{ clipPath: CARD_RING, background: `linear-gradient(135deg, ${tone}, transparent 70%)` }} />
        </span>
        <div className="relative flex flex-1 flex-col p-5 sm:p-6">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-xl border"
            style={{ borderColor: `${tone}88`, color: tone, background: `${tone}14`, boxShadow: `0 0 18px ${tone}40, inset 0 0 10px ${tone}20` }}
          >
            {icon}
          </span>
          <h3 className="mt-5 text-[19px] font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 flex-1 text-[14px] leading-relaxed text-on-media/70">{children}</p>
          <div className="mt-5 border-t border-[#a9d3ff]/15 pt-4">{foot}</div>
        </div>
      </div>
    </li>
  );
}

const footLink =
  "group inline-flex items-center gap-2 text-[14px] font-semibold text-[#bfe6ff] underline-offset-4 transition-colors hover:text-white hover:underline";

export function ContactWays({ email, ready }: { email: string; ready: boolean }) {
  return (
    <section aria-label="Ways to reach BTG" className="relative mx-auto w-full max-w-[1320px] px-5 sm:px-[6vw] 2xl:px-0">
      <ul className="grid gap-4 md:grid-cols-3 lg:gap-6">
        <WayCard
          i={0}
          tone={TONE.btg}
          icon={<PenIcon />}
          title="Write to us here"
          foot={
            <a href="#write" className={footLink}>
              Start your message
              <ArrowIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          }
        >
          The quickest way: three short steps, straight to the BTG team.
        </WayCard>
        <WayCard
          i={1}
          tone={TONE.athlete}
          icon={<MailIcon />}
          title="Email us directly"
          foot={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 select-all break-all text-[14px] font-semibold">{email}</span>
              <CopyEmail email={email} />
            </div>
          }
        >
          Rather use your own inbox? Write to the BTG support address.
          {!ready && (
            <span className="mt-3 flex w-fit items-center gap-2 rounded-md border border-[#facc15]/40 bg-[#facc15]/10 px-2.5 py-1 text-[12px] font-semibold text-[#fde68a]">
              Being set up &mdash; not receiving mail yet
            </span>
          )}
        </WayCard>
        <WayCard
          i={2}
          tone={TONE.sponsor}
          icon={<GuardianIcon />}
          title="Guardians and minors"
          foot={
            <Link href="/contact?topic=guardianship#write" className={footLink}>
              Write about a guardianship
              <ArrowIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        >
          A minor&rsquo;s guardian or consent? A person at BTG always handles it.
        </WayCard>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ panel */

const AFTER: { tone: string; title: string; body: string }[] = [
  { tone: TONE.btg, title: "Sent", body: "A copy of your message goes to the email you give." },
  { tone: TONE.athlete, title: "Read", body: "A person at BTG reads it." },
  { tone: TONE.property, title: "Answered", body: "The reply comes to you by email." },
];

/** A notice on the stage (the preview, an expired sign-in). */
export function StageNotice({ tone = "warn", children }: { tone?: "warn" | "info"; children: ReactNode }) {
  const c = tone === "warn" ? TONE.fan : TONE.btg;
  return (
    <p role="note" className="flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed text-on-media/90" style={{ borderColor: `${c}55`, background: `${c}12` }}>
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      <span>{children}</span>
    </p>
  );
}

export function ContactPanel({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return (
    <section id="write" aria-label="Write to BTG" className="sx-ct-write relative mx-auto mt-12 w-full max-w-[1320px] px-5 pb-20 sm:px-[6vw] lg:mt-16 lg:pb-28 2xl:px-0">
      <div data-reveal="" className="relative">
        <Glass
          plate={PANEL.plate}
          ringClip={PANEL_RING}
          lit
          fill="bg-gradient-to-b from-[#0d1f3d]/70 via-[#07122a]/75 to-[#04091a]/85"
          outline="bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff]/60 to-[#7fd0ff]/20"
        />
        {/* the arrival glow (#write:target) */}
        <span aria-hidden="true" className="sx-ct-glow pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_8px_#7fd0ff)_drop-shadow(0_0_26px_#2e9bf5)]">
          <span className="absolute inset-0 bg-[#d6ecff]" style={{ clipPath: PANEL_GLOW }} />
        </span>
        {/* bright brackets on the two square corners */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(160,215,255,.9))]">
          <span className="absolute right-0 top-0 h-[30px] w-[2px] bg-[#d6ecff]" />
          <span className="absolute right-0 top-0 h-[2px] w-[30px] bg-[#d6ecff]" />
          <span className="absolute bottom-0 left-0 h-[26px] w-[1.5px] bg-[#d6ecff] opacity-70" />
          <span className="absolute bottom-0 left-0 h-[1.5px] w-[26px] bg-[#d6ecff] opacity-70" />
        </span>

        <div className="relative grid gap-10 p-5 sm:p-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-12 lg:p-10 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* why it's safe to write, and what happens after Send — below the form on a phone */}
          <aside aria-label="What happens when you write" className="order-last lg:order-first">
            <div className="lg:sticky lg:top-24">
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-xl border border-[#7fd0ff]/60 bg-[#7fd0ff]/10 text-[#7fd0ff] shadow-[0_0_18px_rgba(127,208,255,.35)]"
              >
                <PlaneIcon className="size-6" />
              </span>
              <h2 className="mt-5 text-[clamp(24px,5vw,32px)] font-bold leading-[1.1] tracking-tight">
                Reach the BTG team <span className="sx-hero-gradient-accent">in three steps.</span>
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-on-media/70">
                Pick a topic, tick what&rsquo;s wrong, add your email. {signedIn ? "You’re signed in, so it’s linked to your account." : ""}
              </p>

              <div className="mt-8">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#7fc4ff]">After you send</p>
                <StepRule className="mt-1" />
                <ol className="relative mt-4 space-y-4">
                  <span aria-hidden="true" className="absolute bottom-4 left-[15px] top-4 w-[2px] rounded-full bg-gradient-to-b from-[#7fd0ff]/70 via-[#2e9bf5]/70 to-[#22c98d]/70" />
                  {AFTER.map((a, i) => (
                    <li key={a.title} className="relative flex items-center gap-3.5">
                      <span
                        aria-hidden="true"
                        className="sx-ping relative grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] bg-[#08172f] text-[12px] font-bold"
                        style={{ borderColor: a.tone, color: a.tone, boxShadow: `0 0 12px ${a.tone}77`, "--ping": a.tone, "--ping-cycle": "6s", "--i": i } as CSSProperties}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold">{a.title}</span>
                        <span className="block text-[13px] leading-snug text-on-media/65">{a.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

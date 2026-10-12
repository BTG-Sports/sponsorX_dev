/* --------------------------------------------------------------------------
   Operations Board — the "Mission Control" stage (P1-ART-14, 2026-10-05).
   /admin (P7-FE-06, §23) redesigned in the landing's, /packages' and
   /login's visual language at the programme owner's request. Server
   components; the client islands are ops-fx.tsx (the stage root's pointer
   light and card spotlights, the count-ups).

   Same rule as login-stage.tsx: the stage is a fixed-dark "media" ground in
   both themes, so its inks are `on-media` or fixed-dark literals, and `.sx-
   ops` re-pins the themed tokens for anything inside that reads them. It is
   bled to the edges of the portal's content column (the page cancels the
   shell's <main> padding); the sidebar and top bar frame it.

   Nothing here invents a figure: every number is one of the board's three
   live reads, through lib/ops-board-live.ts (the headline's words and the
   ring's arcs included).

   Layers, back to front:
   - OpsGround     brand glows, a light that follows the pointer, the floor
                   grid drifting against the pointer, a horizon line, rising
                   motes, a slow scan sweep, the outlined word OPS.
   - OpsHeader     the dashboard header: title row + four tiles (what needs
                   BTG, live campaigns, systems, the ring by queue).
   - QueueDeck     one chamfered glass card per queue the role reads.
   - CampaignPanel / SystemsPanel   the lower row.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { OpsCount } from "./ops-fx";
import {
  QUEUE_TONE,
  ringSegments,
  type CampaignLine,
  type HealthRow,
  type QueueCard,
} from "@/lib/ops-board-live";

/** Staggered entrance delay for one piece (`.sx-ops-in` and friends). */
const at = (seconds: number, extra?: CSSProperties) =>
  ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

/* ----------------------------------------------------------------- ground */

/** Rising motes: left %, size px, duration s, delay s, tone. Fixed, so the
 *  server and client render the same ground. */
const MOTES: ReadonlyArray<readonly [number, number, number, number, string]> = [
  [5, 2, 17, 0, "#7fd0ff"],
  [14, 3, 21, 6, "#f4f5f7"],
  [23, 2, 18, 2.5, "#4fb0ff"],
  [33, 3, 23, 9, "#fb923c"],
  [42, 2, 16, 4, "#7fd0ff"],
  [51, 3, 20, 11, "#f4f5f7"],
  [60, 2, 19, 1, "#fb923c"],
  [69, 3, 24, 7.5, "#4fb0ff"],
  [78, 2, 17, 3.5, "#f4f5f7"],
  [87, 3, 22, 12, "#7fd0ff"],
  [95, 2, 18, 5.5, "#fb923c"],
];

/** `word`: the outlined word behind the hero — each desk on the stage names itself. */
export function OpsGround({ word = "OPS" }: { word?: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_0%,rgba(46,155,245,.22),transparent_65%),radial-gradient(40%_40%_at_88%_30%,rgba(46,155,245,.1),transparent_65%),radial-gradient(50%_45%_at_100%_100%,rgba(249,122,31,.15),transparent_62%)]" />
      <div className="sx-login-light absolute inset-0" />

      {/* "" — a desk with no word (a dashboard header, not a hero). */}
      {word && (
        <span
          className="sx-stage-word absolute -right-4 top-6 select-none font-black leading-none tracking-tighter"
          style={{ fontSize: `clamp(120px, ${Math.min(17, 52 / word.length)}vw, 260px)` }}
        >
          {word}
        </span>
      )}

      <div className="sx-login-depth absolute inset-0" style={{ "--depth": 1 } as CSSProperties}>
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 top-[54%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/50 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.3)]" />
      </div>

      {MOTES.map(([left, size, dur, delay, tone]) => (
        <span
          key={left}
          className="sx-login-mote absolute bottom-0 rounded-full"
          style={{
            left: `${left}%`,
            width: size,
            height: size,
            background: tone,
            boxShadow: `0 0 ${size * 3}px ${tone}`,
            animationDuration: `${dur}s`,
            animationDelay: `-${delay}s`,
          }}
        />
      ))}

      <div className="sx-ops-sweep absolute inset-x-0 top-0" />

      {/* ground under the hero copy, so the word and the glows never sit
          behind the paragraph */}
      <div className="absolute inset-x-0 top-0 h-[26rem] bg-gradient-to-r from-[#04080f]/70 via-[#04080f]/25 to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

/** A dashboard header, not a hero (owner, 2026-10-05): the title row, then
 *  four tiles — what needs BTG, the live campaigns, the systems, and the
 *  action ring by queue. Every figure is one of the board's three reads. */
export function OpsHeader({
  cards, total, campaignTotal, rows, readAt,
}: {
  cards: QueueCard[] | null;
  total: number | null;
  campaignTotal: number | null;
  rows: HealthRow[] | null;
  readAt: string;
}) {
  const ok = rows ? rows.filter((r) => r.status === "Operational").length : 0;
  return (
    <header>
      <div className="sx-ops-in flex flex-wrap items-center gap-3" style={at(0.05)}>
        <h1 className="sx-page-title">Operations Board</h1>
        <span className="rounded-full border border-[#9be0ff]/30 bg-[#04080f]/40 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.2em] text-[#cfe9ff]">
          Postgres · read {readAt}
        </span>
        <p className="basis-full text-xs text-[#8a96a3] sm:ml-auto sm:basis-auto">What needs BTG&rsquo;s action today. Every figure is a live read.</p>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards && total !== null && (
          <KpiTile
            label="Needs BTG action"
            value={total}
            caption={total ? `across ${cards.length} ${cards.length === 1 ? "queue" : "queues"} · each card opens its desk` : "nothing waiting for BTG"}
            tone={total ? "orange" : "green"}
            delay={0.1}
          />
        )}
        {campaignTotal !== null && (
          <KpiTile label="Live campaigns" value={campaignTotal} caption="matched, accepted and running" tone="blue" delay={0.16} />
        )}
        {rows && (
          <div className="sx-ops-panel sx-ops-in relative px-4 pb-4 pt-3.5" style={at(0.22)}>
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: ok === rows.length ? "#22c55e" : "#f97a1f", boxShadow: `0 0 10px ${ok === rows.length ? "#22c55e" : "#f97a1f"}` }} />
            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8a96a3]">Systems</dt>
            <dd className="mt-1.5">
              <span className={`text-[28px] font-bold leading-none tracking-tight ${ok === rows.length ? "text-[#86efac]" : "text-[#fdba74]"}`}>
                {ok}<span className="text-base text-[#7e88a0]"> / {rows.length}</span>
              </span>
              <span className="mt-1.5 block truncate text-[11px] text-[#7e88a0]">{ok === rows.length ? "all operational" : rows.filter((r) => r.status !== "Operational").map((r) => `${r.name} ${r.status.toLowerCase()}`).join(" · ")}</span>
            </dd>
          </div>
        )}
        {cards && total !== null && (
          <div className="sx-ops-panel sx-ops-in relative flex items-center gap-4 px-4 py-3" style={at(0.28)}>
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-[#9be0ff] shadow-[0_0_10px_#9be0ff]" />
            <ActionRing cards={cards} total={total} compact />
            <div className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8a96a3]">By queue</dt>
              <dd className="mt-1.5 space-y-0.5">
                {cards.map((c) => (
                  <span key={c.key} className="flex items-center gap-2 text-[11px] text-[#9aa4b2]">
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: QUEUE_TONE[c.key] }} />
                    <span className="truncate">{c.label}</span>
                    <span className="ml-auto font-mono font-semibold text-[#cfe9ff]">{c.count}</span>
                  </span>
                ))}
              </dd>
            </div>
          </div>
        )}
      </dl>
    </header>
  );
}

/* ------------------------------------------------------------- action ring */

const R = 96;
const C = 2 * Math.PI * R;
const GAP = 4;

/** `compact`: the header tile's small ring. */
export function ActionRing({ cards, total, compact = false }: { cards: QueueCard[]; total: number; compact?: boolean }) {
  const segs = ringSegments(cards, C, GAP);
  const label =
    total === 0
      ? "All clear: nothing waiting for BTG."
      : `${total} actions waiting: ${cards.map((c) => `${c.count} ${c.label.toLowerCase()}`).join(", ")}.`;

  return (
    <div
      role="img"
      aria-label={label}
      className={`relative shrink-0 ${compact ? "size-24" : "sx-ops-in size-[clamp(168px,17vw,240px)]"}`}
      style={compact ? undefined : at(0.3)}
    >
      <div aria-hidden="true" className="sx-ops-orbit absolute -inset-2.5 rounded-full border border-dashed border-[#9be0ff]/15" />
      <svg
        aria-hidden="true"
        viewBox="0 0 240 240"
        className="absolute inset-0 -rotate-90 drop-shadow-[0_0_14px_rgba(46,155,245,.45)]"
      >
        <circle cx="120" cy="120" r="112" fill="none" stroke="rgba(155,224,255,.25)" strokeWidth="1" strokeDasharray="1 7.6" />
        <circle cx="120" cy="120" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14" />
        {segs.map((s, i) => (
          <circle
            key={s.key}
            className="sx-ops-arc"
            cx="120"
            cy="120"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDashoffset={-s.offset}
            style={at(0.5 + i * 0.12, { "--len": s.len, "--c": C } as CSSProperties)}
          />
        ))}
      </svg>
      <div aria-hidden="true" className="absolute inset-0 grid place-content-center text-center">
        {total === 0 ? (
          <>
            <span className={`font-bold leading-none text-[#86efac] ${compact ? "text-2xl" : "text-[44px]"}`}>✓</span>
            {!compact && <span className="mt-2 text-[10px] uppercase tracking-[0.3em] text-[#9aa4b2]">All clear</span>}
          </>
        ) : (
          <>
            <OpsCount value={total} delay={0.5} className={`font-bold leading-none tracking-tight ${compact ? "text-2xl" : "text-[clamp(44px,4.4vw,64px)]"}`} />
            {/* wraps to two lines inside the phone-size ring */}
            {!compact && (
              <span className="mx-auto mt-2 max-w-[6.5rem] text-[10px] uppercase leading-snug tracking-[0.3em] text-[#9aa4b2] sm:max-w-none">
                Actions waiting
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- headings */

export function StageHeading({ title, hint, action, delay }: { title: string; hint?: string; action?: ReactNode; delay: number }) {
  return (
    <div className="sx-ops-in mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" style={at(delay)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#cfe9ff]">{title}</h2>
      {hint && <p className="text-xs text-[#8a96a3]">{hint}</p>}
      {action}
    </div>
  );
}

export function StageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-xs text-[#63b4f8] transition-colors hover:text-[#9be0ff]">
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------------- queues */

const CHIP = {
  warn: "border-[#f97a1f]/35 bg-[#f97a1f]/15 text-[#fdba74]",
  primary: "border-[#2e9bf5]/40 bg-[#2e9bf5]/15 text-[#93c5fd]",
  danger: "border-[#ef4444]/40 bg-[#ef4444]/15 text-[#fca5a5]",
  neutral: "border-white/15 bg-white/5 text-[#cbd5e1]",
} as const;

export function StageChip({ tone, children }: { tone: keyof typeof CHIP; children: ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CHIP[tone]}`}>{children}</span>;
}

export function QueueDeck({ cards }: { cards: QueueCard[] }) {
  return (
    <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c, i) => {
        const delay = 0.55 + i * 0.08;
        return (
          <li key={c.key} className="sx-ops-in" style={at(delay)}>
            <Link
              href={c.href}
              data-spot=""
              className="sx-ops-card group relative flex h-full min-h-[172px] flex-col gap-1.5 px-5 pb-5 pt-[18px]"
              style={{ "--tone": QUEUE_TONE[c.key] } as CSSProperties}
            >
              <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
              <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
              <span className="flex items-start justify-between">
                <OpsCount value={c.count} delay={delay} className="text-[clamp(40px,3.6vw,52px)] font-bold leading-none tracking-tight" />
                <span aria-hidden="true" className="font-mono text-[10px] tracking-[0.1em] text-[#5b6b7d]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </span>
              <span className="mt-1 text-[15px] font-semibold">{c.label}</span>
              <span className="text-xs text-[#8a96a3]">{c.hint}</span>
              <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                {c.chips.map((chip) => (
                  <StageChip key={chip.text} tone={chip.tone}>
                    {chip.text}
                  </StageChip>
                ))}
                <span
                  aria-hidden="true"
                  className="ml-auto text-[#63b4f8] transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1"
                >
                  →
                </span>
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{ background: QUEUE_TONE[c.key], boxShadow: `0 0 12px ${QUEUE_TONE[c.key]}` }}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------- campaigns */

/** `total`: every live campaign, of which `campaigns` is the first page.
 *  `allHref`: the Campaigns desk, or null when the role may not open it.
 *  `briefs`: whether the role may open the Briefs desk the empty state points to. */
export function CampaignPanel({
  campaigns,
  total,
  allHref,
  briefs,
}: {
  campaigns: CampaignLine[];
  total: number;
  allHref: string | null;
  briefs: boolean;
}) {
  if (campaigns.length === 0) {
    return (
      <div className="sx-ops-panel sx-ops-in relative px-6 py-6" style={at(0.9)}>
        <p className="text-sm font-semibold">No live campaigns yet</p>
        <p className="mt-1 text-xs text-[#8a96a3]">
          A campaign goes live once a brief is matched and its athletes accept.{briefs && " Start with the first brief."}
        </p>
        {briefs && (
          <p className="mt-3">
            <StageLink href="/admin/briefs">Open Briefs →</StageLink>
          </p>
        )}
      </div>
    );
  }
  return (
    <ul className="sx-ops-panel sx-ops-in relative py-1.5" style={at(0.9)}>
      {campaigns.map((c, i) => (
        <li key={c.id} className="border-b border-white/5 last:border-0">
          <Link
            href={`/admin/campaigns/${encodeURIComponent(c.id)}`}
            className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-[#2e9bf5]/[0.07] focus-visible:bg-[#2e9bf5]/[0.1] focus-visible:outline-none sm:grid-cols-[40px_minmax(0,1fr)_76px]"
          >
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center border border-[#f97a1f]/35 bg-[#f97a1f]/[0.12] text-[13px] font-bold text-[#ffd1a6] [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))]"
            >
              {c.mono}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{c.name}</span>
                {c.overdue > 0 && <StageChip tone="warn">{c.overdue} overdue</StageChip>}
              </span>
              <span aria-hidden="true" className="relative mt-2 block h-1.5 rounded-full bg-white/[0.07]">
                <span
                  className="sx-ops-bar absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r from-[#2e9bf5] to-[#9be0ff] shadow-[0_0_12px_rgba(46,155,245,.8)]"
                  style={at(1.1 + i * 0.08, { width: `${c.pct}%` })}
                >
                  {c.pct > 0 && (
                    <span className="absolute -right-1 -top-[3px] size-3 rounded-full bg-white shadow-[0_0_12px_#9be0ff]" />
                  )}
                </span>
              </span>
              <span className="mt-1.5 block text-xs text-[#8a96a3]">
                {c.done} of {c.due} deliverables done · {c.ends}
              </span>
            </span>
            <span className="hidden text-right font-mono text-[22px] font-bold leading-none text-[#cfe9ff] sm:block">
              {c.pct}%
              <span className="mt-1 block font-sans text-[10px] font-medium tracking-[0.2em] text-[#6b7785]">DONE</span>
            </span>
          </Link>
        </li>
      ))}
      {/* The board shows the first few; the rest are one click away. */}
      {allHref && total > campaigns.length && (
        <li>
          <Link
            href={allHref}
            className="group flex items-center justify-between gap-3 px-5 py-3.5 text-sm font-semibold text-[#63b4f8] transition-colors hover:bg-[#2e9bf5]/[0.07] hover:text-[#9be0ff] focus-visible:bg-[#2e9bf5]/[0.1] focus-visible:outline-none"
          >
            <span>
              See all {total} live campaigns
              <span className="ml-2 text-xs font-normal text-[#8a96a3]">
                {total - campaigns.length} more not shown
              </span>
            </span>
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1">
              →
            </span>
          </Link>
        </li>
      )}
    </ul>
  );
}

/* ---------------------------------------------------------------- systems */

const LED: Record<HealthRow["status"], { dot: string; text: string }> = {
  Operational: { dot: "bg-[#22c55e] shadow-[0_0_10px_#22c55e]", text: "text-[#86efac]" },
  Syncing: { dot: "bg-[#2e9bf5] shadow-[0_0_12px_#2e9bf5]", text: "text-[#93c5fd]" },
  Degraded: { dot: "bg-[#f59e0b] shadow-[0_0_12px_#f59e0b]", text: "text-[#fcd34d]" },
  Down: { dot: "bg-[#ef4444] shadow-[0_0_14px_#ef4444]", text: "text-[#fca5a5]" },
};

export function SystemsPanel({ rows }: { rows: HealthRow[] }) {
  return (
    <div className="sx-ops-panel sx-ops-in relative py-1.5" style={at(0.95)}>
      <ul>
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
            <i aria-hidden="true" data-status={r.status} className={`sx-ops-led size-[9px] shrink-0 rounded-full ${LED[r.status].dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{r.name}</span>
              <span className="block truncate text-xs text-[#8a96a3]">{r.detail}</span>
            </span>
            <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${LED[r.status].text}`}>{r.status}</span>
          </li>
        ))}
      </ul>
      <p className="px-5 py-3 text-[11px] text-[#7e88a0]">
        Zoho never sits on a request path — a queued sync is healthy, not an outage.
      </p>
    </div>
  );
}

/** A section the role can't read: one quiet line, the board's existing rule. */
export function OutsideRole({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <p className="sx-ops-in text-xs text-[#7e88a0]" style={at(delay)}>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------ KPI tiles */

/** A desk's dashboard figure (P1-ART-16): label, count-up, a one-line
 *  caption, and optionally a thin share bar. Shared by the admin desks'
 *  headers — a dashboard row, never a hero. */
const TONE = {
  blue: { text: "text-[#93c5fd]", bar: "from-[#2e9bf5] to-[#9be0ff]", edge: "#2e9bf5" },
  orange: { text: "text-[#fdba74]", bar: "from-[#fb923c] to-[#f97a1f]", edge: "#f97a1f" },
  green: { text: "text-[#86efac]", bar: "from-[#22c55e] to-[#86efac]", edge: "#22c55e" },
  cyan: { text: "text-[#cfe9ff]", bar: "from-[#2e9bf5] to-[#9be0ff]", edge: "#9be0ff" },
} as const;

export function KpiTile({
  label, value, caption, tone, share, delay,
}: {
  label: string;
  value: number;
  caption: string;
  tone: keyof typeof TONE;
  /** 0..1 — draws a thin share bar under the figure. */
  share?: number;
  delay: number;
}) {
  const t = TONE[tone];
  return (
    <div className="sx-ops-panel sx-ops-in relative px-4 pb-4 pt-3.5" style={at(delay)}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: t.edge, boxShadow: `0 0 10px ${t.edge}` }} />
      <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8a96a3]">{label}</dt>
      <dd className="mt-1.5">
        <OpsCount value={value} delay={delay} className={`text-[28px] font-bold leading-none tracking-tight ${t.text}`} />
        <span className="mt-1.5 block truncate text-[11px] text-[#7e88a0]">{caption}</span>
        {share !== undefined && (
          <span aria-hidden="true" className="relative mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <span
              className={`sx-ops-bar absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r ${t.bar}`}
              style={at(delay + 0.2, { width: `${Math.round(share * 100)}%` })}
            />
          </span>
        )}
      </dd>
    </div>
  );
}

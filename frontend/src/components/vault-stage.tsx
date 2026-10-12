/* --------------------------------------------------------------------------
   The Vault — Finance's stage (P1-ART-25, 2026-10-12).

   The admin desks' dashboard anatomy (memory admin-desks-are-dashboards) —
   a small title with a live pill, a row of tiles, then the work — drawn as
   a bank vault: bank green, brushed gold, banknote guilloché, double-rule
   frames, engraved serif numerals (app/(app)/finance/vault.css). Every figure
   is one of the page's own reads (memory stats-must-be-retrievable); a
   hidden figure is left out, never drawn as 0. The exports mirror the
   Stadium kit (stadium-stage.tsx), so a Vault page reads like a sponsor one.

   - VaultGround    the green and gold glows, two guilloché rosettes, a
                    vignette, the pointer light.
   - VaultHead      title, pill, actions; the tiles as children.
   - VaultUpdated / VaultDate   "Updated 9:41 AM" / a date, in the viewer's
                    own timezone (stadium-time.tsx — client islands).
   - VaultTiles / VaultTile   double-rule tiles: an engraved count-up, the
                    change, a caption, a badge, a "?" hint; a covering link
                    when `href`.
   - VaultBox       a Needs-you deposit box: count · amount, the oldest wait,
                    "Open …"; the whole box links; its key turns on hover.
   - VaultPanel / VaultSection   a panel; a section's title row.
   - VaultDial      the ring gauge: a sweep to the value under a ticked,
                    numbered bezel that turns slowly.
   - VaultFlow      money in vs money out (vault-flow.tsx — a client island).
   - VaultSplit     gold share bars with the amount and the share.
   - VaultSteps     athlete pay, step by step; held / disputed set apart.
   - VaultChip      a status word.  VaultBadge  the pulsing gold count.
   - VaultRange     the 7 / 30 / 90 days / All time switch (links).
   - VaultGhost     the loading screen.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import { useId, type CSSProperties, type ReactNode } from "react";

import { ArenaCount, type CountFormat } from "./arena-fx";
import { StadiumHint } from "./stadium-hint";
import type { RangeKey } from "@/lib/finance-overview-live";
import { formatCount } from "@/lib/format-count";

export { StadiumUpdated as VaultUpdated, StadiumDate as VaultDate } from "./stadium-time";
export { VaultFlow } from "./vault-flow";

export const at = (seconds: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

const usd0 = (cents: number) => formatCount(cents, "usd0");

/* ground ------------------------------------------------------------------ */

/** A banknote rosette: a milled edge (beads and two rules), then two
 *  families of rotated ellipses whose overlap makes the guilloché moiré.
 *  Plain primitives, no ids, so two rosettes on a page never collide. */
function Rosette({ className, size, far = false }: { className: string; size: number; far?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="-220 -220 440 440"
      width={size}
      height={size}
      data-far={far ? "" : undefined}
      className={`sx-vault-rosette ${className}`}
      fill="none"
      stroke="currentColor"
    >
      <circle r="216" strokeWidth="1.4" strokeDasharray="0.6 3.4" strokeLinecap="round" />
      <circle r="211" strokeWidth="0.6" />
      <circle r="206" strokeWidth="0.35" />
      {Array.from({ length: 24 }, (_, i) => (
        <ellipse key={`a${i}`} rx="200" ry="62" strokeWidth="0.55" transform={`rotate(${i * 7.5})`} />
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <ellipse key={`b${i}`} rx="122" ry="84" strokeWidth="0.4" transform={`rotate(${i * 11.25})`} />
      ))}
      <circle r="36" strokeWidth="0.5" />
      <circle r="31" strokeWidth="0.9" strokeDasharray="0.6 2.4" strokeLinecap="round" />
    </svg>
  );
}

export function VaultGround() {
  return (
    <div aria-hidden="true" className="sx-vault-ground pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Rosette className="-right-48 -top-56" size={760} />
      <Rosette className="-bottom-60 -left-52" size={540} far />
      <div className="sx-vault-vignette" />
      <div className="sx-vault-light absolute inset-0" />
    </div>
  );
}

/* head and tiles ------------------------------------------------------------- */

export function VaultHead({
  title,
  pill,
  /** Fixtures, not the real books: a hollow ring (vault.css), never the live dot. */
  sample,
  actions,
  children,
}: {
  title: string;
  pill?: ReactNode;
  sample?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header>
      <div className="sx-vault-in flex flex-wrap items-center gap-3" style={at(0.04)}>
        <h1 className="sx-page-title">{title}</h1>
        {pill != null && (
          <span className="sx-vault-pill" data-sample={sample ? "" : undefined}>
            {pill}
          </span>
        )}
        {actions != null && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export type TileCols = 2 | 3 | 4 | 5;

/** The tile grid, shared by VaultTiles and VaultGhost so a page's loading
 *  screen lays its tiles out as the page will. Two across on a phone (the
 *  numbers read as one block, never a column of lone tiles), and an odd
 *  last tile spans both there. gap-4: the frame's outer rule sits 4px
 *  outside each tile. */
const TILE_GRID: Record<TileCols, string> = { 2: "", 3: "sm:grid-cols-3", 4: "lg:grid-cols-4", 5: "sm:grid-cols-3 xl:grid-cols-5" };
const tileGrid = (cols: TileCols) => `grid grid-cols-2 gap-4 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 ${TILE_GRID[cols]}`;

export function VaultTiles({ children, cols = 4 }: { children: ReactNode; cols?: TileCols }) {
  return <dl className={`mt-5 ${tileGrid(cols)}`}>{children}</dl>;
}

/** A tile. `delta` is a fraction (0.12 = ▲ 12%), null/absent hides it;
 *  `badge` adds the pulsing count after the label; `hint` the "?";
 *  `href` makes the whole tile a link (a covering one, so the "?" stays a
 *  real button beside it). */
export function VaultTile({
  label,
  value,
  format = "usd0",
  caption,
  delta,
  deltaLabel = "vs the period before",
  href,
  hint,
  tone,
  badge,
  delay = 0.1,
}: {
  label: string;
  value: number;
  format?: CountFormat;
  caption?: ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  href?: string;
  hint?: string;
  tone?: "you" | "late";
  badge?: number;
  delay?: number;
}) {
  const shown = delta !== undefined && delta !== null;
  const up = shown && delta >= 0;
  const flat = shown && Math.round(delta * 100) === 0;
  return (
    <div data-spot="" data-tone={tone} className="sx-vault-frame sx-vault-in group min-w-0 px-4 pb-3.5 pt-3.5" style={at(delay)}>
      <dt className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">
        {label}
        {badge !== undefined && <VaultBadge count={badge} />}
        {hint && <StadiumHint label={label} text={hint} skin="vault" />}
      </dt>
      <dd className="mt-1.5">
        {href && <Link href={href} className="sx-vault-cover" aria-label={`${label} — open`} />}
        {/* a size down on a phone, where two tiles share 390px: "$1,234,567" still fits */}
        <ArenaCount value={value} format={format} delay={delay} className="sx-vault-num block text-[23px] leading-tight sm:text-[28px]" />
        {shown && (
          <span className="mt-1 block text-[11.5px] text-[color:var(--vault-muted)]">
            {flat ? (
              <span>— 0%</span>
            ) : (
              <span className={up ? "text-[color:var(--vault-good)]" : "text-[color:var(--vault-late)]"}>
                {up ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}%
              </span>
            )}{" "}
            {deltaLabel}
          </span>
        )}
        {caption != null && <span className="mt-1 block text-[11.5px] text-[color:var(--vault-muted)]">{caption}</span>}
        {href && (
          <span aria-hidden="true" className="absolute right-3.5 top-3 text-[color:var(--vault-gold)] opacity-0 transition-all duration-300 motion-safe:group-hover:translate-x-0.5 group-hover:opacity-100">
            →
          </span>
        )}
      </dd>
    </div>
  );
}

/** The key in a deposit box's corner: a bow, a shaft and two bits. It turns
 *  a quarter in its lock while the box is hovered or focused (vault.css). */
function Key() {
  return (
    <span aria-hidden="true" className="sx-vault-key absolute right-3 top-3 grid size-7 place-items-center rounded-full border border-[color:var(--vault-line)] text-[color:var(--vault-gold)]">
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7.5" cy="12" r="3.5" />
        <path d="M11 12h10M17.5 12v3M20.5 12v2" />
      </svg>
    </span>
  );
}

/** A Needs-you deposit box: count · amount, the oldest wait, "Open …". The
 *  whole box is the link. A count of 0 reads "All clear" — the box stays. */
export function VaultBox({
  label,
  count,
  cents,
  sub,
  href,
  open,
  delay = 0.2,
}: {
  label: string;
  count: number;
  /** Omitted when the desk has no amount (payment events). */
  cents?: number;
  sub?: ReactNode;
  href: string;
  /** The link's words: "Open Payouts". */
  open: string;
  delay?: number;
}) {
  const clear = count === 0;
  return (
    <Link href={href} data-spot="" data-tone={clear ? undefined : "you"} className="sx-vault-frame sx-vault-in group block px-4 pb-3.5 pt-3.5" style={at(delay)}>
      <Key />
      <span className="block pr-9 text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">{label}</span>
      {clear ? (
        <span className="mt-1.5 flex items-center gap-2 font-[family-name:var(--font-source-serif)] text-[20px] font-semibold leading-tight text-[color:var(--vault-good)]">
          <span aria-hidden="true" className="inline-block size-[7px] rotate-45 bg-[color:var(--vault-good)] shadow-[0_0_8px_var(--vault-good)]" />
          All clear
        </span>
      ) : (
        <span className="sx-vault-num mt-1.5 block text-[22px] leading-tight">
          <ArenaCount value={count} delay={delay} />
          {cents !== undefined && (
            <>
              {" · "}
              <ArenaCount value={cents} format="usd0" delay={delay} />
            </>
          )}
        </span>
      )}
      {sub != null && !clear && <span className="mt-0.5 block text-[11.5px] text-[color:var(--vault-muted)]">{sub}</span>}
      <span className="mt-2.5 flex items-center gap-1 text-[11.5px] font-medium text-[color:var(--vault-gold)]">
        {open}
        <span aria-hidden="true" className="transition-transform duration-300 motion-safe:group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}

/* panels ------------------------------------------------------------------------ */

/** A panel. `tone` puts it in the gold (or red) double-rule frame — the
 *  forms that move money; `delay` gives it the unlock entrance. */
export function VaultPanel({
  children,
  flush = false,
  delay,
  tone,
  className = "",
}: {
  children: ReactNode;
  flush?: boolean;
  delay?: number;
  tone?: "you" | "late";
  className?: string;
}) {
  return (
    <div
      data-spot=""
      data-tone={tone}
      className={`sx-vault-panel ${tone ? "sx-vault-frame" : ""} ${delay !== undefined ? "sx-vault-in" : ""} ${flush ? "" : "p-5"} ${className}`}
      style={delay !== undefined ? at(delay) : undefined}
    >
      {children}
    </div>
  );
}

export function VaultSection({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="sx-section-title min-w-0">{title}</h2>
      {hint != null && <p className="text-xs text-[color:var(--vault-muted)]">{hint}</p>}
      {action}
    </div>
  );
}

/* the dial ------------------------------------------------------------------------ */

const DIAL_R = 44;
const DIAL_C = 2 * Math.PI * DIAL_R;

/** The vault dial: `value` 0..1 (null reads "—", "no figure yet"). The sweep
 *  draws round to the value as the page unlocks; the bezel — sixty ticks and
 *  the numbers 0–90 of a safe's combination dial — turns slowly under the
 *  fixed gold index at the top. Reduced motion: still, already at the value. */
export function VaultDial({ value, label, caption, size = 148 }: { value: number | null; label: string; caption?: ReactNode; size?: number }) {
  const gid = useId();
  const pct = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <figure className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <svg
        viewBox="0 0 140 140"
        width={size}
        height={size}
        role="img"
        aria-label={`${label}: ${pct === null ? "no figure yet" : `${pct}%`}`}
        className="shrink-0 overflow-visible"
      >
        <defs>
          <linearGradient id={`${gid}-sweep`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#f6e6b4" />
            <stop offset="1" stopColor="#c49a45" />
          </linearGradient>
          <linearGradient id={`${gid}-num`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0.1" stopColor="#f8ecc2" />
            <stop offset="0.55" stopColor="#e3c57d" />
            <stop offset="1" stopColor="#b98f3e" />
          </linearGradient>
        </defs>

        {/* the bezel: turns */}
        <g className="sx-vault-bezel">
          <circle cx="70" cy="70" r="67" fill="none" stroke="rgb(212 176 98 / 0.3)" strokeWidth="0.8" />
          {Array.from({ length: 60 }, (_, i) => (
            <line
              key={i}
              x1="70"
              y1="4"
              x2="70"
              y2={i % 6 === 0 ? 11 : i % 3 === 0 ? 9 : 7.5}
              stroke="#d4b062"
              strokeOpacity={i % 6 === 0 ? 0.95 : 0.55}
              strokeWidth={i % 6 === 0 ? 1.2 : 0.55}
              transform={`rotate(${i * 6} 70 70)`}
            />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <text
              key={i}
              x="70"
              y="19"
              textAnchor="middle"
              transform={`rotate(${i * 36} 70 70)`}
              className="sx-vault-dial-num"
              style={{ fontSize: 5.6, fill: "#a99b74" }}
            >
              {i * 10}
            </text>
          ))}
        </g>

        {/* the index: fixed, the bezel turns under it */}
        <path d="M66.5 0.5 L73.5 0.5 L70 5.5 Z" fill="#f1dfa6" />

        {/* the track, a bead ring inside it, and the sweep */}
        <circle cx="70" cy="70" r={DIAL_R} fill="none" stroke="rgb(212 176 98 / 0.12)" strokeWidth="7" />
        <circle cx="70" cy="70" r="37" fill="none" stroke="rgb(212 176 98 / 0.3)" strokeWidth="0.8" strokeDasharray="0.4 2.2" strokeLinecap="round" />
        {pct !== null && pct > 0 && (
          <circle
            className="sx-vault-sweep"
            cx="70"
            cy="70"
            r={DIAL_R}
            fill="none"
            stroke={`url(#${gid}-sweep)`}
            strokeWidth="7"
            strokeLinecap={pct === 100 ? "butt" : "round"}
            strokeDasharray={DIAL_C}
            strokeDashoffset={DIAL_C * (1 - pct / 100)}
            transform="rotate(-90 70 70)"
            style={{ "--sx-dial-c": DIAL_C } as CSSProperties}
          />
        )}

        <text x="70" y="76" textAnchor="middle" className="sx-vault-dial-num" style={{ fontSize: 22 }} fill={`url(#${gid}-num)`}>
          {pct === null ? "—" : `${pct}%`}
        </text>
        <text x="70" y="88" textAnchor="middle" style={{ fontSize: 6.4, letterSpacing: 1.3, fill: "#a99b74" }}>
          {label.toUpperCase()}
        </text>
      </svg>
      {caption != null && <figcaption className="min-w-[10rem] max-w-[16rem] flex-1 text-[12px] leading-relaxed text-[color:var(--vault-muted)]">{caption}</figcaption>}
    </figure>
  );
}

/* split and steps ---------------------------------------------------------------- */

/** Where the money went: one gold bar per account, the amount and the share. */
export function VaultSplit({ rows, delay = 0.3 }: { rows: { key: string; label: string; cents: number; share: number }[]; delay?: number }) {
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const pct = Math.round(Math.max(0, Math.min(1, r.share)) * 100);
        return (
          <li key={r.key} className="text-[12.5px]">
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[color:var(--vault-ink)]">{r.label}</span>
              <span className="shrink-0 font-[family-name:var(--font-source-serif)] font-semibold tabular-nums text-[color:var(--vault-gold-hi)]">
                {usd0(r.cents)} <span className="font-normal text-[color:var(--vault-muted)]">· {pct}%</span>
              </span>
            </span>
            <span aria-hidden="true" className="sx-vault-bar mt-1.5">
              <span style={at(delay + i * 0.07, { width: `${pct}%` })} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type Step = { label: string; count: number; cents: number; off?: boolean };

/** Athlete pay by step: the main steps in order on one engraved rule (a bead
 *  each, filled when something stands there), the off-path ones (held,
 *  disputed) set apart below in red. */
export function VaultSteps({ steps, label = "Athlete pay, step by step" }: { steps: Step[]; label?: string }) {
  const main = steps.filter((s) => !s.off);
  const off = steps.filter((s) => s.off);
  const amount = (s: Step) => (
    <>
      <span className="sx-vault-num mt-1 block text-[18px] leading-tight">{usd0(s.cents)}</span>
      <span className="block text-[11px] text-[color:var(--vault-muted)]">
        {s.count.toLocaleString("en-US")} {s.count === 1 ? "earning" : "earnings"}
      </span>
    </>
  );
  return (
    <div className="@container">
      <ol aria-label={label} data-n={main.length} className="sx-vault-steps grid grid-cols-2 gap-x-3 gap-y-4 @md:grid-cols-4">
        {main.map((s) => (
          <li key={s.label} data-has={s.count > 0 ? "" : undefined} className="text-center">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">{s.label}</span>
            {amount(s)}
          </li>
        ))}
      </ol>
      {off.length > 0 && (
        <div className="mt-4 border-t border-dashed border-[color:var(--vault-line)] pt-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--vault-late)]">Set apart</p>
          <ul className="mt-2 grid grid-cols-2 gap-3">
            {off.map((s) => (
              <li key={s.label} data-tone={s.count > 0 ? "late" : undefined} className="sx-vault-frame px-3 py-2.5 text-center">
                <span className={`block text-[10px] uppercase tracking-[0.16em] ${s.count > 0 ? "text-[color:var(--vault-late)]" : "text-[color:var(--vault-muted)]"}`}>{s.label}</span>
                {amount(s)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* words ------------------------------------------------------------------------------ */

const CHIP = {
  good: "border-[color:var(--vault-good)]/45 bg-[color:var(--vault-good)]/10 text-[color:var(--vault-good)]",
  you: "border-[color:var(--vault-gold)] bg-[color:var(--vault-gold)] font-semibold text-[color:var(--vault-ground)]",
  late: "border-[color:var(--vault-late)]/50 bg-[color:var(--vault-late)]/10 text-[color:var(--vault-late)]",
  info: "border-[color:var(--vault-gold)]/40 bg-[color:var(--vault-gold)]/[0.07] text-[color:var(--vault-gold-hi)]",
  done: "border-[color:var(--vault-line)] text-[color:var(--vault-muted)]",
} as const;
export type VaultTone = keyof typeof CHIP;

export function VaultChip({ tone = "info", children }: { tone?: VaultTone; children: ReactNode }) {
  return <span className={`sx-vault-chip inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-[11px] ${CHIP[tone]}`}>{children}</span>;
}

export function VaultBadge({ count }: { count: number }) {
  return (
    <span className="sx-vault-badge tabular-nums" data-zero={count === 0 ? "" : undefined}>
      {count}
    </span>
  );
}

/* range and loading -------------------------------------------------------------------- */

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

/** The window switch — links that keep the other params, drop the pages, and omit the default. */
export function VaultRange({ current, path, params }: { current: RangeKey; path: string; params: Record<string, string | string[] | undefined> }) {
  const href = (key: RangeKey) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "range" || /page$/.test(k)) continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (typeof val === "string" && val) u.set(k, val);
    }
    if (key !== "30d") u.set("range", key);
    const s = u.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <nav aria-label="Time period" className="sx-vault-range flex overflow-hidden text-[12px]">
      {RANGE_OPTIONS.map((r) => (
        <Link key={r.key} href={href(r.key)} scroll={false} aria-current={current === r.key ? "true" : undefined} className="px-2.5 py-1.5">
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

export function VaultGhost({ label = "Loading", tiles = 4, cols = 4, rows = 2 }: { label?: string; tiles?: number; /** The page's VaultTiles `cols`. */ cols?: TileCols; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="sx-vault-ghost h-7 w-48" />
          <div className="sx-vault-ghost h-5 w-28 rounded-full" />
        </div>
        <div className={`mt-5 ${tileGrid(cols)}`}>
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="sx-vault-frame sx-vault-ghost min-h-[110px]" />
          ))}
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="sx-vault-panel sx-vault-ghost min-h-[13rem]" />
          ))}
        </div>
      </div>
    </div>
  );
}

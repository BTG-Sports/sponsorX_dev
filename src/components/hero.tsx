import type { ReactNode } from "react";
import { InsightCarousel, type InsightItem } from "./insight-carousel";

/* --------------------------------------------------------------------------
   Hero-band primitives for the sponsor portal redesign (spec 2026-09-11).
   Server components — gradient glow container, monogram tiles, provenance
   mini-chips and the insight strip (CSS scroll-snap carousel on mobile).
   -------------------------------------------------------------------------- */

export function HeroBand({
  children,
  className = "",
  border = "border-primary/25",
}: {
  children: ReactNode;
  className?: string;
  /** Border-color utility — portals override (e.g. "border-admin/25"). */
  border?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-5 sm:p-6",
        border,
        "bg-[linear-gradient(120deg,rgba(46,155,245,.18),transparent_55%),linear-gradient(240deg,rgba(249,122,31,.13),transparent_50%)]",
        "bg-surface/40",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

const MONO_TONES = {
  primary: "bg-gradient-to-br from-primary to-primary-soft text-white",
  accent: "bg-gradient-to-br from-accent to-accent-soft text-white",
  neutral: "bg-surface-2 text-muted",
} as const;

export function Monogram({
  text,
  tone = "primary",
  shape = "square",
  className = "size-8 text-[10px]",
}: {
  text: string;
  tone?: keyof typeof MONO_TONES;
  shape?: "square" | "circle";
  className?: string;
}) {
  return (
    <span
      className={[
        "grid shrink-0 place-items-center font-bold",
        shape === "circle" ? "rounded-full" : "rounded-lg",
        MONO_TONES[tone],
        className,
      ].join(" ")}
    >
      {text}
    </span>
  );
}

/** Derive a 1–3 letter monogram from a display name. */
export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

const CHIP_TONES = {
  ver: ["VERIFIED", "bg-success/12 text-success"],
  manual: ["MANUAL", "bg-primary/12 text-primary-soft"],
  att: ["ATTRIB", "bg-primary/12 text-primary-soft"],
  est: ["EST", "bg-surface-2 text-muted"],
  warn: ["", "bg-warn/12 text-warn"],
  neutral: ["", "bg-surface-2 text-muted"],
} as const;

/**
 * Compact provenance/source chip — smaller sibling of SourceLabel (§22).
 * Pass children to override the default label (e.g. "ZOHO BOOKS",
 * "EST · curated").
 */
export function MiniChip({
  kind,
  children,
}: {
  kind: keyof typeof CHIP_TONES;
  children?: ReactNode;
}) {
  const [label, cls] = CHIP_TONES[kind];
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wide",
        cls,
      ].join(" ")}
    >
      {children ?? label}
    </span>
  );
}

/**
 * Computed-insight callouts. Wraps on ≥sm; on phones it becomes an autoplay
 * infinite carousel (InsightCarousel client island).
 */
export function InsightStrip({ items }: { items: InsightItem[] }) {
  return (
    <>
      <div className="hidden gap-2 sm:flex sm:flex-wrap">
        {items.map((it, i) => (
          <div
            key={i}
            className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-surface/75 px-3 py-2"
          >
            <span aria-hidden="true" className="text-sm">
              {it.icon}
            </span>
            <span className="text-[11px] leading-snug text-muted">
              {it.text}
            </span>
          </div>
        ))}
      </div>
      <div className="sm:hidden">
        <InsightCarousel items={items} />
      </div>
    </>
  );
}

import type { CSSProperties, ReactNode } from "react";

import { ATTRIBUTION_CLASSES, type AttributionClass } from "@/lib/intelligence";
import type { ClassTile } from "@/lib/attribution-live";

/* --------------------------------------------------------------------------
   3S6-FE-01 — the attribution classes' three looks. Server components (no
   client JS). Theme tokens only, so they sit on the Mission Control stage.

   Four claims, three treatments, and never colour alone (the dataviz rule):
     verified   SOLID   — filled, solid border, a check mark
     modelled   HATCHED — diagonal hatching, dashed border, a tilde
     estimated  OUTLINE — no fill, dotted border, an approx sign
   The two verified classes share "solid" and are told apart by name and
   glyph (a QR scan vs a receipt). Every tile and badge prints its label.
   -------------------------------------------------------------------------- */

const HATCH: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in srgb, var(--sx-primary) 16%, transparent) 0 5px, transparent 5px 11px)",
};

const SHELL: Record<ClassTile["tone"], { cls: string; style?: CSSProperties }> = {
  verified: { cls: "border border-solid border-success/55 bg-success/10" },
  modelled: { cls: "border border-dashed border-primary/60 bg-surface", style: HATCH },
  estimated: { cls: "border-2 border-dotted border-faint/70 bg-transparent" },
};

const TREATMENT: Record<ClassTile["tone"], string> = {
  verified: "Solid · recorded fact",
  modelled: "Hatched · a model's match",
  estimated: "Outlined · an estimate",
};

/** The class's glyph — a second cue beside the label and the fill. */
export function ClassGlyph({ cls, className = "size-4" }: { cls: AttributionClass; className?: string }) {
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
  switch (cls) {
    case "VERIFIED_REDEMPTION": /* a QR corner + check */
      return (
        <svg {...p}>
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
          <path d="m14 17 2.5 2.5L21 15" />
        </svg>
      );
    case "VERIFIED_TRANSACTION": /* a receipt + check */
      return (
        <svg {...p}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="m9 11 2 2 4-4" />
        </svg>
      );
    case "MODELLED": /* tilde: approximately matched */
      return (
        <svg {...p}>
          <path d="M4 13c2-3 4-3 6-1.5S14 14 16 12s3-2 4-1" />
        </svg>
      );
    default: /* ≈ estimated */
      return (
        <svg {...p}>
          <path d="M4 9c2-2 4-2 6-.5S14 10.5 16 9s3-1.5 4-.5M4 15c2-2 4-2 6-.5s4 2 6 .5 3-1.5 4-.5" />
        </svg>
      );
  }
}

const GLYPH_TONE: Record<ClassTile["tone"], string> = {
  verified: "text-success",
  modelled: "text-primary-soft",
  estimated: "text-muted",
};

/** The dashboard's four tiles. Never a fifth "total". */
export function ClassTiles({ tiles }: { tiles: ClassTile[] }) {
  return (
    <ul aria-label="Attribution by class — four separate claims, never added together" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => {
        const s = SHELL[t.tone];
        return (
          <li key={t.cls} data-attribution-class={t.cls} data-tone={t.tone} className={`flex flex-col gap-2 rounded-xl p-4 ${s.cls}`} style={s.style}>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span className={GLYPH_TONE[t.tone]}>
                <ClassGlyph cls={t.cls} />
              </span>
              {t.label}
            </p>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-text">{t.value}</span>
              <span className="text-[11px] text-muted">{t.noun}</span>
            </p>
            <p className="text-[11px] tabular-nums text-faint">{t.sub}</p>
            <p className="mt-auto border-t border-line/60 pt-2 text-[11px] leading-snug text-muted">{t.claim}</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-faint">{TREATMENT[t.tone]}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** A row's class, in the same three looks at badge size. */
export function ClassBadge({ cls, children }: { cls: AttributionClass; children?: ReactNode }) {
  const def = ATTRIBUTION_CLASSES[cls];
  const s = SHELL[def.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-text ${s.cls}`} style={s.style}>
      <span className={GLYPH_TONE[def.tone]}>
        <ClassGlyph cls={cls} className="size-3.5" />
      </span>
      {def.label}
      {children}
    </span>
  );
}

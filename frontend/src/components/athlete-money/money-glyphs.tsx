import { UI_GLYPH, type UiGlyph } from "@/components/athlete-inventory/glyphs";

/* --------------------------------------------------------------------------
   POL-FE-97 — the money page's glyphs: the inventory's set (UI_GLYPH) plus
   the few money needs of its own. Path data only, no "use client", so the
   server page and the client islands share it.
   -------------------------------------------------------------------------- */

const MONEY_GLYPH = {
  bank: "M3 10h18M4 10l8-6 8 6M5.5 10v8m4.3-8v8m4.4-8v8m4.3-8v8M3 20.5h18",
  send: "M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z",
  snow: "M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2 3.8 16.8M9.2 4.2 12 7l2.8-2.8M9.2 19.8 12 17l2.8 2.8",
  wallet: "M3.5 7.5h15a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5h-13a2 2 0 0 1-2-2v-11Zm0 0 2.2-3.5h11.8v3.5M16.5 14.25h.01",
  unlock: "M6 11h12v10H6V11Zm2.5 0V7.5a3.5 3.5 0 0 1 6.9-.9",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2.6 6.4A2.7 2.7 0 0 1 12 7.4c1.5 0 2.7 1 2.7 2.4 0 1.9-2.7 2.2-2.7 4.1M12 17.1h.01",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.5 2.5m6.4 6.4 2.5 2.5m0-11.4-2.5 2.5m-6.4 6.4-2.5 2.5",
} as const;

export type MoneyGlyphName = UiGlyph | keyof typeof MONEY_GLYPH;

/** A stroked 24px glyph from the inventory's set or the money page's own. */
export function MoneyGlyph({ name, className = "size-5" }: { name: MoneyGlyphName; className?: string }) {
  const d = (MONEY_GLYPH as Record<string, string>)[name] ?? UI_GLYPH[name as UiGlyph];
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

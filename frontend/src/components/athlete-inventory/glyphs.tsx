/* --------------------------------------------------------------------------
   POL-FE-83 — the inventory's glyphs: one per kind of item, plus the few the
   page draws itself. Path data only, and no "use client", so the server page
   and the client islands share it (see components/icons.ts for why a client
   module can't hand a server component plain data).
   -------------------------------------------------------------------------- */

export const KIND_GLYPH: Record<string, string> = {
  SOCIAL_POST: "M4 5h16v11H9l-5 4V5Zm8 8.6s-3-1.8-3-3.7A1.6 1.6 0 0 1 12 9a1.6 1.6 0 0 1 3 .9c0 1.9-3 3.7-3 3.7Z",
  VIDEO: "M3 6h13v12H3V6Zm13 4 5-3v10l-5-3M8 9.5v5l4-2.5-4-2.5Z",
  APPEARANCE: "m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8-4.2-4.1 5.8-.8L12 3Z",
  AUTOGRAPH: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z",
  CAMP: "M12 3 5 20h14L12 3Zm-4.6 11.5h9.2M9.6 9h4.8M3 20h18",
  SIGNAGE: "M3 4h18v10H3V4Zm5 10v7m8-7v7M7 8h6m-6 3h10",
  TICKETS: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Zm11 0v10",
  OTHER: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6",
  PACKAGE: "M3 11h18v9H3v-9Zm0-4h18v4H3V7Zm9 0v13M8.5 7a2.5 2.5 0 1 1 3.5-3.2A2.5 2.5 0 1 1 15.5 7",
};

export const UI_GLYPH = {
  box: "M3 7l9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  pause: "M8 5v14m8-14v14",
  tag: "M3 3h8l10 10-8 8L3 11V3Zm4.5 4.5h.01",
  calendar: "M4 5h16v16H4V5Zm0 5h16M9 3v4m6-4v4",
  plus: "M12 5v14M5 12h14",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  rows: "M3 5h18M3 12h18M3 19h18",
  close: "M6 6l12 12M18 6 6 18",
  ban: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5.6 5.6l12.8 12.8",
  lock: "M6 11h12v10H6V11Zm2.5 0V7.5a3.5 3.5 0 0 1 7 0V11",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  megaphone: "M3 11v2l14 5V6L3 11Zm0 0H2v2h1m14-1h4M9 19v2",
  stack: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  back: "M19 12H5m6 6-6-6 6-6",
  check: "m5 12.5 4.5 4.5L19 7",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0m2.5-9a3 3 0 0 0 0-6m3.5 15a6 6 0 0 0-4-5.6",
  trophy: "M8 21h8m-4-4v4M6 4h12v5a6 6 0 0 1-12 0V4Zm0 2H3v1a4 4 0 0 0 4 4M18 6h3v1a4 4 0 0 1-4 4",
  play: "M8 5v14l11-7L8 5Z",
  school: "M2 9l10-5 10 5-10 5L2 9Zm4 2.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.8",
  pin: "M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  shield: "M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Zm-3 9 2 2 4-4",
} as const;

export type UiGlyph = keyof typeof UI_GLYPH;

/** A stroked 24px glyph. `kind` draws an item kind; `ui` one of the page's own. */
export function Glyph({ kind, ui, className = "size-5" }: { kind?: string; ui?: UiGlyph; className?: string }) {
  const d = ui ? UI_GLYPH[ui] : (KIND_GLYPH[kind ?? ""] ?? KIND_GLYPH.OTHER);
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

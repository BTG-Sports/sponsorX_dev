/* --------------------------------------------------------------------------
   The house glyph set — path data only, importable from BOTH server and
   client components. This deliberately carries no "use client": when a server
   component imports from a client module, every export arrives as an opaque
   client-reference proxy, so ICONS.trophy silently becomes undefined and the
   <path> renders with no d at all (the blank points hero, 2026-09-24 QA
   sweep). portal-nav re-exports these for its existing client consumers.
   -------------------------------------------------------------------------- */

export const ICONS = {
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  store: "M3 9h18l-1.5-5H4.5L3 9Zm1 0v11h16V9M9 20v-6h6v6",
  megaphone: "M3 11v2l14 5V6L3 11Zm0 0H2v2h1m14-1h4M9 19v2",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  gift: "M3 11h18v9H3v-9Zm0-4h18v4H3V7Zm9 0v13M8.5 7a2.5 2.5 0 1 1 3.5-3.2A2.5 2.5 0 1 1 15.5 7",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0m2.5-9a3 3 0 0 0 0-6m3.5 15a6 6 0 0 0-4-5.6",
  card: "M3 7h18v12H3V7Zm0 4h18M16 15h2",
  mail: "M3 6h18v12H3V6Zm0 0 9 7 9-7",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5-.1-1 2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15.4 3h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a8 8 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.4h4l.4-2.4a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6.1-1Z",
  inbox: "M3 12h5l1 3h6l1-3h5M5 5h14l2 7v7H3v-7l2-7Z",
  calendar: "M4 5h16v16H4V5Zm0 5h16M9 3v4m6-4v4",
  wallet: "M3 7h18v12H3V7Zm0 4h18M16 15h2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  file: "M6 3h8l4 4v14H6V3Zm8 0v4h4",
  /* SponsorX NEXT glyphs (P1-FE-18, spec §9) — book, pen, camera, trophy. */
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Zm0 15A2.5 2.5 0 0 0 6.5 23H20M8 7h8m-8 4h5",
  pen: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z",
  camera: "M4 7h3.2L9 4h6l1.8 3H20v13H4V7Zm8 9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  trophy: "M8 21h8m-4-4v4M6 4h12v5a6 6 0 0 1-12 0V4Zm0 2H3v1a4 4 0 0 0 4 4M18 6h3v1a4 4 0 0 1-4 4",
  /* 2026-10-01 BTG admin desks — delivery issues, restricted words, guardian requests. */
  flag: "M5 21V4h11l-1.5 4L16 12H5",
  ban: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5.6 5.6l12.8 12.8",
  box: "M3 7l9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10",
  shield: "M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Zm-3 9 2 2 4-4",
} as const;

export type NavIcon = keyof typeof ICONS;

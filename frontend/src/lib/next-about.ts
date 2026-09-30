/* --------------------------------------------------------------------------
   /next/about — the SponsorX NEXT programme landing as a magazine
   (design spec docs/superpowers/specs/2026-09-30-next-about-magazine-design.md).

   Everything here is pure: the issue constants, the copy that used to live
   in page.tsx, and three helpers the stage components call. The stage
   itself is components/next-about-stage.tsx.
   -------------------------------------------------------------------------- */

/** Issue number and season on the cover. Constants until an edition actually
 *  publishes (`P9-DATA-01`); then they come from the editions list. */
export const ISSUE = { number: "01", season: "Fall 2026" } as const;

/** The client's magazine logo — RGB on black, so it is always drawn with
 *  `mix-blend-mode: screen` over a dark cover. */
export const LOGO = "/next/btg-sports-talk-magazine.png";
export const LOGO_ALT = "BTG Sports Talk Magazine";

/** One edition as GET /public/next/editions returns it. */
export type EditionCard = {
  id: string;
  label: string;
  publication: string;
  school: { slug: string; name: string; city: string | null; stateCode: string | null } | null;
};

/** Only the client's own title wears the BTG logo on a mini cover; any
 *  other publication gets its name set in the display face instead. */
export function usesLogo(publication: string): boolean {
  return /\bsports\s*talk/i.test(publication);
}

/** The reader route — unchanged from the pre-redesign page. */
export function editionHref(e: { id: string; school: { slug: string } | null }): string {
  return `/next/${encodeURIComponent(e.school?.slug ?? "regional")}/${encodeURIComponent(e.id)}`;
}

/** "01 Write" → numeral "01", text "Write". Anything else is text only. */
export function splitNumeral(item: string): { numeral: string | null; text: string } {
  const m = /^(\d{2})\s+(.+)$/.exec(item);
  return m ? { numeral: m[1], text: m[2] } : { numeral: null, text: item };
}

/* ------------------------------------------------------------------- copy */

export const STEPS = [
  { n: "01", title: "Write", text: "Game recaps, athlete features, columns. Your byline on every piece." },
  { n: "02", title: "Shoot", text: "Photos and short video from the sideline, with rights handled properly." },
  { n: "03", title: "Design", text: "Lay out pages in SponsorX templates built for print and phone." },
  { n: "04", title: "Sell", text: "Pitch local businesses and sell the ads. Every sale is credited to you." },
  { n: "05", title: "Publish", text: "Your advisor signs off. We publish digital, and print when your school wants it." },
] as const;

export const BENEFITS = [
  {
    title: "Portfolio credit",
    text: "Every byline, photo credit and page you design lands in a portfolio with your name on it. Use it for college, internships, anything.",
  },
  {
    title: "Sales credit that stays yours",
    text: "Sell an ad and the sale is credited to you on the record. It stays yours after you graduate.",
  },
  {
    title: "Recognition points",
    tag: "Not cash",
    text: "Points recognise what you contribute to the team. They aren’t money, can’t be cashed out, and are never pay.",
  },
] as const;

/** The marquee band under the cover: the five jobs (their "NN " numeral
 *  renders in yellow) then the benefits. */
export const BAND_ITEMS: readonly string[] = [
  ...STEPS.map((s) => `${s.n} ${s.title}`),
  "Your byline",
  "Portfolio credit",
  "Sales credit that stays yours",
  "QR on every feature",
];

/* --------------------------------------------------------------------------
   POL-FE-99 — small pure helpers the help pages share (server and client).
   -------------------------------------------------------------------------- */

import type { HelpArticle, HelpPortal } from "@/lib/help/types";

export const PORTAL_WORD: Record<HelpPortal, string> = {
  sponsor: "Sponsor",
  athlete: "Athlete",
  property: "Property",
  next: "NEXT Student",
  advisor: "NEXT Advisor",
  finance: "Finance",
  admin: "Admin",
};

/** A step's words cut so on-screen labels in quotes ("Add to cart") render as UI chips. */
export function labelSegments(body: string): { text: string; ui: boolean }[] {
  const out: { text: string; ui: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(/["“]([^"”]{1,60})["”]/g)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index), ui: false });
    out.push({ text: m[1], ui: true });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), ui: false });
  return out;
}

/** "about 1 min" — twenty seconds a step, rounded up. */
export function readingTime(a: Pick<HelpArticle, "steps">): string {
  return `about ${Math.max(1, Math.ceil((a.steps.length * 20) / 60))} min`;
}

/** What the client islands need of an article: everything but the capture plan. */
export type ArticleCard = Omit<HelpArticle, "steps"> & { steps: { title: string; body: string }[] };

export function toCard(a: HelpArticle): ArticleCard {
  return { ...a, steps: a.steps.map((s) => ({ title: s.title, body: s.body })) };
}

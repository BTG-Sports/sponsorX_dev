/* --------------------------------------------------------------------------
   POL-FE-99 — the help content of every portal, and the screenshots.
   -------------------------------------------------------------------------- */

import { content as admin } from "./admin";
import { content as advisor } from "./advisor";
import { content as athlete } from "./athlete";
import { content as finance } from "./finance";
import { content as next } from "./next";
import { content as property } from "./property";
import { content as sponsor } from "./sponsor";
import adminShots from "./shots/admin.json";
import advisorShots from "./shots/advisor.json";
import athleteShots from "./shots/athlete.json";
import financeShots from "./shots/finance.json";
import nextShots from "./shots/next.json";
import propertyShots from "./shots/property.json";
import sponsorShots from "./shots/sponsor.json";
import type { HelpArticle, HelpContent, HelpPortal, ShotEntry } from "./types";

/* One manifest per portal (written by scripts/help-shots/capture.mjs), so portals can be re-captured independently. */
const shots: Record<string, ShotEntry> = {
  ...adminShots,
  ...advisorShots,
  ...athleteShots,
  ...financeShots,
  ...nextShots,
  ...propertyShots,
  ...sponsorShots,
};

export type * from "./types";

const CONTENT: Record<HelpPortal, HelpContent> = { sponsor, athlete, property, next, advisor, finance, admin };

export const HELP_PORTALS = Object.keys(CONTENT) as HelpPortal[];

export function helpFor(portal: HelpPortal): HelpContent {
  return CONTENT[portal];
}

export function articleFor(portal: HelpPortal, slug: string): HelpArticle | null {
  return CONTENT[portal].articles.find((a) => a.slug === slug) ?? null;
}

/** The portal's help home, e.g. "/sponsor/help". */
export function helpHome(portal: HelpPortal): string {
  return `/${portal}/help`;
}

export function shotFor(id: string): ShotEntry | null {
  return shots[id] ?? null;
}

/* --------------------------------------------------------------------------
   POL-FE-99 — the Help & FAQ center's content model. Pure types, importable
   from server and client alike.

   Every step names the screenshot that shows it (`shot`, "<portal>/<slug>-<n>")
   and says how the capture script reaches it (`capture`). The screenshots and
   their hotspots live in shots.json, written by
   frontend/scripts/help-shots/capture.mjs — so re-running that script after a
   redesign refreshes every picture and every ring without touching the words.
   -------------------------------------------------------------------------- */

import type { NavIcon } from "@/components/icons";

export type HelpPortal = "sponsor" | "athlete" | "property" | "next" | "advisor" | "finance" | "admin";

export type HelpCategory = {
  key: string;
  title: string;
  /** One line under the title on the topic card. */
  blurb: string;
  icon: NavIcon;
};

/** Something the capture script does before the shot. Locators as in `highlight`. */
export type HelpCaptureAction =
  | { click: string; wait?: number }
  | { fill: string; text: string; wait?: number }
  | { hover: string; wait?: number }
  | { press: string; wait?: number }
  /** Replaces an element's text in the picture only — for seed data that must not ship (a rude test note). */
  | { setText: string; text: string; wait?: number };

/** How the capture script reaches a step's screen. The UI ignores it. */
export type HelpCapture = {
  /** Which QA account takes the shot (capture.mjs ACCOUNTS); default the portal's own. */
  as?: string;
  /** Done in order after the page loads: open a dialog, pick a tab, type a search. */
  actions?: HelpCaptureAction[];
  /** A Playwright locator for the thing to click, e.g. `getByRole('link', { name: 'Shop' })`; null = no ring. */
  highlight?: string | null;
  /** For a record route ("/sponsor/orders/[id]"): open `route`'s list page and follow the first link matching this CSS selector. */
  follow?: string;
  /** The page to open first when `route` is a pattern, if it isn't the list above it. */
  from?: string;
  /** Scroll the highlight into view before the shot (default true). */
  scroll?: boolean;
  /** The record this screen needs to show something useful — for the capture report. */
  needs?: string;
  /** A query string added to the route for the shot, e.g. "demo=sample". */
  query?: string;
};

export type HelpStep = {
  title: string;
  /** One to three plain sentences; on-screen labels in quotes. */
  body: string;
  /** Where this step happens, as the person sees it (a pattern for records). */
  route: string;
  /** Screenshot id: "<portal>/<slug>-<n>". */
  shot: string;
  capture?: HelpCapture;
};

export type HelpArticle = {
  slug: string;
  category: string;
  question: string;
  /** The answer in one or two sentences, shown under the question. */
  summary: string;
  keywords: string[];
  steps: HelpStep[];
  notes?: string[];
  related?: string[];
  /** Shown first on the help home. */
  top?: boolean;
  /** Written for a guardian, or for a minor athlete. */
  audience?: "guardian" | "minor";
};

export type HelpContent = {
  portal: HelpPortal;
  /** Hero line under "How can we help?". */
  intro: string;
  categories: HelpCategory[];
  articles: HelpArticle[];
};

/** One captured screenshot. `spot` is the thing to click, in percent of the image. */
export type ShotEntry = {
  src: string;
  /** The address the picture was taken at, shown in the frame's address bar. */
  path?: string;
  w: number;
  h: number;
  spot: { x: number; y: number; w: number; h: number } | null;
  capturedAt: string;
};

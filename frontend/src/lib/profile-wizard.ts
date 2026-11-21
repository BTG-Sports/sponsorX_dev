import type { SectionKey } from "@/lib/profile-sections";
import type { ApiMyProfile, SectionState } from "@/lib/profile-live";
import { placeRegion, placeWords, regionLabel } from "@/lib/places";

/* --------------------------------------------------------------------------
   /athlete/profile as a step-by-step wizard (POL-FE-80, 2026-11-16).

   The owner found the nine-plate profile dashboard "so confusing for a
   human". While the profile is unfinished, the page is now a wizard, one
   step per section the athlete can actually answer (the §24 meter's
   "answerable" sections — rates and payment are BTG's, so never a step).
   Once every step is done the wizard goes away and the page shows the
   public page itself, owner-framed.

   Pure: data in, answers out — the page and the island both use it, and
   tests/profile-wizard.test.ts pins it.
   -------------------------------------------------------------------------- */

export type WizardKey = Extract<SectionKey, "identity" | "sport" | "socials" | "capabilities" | "interests" | "restrictions" | "agreements">;

export type WizardStepDef = {
  key: WizardKey;
  /** The step's heading — plain words, no jargon. */
  title: string;
  /** The stepper's label. */
  short: string;
  /** One sentence: what this is and why it matters. */
  tagline: string;
  /** Who sees it: on the public page, or only you and BTG. */
  where: "public" | "private";
  minutes: number;
};

export const WIZARD_STEPS: readonly WizardStepDef[] = [
  {
    key: "identity",
    title: "Who you are",
    short: "You",
    tagline: "The name sponsors see and where you're based. It sits at the top of your public page.",
    where: "public",
    minutes: 1,
  },
  {
    key: "sport",
    title: "Your sport",
    short: "Sport",
    tagline: "What you play, where, and at what level. It shows right under your name.",
    where: "public",
    minutes: 1,
  },
  {
    key: "socials",
    title: "Your social accounts",
    short: "Socials",
    tagline: "Where fans follow you. Sponsors look here first. Your numbers are marked self-reported until BTG checks them.",
    where: "public",
    minutes: 1,
  },
  {
    key: "capabilities",
    title: "What you'll create",
    short: "Content",
    tagline: "Pick the kinds of posts and appearances you're happy to do. Sponsors can only ask you for what you pick.",
    where: "public",
    minutes: 1,
  },
  {
    key: "interests",
    title: "Brands you'd love",
    short: "Brands",
    tagline: "The kinds of brands you want to work with. BTG uses this to match you with sponsors.",
    where: "public",
    minutes: 1,
  },
  {
    key: "restrictions",
    title: "What you won't promote",
    short: "Off-limits",
    tagline: "Anything you can never promote, because of your school's rules or your own values. A clashing deal never reaches you.",
    where: "private",
    minutes: 1,
  },
  {
    key: "agreements",
    title: "Accept your agreement",
    short: "Agreement",
    tagline: "One agreement covers how campaigns work. You read it and accept it on Confirmations. A parent or guardian does this for an athlete under 18.",
    where: "private",
    minutes: 3,
  },
];

/** The answer an athlete gives when nothing is off-limits: "none" is an answer (§11), so it is recorded. */
export const NO_RESTRICTIONS_NOTE = "None — nothing is off-limits for me.";

/** Each step done or still to do, from the §24 section states. */
export function wizardDone(states: Record<SectionKey, SectionState>): boolean[] {
  return WIZARD_STEPS.map((s) => states[s.key] === "done");
}

/** Every step done: the page shows the public page instead of the wizard. */
export function profileComplete(states: Record<SectionKey, SectionState>): boolean {
  return wizardDone(states).every(Boolean);
}

/** The next step still to do after `from` (wrapping round), or -1 when every step is done. */
export function nextOpen(done: readonly boolean[], from = -1): number {
  const n = done.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (!done[i]) return i;
  }
  return -1;
}

/** "About 4 min left" — the minutes of the steps still to do. */
export function minutesLeft(done: readonly boolean[]): number {
  return WIZARD_STEPS.reduce((n, s, i) => n + (done[i] ? 0 : s.minutes), 0);
}

/* ---------------------------------------------------------------- the forms */

export type WizardForm = {
  displayName: string;
  city: string;
  stateCode: string;
  /** POL-FE-117 — picked with the region and city (lib/places). */
  countryCode: string;
  sport: string;
  position: string;
  school: string;
  level: string;
  gradYear: string;
  achievements: string;
  contentCapabilities: string[];
  brandInterests: string[];
  restrictedCategories: string[];
  restrictionNotes: string;
};

export type SocialRow = { platform: "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "X"; handle: string; followers: string };

/** What a step still needs before it can be saved — one plain sentence, or null when it's ready. */
export function stepNeeds(key: WizardKey, f: WizardForm, rows: readonly SocialRow[]): string | null {
  switch (key) {
    case "identity": {
      const name = f.displayName.trim().length > 0;
      /* POL-FE-117 — a region of the chosen country, from the list. */
      const state = placeRegion(f.countryCode || "US", f.stateCode) !== null;
      const where = regionLabel(f.countryCode || "US").toLowerCase();
      if (!name && !state) return `Add your display name and choose your ${where} to continue.`;
      if (!name) return "Add the name sponsors should see.";
      if (!state) return `Choose your ${where} from the list.`;
      return null;
    }
    case "sport":
      if (!f.sport.trim()) return "Add the sport you play.";
      if (!f.position.trim() && !f.school.trim() && !f.level) return "Add at least one more: your position, school or level.";
      if (f.gradYear !== "" && !/^\d{4}$/.test(f.gradYear)) return "Class of needs a four-digit year, like 2027.";
      return null;
    case "socials":
      if (rows.length === 0) return "Add at least one account.";
      if (rows.some((r) => r.handle.trim().replace(/^@/, "").length === 0)) return "Every account needs a handle.";
      if (rows.some((r) => r.followers !== "" && !/^\d+$/.test(r.followers))) return "Followers must be a whole number.";
      return null;
    case "capabilities":
      return f.contentCapabilities.length > 0 ? null : "Pick at least one.";
    case "interests":
      return f.brandInterests.length > 0 ? null : "Pick at least one.";
    case "restrictions":
      return f.restrictedCategories.length > 0 || f.restrictionNotes.trim()
        ? null
        : "Pick what you won't promote, or choose “Nothing's off-limits”.";
    case "agreements":
      return null;
  }
}

/** The form as the profile holds it now — the wizard's starting point, and what "changed" is measured against. */
export function formFrom(p: ApiMyProfile): WizardForm {
  return {
    displayName: p.displayName ?? "",
    city: p.city ?? "",
    stateCode: p.stateCode ?? "",
    countryCode: p.countryCode ?? "US",
    sport: p.sport ?? "",
    position: p.position ?? "",
    school: p.school ?? "",
    level: p.level ?? "",
    gradYear: p.gradYear ? String(p.gradYear) : "",
    achievements: p.achievements ?? "",
    contentCapabilities: [...p.contentCapabilities],
    brandInterests: [...p.brandInterests],
    restrictedCategories: [...p.restrictedCategories],
    restrictionNotes: p.restrictionNotes ?? "",
  };
}

const PLATFORMS = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X"] as const;

export function rowsFrom(socials: ApiMyProfile["socials"]): SocialRow[] {
  return socials
    .filter((s): s is typeof s & { platform: SocialRow["platform"] } => (PLATFORMS as readonly string[]).includes(s.platform))
    .map((s) => ({ platform: s.platform, handle: s.handle, followers: s.followers === null ? "" : String(s.followers) }));
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Has the athlete changed this step since it was saved? An unchanged, done step just moves on. */
export function stepChanged(key: WizardKey, f: WizardForm, base: WizardForm, rows: readonly SocialRow[], baseRows: readonly SocialRow[]): boolean {
  const t = (s: string) => s.trim();
  switch (key) {
    case "identity":
      return t(f.displayName) !== t(base.displayName) || t(f.city) !== t(base.city) || t(f.stateCode).toUpperCase() !== t(base.stateCode).toUpperCase() || f.countryCode !== base.countryCode;
    case "sport":
      return (["sport", "position", "school", "level", "gradYear", "achievements"] as const).some((k) => t(f[k]) !== t(base[k]));
    case "socials":
      return (
        rows.length !== baseRows.length ||
        rows.some((r, i) => r.platform !== baseRows[i].platform || t(r.handle).replace(/^@/, "") !== t(baseRows[i].handle).replace(/^@/, "") || r.followers !== baseRows[i].followers)
      );
    case "capabilities":
      return !same(f.contentCapabilities, base.contentCapabilities);
    case "interests":
      return !same(f.brandInterests, base.brandInterests);
    case "restrictions":
      return !same(f.restrictedCategories, base.restrictedCategories) || t(f.restrictionNotes) !== t(base.restrictionNotes);
    case "agreements":
      return false;
  }
}

/** The POST /athletes/:id/profile-changes body for one step — the same shape the full editor sends. */
export function changeBody(key: WizardKey, f: WizardForm): Record<string, unknown> | null {
  const opt = (s: string) => (s.trim() === "" ? null : s.trim());
  switch (key) {
    case "identity":
      return { identity: { displayName: f.displayName.trim(), city: opt(f.city), stateCode: f.stateCode.trim().toUpperCase(), countryCode: f.countryCode || "US" } };
    case "sport":
      return {
        sport: {
          sport: f.sport.trim(), position: opt(f.position), school: opt(f.school), level: f.level || null,
          gradYear: f.gradYear ? Number(f.gradYear) : null, achievements: opt(f.achievements),
        },
      };
    case "capabilities":
      return { capabilities: { contentCapabilities: [...f.contentCapabilities] } };
    case "interests":
      return { interests: { brandInterests: [...f.brandInterests] } };
    case "restrictions":
      return { restrictions: { restrictedCategories: [...f.restrictedCategories], restrictionNotes: opt(f.restrictionNotes) } };
    default:
      return null;
  }
}

/* ------------------------------------------------------- the public page */

/** Exactly what GET /public/athletes/:slug shows of a profile — the §11
 *  public sections. No legal name, age, rates or restrictions: the
 *  owner's view of their public page must not show more than a sponsor sees. */
export type PublicFace = {
  displayName: string;
  sport: string;
  position: string | null;
  school: string | null;
  city: string | null;
  stateCode: string | null;
  level: string | null;
  achievements: string | null;
  contentCapabilities: string[];
  brandInterests: string[];
  socials: { platform: string; handle: string; followers: number | null; source: string }[];
};

export function publicFace(p: ApiMyProfile): PublicFace {
  return {
    displayName: p.displayName,
    sport: p.sport,
    position: p.position,
    school: p.school,
    city: p.city,
    stateCode: p.stateCode,
    level: p.level,
    achievements: p.achievements,
    contentCapabilities: [...p.contentCapabilities],
    brandInterests: [...p.brandInterests],
    socials: p.socials.map((s) => ({ platform: s.platform, handle: s.handle, followers: s.followers, source: s.source })),
  };
}

/** "Point guard · College" — the line under the name, as the public page writes it. */
export function metaLine(f: Pick<PublicFace, "sport" | "position" | "level">): string {
  const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");
  return [f.sport, f.position, f.level ? words(f.level) : null].filter(Boolean).join(" · ");
}

/** "Lincoln High · Austin, TX" — school and place, as the public page writes it;
    "Arusha, Tanzania" outside the US (POL-FE-117). */
export function placeLine(f: Pick<PublicFace, "school" | "city" | "stateCode"> & { countryCode?: string | null }): string {
  return [f.school, placeWords(f)].filter(Boolean).join(" · ");
}

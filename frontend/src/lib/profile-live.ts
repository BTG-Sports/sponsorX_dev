import type { SectionKey } from "@/lib/profile-sections";

/* --------------------------------------------------------------------------
   P3-FE-03 — the athlete profile's live translation: GET /athletes/me
   (backend/src/routes/v1/athletes.ts) → the §11 section states the §24
   completion meter renders. Pure, like applications-live: `sectionStates`
   and `completion` take data and return answers, no fetch, no clock.

   THE METER MUST NOT FLATTER. §11 lists nine sections; Phase 1 collects
   eight of them ("payment recipient" has no model yet — §26 forbids bank
   details and the recipient row hasn't been built). A section that CANNOT
   be answered is "not-collected" and is excluded from the percentage —
   counting it done would inflate the meter, counting it missing would nag
   the athlete about something they cannot fix.
   -------------------------------------------------------------------------- */

export type ApiSocial = {
  platform: string;
  handle: string;
  followers: number | null;
  avgViews: number | null;
  /** §22 MetricSource — SELF_REPORTED until platform verification lands. */
  source: string;
};

/** What GET /athletes/me answers. */
export type ApiMyProfile = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  city: string | null;
  stateCode: string | null;
  sport: string;
  position: string | null;
  school: string | null;
  level: string | null;
  gradYear: number | null;
  achievements: string | null;
  state: string;
  tier: string | null;
  contentCapabilities: string[];
  brandInterests: string[];
  restrictedCategories: string[];
  restrictionNotes: string | null;
  socials: ApiSocial[];
  ratesConfirmed: number;
  agreementsSigned: number;
  /** 2S1-BE-14 — the sensitive fields the editor shows. */
  birthDate?: string | null;
  ageBand?: string | null;
  guardian?: { legalName: string; verifiedAt: string | null } | null;
};

/** One row of GET /athletes/{id}/rates — the athlete's own pay, in cents
 *  (P3-FE-04). Never shown to sponsors; §7.1 denies them the whole column. */
export type ApiRate = {
  jobId: string;
  jobName: string;
  amount: number;
  version: number;
};

export type SectionState = "done" | "missing" | "not-collected";

/** §11, answered from data — each rule says what "done" means for a section. */
export function sectionStates(p: ApiMyProfile): Record<SectionKey, SectionState> {
  const has = (s: string | null) => Boolean(s && s.trim());
  return {
    identity: has(p.legalName) && has(p.displayName) && (has(p.city) || has(p.stateCode))
      ? "done"
      : "missing",
    sport: has(p.sport) && (has(p.position) || has(p.school) || has(p.level))
      ? "done"
      : "missing",
    socials: p.socials.length > 0 ? "done" : "missing",
    capabilities: p.contentCapabilities.length > 0 ? "done" : "missing",
    interests: p.brandInterests.length > 0 ? "done" : "missing",
    /* Answered, not empty: "no restrictions" is an answer and arrives as
       notes; an empty list with no notes means nobody asked yet. */
    restrictions: p.restrictedCategories.length > 0 || has(p.restrictionNotes)
      ? "done"
      : "missing",
    rates: p.ratesConfirmed > 0 ? "done" : "missing",
    payment: "not-collected",
    agreements: p.agreementsSigned > 0 ? "done" : "missing",
  };
}

/** The meter: done ÷ answerable, whole percent. */
export function completion(states: Record<SectionKey, SectionState>): {
  percent: number;
  missing: SectionKey[];
} {
  const answerable = (Object.keys(states) as SectionKey[]).filter(
    (k) => states[k] !== "not-collected",
  );
  const done = answerable.filter((k) => states[k] === "done");
  return {
    percent: Math.round((100 * done.length) / answerable.length),
    missing: answerable.filter((k) => states[k] === "missing"),
  };
}

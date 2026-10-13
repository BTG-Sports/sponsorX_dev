import { REGION_NAMES } from "./region-names";

/* --------------------------------------------------------------------------
   3S0-FE-01 — a reward's venue: where an in-person reward is handed out
   (3S0-BE-05, Spec §16). The REWARD's location, never the fan's: the fan
   page has no login and records nowhere a fan is.

   Optional, and both-or-neither: a city and a US state together, or neither
   for an online-only reward. The API refuses half a venue
   (backend/src/contracts/reward.ts `venue`), so the creator and the server
   action say so first, in words. The state list mirrors the API's exactly —
   the 50 states and DC (backend/src/domain/onboarding-rules.ts US_STATES),
   no territories — so the select never offers a code the API would refuse.

   Pure: the creator (client), the server action and the tests all import it.
   -------------------------------------------------------------------------- */

export type RewardVenue = { city: string; stateCode: string };

/** The API's US_STATES, in the same order. */
export const VENUE_STATE_CODES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const CODES = new Set(VENUE_STATE_CODES);

/** The select's options, by state name ("Alabama — AL"), A to Z. */
export const VENUE_STATE_OPTIONS: readonly { value: string; label: string }[] = VENUE_STATE_CODES.map((c) => ({
  value: c,
  label: `${REGION_NAMES.US?.[c] ?? c} — ${c}`,
})).sort((a, b) => a.label.localeCompare(b.label));

export const VENUE_CITY_MAX = 120;

export const VENUE_HALF = "Give the venue both a city and a state — or leave both blank for an online-only reward.";

/**
 * The creator's two fields → what the API is sent. Blank and blank is an
 * online-only reward (null); one without the other, a city too long, or a
 * state the API doesn't know is refused with the reason.
 */
export function parseVenue(city: string, stateCode: string): { ok: true; venue: RewardVenue | null } | { ok: false; message: string } {
  const c = (city ?? "").trim();
  const s = (stateCode ?? "").trim().toUpperCase();
  if (!c && !s) return { ok: true, venue: null };
  if (!c || !s) return { ok: false, message: VENUE_HALF };
  if (c.length > VENUE_CITY_MAX) return { ok: false, message: `The venue's city is ${VENUE_CITY_MAX} characters at most.` };
  if (!CODES.has(s)) return { ok: false, message: "Pick the venue's state from the list — US states only." };
  return { ok: true, venue: { city: c, stateCode: s } };
}

/**
 * The server action's check on what the client sent — an untyped value,
 * since a server action is a public endpoint. Absent or null is online-only.
 */
export function checkVenue(v: unknown): { ok: true; venue: RewardVenue | null } | { ok: false; message: string } {
  if (v === undefined || v === null) return { ok: true, venue: null };
  if (typeof v !== "object") return { ok: false, message: VENUE_HALF };
  const o = v as { city?: unknown; stateCode?: unknown };
  return parseVenue(typeof o.city === "string" ? o.city : "", typeof o.stateCode === "string" ? o.stateCode : "");
}

/** "Austin, TX" — or "Online only" when the reward has no venue. */
export function venueLabel(v: RewardVenue | null | undefined): string {
  return v ? `${v.city}, ${v.stateCode}` : "Online only";
}

/* --------------------------------------------------------------------------
   The home page's Featured athletes panel — P8-FE-10.

   It used to show the first four ACTIVE sample athletes (fixtures) with
   "Verified" badges, as if they were real. Now it shows
   GET /public/featured-athletes (P8-BE-08). The backend applies every rule —
   active, a complete profile with a photo, a minor only once a Network
   Manager approves, never one BTG removed — and returns at most four, each
   carrying only what that athlete's public page already shows. The frontend
   only shows what it gets.

   Two rules for showing them, as the network numbers (network-stats.ts):
   - **No read, no panel.** When the API can't be reached the panel hides; it
     never falls back to samples.
   - **An empty list hides the panel.** Nobody qualifying is a real answer.

   Pure, so server pages and tests can share it.
   -------------------------------------------------------------------------- */

/** One row, as `PublicFeaturedAthlete` in backend contracts/home-featured.ts. */
export type PublicFeaturedAthlete = {
  slug: string;
  displayName: string;
  sport: string;
  position: string;
  city: string;
  stateCode: string;
  photoUrl: string;
  followers: number;
  /** The follower count's account is verified; otherwise it is self-reported. */
  verified: boolean;
};

export type PublicFeaturedAthletes = { athletes: PublicFeaturedAthlete[]; readAt: string };

/** The panel shows at most four (the API's own cap, kept here too). */
export const FEATURED_MAX = 4;

const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** The rows to show, in the API's order: well-formed ones only, at most four; [] with no read. */
export function featuredRows(data: PublicFeaturedAthletes | null): PublicFeaturedAthlete[] {
  if (!data || !Array.isArray(data.athletes)) return [];
  return data.athletes
    .filter(
      (a) =>
        a &&
        text(a.slug) &&
        text(a.displayName) &&
        text(a.photoUrl) &&
        Number.isFinite(a.followers) &&
        a.followers >= 0,
    )
    .slice(0, FEATURED_MAX);
}

/** "842", "12.8K", "128K", "1.4M", "2.1B" — the follower figure as the panel prints it. */
export function followersLabel(n: number): string {
  if (n >= 1_000_000_000) return `${trim(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(Math.round(n));
}

/** One decimal under 100, none from 100 up; never a trailing ".0". */
function trim(v: number): string {
  const s = v < 100 ? (Math.floor(v * 10) / 10).toFixed(1) : String(Math.floor(v));
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** "Basketball · Guard": sport and position, either one alone when the other is blank. */
export function sportLine(a: Pick<PublicFeaturedAthlete, "sport" | "position">): string {
  return [a.sport, a.position].filter(text).join(" · ");
}

/** "Laurel, MD" — city and state, either one alone when the other is blank. */
export function placeLine(a: Pick<PublicFeaturedAthlete, "city" | "stateCode">): string {
  return [a.city, a.stateCode].filter(text).join(", ");
}

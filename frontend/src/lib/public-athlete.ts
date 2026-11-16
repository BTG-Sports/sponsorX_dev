/** GET /public/athletes/:slug — what a stranger may read about an athlete. */
export type PublicAthlete = {
  slug: string;
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
  /** POL-FE-82 — null for a minor until BTG approved the photo, and for a featured athlete. */
  photoUrl?: string | null;
  /** "YYYY-MM" the athlete joined the network; null for a featured athlete. */
  memberSince?: string | null;
  /** What they have done on SponsorX — counts only; null for a featured athlete. */
  track?: PublicTrack | null;
  featured: boolean;
  claimable: boolean;
};

export type PublicTrack = {
  campaignsCompleted: number;
  brands: number;
  postsLive: number;
  postsVerified: number;
  onTime: { onTime: number; of: number };
  fanRedemptions: number;
  recent: { platform: string | null; month: string; verified: boolean }[];
};

/* --------------------------------------------------------------------------
   POL-FE-82 — the words and numbers of an ACTIVE athlete's public page.

   Pure, so tests read it directly. Every figure comes from what
   GET /public/athletes/:slug sends (Postgres counts and the athlete's social
   rows with their provenance); nothing here estimates, rounds up or invents.
   A badge is shown only when the data earns it, and each says why in one
   sentence a stranger understands.
   -------------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" → "Sep 2026"; anything else → null. */
export function monthLabel(ym: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? "");
  if (!m) return null;
  const i = Number(m[2]) - 1;
  return i >= 0 && i < 12 ? `${MONTHS[i]} ${m[1]}` : null;
}

export const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] || displayName;

/** "HIGH_SCHOOL" → "High school". */
export const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");

const PLATFORM_NAMES: Record<string, string> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube", X: "X" };
export const platformName = (p: string | null | undefined) => (p ? (PLATFORM_NAMES[p.toUpperCase()] ?? words(p)) : "Social post");

/** Compact count for a big stat: 1,240 → "1.2K", 2,400,000 → "2.4M". */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${trim1(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${trim1(n / 1000)}K`;
  return String(n);
}
const trim1 = (x: number) => (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, "");

export type Reach = {
  total: number;
  /** True when every counted number was checked (platform or manual); false if any is self-reported. */
  allVerified: boolean;
  /** Each account's share of the total, 0–1, in the API's order. */
  rows: { platform: string; handle: string; followers: number | null; source: string; share: number }[];
};

const VERIFIED = new Set(["VERIFIED_API", "VERIFIED_MANUAL", "VERIFIED_SYSTEM"]);

/** Total followers across listed accounts, and whether all of it is verified. */
export function reach(socials: PublicAthlete["socials"]): Reach {
  const counted = socials.filter((s) => typeof s.followers === "number" && s.followers > 0);
  const total = counted.reduce((sum, s) => sum + (s.followers ?? 0), 0);
  return {
    total,
    allVerified: counted.length > 0 && counted.every((s) => VERIFIED.has(s.source)),
    rows: socials.map((s) => ({ ...s, handle: s.handle.replace(/^@/, ""), share: total > 0 && s.followers ? s.followers / total : 0 })),
  };
}

/** On-time share as a whole percent, or null with fewer than one dated live post. */
export function onTimePercent(t: PublicTrack | null | undefined): number | null {
  if (!t || t.onTime.of === 0) return null;
  return Math.round((t.onTime.onTime / t.onTime.of) * 100);
}

export type BadgeTone = "accent" | "primary" | "success" | "next";
export type EarnedBadge = { id: string; label: string; short: string; why: string; tone: BadgeTone };

/**
 * The stickers on the page. Earned from data only, most impressive first.
 * A newcomer gets one honest badge ("New on SponsorX") rather than none.
 */
export function earnedBadges(a: Pick<PublicAthlete, "displayName" | "track" | "socials">): EarnedBadge[] {
  const t = a.track;
  const first = firstName(a.displayName);
  const out: EarnedBadge[] = [];
  const pct = onTimePercent(t);
  if (t && pct !== null && t.onTime.of >= 3 && pct >= 90) {
    out.push({ id: "on-time", label: "Always on time", short: `${pct}%`, tone: "success", why: `${pct}% of ${first}'s posts went up by their due date.` });
  }
  if (t && t.campaignsCompleted >= 1) {
    out.push({ id: "campaigns", label: "Campaign pro", short: String(t.campaignsCompleted), tone: "accent", why: `${first} has completed ${plural(t.campaignsCompleted, "campaign")} on SponsorX.` });
  }
  if (t && t.brands >= 2) {
    out.push({ id: "brands", label: "Trusted by brands", short: String(t.brands), tone: "primary", why: `${plural(t.brands, "brand")} have worked with ${first}.` });
  }
  if (t && t.postsVerified >= 1) {
    out.push({ id: "verified", label: "Verified creator", short: "✓", tone: "success", why: `${plural(t.postsVerified, "post")} checked live on the platform by SponsorX.` });
  }
  if (t && t.fanRedemptions >= 1) {
    out.push({ id: "fans", label: "Fan favourite", short: compact(t.fanRedemptions), tone: "next", why: `Fans redeemed ${plural(t.fanRedemptions, "reward")} through ${first}'s codes.` });
  }
  if (out.length === 0) {
    out.push({ id: "new", label: "New on SponsorX", short: "★", tone: "primary", why: `${first} is approved and ready for a first campaign.` });
  }
  return out;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * The one-sentence story at the top of the track record, in plain words.
 * Says only what the counts say.
 */
export function storyLine(a: Pick<PublicAthlete, "displayName" | "track">): string {
  const first = firstName(a.displayName);
  const t = a.track;
  if (!t || (t.campaignsCompleted === 0 && t.postsLive === 0)) {
    return `${first} is new on SponsorX: approved, ready, and looking for a first campaign.`;
  }
  const parts: string[] = [];
  if (t.campaignsCompleted > 0) parts.push(`completed ${plural(t.campaignsCompleted, "campaign")}`);
  if (t.brands > 0) parts.push(`worked with ${plural(t.brands, "brand")}`);
  if (t.postsLive > 0) parts.push(`put ${plural(t.postsLive, "sponsored post")} live`);
  const pct = onTimePercent(t);
  const tail = pct !== null ? `, ${pct}% of them on time` : "";
  return `${first} has ${joinAnd(parts)}${t.postsLive > 0 ? tail : ""}.`;
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}

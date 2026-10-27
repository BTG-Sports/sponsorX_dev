/**
 * The home page's Featured athletes rules — P8-BE-08. Pure: no database, no
 * storage, so the contracts and the tests read them directly. The reads and
 * BTG's controls that apply them are in home-featured.ts, which explains each
 * rule.
 */
import { isMinorBand, isMinorOn } from "./guardian-rules";

export const HOME_FEATURED_MAX = 4;
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The public profile fields the panel needs, in the order a screen lists them. */
export const HOME_REQUIRED = [
  "photo", "displayName", "sport", "position", "level", "school", "city", "state",
  "achievements", "contentCapabilities", "brandInterests", "socialFollowers",
] as const;
export type HomeMissing = (typeof HOME_REQUIRED)[number];

/** Why an athlete is off the home page; empty when they qualify. */
export type HomeBlock = "not_active" | "incomplete" | "minor_not_approved" | "removed";

export const HOME_ACTIONS = ["pin", "unpin", "remove", "restore", "approve", "unapprove"] as const;
export type HomeAction = (typeof HOME_ACTIONS)[number];

/** The athlete fields every rule reads. */
export type HomeCandidate = {
  id: string;
  slug: string;
  state: string;
  displayName: string;
  sport: string;
  position: string | null;
  level: string | null;
  school: string | null;
  city: string | null;
  stateCode: string | null;
  achievements: string | null;
  contentCapabilities: string[];
  brandInterests: string[];
  birthDate: Date | null;
  ageBand: string | null;
  majorityAge: number;
  photoKey: string | null;
  homePinnedAt: Date | null;
  homeRemovedAt: Date | null;
  homeApprovedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  socials: { followers: number | null; source: string }[];
};

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** Which required public fields are missing. Pure. */
export function missingForHome(a: HomeCandidate): HomeMissing[] {
  const has: Record<HomeMissing, boolean> = {
    photo: filled(a.photoKey),
    displayName: filled(a.displayName),
    sport: filled(a.sport),
    position: filled(a.position),
    level: filled(a.level),
    school: filled(a.school),
    city: filled(a.city),
    state: filled(a.stateCode),
    achievements: filled(a.achievements),
    contentCapabilities: a.contentCapabilities.length > 0,
    brandInterests: a.brandInterests.length > 0,
    socialFollowers: a.socials.some((s) => (s.followers ?? 0) > 0),
  };
  return HOME_REQUIRED.filter((f) => !has[f]);
}

/** A minor for the home page: under majority by date or band — or no age at all. Pure. */
export function minorForHome(a: Pick<HomeCandidate, "birthDate" | "ageBand" | "majorityAge">, now: Date): boolean {
  if (!a.birthDate && !a.ageBand) return true;
  return isMinorOn(a.birthDate, now, a.majorityAge) || isMinorBand(a.ageBand);
}

/** The verdict for one athlete. Pure. */
export function homeVerdict(a: HomeCandidate, now: Date) {
  const missing = missingForHome(a);
  const minor = minorForHome(a, now);
  const blocks: HomeBlock[] = [];
  if (a.state !== "ACTIVE") blocks.push("not_active");
  if (missing.length) blocks.push("incomplete");
  if (minor && !a.homeApprovedAt) blocks.push("minor_not_approved");
  if (a.homeRemovedAt) blocks.push("removed");
  return { eligible: blocks.length === 0, blocks, missing, minor };
}

const time = (d: Date | null | undefined) => (d ? d.getTime() : -Infinity);

/** Pinned first (oldest pin first), then latest verified post, then latest approval. Pure. */
export function rankForHome<T extends Pick<HomeCandidate, "id" | "homePinnedAt" | "reviewedAt" | "createdAt">>(
  eligible: T[],
  lastVerified: Map<string, Date>,
): T[] {
  return [...eligible].sort((x, y) => {
    if (x.homePinnedAt || y.homePinnedAt) {
      if (!x.homePinnedAt) return 1;
      if (!y.homePinnedAt) return -1;
      if (x.homePinnedAt.getTime() !== y.homePinnedAt.getTime()) return x.homePinnedAt.getTime() - y.homePinnedAt.getTime();
    }
    const v = time(lastVerified.get(y.id)) - time(lastVerified.get(x.id));
    if (v) return v;
    const r = time(y.reviewedAt ?? y.createdAt) - time(x.reviewedAt ?? x.createdAt);
    return r || x.id.localeCompare(y.id);
  });
}

const VERIFIED_SOURCES = new Set(["VERIFIED_API", "VERIFIED_MANUAL"]);

/** The panel's follower figure: the largest count, and whether that account is verified. Pure. */
export function followerFigure(socials: HomeCandidate["socials"]): { followers: number; verified: boolean } {
  const top = [...socials].filter((s) => (s.followers ?? 0) > 0).sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))[0];
  return { followers: top?.followers ?? 0, verified: !!top && VERIFIED_SOURCES.has(top.source) };
}

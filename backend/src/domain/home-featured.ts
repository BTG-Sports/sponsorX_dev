/**
 * The home page's Featured athletes panel — P8-BE-08.
 *
 * The panel showed the first four ACTIVE fixtures on sponsorx.net, with
 * "Verified" badges, as if they were real athletes. This is the read that
 * replaces them, and the rules for who may be on it (decided by the user,
 * 2026-10-27). The frontend applies none of them; it shows what it gets.
 *
 * AN ATHLETE APPEARS ONLY IF EVERY ONE OF THESE HOLDS — miss one and they are off
 * (the checks themselves are pure, in home-featured-rules.ts):
 *   1. ACTIVE. Featured (editorial), suspended and pending athletes never.
 *   2. A COMPLETE PUBLIC PROFILE: a profile photo, and every public field —
 *      display name, sport, position, level, school, city, state,
 *      achievements, at least one content capability, at least one brand
 *      interest, and a social account with a follower count.
 *   3. AN ADULT, OR A MINOR A PERSON APPROVED. A minor (under their place's
 *      age of majority by birth date, or by age band) appears only after a
 *      Network Manager approves them for the home page. NO AGE AT ALL COUNTS
 *      AS A MINOR here, stricter than guardian-rules.ts, because a public
 *      page is where guessing wrong about a child costs most. A minor's
 *      guardian has already signed off: a minor can't be ACTIVE without it.
 *   4. NOT REMOVED by BTG.
 *
 * WHICH FOUR: pinned athletes first, oldest pin first; then the most recent
 * verified post, then the most recently approved. At most four, and an empty
 * list when nobody qualifies — the panel hides; nothing falls back to samples.
 *
 * WHAT LEAVES: what the athlete's public page already shows, and less — name,
 * slug, sport, position, city, state, the photo, and the largest follower
 * count with whether it is verified. No school, age, rates or ids.
 *
 * WHO CONTROLS IT: approve on `athlete` held tenant-wide — BTG_ADMIN,
 * NETWORK_MGR, SUPER_ADMIN. The photo is the athlete's own edit (athlete
 * write: the athlete, a minor's guardian, BTG). Every change is audited.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { presignPublicUpload, publicObjectHead, publicObjectUrl } from "../lib/storage";
import {
  followerFigure, HOME_FEATURED_MAX, homeVerdict, MAX_PHOTO_BYTES, minorForHome, PHOTO_TYPES, rankForHome,
  type HomeAction, type HomeBlock, type HomeCandidate, type HomeMissing,
} from "./home-featured-rules";

export class HomeFeatureError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "HomeFeatureError";
    this.status = status;
  }
}

const CANDIDATE = {
  id: true, slug: true, state: true, displayName: true, sport: true, position: true, level: true, school: true,
  city: true, stateCode: true, achievements: true, contentCapabilities: true, brandInterests: true,
  birthDate: true, ageBand: true, majorityAge: true, photoKey: true,
  homePinnedAt: true, homeRemovedAt: true, homeApprovedAt: true, reviewedAt: true, createdAt: true,
  socials: { select: { followers: true, source: true } },
} as const;

export type PublicFeaturedAthlete = {
  slug: string;
  displayName: string;
  sport: string;
  position: string;
  city: string;
  stateCode: string;
  photoUrl: string;
  followers: number;
  verified: boolean;
};

async function lastVerifiedPosts(tenantId: string, athleteIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (!athleteIds.length) return out;
  const rows = await prisma.deliverable.findMany({
    /* tenant-scope: the caller's tenant, passed in. */
    where: { tenantId, state: "VERIFIED", publishedAt: { not: null }, order: { athleteId: { in: athleteIds } } },
    select: { publishedAt: true, order: { select: { athleteId: true } } },
  });
  for (const r of rows) {
    const prev = out.get(r.order.athleteId);
    if (!prev || r.publishedAt! > prev) out.set(r.order.athleteId, r.publishedAt!);
  }
  return out;
}

/** The ranked, qualifying athletes of a tenant — the panel's list before it is shaped for the public. */
async function rankedHomeAthletes(tenantId: string, now: Date): Promise<HomeCandidate[]> {
  const rows = await prisma.athlete.findMany({
    /* tenant-scope: the public read passes the configured public tenant; staff reads pass their own. */
    where: { tenantId, state: "ACTIVE", homeRemovedAt: null, photoKey: { not: null } },
    select: CANDIDATE,
  });
  const eligible = rows.filter((a) => homeVerdict(a, now).eligible);
  return rankForHome(eligible, await lastVerifiedPosts(tenantId, eligible.map((a) => a.id))).slice(0, HOME_FEATURED_MAX);
}

/** GET /public/featured-athletes — the panel's list, pinned to the public tenant. */
export async function readHomeFeatured(
  tenantId: string,
  now: Date = new Date(),
): Promise<{ athletes: PublicFeaturedAthlete[]; readAt: string }> {
  const athletes = (await rankedHomeAthletes(tenantId, now)).map((a) => ({
    slug: a.slug,
    displayName: a.displayName,
    sport: a.sport,
    position: a.position!,
    city: a.city!,
    stateCode: a.stateCode!,
    photoUrl: publicObjectUrl(a.photoKey!),
    ...followerFigure(a.socials),
  }));
  return { athletes, readAt: now.toISOString() };
}

async function findInTenant(actor: Actor, athleteId: string): Promise<HomeCandidate> {
  const a = await prisma.athlete.findFirst({ where: { tenantId: actor.tenantId, id: athleteId }, select: CANDIDATE });
  if (!a) throw new HomeFeatureError("No athlete matches.", 404);
  return a;
}

export type HomeFeatureStatus = {
  athleteId: string;
  onHomePage: boolean;
  eligible: boolean;
  blocks: HomeBlock[];
  missing: HomeMissing[];
  minor: boolean;
  pinned: boolean;
  removed: boolean;
  approved: boolean;
  photoUrl: string | null;
};

/** GET /athletes/:id/home-page — BTG's view: on the home page now, and if not, why. */
export async function homeFeatureStatus(actor: Actor, athleteId: string, now: Date = new Date()): Promise<HomeFeatureStatus> {
  assertTenantWide(actor, "athlete", "approve");
  const a = await findInTenant(actor, athleteId);
  const v = homeVerdict(a, now);
  const shown = v.eligible && (await rankedHomeAthletes(actor.tenantId, now)).some((x) => x.id === a.id);
  return {
    athleteId: a.id,
    onHomePage: shown,
    eligible: v.eligible,
    blocks: v.blocks,
    missing: v.missing,
    minor: v.minor,
    pinned: !!a.homePinnedAt,
    removed: !!a.homeRemovedAt,
    approved: !!a.homeApprovedAt,
    photoUrl: a.photoKey ? publicObjectUrl(a.photoKey) : null,
  };
}

/** POST /athletes/:id/home-page — pin, unpin, remove, restore, approve or unapprove. Audited. */
export async function setHomeFeature(
  actor: Actor,
  athleteId: string,
  action: HomeAction,
  now: Date = new Date(),
): Promise<HomeFeatureStatus> {
  assertTenantWide(actor, "athlete", "approve");
  const a = await findInTenant(actor, athleteId);
  const before = { homePinnedAt: a.homePinnedAt, homeRemovedAt: a.homeRemovedAt, homeApprovedAt: a.homeApprovedAt };
  let data: Partial<typeof before>;
  switch (action) {
    case "pin":
      if (a.homeRemovedAt) throw new HomeFeatureError("This athlete was removed from the home page — restore them first.");
      data = { homePinnedAt: a.homePinnedAt ?? now };
      break;
    case "unpin":
      data = { homePinnedAt: null };
      break;
    case "remove":
      data = { homeRemovedAt: a.homeRemovedAt ?? now, homePinnedAt: null };
      break;
    case "restore":
      data = { homeRemovedAt: null };
      break;
    case "approve":
      if (!minorForHome(a, now)) throw new HomeFeatureError("Only an athlete under 18, or with no age on file, needs approval for the home page.");
      data = { homeApprovedAt: a.homeApprovedAt ?? now };
      break;
    case "unapprove":
      data = { homeApprovedAt: null };
      break;
  }
  await prisma.$transaction(async (tx) => {
    await tx.athlete.updateMany({ where: { id: a.id, tenantId: actor.tenantId }, data });
    await audit(tx, actor, AUDIT_ACTIONS.homePage[action], "Athlete", a.id, { before, after: { ...before, ...data } });
  });
  return homeFeatureStatus(actor, a.id, now);
}

export const photoPrefix = (tenantId: string, athleteId: string) => `athletes/${tenantId}/${athleteId}/`;

/** The profile photo's CDN address, or null — for reads that show it (GET /athletes/me, P8-FE-10).
 *  Built here so the public bucket stays reached from this file and branding.ts alone. */
export const athletePhotoUrl = (photoKey: string | null): string | null => (photoKey ? publicObjectUrl(photoKey) : null);

/** The athlete row this actor may edit, or a 404 — never a hint that it exists. */
async function editable(actor: Actor, athleteId: string) {
  const a = await prisma.athlete.findFirst({
    where: { ...whereFor(actor, "athlete", "write"), id: athleteId },
    select: { id: true, tenantId: true, photoKey: true, birthDate: true, ageBand: true, majorityAge: true, homeApprovedAt: true },
  });
  if (!a) throw new HomeFeatureError("No athlete matches.", 404);
  return a;
}

/** POST /athletes/:id/photo — a public-bucket upload grant for a new profile photo. */
export async function requestPhotoUpload(
  actor: Actor,
  athleteId: string,
  input: { contentType: string; bytes: number },
): Promise<{ photoKey: string; uploadUrl: string; photoUrl: string }> {
  const a = await editable(actor, athleteId);
  if (!(input.contentType in PHOTO_TYPES)) throw new HomeFeatureError("A profile photo is JPEG, PNG or WebP.", 422);
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_PHOTO_BYTES) {
    throw new HomeFeatureError("A profile photo is at most 5 MB.", 422);
  }
  const ext = PHOTO_TYPES[input.contentType as keyof typeof PHOTO_TYPES];
  const photoKey = `${photoPrefix(a.tenantId, a.id)}photo-${randomBytes(8).toString("hex")}.${ext}`;
  /* 2S8-SEC-02 — the CDN serves whatever lands here, so the PUT is pinned to
     the declared type and size, as the tenant logo's is (branding.ts). */
  const uploadUrl = await presignPublicUpload(photoKey, input.contentType, { signContentType: true, contentLength: input.bytes });
  return { photoKey, uploadUrl, photoUrl: publicObjectUrl(photoKey) };
}

/** PUT /athletes/:id/photo — use an uploaded photo, or clear it with null. Audited. */
export async function setAthletePhoto(
  actor: Actor,
  athleteId: string,
  photoKey: string | null,
  now: Date = new Date(),
): Promise<{ photoUrl: string | null }> {
  const a = await editable(actor, athleteId);
  if (photoKey !== null) {
    if (!photoKey.startsWith(photoPrefix(a.tenantId, a.id)) || photoKey.includes("..")) {
      throw new HomeFeatureError("photoKey: not this athlete's upload — request one with POST /athletes/{id}/photo.", 422);
    }
    if (!(await publicObjectHead(photoKey))) throw new HomeFeatureError("That photo hasn't arrived yet — upload it, then confirm.");
  }
  /* A minor's approval was for the photo a person saw; a new one goes back to them. */
  const resetApproval = photoKey !== a.photoKey && minorForHome(a, now) && !!a.homeApprovedAt;
  const data = { photoKey, ...(resetApproval ? { homeApprovedAt: null } : {}) };
  await prisma.$transaction(async (tx) => {
    await tx.athlete.updateMany({ where: { id: a.id, tenantId: a.tenantId }, data });
    await audit(tx, actor, AUDIT_ACTIONS.homePage.photoSet, "Athlete", a.id, {
      before: { photoKey: a.photoKey, homeApprovedAt: a.homeApprovedAt },
      after: { photoKey, homeApprovedAt: resetApproval ? null : a.homeApprovedAt },
    });
  });
  return { photoUrl: photoKey ? publicObjectUrl(photoKey) : null };
}

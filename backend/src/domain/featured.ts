/**
 * Featured athletes and the claim flow — P9-BE-11, spec v2.0 §5.4.
 *
 * BEING FEATURED IS NOT BEING REPRESENTED. Editorial creates a FEATURED
 * athlete to write about them; nobody applied, nobody consented to be
 * marketed, and the profile is read-only. A featured athlete has a public
 * profile and nothing else: no rates (athlete-rate.ts refuses), no
 * invitations and no matching (both require ACTIVE).
 *
 * THE CLAIM needs three assertions:
 *   1. the athlete: "that's me" — `submitClaim`, public, no login;
 *   2. the school: roster match plus the advisor's verification —
 *      `verifyClaim`, which takes the profile into ordinary review;
 *   3. a guardian, for a minor: their COMMERCIAL authorisation, recorded as
 *      consent with the athlete as the subject (content-rights.ts
 *      `recordSubjectConsent`). Activation refuses without it (athlete.ts).
 *
 * GPA IS NOT HERE. A minor's academic record on a public page is its own
 * data-protection decision (spec §14 gate 3); nothing in this file or the
 * schema holds one.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { scopeFor } from "../auth/policy";
import { ForbiddenError } from "../auth/errors";
import { transitionAthleteIn } from "./athlete";
import { readPage, type PageRequest } from "../lib/paging";
/* The claim's name match — shared with P9-BE-20's roster approval. */
import { norm } from "./name-match";

export class FeaturedError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "FeaturedError";
    this.status = status;
  }
}

export class ProfileNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("No public profile matches.");
    this.name = "ProfileNotFoundError";
  }
}

/** Editorial features an athlete. No email, no consent, no rates. */
export async function createFeaturedAthlete(
  actor: Actor,
  input: { displayName: string; sport: string; propertyId: string; stateCode?: string | null; position?: string | null },
): Promise<{ id: string; slug: string }> {
  assertTenantWide(actor, "athlete", "write");
  return prisma.$transaction(async (tx) => {
    const school = await tx.property.findFirst({ where: { tenantId: actor.tenantId, id: input.propertyId }, select: { id: true, name: true } });
    if (!school) throw new ForbiddenError("property", "read");
    const slug = `${norm(input.displayName).replace(/ /g, "-") || "athlete"}-${randomBytes(3).toString("hex")}`;
    const athlete = await tx.athlete.create({
      data: {
        tenantId: actor.tenantId, slug, state: "FEATURED",
        /* Until claimed, the only name editorial has is the one it prints. */
        legalName: input.displayName, displayName: input.displayName, email: null,
        sport: input.sport, propertyId: school.id, school: school.name,
        stateCode: input.stateCode ?? null, position: input.position ?? null,
      },
      select: { id: true, slug: true },
    });
    await audit(tx, actor, "athlete.feature", "Athlete", athlete.id, { after: { state: "FEATURED", propertyId: school.id } });
    return athlete;
  });
}

/**
 * GET /public/athletes/:slug — the public profile. FEATURED and ACTIVE only,
 * and only what a stranger may read: never the legal name, email, date of
 * birth, age band or anything academic.
 */
export async function publicProfile(slug: string) {
  /* A NUL byte can never be a slug, and Postgres refuses it (QA pass 7, F-1). */
  if (slug.includes("\0")) throw new ProfileNotFoundError();
  const a = await prisma.athlete.findFirst({
    /* tenant-scope: public profile — the slug is globally unique and the page is public by design. */
    where: { slug, state: { in: ["FEATURED", "ACTIVE"] } },
    /* P3-FE-08 (2026-09-29): an ACTIVE athlete's page renders from this, so
       it carries the §11 PUBLIC sections — identity (display name, place),
       sport, socials with their provenance label, capabilities, interests.
       Private ones (restrictions, rates, agreements) never leave the tenant,
       and nothing here says an age: no birth date, band or graduation year.
       Minors follow the same rule as everyone. */
    select: {
      slug: true, displayName: true, sport: true, position: true, school: true, city: true, stateCode: true, level: true,
      achievements: true, contentCapabilities: true, brandInterests: true, state: true,
      socials: { select: { platform: true, handle: true, followers: true, source: true }, orderBy: { platform: "asc" } },
    },
  });
  if (!a) throw new ProfileNotFoundError();
  const { state, ...profile } = a;
  /* The one thing a featured page must say: this is editorial, not an
     endorsement — and "claim this profile" is the only action on it. */
  return { ...profile, featured: state === "FEATURED", claimable: state === "FEATURED" };
}

/**
 * "That's me" — PUBLIC, no login. Records the claim and checks it against
 * the school's roster; the answer to that check is kept for the advisor and
 * never returned, because "your name is on this school's list of minors" is
 * not something to tell an anonymous caller.
 */
export async function submitClaim(
  slug: string,
  input: { claimantName: string; claimantEmail: string; birthDate?: Date | null; ageBand?: string | null },
): Promise<{ id: string; state: "SUBMITTED" }> {
  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      /* tenant-scope: public claim — the athlete's own tenant is stamped onto the claim. */
      where: { slug, state: "FEATURED" },
      select: { id: true, tenantId: true, propertyId: true },
    });
    if (!athlete) throw new ProfileNotFoundError();
    const roster = athlete.propertyId
      ? await tx.rosterEntry.findMany({
          where: { tenantId: athlete.tenantId, propertyId: athlete.propertyId },
          select: { legalName: true },
        })
      : [];
    const rosterMatched = roster.some((r) => norm(r.legalName) === norm(input.claimantName));
    const claim = await tx.athleteClaim.create({
      data: {
        tenantId: athlete.tenantId, athleteId: athlete.id, claimantName: input.claimantName,
        claimantEmail: input.claimantEmail.toLowerCase(), birthDate: input.birthDate ?? null,
        ageBand: input.ageBand ?? null, rosterMatched,
      },
      select: { id: true },
    });
    return { id: claim.id, state: "SUBMITTED" };
  });
}

const CLAIM_SELECT = { id: true, athleteId: true, claimantName: true, claimantEmail: true, rosterMatched: true, state: true, createdAt: true } as const;
export const CLAIM_STATES = ["SUBMITTED", "VERIFIED", "REJECTED"] as const;
export type ClaimStateName = (typeof CLAIM_STATES)[number];

export async function listClaims(actor: Actor) {
  assertAllowed(actor, "athleteClaim", "read");
  return prisma.athleteClaim.findMany({
    where: { ...whereFor(actor, "athleteClaim", "read") },
    select: CLAIM_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * GET /claims?page= — one page of the caller's claims, optionally narrowed
 * to states, plus the open (SUBMITTED) and total counts — counted in the
 * database with the same scope, not folded over every row (2026-09-29).
 */
export async function listClaimsPage(actor: Actor, req: PageRequest, opts: { states?: ClaimStateName[] } = {}) {
  assertAllowed(actor, "athleteClaim", "read");
  const where = opts.states?.length
    ? { ...whereFor(actor, "athleteClaim", "read"), state: { in: opts.states } }
    : { ...whereFor(actor, "athleteClaim", "read") };
  const [{ rows, page }, open, all] = await Promise.all([
    readPage(
      req,
      () => prisma.athleteClaim.count({ where: { ...where } }),
      (skip, take) =>
        prisma.athleteClaim.findMany({ where: { ...where }, select: CLAIM_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
    ),
    prisma.athleteClaim.count({ where: { ...whereFor(actor, "athleteClaim", "read"), state: "SUBMITTED" } }),
    prisma.athleteClaim.count({ where: { ...whereFor(actor, "athleteClaim", "read") } }),
  ]);
  return { claims: rows, page, summary: { open, all } };
}

/**
 * The school's assertion: the roster matches AND the advisor confirms it.
 * The claimant's details become the athlete's, and the profile leaves
 * FEATURED for ordinary review — from here it is an application like any
 * other, and a minor's activation still needs their guardian's COMMERCIAL
 * authorisation.
 */
export async function verifyClaim(actor: Actor, claimId: string): Promise<{ athleteId: string; state: "UNDER_REVIEW" }> {
  assertAllowed(actor, "athleteClaim", "approve");
  return prisma.$transaction(async (tx) => {
    const claim = await tx.athleteClaim.findFirst({
      where: { ...whereFor(actor, "athleteClaim", "approve"), id: claimId },
      select: { id: true, state: true, athleteId: true, rosterMatched: true, claimantName: true, claimantEmail: true, birthDate: true, ageBand: true },
    });
    if (!claim) throw new ForbiddenError("athleteClaim", "approve");
    if (claim.state !== "SUBMITTED") throw new FeaturedError(`This claim was already ${claim.state.toLowerCase()}.`);
    if (!claim.rosterMatched) throw new FeaturedError("The claimant is not on the school's roster; the school cannot verify this claim.");

    await tx.athlete.update({
      where: { id: claim.athleteId },
      data: { legalName: claim.claimantName, email: claim.claimantEmail, birthDate: claim.birthDate, ageBand: claim.ageBand },
      select: { id: true },
    });
    /* The permission was the advisor's (athleteClaim.approve, checked above);
       the move itself goes through the one function that changes an
       athlete's state, as a system transition — which can never activate. */
    await transitionAthleteIn(tx, { system: true, tenantId: actor.tenantId, userId: null }, claim.athleteId, "UNDER_REVIEW");
    await tx.athleteClaim.update({
      where: { id: claimId }, data: { state: "VERIFIED", verifiedBy: actor.userId, verifiedAt: new Date() }, select: { id: true },
    });
    /* Only one claim can succeed on a profile. */
    await tx.athleteClaim.updateMany({
      where: { tenantId: actor.tenantId, athleteId: claim.athleteId, state: "SUBMITTED", id: { not: claimId } },
      data: { state: "REJECTED" },
    });
    await audit(tx, actor, "athleteClaim.verify", "Athlete", claim.athleteId, { after: { claimId } });
    return { athleteId: claim.athleteId, state: "UNDER_REVIEW" };
  });
}

export async function rejectClaim(actor: Actor, claimId: string): Promise<{ id: string; state: "REJECTED" }> {
  assertAllowed(actor, "athleteClaim", "approve");
  return prisma.$transaction(async (tx) => {
    const claim = await tx.athleteClaim.findFirst({
      where: { ...whereFor(actor, "athleteClaim", "approve"), id: claimId }, select: { id: true, state: true, athleteId: true },
    });
    if (!claim) throw new ForbiddenError("athleteClaim", "approve");
    if (claim.state !== "SUBMITTED") throw new FeaturedError(`This claim was already ${claim.state.toLowerCase()}.`);
    await tx.athleteClaim.update({ where: { id: claimId }, data: { state: "REJECTED" }, select: { id: true } });
    await audit(tx, actor, "athleteClaim.reject", "Athlete", claim.athleteId, { after: { claimId } });
    return { id: claimId, state: "REJECTED" };
  });
}

/** The school supplies its roster: names and graduation years only. */
export async function addRosterEntries(
  actor: Actor,
  propertyId: string,
  entries: Array<{ legalName: string; gradYear?: number | null }>,
): Promise<{ added: number }> {
  assertAllowed(actor, "rosterEntry", "write");
  /* No row to filter before it exists: an advisor's scope is their school. */
  if (scopeFor(actor.roles, "rosterEntry", "write") === "own-property" && actor.propertyId !== propertyId) {
    throw new ForbiddenError("rosterEntry", "write");
  }
  return prisma.$transaction(async (tx) => {
    const school = await tx.property.findFirst({ where: { tenantId: actor.tenantId, id: propertyId, kind: "SCHOOL" }, select: { id: true } });
    if (!school) throw new ForbiddenError("rosterEntry", "write");
    const out = await tx.rosterEntry.createMany({
      data: entries.map((e) => ({ tenantId: actor.tenantId, propertyId, legalName: e.legalName, gradYear: e.gradYear ?? null })),
    });
    await audit(tx, actor, "rosterEntry.add", "Property", propertyId, { after: { count: out.count } });
    return { added: out.count };
  });
}

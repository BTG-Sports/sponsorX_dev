/**
 * A property manager's own property — P9-OPS-01, §8 property portal.
 *
 * A participating NEXT school is a `Property` with kind SCHOOL (spec §3) —
 * no new model — and its advisor signs in as that property's PROPERTY_MGR.
 * This is the read the property portal starts from: which property is mine.
 *
 * Scoped by `whereFor`, so the answer is the property the actor's own User
 * row is linked to, in the actor's own tenant, and never another.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { whereFor } from "../auth/scope";
import { isMinorOn } from "./guardian-rules";

export type OwnProperty = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  city: string | null;
  stateCode: string | null;
};

export class NoPropertyError extends Error {
  readonly status = 404;
  constructor() {
    super("This account is not linked to a property.");
    this.name = "NoPropertyError";
  }
}

export async function getOwnProperty(actor: Actor): Promise<OwnProperty> {
  /* No property link means no property — not "the first one in the tenant".
     BTG staff hold own-tenant here, and without this guard the query below
     would hand them an arbitrary one. */
  if (!actor.propertyId) throw new NoPropertyError();
  const property = await prisma.property.findFirst({
    where: { ...whereFor(actor, "property", "read"), id: actor.propertyId },
    select: { id: true, slug: true, name: true, kind: true, city: true, stateCode: true },
  });
  if (!property) throw new NoPropertyError();
  return property;
}

/* --------------------------------------------------------------------------
   The public property profile — §9 screen 5, P2-FE-01.

   PUBLIC, no login, like /public/athletes/:slug: the slug is globally unique
   and the page exists to be read by a sponsor who is not yet a customer.

   The roster is the part that needs care. Each athlete listed is already
   public on their own (FEATURED / ACTIVE, the same rule and the same field
   list as `publicProfile`), but a school's page naming its minors in one place
   is new exposure that no individual profile creates. So an athlete is NAMED
   only when they are CONFIRMED adult — a date of birth 18+ years ago, or the
   18_PLUS band. Everyone else, minor or age unknown, is counted, not named.
   (QA pass 9: the first version asked `requiresGuardian`, which reads
   "unknown" as adult — right for a gate that also checks the band upstream,
   wrong here: FEATURED athletes are created with no age at all, and a NEXT
   school's featured athletes are high-schoolers.)
   No price, inventory, contact or legal name is returned: Phase 1 is managed
   (§17), and what a sponsor buys is a brief, not a line on this page.
   -------------------------------------------------------------------------- */

export class PropertyNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("No public property matches.");
    this.name = "PropertyNotFoundError";
  }
}

export type PublicProperty = {
  slug: string;
  name: string;
  kind: string;
  city: string | null;
  stateCode: string | null;
  roster: { slug: string; displayName: string; sport: string; position: string | null }[];
  /** Public athletes not named — minors, or age not confirmed. */
  notListed: number;
  /** More confirmed adults exist than `roster` shows. */
  rosterTruncated: boolean;
};

const PUBLIC_ROSTER_CAP = 60;
/** Rows read per public hit — bounded, since the route is anonymous. */
const PUBLIC_ROSTER_READ = 500;

/** Adult on the record, not by assumption. */
export function confirmedAdult(a: { birthDate: Date | null; ageBand: string | null }, on = new Date()): boolean {
  if (a.birthDate) return !isMinorOn(a.birthDate, on);
  return a.ageBand === "18_PLUS";
}

export async function publicProperty(slug: string): Promise<PublicProperty> {
  /* A NUL byte can never be a slug, and Postgres refuses it (QA pass 7, F-1). */
  if (slug.includes("\0")) throw new PropertyNotFoundError();
  const p = await prisma.property.findFirst({
    /* tenant-scope: public profile — the slug is globally unique and the page is public by design. */
    where: { slug },
    select: {
      slug: true, name: true, kind: true, city: true, stateCode: true,
      athletes: {
        where: { state: { in: ["FEATURED", "ACTIVE"] } },
        select: { slug: true, displayName: true, sport: true, position: true, birthDate: true, ageBand: true },
        orderBy: { displayName: "asc" },
        take: PUBLIC_ROSTER_READ,
      },
      _count: { select: { athletes: { where: { state: { in: ["FEATURED", "ACTIVE"] } } } } },
    },
  });
  if (!p) throw new PropertyNotFoundError();
  const { athletes, _count, ...rest } = p;
  const adults = athletes.filter((a) => confirmedAdult(a));
  const publicTotal = _count.athletes;
  return {
    ...rest,
    roster: adults
      .slice(0, PUBLIC_ROSTER_CAP)
      .map(({ slug, displayName, sport, position }) => ({ slug, displayName, sport, position })),
    /* Everyone public who isn't named: not-confirmed-adult among the rows
       read, plus any rows beyond the bounded read (they aren't named either). */
    notListed: publicTotal - Math.min(adults.length, PUBLIC_ROSTER_CAP),
    rosterTruncated: adults.length > PUBLIC_ROSTER_CAP || publicTotal > athletes.length,
  };
}

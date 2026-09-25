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

/**
 * Who is asking — P2-BE-04, Addendum A4, Guide §04.
 *
 * Moved here from `frontend/src/server` on 2026-09-21, and the reason is the
 * whole point of Addendum B: `/api/v1` is reached by the portals, by §8's API
 * service account and by INFINEX on equal terms. Authorisation enforced in the
 * Next app would have applied to exactly one of those three. It has to sit
 * where the data is, and the data is here.
 *
 * Two halves, deliberately separate:
 *
 *   - `resolveActor()` is pure domain logic over Postgres. It takes an already
 *     authenticated Clerk id and email, so it can be tested with no HTTP and
 *     no Clerk.
 *   - `requireActor()` is the Express middleware that gets those two values
 *     off a request. Vendor coupling lives there and nowhere else.
 *
 * **Roles are read from Postgres on every request, never from a session
 * claim.** Revoking a role therefore takes effect on the next request rather
 * than whenever a token happens to expire.
 */

import type { NextFunction, Request, Response } from "express";

import { prisma } from "../db/client";
import { authenticateClerkRequest } from "./clerk";
import { UnauthenticatedError, UnprovisionedError } from "./errors";
import { ROLES, type Role } from "./policy";

export type Actor = {
  /** Postgres `User.id`, not the Clerk id. Audit entries reference this. */
  userId: string;
  tenantId: string;
  roles: Role[];
  /**
   * The sponsor org this user belongs to, or `null` for BTG staff and
   * athletes (P4-BE-01).
   *
   * Carried on the actor because the matrix's `own` and `own-sponsor` scopes
   * on `sponsor` and `sponsorContact` cannot be expressed without it — a
   * SPONSOR_ADMIN reaches their own organisation's records and no other's,
   * and a scope builder has no second query to find out which that is.
   */
  sponsorId: string | null;
  /**
   * The athlete and guardian rows this user *is*, or null.
   *
   * Same reasoning as `sponsorId`: the matrix's `own` and `ward` scopes name
   * a row, and a scope builder has no second query to find out which. Both
   * columns already exist on `User`.
   */
  athleteId: string | null;
  guardianId: string | null;
  /**
   * The property this user manages, or null.
   *
   * Added for P3-BE-02: §15 gives PROPERTY_MGR an `own-property` scope on
   * athletes and several other resources, and until now every builder fell
   * through to MATCHES_NOTHING because the actor could not say WHICH
   * property. The column already existed on `User`; it simply was not
   * carried. Same reasoning as `sponsorId` — a scope builder has no second
   * query to find out.
   */
  propertyId: string | null;
};

const ROLE_SET = new Set<string>(ROLES);

/** Drop anything the policy does not know about rather than trusting it. A
 *  role string this build has never heard of must grant nothing. */
function knownRoles(values: readonly string[]): Role[] {
  return values.filter((value): value is Role => ROLE_SET.has(value));
}

/**
 * Resolve an authenticated Clerk identity to its Postgres `User` row, linking
 * the two on first sign-in.
 *
 * **This never invents a tenant.** Phase 1 is a managed marketplace: BTG staff
 * provision accounts and athletes are approved, so an identity with no `User`
 * row is authenticated but *unprovisioned*. Creating one here would be exactly
 * the drift of authorisation into the identity provider that A4 forbids.
 *
 * Linking is by verified email — an administrator creates the row ahead of
 * time and the first sign-in claims it by writing the real `clerkId` over the
 * placeholder.
 */
export async function resolveActor(
  clerkId: string,
  email: string | null,
): Promise<Actor> {
  const linked = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, tenantId: true, roles: true, sponsorId: true, athleteId: true, guardianId: true, propertyId: true },
  });
  if (linked) {
    return {
      userId: linked.id,
      tenantId: linked.tenantId,
      roles: knownRoles(linked.roles),
      sponsorId: linked.sponsorId,
      athleteId: linked.athleteId,
      guardianId: linked.guardianId,
      propertyId: linked.propertyId,
    };
  }

  if (!email) throw new UnprovisionedError(null);

  const provisioned = await prisma.user.findFirst({
    /* tenant-scope: identity resolution — there is no actor, and so no tenant, until this finds one. */
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  if (!provisioned) throw new UnprovisionedError(email);

  /* Claim it. `clerkId` is unique, so a second identity claiming the same
     address fails at the database rather than silently sharing a row. */
  const claimed = await prisma.user.update({
    where: { id: provisioned.id },
    data: { clerkId },
    select: { id: true, tenantId: true, roles: true, sponsorId: true, athleteId: true, guardianId: true, propertyId: true },
  });

  return {
    userId: claimed.id,
    tenantId: claimed.tenantId,
    roles: knownRoles(claimed.roles),
    sponsorId: claimed.sponsorId,
    propertyId: claimed.propertyId,
    athleteId: claimed.athleteId,
    guardianId: claimed.guardianId,
  };
}

declare module "express-serve-static-core" {
  interface Request {
    actor?: Actor;
  }
}

/**
 * Express middleware: attach `req.actor` or fail.
 *
 * Throwing is right here rather than returning a response — `app.ts`'s error
 * handler maps `status` onto the reply, and Express 5 forwards a rejected
 * async handler to it automatically. The three error types stay distinct all
 * the way to the client, because "sign in", "ask BTG for access" and "this is
 * not yours" are three different remedies.
 */
export async function requireActor(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const identity = await authenticateClerkRequest(req);
  if (!identity) throw new UnauthenticatedError();

  req.actor = await resolveActor(identity.clerkId, identity.email);
  next();
}

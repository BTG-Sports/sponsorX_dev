/**
 * P3-BE-15 — an approved athlete, and their linked guardian, get a login.
 *
 * Phase 1 is managed: identity is Clerk's, authorisation is ours, and an
 * identity with no `User` row is authenticated but unprovisioned
 * (`src/auth/actor.ts`). Approval emails the athlete "sign in to your
 * portal" — and until this, nothing created the row that sign-in claims, so
 * every approved applicant from `/join`, a cohort import or a featured-profile
 * claim landed on "no SponsorX account". Found by the staging walkthrough.
 *
 * The row is an INVITATION TO CLAIM, exactly like the team roster's
 * (`team.ts`) and onboarding's: a placeholder `clerkId` that the first
 * sign-in with the verified address overwrites. No password, no Clerk call.
 *
 * NEVER A TAKEOVER. An address already held by any account — in any tenant,
 * because a sign-in is claimed by email across all of them — is left exactly
 * as it is and reported, never re-pointed at this athlete. Reviewers see the
 * outcome in the decision's response.
 */

import { randomBytes } from "node:crypto";

import type { Actor } from "../auth/actor";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Prisma } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** What happened to one login. `address-in-use` and `no-email` mean the
 *  person cannot sign in yet, and a reviewer should know. */
export type LoginOutcome = "created" | "already-linked" | "address-in-use" | "no-email";

type Link = { role: "ATHLETE"; athleteId: string } | { role: "GUARDIAN"; guardianId: string };

async function ensureLogin(
  tx: Tx,
  actor: Actor,
  email: string | null,
  link: Link,
): Promise<LoginOutcome> {
  const address = email?.trim().toLowerCase();
  if (!address) return "no-email";

  /* Already this person's login — approval of a re-application, or a
     guardian linked to a second ward. `athleteId` is unique on User. */
  const own = await tx.user.findFirst({
    where: {
      tenantId: actor.tenantId,
      ...(link.role === "ATHLETE" ? { athleteId: link.athleteId } : { guardianId: link.guardianId }),
    },
    select: { id: true },
  });
  if (own) return "already-linked";

  const holder = await tx.user.findFirst({
    /* tenant-scope: identity is global — a sign-in is claimed by email across every tenant, so an address held anywhere is taken. */
    where: { email: { equals: address, mode: "insensitive" } },
    select: { id: true },
  });
  if (holder) return "address-in-use";

  const user = await tx.user.create({
    data: {
      tenantId: actor.tenantId,
      email: address,
      roles: [link.role],
      ...(link.role === "ATHLETE" ? { athleteId: link.athleteId } : { guardianId: link.guardianId }),
      clerkId: `invite:${randomBytes(12).toString("hex")}`,
    },
    select: { id: true },
  });
  await audit(tx, actor, AUDIT_ACTIONS.permission.loginProvision, "User", user.id, {
    after: { role: link.role, ...(link.role === "ATHLETE" ? { athleteId: link.athleteId } : { guardianId: link.guardianId }) },
  });
  return "created";
}

/** A guardian's login, for the guardian row as it stands. */
export async function provisionGuardianLoginIn(tx: Tx, actor: Actor, guardianId: string): Promise<LoginOutcome> {
  const guardian = await tx.guardian.findFirst({
    where: { tenantId: actor.tenantId, id: guardianId },
    select: { id: true, email: true },
  });
  if (!guardian) return "no-email";
  return ensureLogin(tx, actor, guardian.email, { role: "GUARDIAN", guardianId: guardian.id });
}

/**
 * The athlete's login and, where one is linked, their guardian's. Called
 * inside the approval's own transaction (`application-review.ts`), so the
 * decision and the logins commit together or not at all.
 */
export async function provisionAthleteLoginsIn(
  tx: Tx,
  actor: Actor,
  athleteId: string,
): Promise<{ athlete: LoginOutcome; guardian: LoginOutcome | null }> {
  const athlete = await tx.athlete.findFirst({
    where: { tenantId: actor.tenantId, id: athleteId },
    select: { id: true, email: true, guardianId: true },
  });
  if (!athlete) return { athlete: "no-email", guardian: null };
  return {
    athlete: await ensureLogin(tx, actor, athlete.email, { role: "ATHLETE", athleteId: athlete.id }),
    guardian: athlete.guardianId ? await provisionGuardianLoginIn(tx, actor, athlete.guardianId) : null,
  };
}

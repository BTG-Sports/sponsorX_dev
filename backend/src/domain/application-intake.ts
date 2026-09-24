/**
 * Public application intake — P3-BE-13, §11, §21, §39.
 *
 * The first half of the protected loop, and until this task it did not exist:
 * `AthleteApplicationInput` was written and published in `openapi.json` by
 * P3-BE-01, and nothing consumed it. The review surface built by P3-BE-07
 * could only decide applications that had no way of being created.
 *
 * THIS IS THE ONE WRITE PATH WITH NO ACTOR. Every other domain function takes
 * an `Actor` and asks `scope.ts` what they may reach. An applicant at `/join`
 * has no session, no `User` row, and will not have one unless BTG approves
 * them — so authorisation here is not a role check. It is three other things:
 *
 *   1. The tenant is configuration, never input. A public form cannot be
 *      allowed to nominate the tenant it lands in.
 *   2. Reaching an existing application requires a signed token that names
 *      that application and nothing else (`intake-token.ts`).
 *   3. Editing is refused unless the state permits it — DRAFT or
 *      CHANGES_REQUESTED. An applicant cannot edit their way around a
 *      decision that has already been made about them.
 *
 * WHAT IT DOES NOT DO. It does not capture a guardian. P3-BE-03 owns that,
 * `linkGuardian` already exists, and a minor's application is perfectly valid
 * without one — §37's gate stands between APPROVED and ACTIVE, not between an
 * applicant and the form. Duplicating the guardian capture here would mean two
 * places that decide who is a minor.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import { athleteNotificationKey, send } from "../lib/email";
import { issueIntakeToken } from "../lib/intake-token";
import type { AthleteApplicationInput, AthleteApplicationPatch } from "../contracts/athlete";
import { transitionAthleteIn, type SystemActor } from "./athlete";
import type { AthleteState } from "./athlete-state";

/** The states an applicant may still edit from. Anything else means a
 *  decision is in flight or has been taken, and the form is closed. */
const EDITABLE: readonly AthleteState[] = ["DRAFT", "CHANGES_REQUESTED"];

export class ApplicationNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    /* No id in the message. This is the one endpoint an unauthenticated
       stranger can call, and a message that distinguishes "no such
       application" from "not yours" is an oracle for probing ids. */
    super("No application matches that link.");
    this.name = "ApplicationNotFoundError";
  }
}

export class ApplicationClosedError extends Error {
  readonly status = 409;
  constructor(state: AthleteState) {
    super(
      `This application is ${state} and can no longer be edited. ` +
        `Only a draft or an application we have asked you to change can be updated.`,
    );
    this.name = "ApplicationClosedError";
  }
}

/** The intake acts as the tenant, with no user behind it. */
function intakeActor(): AuditActor {
  return { userId: null, tenantId: env.PUBLIC_INTAKE_TENANT_ID };
}

/**
 * Create an application and submit it in one call.
 *
 * DRAFT and SUBMITTED in the same transaction rather than two endpoints,
 * because `/join` is a wizard that holds its own state until the last step —
 * a server-side draft per keystroke would be a second source of truth for the
 * same form. The DRAFT row still exists for an instant, so the audit log
 * records a creation and a submission rather than an athlete appearing
 * already submitted.
 */
export async function submitApplication(
  input: AthleteApplicationInput,
): Promise<{ id: string; state: AthleteState; continuationToken: string }> {
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;
  const actor = intakeActor();

  const id = await prisma.$transaction(async (tx) => {
    const athlete = await createApplicantIn(tx, tenantId, actor, input);

    /* Through the state machine, not a direct write — P3-BE-01's invariant is
       that exactly one function changes `Athlete.state`, and "the applicant
       pressed submit" is not an exception to it. */
    await transitionAthleteIn(tx, asSystem(actor), athlete.id, "SUBMITTED");

    await send(tx, tenantId, {
      template: "athlete.applicationReceived",
      to: input.email.toLowerCase(),
      data: { firstName: firstNameOf(input.legalName, input.displayName) },
      idempotencyKey: athleteNotificationKey(
        "athlete.applicationReceived",
        athlete.id,
        "SUBMITTED",
      ),
    });

    return athlete.id;
  });

  return { id, state: "SUBMITTED", continuationToken: issueIntakeToken(id) };
}

/**
 * The athlete row, its socials and the "apply" audit entry — as DRAFT.
 *
 * Shared by `/join` and the pilot cohort import (P3-DATA-01) so an imported
 * athlete is created by exactly the code an applicant is: same slug rule,
 * same lower-cased email, same socials. The caller moves it on through the
 * state machine; this never touches `state`.
 */
export async function createApplicantIn(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actor: AuditActor,
  input: AthleteApplicationInput,
  auditExtra: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const athlete = await tx.athlete.create({
    data: {
      tenantId,
      slug: await uniqueSlug(tx, input.displayName),
      legalName: input.legalName,
      displayName: input.displayName,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      ageBand: input.ageBand ?? null,
      city: input.city ?? null,
      stateCode: input.stateCode,
      sport: input.sport,
      position: input.position ?? null,
      school: input.school ?? null,
      level: input.level ?? null,
      gradYear: input.gradYear ?? null,
      achievements: input.achievements ?? null,
    },
    select: { id: true },
  });

  await writeSocials(tx, tenantId, athlete.id, input.socials);

  await audit(tx, actor, "athlete.apply", "Athlete", athlete.id, {
    after: { state: "DRAFT", sport: input.sport, stateCode: input.stateCode, ...auditExtra },
  });

  return athlete;
}

/** An applicant's own view of their application, reached by token. */
export async function readOwnApplication(athleteId: string) {
  const row = await prisma.athlete.findFirst({
    where: { id: athleteId, tenantId: env.PUBLIC_INTAKE_TENANT_ID },
    select: {
      id: true, state: true, displayName: true, legalName: true, email: true,
      sport: true, stateCode: true, reviewerNotes: true,
      socials: { select: { platform: true, handle: true, followers: true, avgViews: true, source: true } },
    },
  });
  if (!row) throw new ApplicationNotFoundError();

  return {
    id: row.id,
    state: row.state as AthleteState,
    displayName: row.displayName,
    legalName: row.legalName,
    email: row.email,
    sport: row.sport,
    stateCode: row.stateCode,
    /* §11 §10: the reviewer's note is the applicant's business only when we
       have asked them to change something. At every other state it is an
       internal note and is withheld here rather than by the client. */
    reviewerNotes: row.state === "CHANGES_REQUESTED" ? row.reviewerNotes : null,
    socials: row.socials,
  };
}

/**
 * Edit an application that is still open, and resubmit it.
 *
 * CHANGES_REQUESTED → SUBMITTED is the edge §21 draws explicitly, "otherwise
 * asking an applicant to fix something is a dead end". A patch from DRAFT
 * stays in DRAFT; a patch from CHANGES_REQUESTED goes back into the queue,
 * because an applicant who has edited in response to a request has answered
 * it and should not also have to find a second button.
 */
export async function patchApplication(
  athleteId: string,
  patch: AthleteApplicationPatch,
): Promise<{ id: string; state: AthleteState }> {
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;
  const actor = intakeActor();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.athlete.findFirst({
      where: { id: athleteId, tenantId },
      select: { id: true, state: true },
    });
    if (!existing) throw new ApplicationNotFoundError();

    const from = existing.state as AthleteState;
    if (!EDITABLE.includes(from)) throw new ApplicationClosedError(from);

    const data: Prisma.AthleteUpdateInput = {};
    if (patch.legalName !== undefined) data.legalName = patch.legalName;
    if (patch.displayName !== undefined) data.displayName = patch.displayName;
    if (patch.email !== undefined) data.email = patch.email.toLowerCase();
    if (patch.phone !== undefined) data.phone = patch.phone;
    if (patch.birthDate !== undefined) data.birthDate = patch.birthDate ? new Date(patch.birthDate) : null;
    if (patch.ageBand !== undefined) data.ageBand = patch.ageBand;
    if (patch.city !== undefined) data.city = patch.city;
    if (patch.stateCode !== undefined) data.stateCode = patch.stateCode;
    if (patch.sport !== undefined) data.sport = patch.sport;
    if (patch.position !== undefined) data.position = patch.position;
    if (patch.school !== undefined) data.school = patch.school;
    if (patch.level !== undefined) data.level = patch.level;
    if (patch.gradYear !== undefined) data.gradYear = patch.gradYear;
    if (patch.achievements !== undefined) data.achievements = patch.achievements;

    /* The slug is not repatched. It is a public URL that may already have been
       shared, and §11 gives no rule for changing one — renaming it silently
       would break a link nobody knows they are holding. */
    if (Object.keys(data).length > 0) {
      await tx.athlete.update({ where: { id: athleteId }, data, select: { id: true } });
    }

    if (patch.socials !== undefined) {
      await tx.athleteSocial.deleteMany({ where: { athleteId } });
      await writeSocials(tx, tenantId, athleteId, patch.socials);
    }

    await audit(tx, actor, "athlete.applicationUpdate", "Athlete", athleteId, {
      before: { state: from },
      after: { fields: Object.keys(data), socialsReplaced: patch.socials !== undefined },
    });

    if (from === "CHANGES_REQUESTED") {
      const moved = await transitionAthleteIn(tx, asSystem(actor), athleteId, "SUBMITTED");
      return { id: moved.id, state: moved.state };
    }

    return { id: athleteId, state: from };
  });
}

async function writeSocials(
  tx: Prisma.TransactionClient,
  tenantId: string,
  athleteId: string,
  socials: AthleteApplicationInput["socials"] | undefined,
): Promise<void> {
  if (!socials?.length) return;
  await tx.athleteSocial.createMany({
    data: socials.map((s) => ({
      tenantId,
      athleteId,
      platform: s.platform,
      handle: s.handle,
      followers: s.followers ?? null,
      avgViews: s.avgViews ?? null,
      /* §22: the number and its provenance travel together. An applicant
         typing their own follower count is SELF_REPORTED, and the contract
         defaults it there rather than letting the caller claim otherwise. */
      source: s.source,
    })),
  });
}

/**
 * A public URL that is unique, without a second round trip per collision.
 *
 * Two people called Jordan Reed is not an edge case in a network of
 * teenagers, and `slug` is `@unique`, so a naive slug fails at the database on
 * an insert the applicant cannot retry.
 */
async function uniqueSlug(tx: Prisma.TransactionClient, displayName: string): Promise<string> {
  const base =
    displayName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "athlete";

  const taken = await tx.athlete.findMany({
    /* tenant-scope: slugs are unique across tenants by design (@unique); reads slug strings only, returns none. */
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  /* A thousand people sharing a display name is not a slug problem any more. */
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * The intake, as `transitionAthleteIn` sees it.
 *
 * Not a role and not a borrowed identity. `SERVICE` would have been the
 * tempting choice and is wrong twice over: §8 gives it read-only reach on
 * athletes, and presenting it here would file an applicant's own act under
 * the API service account. `SystemActor` says what is true — the platform
 * moved this, nobody signed it — and the state machine refuses to let that
 * path reach ACTIVE at all.
 */
export function asSystem(actor: AuditActor): SystemActor {
  return { system: true, tenantId: actor.tenantId, userId: null };
}

function firstNameOf(legalName: string, displayName: string): string {
  const source = legalName.trim() || displayName.trim();
  return source.split(/\s+/)[0] ?? "";
}

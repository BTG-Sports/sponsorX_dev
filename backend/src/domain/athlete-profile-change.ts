/**
 * Post-approval profile edits — P3-BE-16, §11, §24, §26.
 *
 * Until this landed, only socials could be written after approval, and the
 * live editor told an athlete to "ask your BTG contact" for everything else.
 * The acceptance is that an athlete can submit a change to each editable
 * section and that public-facing changes reach the public profile only after
 * BTG approves — so the edit is a RECORD, not a write. The Athlete row is
 * what /public/athletes/:slug, matching and the conflict check read, and it
 * moves once, inside the approval's transaction, with the audit rows.
 *
 * WHY EVERY SECTION IS REVIEWED, NOT ONLY THE PUBLIC ONES. Restrictions are
 * private, but they are the input to §26's conflict check — a restriction
 * silently removed is the failure that column exists to prevent, and one
 * silently added can strand a running campaign. Capabilities and interests
 * feed matching. Reviewing five sections the same way is one rule instead of
 * three, and "BTG saw it" is the promise the product makes (§10).
 *
 * ONE OPEN REQUEST PER ATHLETE. A new submission while one is pending
 * withdraws the old one and records that; the reviewer always sees the
 * athlete's latest intention, never two that contradict each other.
 */

import type { Prisma } from "../generated/prisma/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { athleteNotificationKey, send } from "../lib/email";
import { env } from "../config/env";
import { readPage, type PageRequest } from "../lib/paging";
import type { ProfileChangeInput } from "../contracts/profile-change";

/** The Athlete columns a change may carry, by §11 section. */
export const SECTION_FIELDS = {
  identity: ["displayName", "city", "stateCode"],
  sport: ["sport", "position", "school", "level", "gradYear", "achievements"],
  capabilities: ["contentCapabilities"],
  interests: ["brandInterests"],
  restrictions: ["restrictedCategories", "restrictionNotes"],
} as const;
export type ChangeSection = keyof typeof SECTION_FIELDS;
export type ChangeField = (typeof SECTION_FIELDS)[ChangeSection][number];
const ALL_FIELDS = Object.values(SECTION_FIELDS).flat() as readonly ChangeField[];

/** States in which the profile is BTG-approved and an edit is a change
 *  request. Before that, the application itself is what the athlete edits. */
export const POST_APPROVAL_STATES = ["APPROVED", "ACTIVE", "SUSPENDED"] as const;

export type ProfileChangeDecision = "APPROVED" | "DECLINED";

/** 409: the athlete's record is not one a change request applies to. */
export class ProfileNotEditableError extends Error {
  readonly status = 409;
  readonly code = "profile_not_editable";
  constructor(state: string) {
    super(
      state === "FEATURED"
        ? "A featured profile is editorial — claim it first."
        : "Profile changes are for approved athletes. Until then, edit your application.",
    );
    this.name = "ProfileNotEditableError";
  }
}

/** 422: everything sent already matches the profile. */
export class NothingToChangeError extends Error {
  readonly status = 422;
  readonly code = "nothing_to_change";
  constructor() {
    super("Nothing here differs from your profile as it stands.");
    this.name = "NothingToChangeError";
  }
}

/** 409: the request has already been decided or withdrawn. */
export class ChangeNotPendingError extends Error {
  readonly status = 409;
  readonly code = "change_not_pending";
  constructor(readonly state: string) {
    super(`This change is already ${state.toLowerCase()}.`);
    this.name = "ChangeNotPendingError";
  }
}

/** 422: a decline carries nothing to tell the athlete. */
export class DeclineNotesRequiredError extends Error {
  readonly status = 422;
  readonly code = "notes_required";
  constructor() {
    super("Declining needs reviewer notes: the athlete is sent them verbatim, and they are the record of why.");
    this.name = "DeclineNotesRequiredError";
  }
}

type Fields = Partial<Record<ChangeField, unknown>>;

const CHANGE_SELECT = {
  id: true, athleteId: true, sections: true, fields: true, note: true, state: true,
  reviewerNotes: true, reviewedAt: true, createdAt: true,
} as const;

const ATHLETE_FIELDS_SELECT = Object.fromEntries(ALL_FIELDS.map((f) => [f, true])) as Record<ChangeField, true>;

/** Flatten the sectioned input into { column: value } — only keys present. */
export function flattenInput(input: ProfileChangeInput): { fields: Fields; sections: ChangeSection[] } {
  const fields: Fields = {};
  const sections: ChangeSection[] = [];
  for (const section of Object.keys(SECTION_FIELDS) as ChangeSection[]) {
    const part = input[section] as Record<string, unknown> | undefined;
    if (!part) continue;
    let touched = false;
    for (const f of SECTION_FIELDS[section]) {
      if (part[f] !== undefined) {
        fields[f] = part[f];
        touched = true;
      }
    }
    if (touched) sections.push(section);
  }
  return { fields, sections };
}

/** Same value as the row holds? Lists compare as sets — order is not a change. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  }
  return (a ?? null) === (b ?? null);
}

/** Drop what already matches; say which sections still change. */
export function diffAgainst(fields: Fields, current: Record<string, unknown>): { fields: Fields; sections: ChangeSection[] } {
  const kept: Fields = {};
  for (const [k, v] of Object.entries(fields) as [ChangeField, unknown][]) {
    if (!same(v, current[k])) kept[k] = v;
  }
  const sections = (Object.keys(SECTION_FIELDS) as ChangeSection[]).filter((s) =>
    SECTION_FIELDS[s].some((f) => f in kept),
  );
  return { fields: kept, sections };
}

/**
 * POST /athletes/:id/profile-changes — propose a change.
 *
 * Scoped through `athlete.write`: an ATHLETE reaches only their own row, a
 * GUARDIAN their ward's, so the id in the path cannot be someone else's.
 * Not found and not-yours answer the same 403, as everywhere.
 */
export async function submitProfileChange(actor: Actor, athleteId: string, input: ProfileChangeInput) {
  assertAllowed(actor, "athleteProfileChange", "write");
  const proposed = flattenInput(input);

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athlete", "write"), id: athleteId },
      select: { id: true, state: true, ...ATHLETE_FIELDS_SELECT },
    });
    if (!athlete) throw new ForbiddenError("athleteProfileChange", "write");
    if (!(POST_APPROVAL_STATES as readonly string[]).includes(athlete.state)) throw new ProfileNotEditableError(athlete.state);

    const { fields, sections } = diffAgainst(proposed.fields, athlete);
    if (sections.length === 0) throw new NothingToChangeError();

    /* One open request: the newer one replaces the older, on the record. */
    const open = await tx.athleteProfileChange.findMany({
      where: { ...whereFor(actor, "athleteProfileChange", "write"), athleteId, state: "PENDING" },
      select: { id: true },
    });
    if (open.length > 0) {
      await tx.athleteProfileChange.updateMany({
        where: { id: { in: open.map((o) => o.id) } },
        data: { state: "WITHDRAWN", reviewedAt: new Date() },
      });
      for (const o of open) {
        await audit(tx, actor, "athlete.profileChangeWithdraw", "AthleteProfileChange", o.id, {
          after: { reason: "superseded" },
        });
      }
    }

    const change = await tx.athleteProfileChange.create({
      data: {
        tenantId: actor.tenantId,
        athleteId,
        sections,
        fields: fields as Prisma.InputJsonObject,
        note: input.note?.trim() || null,
      },
      select: CHANGE_SELECT,
    });
    await audit(tx, actor, "athlete.profileChangeSubmit", "AthleteProfileChange", change.id, {
      after: { athleteId, sections, fields },
    });
    return change;
  });
}

/** POST /profile-changes/:id/withdraw — the athlete takes it back. */
export async function withdrawProfileChange(actor: Actor, id: string) {
  assertAllowed(actor, "athleteProfileChange", "write");
  return prisma.$transaction(async (tx) => {
    const change = await tx.athleteProfileChange.findFirst({
      where: { ...whereFor(actor, "athleteProfileChange", "write"), id },
      select: { id: true, state: true },
    });
    if (!change) throw new ForbiddenError("athleteProfileChange", "write");
    if (change.state !== "PENDING") throw new ChangeNotPendingError(change.state);
    const out = await tx.athleteProfileChange.update({
      where: { id },
      data: { state: "WITHDRAWN", reviewedAt: new Date() },
      select: CHANGE_SELECT,
    });
    await audit(tx, actor, "athlete.profileChangeWithdraw", "AthleteProfileChange", id, { after: { reason: "athlete" } });
    return out;
  });
}

/** GET /athletes/me/profile-changes — the athlete's own, newest first.
 *  Capped: the editor shows the open one and the last few decisions. */
export async function myProfileChanges(actor: Actor, take = 10) {
  assertAllowed(actor, "athleteProfileChange", "read");
  if (!actor.athleteId && !actor.guardianId) throw new ForbiddenError("athleteProfileChange", "read");
  return prisma.athleteProfileChange.findMany({
    where: { ...whereFor(actor, "athleteProfileChange", "read") },
    select: CHANGE_SELECT,
    orderBy: { createdAt: "desc" },
    take,
  });
}

export const CHANGE_STATES = ["PENDING", "APPROVED", "DECLINED", "WITHDRAWN"] as const;
export type ChangeStateName = (typeof CHANGE_STATES)[number];

/**
 * GET /profile-changes?page= — the review desk, SERVER-PAGED, oldest pending
 * first. Each row carries the athlete's current values for the fields it
 * proposes, so the desk shows "now → proposed" without a second read.
 */
export async function listProfileChangesPage(actor: Actor, req: PageRequest, opts: { states?: ChangeStateName[] } = {}) {
  assertAllowed(actor, "athleteProfileChange", "approve");
  const states = opts.states?.length ? opts.states : (["PENDING"] as ChangeStateName[]);
  const where = { ...whereFor(actor, "athleteProfileChange", "approve"), state: { in: states } };
  const pendingOnly = states.length === 1 && states[0] === "PENDING";
  const [{ rows, page }, pending] = await Promise.all([
    readPage(
      req,
      () => prisma.athleteProfileChange.count({ where: { ...where } }),
      (skip, take) =>
        prisma.athleteProfileChange.findMany({
          where: { ...where },
          select: {
            ...CHANGE_SELECT,
            athlete: { select: { id: true, slug: true, legalName: true, state: true, ...ATHLETE_FIELDS_SELECT } },
          },
          /* Pending: oldest first — the queue's fairness. Decided: newest first. */
          orderBy: { createdAt: pendingOnly ? "asc" : "desc" },
          skip,
          take,
        }),
    ),
    prisma.athleteProfileChange.count({ where: { ...whereFor(actor, "athleteProfileChange", "approve"), state: "PENDING" } }),
  ]);
  const changes = rows.map(({ athlete, ...c }) => {
    const fields = (c.fields ?? {}) as Fields;
    const current: Fields = {};
    for (const k of Object.keys(fields) as ChangeField[]) current[k] = athlete[k] ?? null;
    return {
      ...c,
      current,
      athlete: { id: athlete.id, slug: athlete.slug, displayName: athlete.displayName, legalName: athlete.legalName, state: athlete.state },
    };
  });
  return { changes, page, counts: { pending } };
}

/**
 * Decide — POST /profile-changes/:id/approve | /decline.
 *
 * One transaction: the decision, the Athlete update (on approve), the audit
 * rows and the queued email. Restrictions are audited as their own change,
 * as `setAthleteProfile` does, so "who removed the alcohol restriction"
 * stays answerable without diffing a whole profile.
 */
export async function decideProfileChange(actor: Actor, id: string, decision: ProfileChangeDecision, reviewerNotes?: string) {
  assertAllowed(actor, "athleteProfileChange", "approve");
  const notes = reviewerNotes?.trim() || undefined;
  if (decision === "DECLINED" && !notes) throw new DeclineNotesRequiredError();

  return prisma.$transaction(async (tx) => {
    const change = await tx.athleteProfileChange.findFirst({
      where: { ...whereFor(actor, "athleteProfileChange", "approve"), id },
      select: {
        ...CHANGE_SELECT,
        athlete: { select: { id: true, state: true, email: true, legalName: true, ...ATHLETE_FIELDS_SELECT } },
      },
    });
    if (!change) throw new ForbiddenError("athleteProfileChange", "approve");
    if (change.state !== "PENDING") throw new ChangeNotPendingError(change.state);

    const fields = (change.fields ?? {}) as Fields;
    if (decision === "APPROVED") {
      /* The row may have moved since submission (a suspension, say); a
         change is applied only to a profile it still applies to. */
      if (!(POST_APPROVAL_STATES as readonly string[]).includes(change.athlete.state)) throw new ProfileNotEditableError(change.athlete.state);
      const before: Fields = {};
      for (const k of Object.keys(fields) as ChangeField[]) before[k] = change.athlete[k] ?? null;
      await tx.athlete.update({ where: { id: change.athleteId }, data: fields as Prisma.AthleteUpdateInput });
      if ("restrictedCategories" in fields) {
        await audit(tx, actor, "athlete.restrictionsSet", "Athlete", change.athleteId, {
          before: { restrictedCategories: before.restrictedCategories },
          after: { restrictedCategories: fields.restrictedCategories },
        });
      }
      await audit(tx, actor, "athlete.profileChangeApprove", "Athlete", change.athleteId, {
        before, after: { ...fields, changeId: id },
      });
    } else {
      await audit(tx, actor, "athlete.profileChangeDecline", "AthleteProfileChange", id, {
        after: { athleteId: change.athleteId, reviewerNotes: notes },
      });
    }

    const out = await tx.athleteProfileChange.update({
      where: { id },
      data: { state: decision, reviewerNotes: notes ?? null, reviewedBy: actor.userId, reviewedAt: new Date() },
      select: CHANGE_SELECT,
    });

    if (change.athlete.email) {
      const template = decision === "APPROVED" ? "athlete.profileChangeApproved" : "athlete.profileChangeDeclined";
      await send(tx, actor.tenantId, {
        template,
        to: change.athlete.email,
        data: {
          firstName: (change.athlete.legalName.trim() || change.athlete.displayName.trim()).split(/\s+/)[0] ?? "",
          sections: change.sections.join(", "),
          portalUrl: `${env.APP_URL}/athlete/profile`,
          ...(notes ? { reviewerNotes: notes } : {}),
        },
        /* One message per request per decision; a request is decided once. */
        idempotencyKey: athleteNotificationKey(template, change.athleteId, id),
      });
    }
    return out;
  });
}

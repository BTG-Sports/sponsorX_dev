/**
 * Profile edits — P3-BE-16, replaced by 2S1-BE-14 (2026-10-01).
 *
 * P3-BE-16 held every post-approval edit for BTG's review. With BTG down to
 * one reviewer that review is gone (2S1-BE-14):
 *
 *   ORDINARY EDITS publish at once — display name, region, sport, position,
 *   school, level, achievements, capabilities, interests, restrictions. The
 *   Athlete row (what the public profile, matching and the §26 conflict check
 *   read) moves in the same transaction as the audit row. No BTG step, no
 *   email.
 *
 *   SENSITIVE EDITS publish too, but re-run the sign-up checks, and BTG
 *   admins are emailed a link to the athlete on New sign-ups, where Reject
 *   is:
 *     · a new LEGAL NAME needs a matching ID upload (private bucket) before
 *       it takes effect — the change waits (PENDING) until the file arrives;
 *     · a new DATE OF BIRTH works out adulthood again: now a minor → the
 *       guardian process starts (no new agreements or payments until a
 *       guardian is confirmed — guardianReadiness); now an adult → the
 *       coming-of-age allowance starts (2S1-BE-12);
 *     · a new GUARDIAN goes through the guardian's page and documents
 *       (2S1-BE-10): they are emailed its signed set-up link. Replacing a
 *       guardian who already exists is the handoff's job (2S1-BE-15), which
 *       only the new guardian can start.
 *
 *   A MOVE (a new state) or a new date of birth works the age of majority
 *   out again from the editable table (2S1-BE-12, age-of-majority.ts): the
 *   athlete's `majorityAge`, and the age band from the date of birth. A move
 *   that changes adulthood is sensitive too. Becoming an adult while linked
 *   to a guardian starts the coming-of-age allowance at once
 *   (coming-of-age.ts); a corrected date that makes them a minor again closes
 *   an allowance that should not have opened.
 *
 *   EVERY EDIT is audited and kept as an AthleteProfileChange row — the
 *   athlete's own history, and BTG's list of sensitive edits.
 */

import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import { readPage, type PageRequest } from "../lib/paging";
import { checkPrivateUpload, presignPrivateDownload, presignPrivateUpload, SENSITIVE_DOCUMENT_TTL_SECONDS, uploadRefusal } from "../lib/storage";
import type { ProfileChangeInput } from "../contracts/profile-change";
import { provisionGuardianLoginIn } from "./athlete-login";
import { requiresGuardian } from "./guardian-rules";
import { safeFilename } from "./onboarding-documents";
import { majorityOf, refreshMajorityIn } from "./age-of-majority";
import { sendGuardianSetupEmail } from "./athlete-signup";
import { rerunComingOfAgeIn } from "./coming-of-age";
import { ageBandFor } from "./age-of-majority-rules";

type Tx = Prisma.TransactionClient;

/** The Athlete columns an ordinary edit may carry, by §11 section. */
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

/** States in which the profile is approved and an edit is a change. Before
 *  that, the application itself is what the athlete edits. */
export const POST_APPROVAL_STATES = ["APPROVED", "ACTIVE", "SUSPENDED"] as const;

/** 2S1-BE-14 — a new legal name needs its matching ID, at most 10 MB. */
export const MAX_ID_BYTES = 10 * 1024 * 1024;

/** 409: the athlete's record is not one an edit applies to. */
export class ProfileNotEditableError extends Error {
  readonly status = 409;
  readonly code = "profile_not_editable";
  constructor(state: string) {
    super(
      state === "FEATURED"
        ? "A featured profile is editorial — claim it first."
        : "Profile edits are for approved athletes. Until then, edit your application.",
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

/** 409: the change is not waiting for anything. */
export class ChangeNotPendingError extends Error {
  readonly status = 409;
  readonly code = "change_not_pending";
  constructor(readonly state: string) {
    super(`This change is already ${state === "APPROVED" ? "live" : state.toLowerCase()}.`);
    this.name = "ChangeNotPendingError";
  }
}

/** 422 / 409: a sensitive edit that cannot go through as sent. */
export class SensitiveEditError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, code: string, status = 422) {
    super(message);
    this.name = "SensitiveEditError";
    this.code = code;
    this.status = status;
  }
}

type Fields = Partial<Record<ChangeField, unknown>>;

const CHANGE_SELECT = {
  id: true, athleteId: true, sections: true, fields: true, note: true, state: true,
  reviewerNotes: true, reviewedAt: true, createdAt: true,
  sensitive: true, appliedAt: true, checkNotes: true, idDocumentFilename: true, idDocumentUploadedAt: true,
} as const;

const ATHLETE_FIELDS_SELECT = Object.fromEntries(ALL_FIELDS.map((f) => [f, true])) as Record<ChangeField, true>;
const appUrl = () => env.APP_URL.replace(/\/+$/, "");

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

/** "2009-04-12" ⇄ the stored date (midnight UTC). */
const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * What a new date of birth (or a move) means, in words the athlete and BTG
 * read. Pure. The age of majority is the athlete's place's, from 2S1-BE-12's
 * table (`majorityAge`); 18 where a caller doesn't carry it.
 */
type AgeFacts = { birthDate: Date | null; ageBand: string | null; majorityAge?: number | null };
export function adulthoodNotes(before: AgeFacts, after: AgeFacts, hasGuardian: boolean): string[] {
  const was = requiresGuardian(before);
  const now = requiresGuardian(after);
  if (!was && now) {
    return [hasGuardian
      ? "Now under the age of majority: your guardian approves new agreements and payments."
      : "Now under the age of majority: a guardian is needed before any new agreement or payment. Name your guardian."];
  }
  if (was && !now) return ["Now an adult: the coming-of-age allowance starts. Upload a government ID within 90 days to take over your account."];
  return ["Adulthood is unchanged."];
}

/** BTG admins, told about a sensitive edit — with the link to the athlete on New sign-ups, where Reject is. */
async function tellBtg(tx: Tx, tenantId: string, a: { id: string; displayName: string; legalName: string }, changeId: string, what: string, checks: string[]) {
  const admins = await tx.user.findMany({
    where: { tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true },
  });
  for (const u of admins) {
    await send(tx, tenantId, {
      template: "athlete.sensitiveEdit", to: u.email, idempotencyKey: `athlete.sensitiveEdit:${changeId}:${u.id}`,
      data: {
        athleteName: a.displayName || a.legalName, what, checks: checks.map((c) => `• ${c}`).join("\n"),
        /* The athlete's profile on New sign-ups (2S1-BE-09), where Reject is. */
        reviewUrl: `${appUrl()}/admin/new-signups/athletes/${a.id}`,
      },
    });
  }
}

/**
 * POST /athletes/:id/profile-changes — make an edit.
 *
 * Scoped through `athlete.write`: an ATHLETE reaches only their own row, a
 * GUARDIAN their ward's, so the id in the path cannot be someone else's.
 * Not found and not-yours answer the same 403, as everywhere.
 *
 * Returns the change records it made: one APPROVED (applied now) for the
 * ordinary and immediate sensitive fields, and one PENDING for a legal name
 * with the presigned upload for its matching ID.
 */
export async function submitProfileChange(actor: Actor, athleteId: string, input: ProfileChangeInput) {
  assertAllowed(actor, "athleteProfileChange", "write");
  const proposed = flattenInput(input);

  const out = await prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athlete", "write"), id: athleteId },
      select: {
        id: true, tenantId: true, state: true, legalName: true, email: true, birthDate: true, ageBand: true, guardianId: true,
        countryCode: true, majorityAge: true, ...ATHLETE_FIELDS_SELECT,
      },
    });
    if (!athlete) throw new ForbiddenError("athleteProfileChange", "write");
    if (!(POST_APPROVAL_STATES as readonly string[]).includes(athlete.state)) throw new ProfileNotEditableError(athlete.state);

    const ordinary = diffAgainst(proposed.fields, athlete);
    const newLegal = input.identity?.legalName?.trim();
    const legalChanges = Boolean(newLegal && newLegal !== athlete.legalName);
    const newBirth = input.identity?.birthDate ?? null;
    const birthChanges = Boolean(newBirth && newBirth !== isoDay(athlete.birthDate));
    const guardianIn = input.guardian;
    if (!ordinary.sections.length && !legalChanges && !birthChanges && !guardianIn) throw new NothingToChangeError();
    if (legalChanges && !input.idDocument) {
      throw new SensitiveEditError("Changing your legal name needs a matching ID. Add the ID upload and send again.", "id_required");
    }

    const note = input.note?.trim() || null;
    const now = new Date();
    const applied: Record<string, unknown> = { ...ordinary.fields };
    const sections = new Set<string>(ordinary.sections);
    const checkNotes: string[] = [];
    const sensitiveWhat: string[] = [];

    /* ── the date of birth and the place: applied now, adulthood worked out again (2S1-BE-12) ── */
    const birthDate = birthChanges ? new Date(`${newBirth}T00:00:00.000Z`) : athlete.birthDate;
    const moved = "stateCode" in ordinary.fields;
    const majority = moved
      ? await majorityOf(tx, athlete.tenantId, athlete.countryCode, (ordinary.fields.stateCode as string | null | undefined) ?? null)
      : { age: athlete.majorityAge };
    /* With a date of birth on file the band follows it, so a stale band can't keep an adult a minor (or the reverse). */
    const ageBand = birthDate && (birthChanges || moved) ? ageBandFor(birthDate, majority.age, now) : athlete.ageBand;
    if (ageBand !== athlete.ageBand) applied.ageBand = ageBand;
    const ageAfter = { birthDate, ageBand, majorityAge: majority.age };
    const adulthood = adulthoodNotes(athlete, ageAfter, Boolean(athlete.guardianId));
    if (birthChanges) {
      applied.birthDate = birthDate;
      sections.add("identity");
      sensitiveWhat.push("their date of birth");
      checkNotes.push(...adulthood);
    } else if (moved && requiresGuardian(athlete) !== requiresGuardian(ageAfter)) {
      /* A move across an age-of-majority line changes adulthood: sensitive, like a new date of birth. */
      sensitiveWhat.push("where they live (a different age of majority)");
      checkNotes.push(...adulthood);
    }

    /* ── a guardian: only a minor, and only one with none yet ── */
    let guardian: { id: string; legalName: string; email: string; verifiedAt: Date | null } | null = null;
    if (guardianIn) {
      if (!requiresGuardian(ageAfter)) {
        throw new SensitiveEditError("Only an athlete under the age of majority has a guardian.", "guardian_not_required");
      }
      if (athlete.guardianId) {
        throw new SensitiveEditError(
          `You already have a guardian. A new guardian asks to take over on the guardian handoff page (${appUrl()}/guardian/handoff), and your current guardian hands off.`,
          "handoff_required", 409,
        );
      }
      const email = guardianIn.email.trim().toLowerCase();
      if (athlete.email && email === athlete.email.toLowerCase()) {
        throw new SensitiveEditError("Your guardian's email has to be their own, not yours.", "guardian_email_is_yours");
      }
      /* One guardian may look after several athletes (2S1-BE-10): an address
         already on file in this tenant, and not rejected, is that guardian. */
      guardian = await tx.guardian.findFirst({
        where: { tenantId: athlete.tenantId, email: { equals: email, mode: "insensitive" }, rejectedAt: null },
        select: { id: true, legalName: true, email: true, verifiedAt: true },
      }) ?? await tx.guardian.create({
        data: {
          tenantId: athlete.tenantId, legalName: guardianIn.legalName.trim(), email,
          phone: guardianIn.phone?.trim() || null, relationship: guardianIn.relationship,
          /* Never verified here: the guardian completes their own page (2S1-BE-10). */
        },
        select: { id: true, legalName: true, email: true, verifiedAt: true },
      });
      applied.guardianId = guardian.id;
      sections.add("guardian");
      sensitiveWhat.push("their guardian");
      checkNotes.push("Your guardian is emailed to complete their page: their ID, proof of guardianship and the guardian agreement. New agreements and payments wait until then.");
    }

    let appliedChange: { id: string } | null = null;
    if (Object.keys(applied).length) {
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(applied)) {
        before[k] = k === "birthDate" ? isoDay(athlete.birthDate) : (athlete as Record<string, unknown>)[k] ?? null;
      }
      /* tenant-scope: the row loaded above through whereFor(athlete, write). */
      await tx.athlete.update({ where: { id: athlete.id }, data: applied as Prisma.AthleteUpdateInput, select: { id: true } });
      /* 2S1-BE-12 — a move is a new age of majority; a new date of birth may cross it. */
      if (moved) await refreshMajorityIn(tx, athlete.tenantId, athlete.id);
      if (moved || birthChanges) {
        const coming = await rerunComingOfAgeIn(tx, athlete.tenantId, athlete.id, now);
        if (coming === "started") checkNotes.push("Your coming-of-age allowance has started: you and your guardian are emailed how to take over.");
      }
      const recorded = { ...applied, ...(applied.birthDate ? { birthDate: newBirth } : {}) };
      appliedChange = await tx.athleteProfileChange.create({
        data: {
          tenantId: athlete.tenantId, athleteId: athlete.id, sections: [...sections], fields: recorded as Prisma.InputJsonObject, note,
          state: "APPROVED", appliedAt: now, reviewedAt: now, sensitive: sensitiveWhat.length > 0, checkNotes,
        },
        select: { id: true },
      });
      if ("restrictedCategories" in applied) {
        await audit(tx, actor, "athlete.restrictionsSet", "Athlete", athlete.id, {
          before: { restrictedCategories: before.restrictedCategories }, after: { restrictedCategories: applied.restrictedCategories },
        });
      }
      await audit(tx, actor, sensitiveWhat.length ? "athlete.sensitiveEdit" : "athlete.profileEdit", "Athlete", athlete.id, {
        before, after: { ...recorded, changeId: appliedChange.id, checks: checkNotes },
      });
      if (guardian) {
        /* 2S1-BE-10 / -14 — "new agreements and payments wait until then".
           Every guardian named here waits for THIS athlete: proof naming them
           and the agreement for them (guardianPendingSince), whether or not the
           guardian is, or is about to be, verified through another child.
           Verifying a guardian through one child's page never clears another
           child's wait (athlete-signup.ts verifyLateGuardianIn). */
        /* tenant-scope: the row loaded above through whereFor(athlete, write). */
        await tx.athlete.update({ where: { id: athlete.id }, data: { guardianPendingSince: now }, select: { id: true } });
        await audit(tx, actor, "guardian.link", "Athlete", athlete.id, {
          before: { guardianId: null }, after: { guardianId: guardian.id, via: "profileEdit", pendingProofForThisAthlete: true },
        });
        if (athlete.state === "APPROVED" || athlete.state === "ACTIVE") await provisionGuardianLoginIn(tx, actor, guardian.id);
        /* The guardian's own page (2S1-BE-10): opening its signed link confirms
           their email; ID, proof and the agreement there verify them. */
        await sendGuardianSetupEmail(tx, athlete, guardian, 0);
      }
      if (sensitiveWhat.length) await tellBtg(tx, athlete.tenantId, athlete, appliedChange.id, sensitiveWhat.join(" and "), checkNotes);
    }

    /* ── a legal name: waits for its matching ID ── */
    let pendingLegal: { id: string; idDocumentKey: string; contentType: string; bytes: number } | null = null;
    if (legalChanges) {
      const open = await tx.athleteProfileChange.findMany({
        where: { tenantId: athlete.tenantId, athleteId: athlete.id, state: "PENDING" }, select: { id: true },
      });
      if (open.length) {
        await tx.athleteProfileChange.updateMany({
          /* tenant-scope: this athlete's own open changes, found just above. */
          where: { id: { in: open.map((o) => o.id) } }, data: { state: "WITHDRAWN", reviewedAt: now },
        });
        for (const o of open) await audit(tx, actor, "athlete.profileChangeWithdraw", "AthleteProfileChange", o.id, { after: { reason: "superseded" } });
      }
      const id = `pc_${randomBytes(12).toString("hex")}`;
      const filename = safeFilename(input.idDocument!.filename);
      const key = `athlete-ids/${athlete.id}/${id}/${filename}`;
      await tx.athleteProfileChange.create({
        data: {
          id, tenantId: athlete.tenantId, athleteId: athlete.id, sections: ["identity"], fields: { legalName: newLegal } as Prisma.InputJsonObject,
          note, state: "PENDING", sensitive: true, idDocumentKey: key, idDocumentFilename: filename,
          idDocumentContentType: input.idDocument!.contentType, idDocumentBytes: input.idDocument!.bytes,
          checkNotes: ["Your new legal name takes effect once the matching ID arrives."],
        },
        select: { id: true },
      });
      await audit(tx, actor, "athlete.legalNameRequested", "AthleteProfileChange", id, { after: { athleteId: athlete.id, legalName: newLegal } });
      pendingLegal = { id, idDocumentKey: key, contentType: input.idDocument!.contentType, bytes: input.idDocument!.bytes };
    }
    return { athleteTenantId: athlete.tenantId, appliedId: appliedChange?.id ?? null, pendingLegal, checkNotes };
  });

  const idUpload = out.pendingLegal
    ? {
      changeId: out.pendingLegal.id,
      contentType: out.pendingLegal.contentType,
      /* 2S8-SEC-03 — the PUT is signed for exactly this type and size. */
      uploadUrl: await presignPrivateUpload(actor, out.pendingLegal.idDocumentKey, out.pendingLegal.contentType, { entity: "AthleteProfileChange", entityId: out.pendingLegal.id }, {
        signContentType: true, contentLength: out.pendingLegal.bytes,
      }),
    }
    : null;
  const ids = [out.appliedId, out.pendingLegal?.id].filter((x): x is string => Boolean(x));
  const changes = await prisma.athleteProfileChange.findMany({
    where: { ...whereFor(actor, "athleteProfileChange", "read"), id: { in: ids } }, select: CHANGE_SELECT, orderBy: { createdAt: "asc" },
  });
  return { id: ids[0]!, changes, idUpload, checkNotes: out.checkNotes };
}

/**
 * POST /profile-changes/:id/id-document/confirm — the matching ID has been
 * uploaded. Counted only if it is in the bucket; then the new legal name is
 * applied, audited, and BTG admins are emailed.
 */
export async function confirmLegalNameDocument(actor: Actor, id: string) {
  assertAllowed(actor, "athleteProfileChange", "write");
  const change = await prisma.athleteProfileChange.findFirst({
    where: { ...whereFor(actor, "athleteProfileChange", "write"), id }, select: { id: true, state: true, idDocumentKey: true, idDocumentContentType: true, idDocumentBytes: true },
  });
  if (!change) throw new ForbiddenError("athleteProfileChange", "write");
  if (change.state !== "PENDING" || !change.idDocumentKey) throw new ChangeNotPendingError(change.state);
  /* 2S8-SEC-03 — what arrived must be what the grant pinned; anything else is deleted. */
  const arrived = await checkPrivateUpload(actor, change.idDocumentKey,
    { contentType: change.idDocumentContentType ?? "", bytes: change.idDocumentBytes, maxBytes: MAX_ID_BYTES }, { entity: "AthleteProfileChange", entityId: change.id });
  if (!arrived.ok && arrived.problem === "missing") throw new SensitiveEditError("Your ID hasn't arrived yet — upload it, then confirm.", "id_not_arrived", 409);
  if (!arrived.ok) throw new SensitiveEditError(uploadRefusal(arrived.problem, "Your ID"), arrived.problem === "type" ? "id_wrong_type" : "id_too_large");
  const size = arrived.bytes;

  return prisma.$transaction(async (tx) => {
    const c = await tx.athleteProfileChange.findFirst({
      where: { ...whereFor(actor, "athleteProfileChange", "write"), id },
      select: { id: true, tenantId: true, athleteId: true, state: true, fields: true, athlete: { select: { id: true, legalName: true, displayName: true } } },
    });
    if (!c || c.state !== "PENDING") throw new ChangeNotPendingError(c?.state ?? "gone");
    const legalName = String((c.fields as { legalName?: string }).legalName ?? "");
    const now = new Date();
    /* tenant-scope: the change's own athlete; the change was loaded above through whereFor(athleteProfileChange, write). */
    await tx.athlete.update({ where: { id: c.athleteId }, data: { legalName }, select: { id: true } });
    const notes = ["Matching ID uploaded; the new legal name is live. BTG can see the ID and reject the change if it doesn't match."];
    await tx.athleteProfileChange.update({
      /* tenant-scope: loaded through whereFor(athleteProfileChange, write). */
      where: { id: c.id },
      data: { state: "APPROVED", appliedAt: now, reviewedAt: now, idDocumentUploadedAt: now, idDocumentBytes: size, checkNotes: notes },
    });
    await audit(tx, actor, "athlete.sensitiveEdit", "Athlete", c.athleteId, {
      before: { legalName: c.athlete.legalName }, after: { legalName, changeId: c.id, idDocument: "uploaded" },
    });
    await tellBtg(tx, c.tenantId, c.athlete, c.id, "their legal name (matching ID uploaded)", notes);
    return tx.athleteProfileChange.findFirstOrThrow({ where: { tenantId: c.tenantId, id: c.id }, select: CHANGE_SELECT });
  });
}

/**
 * GET /profile-changes/:id/id-document — BTG reads the ID a legal-name
 * change was matched against, through a five-minute, audited link.
 */
export async function viewLegalNameDocument(actor: Actor, id: string) {
  assertAllowed(actor, "athleteProfileChange", "approve");
  const c = await prisma.athleteProfileChange.findFirst({
    where: { ...whereFor(actor, "athleteProfileChange", "approve"), id }, select: { id: true, idDocumentKey: true, idDocumentUploadedAt: true },
  });
  if (!c) throw new ForbiddenError("athleteProfileChange", "approve");
  if (!c.idDocumentKey || !c.idDocumentUploadedAt) throw new SensitiveEditError("There is no ID on this change.", "no_document", 404);
  const url = await presignPrivateDownload(actor, c.idDocumentKey, { entity: "AthleteProfileChange", entityId: c.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}

/** POST /profile-changes/:id/withdraw — the athlete takes back a legal name still waiting for its ID. */
export async function withdrawProfileChange(actor: Actor, id: string) {
  assertAllowed(actor, "athleteProfileChange", "write");
  return prisma.$transaction(async (tx) => {
    const change = await tx.athleteProfileChange.findFirst({
      where: { ...whereFor(actor, "athleteProfileChange", "write"), id },
      select: { id: true, state: true },
    });
    if (!change) throw new ForbiddenError("athleteProfileChange", "write");
    if (change.state !== "PENDING") throw new ChangeNotPendingError(change.state);
    /* tenant-scope: the row loaded above through whereFor(athleteProfileChange, write). */
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
 *  Capped: the editor shows a waiting legal name and the last few edits. */
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

/**
 * GET /profile-changes?page= — BTG's list of SENSITIVE edits, newest first,
 * SERVER-PAGED: what New sign-ups shows (2S1-FE-09). Ordinary edits are in
 * each athlete's audit history and need nobody's attention.
 */
export async function listSensitiveEditsPage(actor: Actor, req: PageRequest) {
  assertAllowed(actor, "athleteProfileChange", "approve");
  const where = { ...whereFor(actor, "athleteProfileChange", "approve"), sensitive: true, state: { in: ["APPROVED", "PENDING"] as ("APPROVED" | "PENDING")[] } };
  const { rows, page } = await readPage(
    req,
    () => prisma.athleteProfileChange.count({ where: { ...where } }),
    (skip, take) =>
      prisma.athleteProfileChange.findMany({
        where: { ...where },
        select: { ...CHANGE_SELECT, athlete: { select: { id: true, slug: true, legalName: true, displayName: true, state: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
  );
  return {
    edits: rows.map(({ idDocumentFilename, idDocumentUploadedAt, ...c }) => ({
      ...c, idDocument: idDocumentUploadedAt ? { filename: idDocumentFilename, uploadedAt: idDocumentUploadedAt } : null,
    })),
    page,
  };
}

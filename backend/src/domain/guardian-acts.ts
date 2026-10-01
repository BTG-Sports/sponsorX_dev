/**
 * The guardian acts for the minor — 2S1-BE-11 (and the coming-of-age pause,
 * 2S1-BE-12).
 *
 * "For a minor, every agreement and money action comes from the guardian's
 * account: accepting offers and orders, listing items, setting up the payout
 * account in the guardian's name, and requesting payouts. The minor's own
 * login can view everything and upload their content."
 *
 * TWO HALVES.
 *
 *   1. `actForWard` — the guardian's login AS the ward. `requireActor` hands
 *      every request from a GUARDIAN through here: the minor named by the
 *      `x-sponsorx-ward` header (or, without one, the first they look after)
 *      becomes the actor's athlete, ATHLETE joins the roles, and scope.ts
 *      `scopeOf` answers the athlete's own cells first. So the athlete
 *      portal, and every athlete-side function behind it, works for the
 *      guardian on that one ward — and only that ward, because `own`
 *      resolves through `actor.athleteId`. The audit rows name the
 *      guardian's own user: the record says who agreed.
 *
 *   2. `assertMayCommit` — called at the top of every route that agrees to
 *      something or moves money. The minor's OWN login is refused (403
 *      `guardian_must_act`, naming the guardian); during the 90-day
 *      coming-of-age allowance nothing new is started by anyone (409
 *      `coming_of_age_paused`) while existing orders and campaigns carry on.
 *      An adult's own login passes untouched.
 *
 * WHO IS "UNDER THE GUARDIAN'S CONTROL" is one pure rule, guardian-rules.ts
 * `guardianControls`: under their place's age of majority, or in the
 * allowance until a government ID is uploaded.
 *
 * ONLY A VERIFIED GUARDIAN ACTS (2S1-BE-14 review fix). A guardian named by
 * a profile edit, or linked by BTG, has a login before they have finished
 * their own page — and "new agreements and payments wait until then" is
 * what the athlete is told. So a ward is acted for only when the guardian
 * is verified AND the ward is not waiting on this guardian's proof for them
 * (`Athlete.guardianPendingSince`, a guardian already verified for another
 * child). Until then the login does not act for that ward, and any write it
 * attempts for them is refused with 403 `guardian_not_verified` — at the
 * door (`actForWard`), and again inside every commit (`assertMayCommit`).
 * Only APPROVED / ACTIVE / SUSPENDED wards are acted for: a minor still
 * signing up, or one BTG rejected (`signupRejectedAt`), is nobody's to act
 * for.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { guardianControls } from "./guardian-rules";
import { comingOfAgeOpen } from "./age-of-majority-rules";
import { env } from "../config/env";
import { send } from "../lib/email";

type Db = Prisma.TransactionClient | typeof prisma;

/** The header a guardian's portal sends to say which of their minors it is acting for. */
export const WARD_HEADER = "x-sponsorx-ward";

export class GuardianMustActError extends Error {
  readonly status = 403;
  readonly code = "guardian_must_act";
  constructor(guardianName: string | null) {
    super(
      `${guardianName ?? "Your guardian"} does this for your account, from their own login — ` +
        `every agreement and money action for an athlete under the age of majority comes from the guardian. ` +
        `You can still view everything and upload your content.`,
    );
    this.name = "GuardianMustActError";
  }
}

/** 403 `guardian_not_verified` — the guardian hasn't finished their own page for this athlete yet. */
export class GuardianNotVerifiedError extends Error {
  readonly status = 403;
  readonly code = "guardian_not_verified";
  constructor(athleteFirstName: string | null) {
    super(
      `You can act for ${athleteFirstName ?? "this athlete"} once your guardian set-up is finished: your government ID, proof you're ` +
        `${athleteFirstName ? `${athleteFirstName}'s` : "their"} guardian and the guardian agreement, from the link we emailed you. ` +
        `New agreements and payments wait until then.`,
    );
    this.name = "GuardianNotVerifiedError";
  }
}

export class ComingOfAgePausedError extends Error {
  readonly status = 409;
  readonly code = "coming_of_age_paused";
  constructor(firstName: string, dueAt: Date | null) {
    super(
      `New items and new deals are paused until ${firstName} uploads a government ID` +
        `${dueAt ? ` (by ${dueAt.toISOString().slice(0, 10)})` : ""}. Orders and campaigns already agreed carry on as normal.`,
    );
    this.name = "ComingOfAgePausedError";
  }
}

/** What an athlete-side route is about to do. */
export type CommitAct =
  /** Accept an offer, an invitation, a Campaign Order, an agreement — a new transaction. */
  | "accept"
  /** Add an item, create or submit a listing — a new item. */
  | "list"
  /** Set up the payout account, or change an existing item or listing — not new, so not paused by coming of age. */
  | "manage"
  /** Ask for a payout. */
  | "payoutRequest";

const PAUSED: ReadonlySet<CommitAct> = new Set(["accept", "list", "payoutRequest"]);

const CONTROL_SELECT = {
  id: true, displayName: true, legalName: true, state: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
  comingOfAgeStartedAt: true, comingOfAgeDueAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
  guardianPendingSince: true,
  guardian: { select: { legalName: true, verifiedAt: true } },
} as const;

const firstOf = (w: { legalName: string; displayName: string }) => (w.legalName || w.displayName).trim().split(/\s+/)[0] ?? w.displayName;

/** Is this guardian cleared to act for this ward: verified, and not waiting on their proof for this child? */
const cleared = (w: { guardianPendingSince: Date | null; guardian: { verifiedAt: Date | null } | null }) =>
  Boolean(w.guardian?.verifiedAt) && !w.guardianPendingSince;

/** The wards a guardian's login may act for: theirs, approved, not rejected, not terminated. */
const wardsWhere = (actor: Actor) => ({
  tenantId: actor.tenantId, guardianId: actor.guardianId,
  state: { in: ["APPROVED", "ACTIVE", "SUSPENDED"] as ("APPROVED" | "ACTIVE" | "SUSPENDED")[] },
  signupRejectedAt: null, comingOfAgeTerminatedAt: null,
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Refuse an agreement or money action the caller may not take for this
 * athlete. A no-op for anyone who is not acting as an athlete (staff, a
 * property manager, a sponsor).
 */
export async function assertMayCommit(db: Db, actor: Actor, act: CommitAct): Promise<void> {
  if (!actor.athleteId || !actor.roles.includes("ATHLETE")) return;
  const a = await db.athlete.findFirst({
    where: { tenantId: actor.tenantId, id: actor.athleteId }, select: CONTROL_SELECT,
  });
  if (!a) return;
  const first = (a.legalName || a.displayName).trim().split(/\s+/)[0] ?? "the athlete";
  if (guardianControls(a) && !actor.actingFor) throw new GuardianMustActError(a.guardian?.legalName ?? null);
  /* The door (actForWard) already refused this; checked again where the commit happens, whoever built the actor. */
  if (actor.actingFor && (actor.actingFor.guardianId !== a.guardianId || !cleared(a))) throw new GuardianNotVerifiedError(first);
  if (comingOfAgeOpen(a) && PAUSED.has(act)) throw new ComingOfAgePausedError(first, a.comingOfAgeDueAt);
}

/**
 * The guardian's login as one of their minors, or the actor unchanged.
 *
 * Only a GUARDIAN-only login is changed (a person who is also an athlete
 * acts as themselves). The ward is one this guardian looks after, in their
 * tenant, approved, still under their control and not rejected or
 * terminated — and one they are CLEARED for (verified, with their proof for
 * this child in). A header naming anyone else means no ward at all — never a
 * fallback to another child, so a stale choice can't act for the wrong one.
 *
 * A write (`method` not GET/HEAD/OPTIONS) aimed at a ward the guardian is not
 * yet cleared for — named by the header, or, with no header, when every ward
 * is still waiting — is refused here, 403 `guardian_not_verified`. Reads go
 * on as the guardian's own login.
 */
export async function actForWard(actor: Actor, requested: string | undefined | null, method = "GET"): Promise<Actor> {
  if (!actor.guardianId || !actor.roles.includes("GUARDIAN") || actor.roles.includes("ATHLETE")) return actor;
  const wards = await prisma.athlete.findMany({
    /* tenant-scope: wardsWhere carries the actor's tenantId and guardianId. */
    where: wardsWhere(actor),
    select: CONTROL_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const controlled = wards.filter((w) => guardianControls(w));
  const named = requested?.trim();
  const chosen = named ? controlled.find((w) => w.id === named) : controlled.find(cleared) ?? controlled[0];
  if (chosen && !cleared(chosen)) {
    if (!SAFE_METHODS.has(method.toUpperCase())) throw new GuardianNotVerifiedError(firstOf(chosen));
    return actor;
  }
  const ward = chosen;
  if (!ward) return actor;
  return {
    ...actor,
    roles: [...actor.roles, "ATHLETE"],
    athleteId: ward.id,
    actingFor: { athleteId: ward.id, guardianId: actor.guardianId },
  };
}

/**
 * For the portals (GET /me): the minors this guardian acts for, and — for
 * an athlete's own login — whether their guardian acts for them.
 */
export async function controlView(actor: Actor) {
  if (actor.guardianId && actor.roles.includes("GUARDIAN")) {
    const wards = await prisma.athlete.findMany({
      /* tenant-scope: wardsWhere carries the actor's tenantId and guardianId. */
      where: wardsWhere(actor),
      select: CONTROL_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const controlled = wards.filter((w) => guardianControls(w));
    return {
      wards: controlled.filter(cleared).map((w) => ({
        athleteId: w.id, displayName: w.displayName, firstName: (w.legalName || w.displayName).split(/\s+/)[0] ?? w.displayName,
        comingOfAge: comingOfAgeOpen(w),
      })),
      /* Named, but the guardian's own page isn't finished for them yet — nothing is acted for until it is. */
      pendingWards: controlled.filter((w) => !cleared(w)).map((w) => ({ athleteId: w.id, displayName: w.displayName, firstName: firstOf(w) })),
      actingFor: actor.actingFor?.athleteId ?? null,
      guardianControl: null,
    };
  }
  if (actor.athleteId && actor.roles.includes("ATHLETE")) {
    const a = await prisma.athlete.findFirst({ where: { tenantId: actor.tenantId, id: actor.athleteId }, select: CONTROL_SELECT });
    const controlled = a ? guardianControls(a) : false;
    return {
      wards: [],
      actingFor: null,
      guardianControl: a && controlled
        ? { guardianName: a.guardian?.legalName ?? null, comingOfAge: comingOfAgeOpen(a), dueAt: a.comingOfAgeDueAt }
        : null,
    };
  }
  return { wards: [], actingFor: null, guardianControl: null };
}

/**
 * 2S1-BE-11 — "the minor can upload content and the guardian is emailed for
 * every upload". Called inside the upload's own transaction, so the email is
 * queued exactly when the upload is recorded. Only the minor's OWN login
 * triggers it: a guardian uploading for them already knows.
 */
export async function notifyGuardianOfUpload(tx: Prisma.TransactionClient, actor: Actor, upload: { deliverableId: string; assetId: string }) {
  if (!actor.athleteId || !actor.roles.includes("ATHLETE") || actor.actingFor) return;
  const a = await tx.athlete.findFirst({
    where: { tenantId: actor.tenantId, id: actor.athleteId },
    select: { ...CONTROL_SELECT, guardian: { select: { legalName: true, email: true } } },
  });
  if (!a?.guardian || !guardianControls(a)) return;
  const d = await tx.deliverable.findFirst({ where: { tenantId: actor.tenantId, id: upload.deliverableId }, select: { title: true } });
  await send(tx, actor.tenantId, {
    template: "guardian.contentUploaded", to: a.guardian.email, idempotencyKey: `guardian.contentUploaded:${upload.assetId}`,
    data: {
      firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", athleteFirstName: (a.legalName || a.displayName).split(/\s+/)[0] ?? "",
      what: d?.title ?? "a deliverable", reviewUrl: `${env.APP_URL.replace(/\/+$/, "")}/athlete/deliverables/${upload.deliverableId}`,
    },
  });
}

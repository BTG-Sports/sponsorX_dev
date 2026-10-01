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
  guardian: { select: { legalName: true } },
} as const;

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
  if (comingOfAgeOpen(a) && PAUSED.has(act)) throw new ComingOfAgePausedError(first, a.comingOfAgeDueAt);
}

/**
 * The guardian's login as one of their minors, or the actor unchanged.
 *
 * Only a GUARDIAN-only login is changed (a person who is also an athlete
 * acts as themselves). The ward is one this guardian looks after, in their
 * tenant, still under their control and not rejected or terminated. A
 * header naming anyone else means no ward at all — never a fallback to
 * another child, so a stale choice can't act for the wrong one.
 */
export async function actForWard(actor: Actor, requested: string | undefined | null): Promise<Actor> {
  if (!actor.guardianId || !actor.roles.includes("GUARDIAN") || actor.roles.includes("ATHLETE")) return actor;
  const wards = await prisma.athlete.findMany({
    where: {
      tenantId: actor.tenantId, guardianId: actor.guardianId,
      state: { notIn: ["REJECTED", "DRAFT", "FEATURED"] }, comingOfAgeTerminatedAt: null,
    },
    select: CONTROL_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const controlled = wards.filter((w) => guardianControls(w));
  const ward = requested?.trim() ? controlled.find((w) => w.id === requested.trim()) : controlled[0];
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
      where: {
        tenantId: actor.tenantId, guardianId: actor.guardianId,
        state: { notIn: ["REJECTED", "DRAFT", "FEATURED"] }, comingOfAgeTerminatedAt: null,
      },
      select: CONTROL_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return {
      wards: wards.filter((w) => guardianControls(w)).map((w) => ({
        athleteId: w.id, displayName: w.displayName, firstName: (w.legalName || w.displayName).split(/\s+/)[0] ?? w.displayName,
        comingOfAge: comingOfAgeOpen(w),
      })),
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

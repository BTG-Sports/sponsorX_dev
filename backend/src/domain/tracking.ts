/**
 * Tracking links — P6-BE-01 and P6-BE-07, Guide §06, §16.
 *
 * A short link on an athlete's post. The fan taps it, is redirected at once,
 * and the click is recorded afterwards.
 *
 * THE OTHER FUNNEL. A TrackingLink measures AN ATHLETE'S DELIVERABLE; a
 * RewardToken measures A FAN'S JOURNEY. They are separate models, separate
 * event tables and separate modules, because V1 of the guide collapsed them
 * and wrote a TrackingLink id into a column that foreign-keys RewardToken —
 * an insert that could only ever fail. `reward.ts` owns the other one and
 * this file shares no code with it on purpose.
 *
 * THE REDIRECT NEVER WAITS ON A WRITE. `resolveCode` does one indexed read
 * and returns the destination; `recordClick` is called afterwards, from the
 * route's after-response hook. The two are separate exports precisely so the
 * ordering is impossible to get wrong — there is no single function a caller
 * could await before redirecting.
 *
 * GEO IS NOT READ FROM HEADERS. Railway sends no `x-vercel-ip-*`, and relying
 * on host-specific headers is exactly the coupling the portability rule
 * forbids. `recordClick` takes the client IP, enqueues `tracking.resolveGeo`,
 * and the worker fills city and region — then the IP is discarded and never
 * stored (§26).
 */

import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";

export class UnknownTrackingCodeError extends Error {
  readonly status = 404;
  constructor() {
    super("That link is not valid.");
    this.name = "UnknownTrackingCodeError";
  }
}

export class DeliverableAlreadyLinkedError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "This deliverable already has a tracking link. One deliverable has one " +
        "link, so that a click is attributable to exactly one piece of work.",
    );
    this.name = "DeliverableAlreadyLinkedError";
  }
}

/**
 * An opaque short code.
 *
 * NEVER the record id — a sequential or guessable code lets anyone enumerate
 * every campaign's links and inflate another athlete's numbers. 9 bytes of
 * `randomBytes` in base64url is 12 characters and ~72 bits, short enough to
 * sit in a bio link and far past guessing.
 */
export function generateCode(): string {
  return randomBytes(9).toString("base64url");
}

/* ────────────────────────────────────────────────────────────────────────────
   P6-BE-01 / P6-BE-07 · Creating links
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Create the tracking link for one deliverable.
 *
 * P6-BE-07 — "each athlete on a campaign gets a distinct code" — falls out of
 * this rather than needing a separate mechanism, and that is the point.
 * `TrackingLink.deliverableId` is UNIQUE, a deliverable belongs to exactly one
 * CampaignOrder, and an order belongs to exactly one athlete. So one link per
 * deliverable *is* one code per athlete per piece of work, and two athletes on
 * the same campaign can never share a code. `codesForCampaign` below is the
 * read that proves it.
 */
export async function createTrackingLink(
  actor: Actor,
  deliverableId: string,
  destinationUrl: string,
): Promise<{ id: string; code: string }> {
  assertTenantWide(actor, "trackingLink", "write");

  return prisma.$transaction(async (tx) => {
    const deliverable = await tx.deliverable.findFirst({
      where: { ...whereFor(actor, "deliverable", "read"), id: deliverableId },
      select: { id: true, tenantId: true },
    });
    if (!deliverable) throw new ForbiddenError("trackingLink", "write");

    const existing = await tx.trackingLink.findUnique({
      where: { deliverableId },
      select: { id: true },
    });
    if (existing) throw new DeliverableAlreadyLinkedError();

    const link = await tx.trackingLink.create({
      data: {
        tenantId: deliverable.tenantId,
        deliverableId: deliverable.id,
        destinationUrl,
        code: generateCode(),
      },
      select: { id: true, code: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.tracking.linkCreate, "TrackingLink", link.id, {
      after: { deliverableId, destinationUrl },
    });

    return link;
  });
}

/**
 * Every athlete's code on one campaign, with their click count.
 *
 * This is what P6-BE-07 is *for*: "so relative performance is measurable".
 * A code nobody can compare against another athlete's answers no question.
 */
export async function codesForCampaign(
  actor: Actor,
  campaignId: string,
): Promise<{ athleteId: string; deliverableId: string; code: string; clicks: number }[]> {
  assertTenantWide(actor, "trackingLink", "read");

  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: { id: true },
  });
  if (!campaign) throw new ForbiddenError("trackingLink", "read");

  const links = await prisma.trackingLink.findMany({
    where: { deliverable: { is: { order: { is: { campaignId } } } } },
    select: {
      code: true,
      deliverableId: true,
      deliverable: { select: { order: { select: { athleteId: true } } } },
      _count: { select: { events: true } },
    },
  });

  return links.map((l) => ({
    athleteId: l.deliverable.order.athleteId,
    deliverableId: l.deliverableId,
    code: l.code,
    clicks: l._count.events,
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
   P6-BE-01 · The redirect path
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Resolve a code to its destination. READ ONLY — no write, no side effect.
 *
 * Public: the fan has no account. One indexed lookup on the unique `code`
 * column, and nothing else happens before the 302 goes out.
 */
export async function resolveCode(
  code: string,
): Promise<{ linkId: string; tenantId: string; destinationUrl: string }> {
  const link = await prisma.trackingLink.findUnique({
    where: { code },
    select: { id: true, tenantId: true, destinationUrl: true },
  });
  if (!link) throw new UnknownTrackingCodeError();

  return {
    linkId: link.id,
    tenantId: link.tenantId,
    destinationUrl: link.destinationUrl,
  };
}

/**
 * Record the click. Called AFTER the response has been sent.
 *
 * The LinkEvent row and the geo job are written in one transaction, so a
 * click never exists without its follow-up queued, and a job never points at
 * a row that was rolled back.
 *
 * The IP goes into the job payload and never into a column — the worker turns
 * it into city and region and drops it (§26).
 */
export async function recordClick(
  linkId: string,
  tenantId: string,
  clientIp?: string | null,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.linkEvent.create({
      data: { tenantId, linkId },
      select: { id: true },
    });

    if (clientIp) {
      await enqueue(tx, tenantId, "tracking.resolveGeo", {
        linkEventId: event.id,
        clientIp,
      });
    }

    return event;
  });
}

/** Clicks on one link. The athlete-facing number. */
export async function clicksForLink(
  actor: Actor,
  linkId: string,
): Promise<{ linkId: string; clicks: number }> {
  assertTenantWide(actor, "trackingLink", "read");

  const link = await prisma.trackingLink.findFirst({
    where: { ...whereFor(actor, "trackingLink", "read"), id: linkId },
    select: { id: true, _count: { select: { events: true } } },
  });
  if (!link) throw new ForbiddenError("trackingLink", "read");

  return { linkId: link.id, clicks: link._count.events };
}

/* `applyGeo` deliberately does not live here yet. The geo worker job is
   P6-BE-05, and a function no caller can reach is a capability the board
   would claim and the product would not have — the job payload enqueued
   above is the whole of this task's contribution to it. */

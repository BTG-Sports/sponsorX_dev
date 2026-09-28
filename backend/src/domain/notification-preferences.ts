/**
 * Notification preferences — 2S6-BE-02.
 *
 * "A user can mute a channel per event type and the worker honours it."
 *
 * A preference is (user, event, channel) → muted. No row is the default:
 * delivered. The API writes only the caller's own rows; the WORKER is where
 * it is honoured, at send time, so a mute set after a job was queued still
 * stops it (worker/jobs/send-email.mts, `mutedFor`).
 *
 * Not every message can be muted. The ones that decide something about the
 * person — an application's outcome, a guardian's authorisation, an
 * organisation's approval or suspension — are always sent: muting one would
 * let a user miss the only notice of a decision about them. Fans are not
 * users at all; theirs is the one-tap unsubscribe (P6-SEC-03).
 */
import type { Actor } from "../auth/actor";
import { can, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { prisma } from "../db/client";

import { CHANNELS, MUTABLE_EVENTS } from "./notification-rules";

export { CHANNELS, MUTABLE_EVENTS };

export class PreferenceError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "PreferenceError";
  }
}

export async function listPreferences(actor: Actor) {
  if (!can(actor, "notificationPreference", "read")) throw new ForbiddenError("notificationPreference", "read");
  const rows = await prisma.notificationPreference.findMany({
    where: whereFor(actor, "notificationPreference", "read"),
    select: { event: true, channel: true, muted: true },
  });
  const muted = new Set(rows.filter((r) => r.muted).map((r) => `${r.event}|${r.channel}`));
  return MUTABLE_EVENTS.flatMap((event) =>
    CHANNELS.map((channel) => ({ event, channel, muted: muted.has(`${event}|${channel}`) })),
  );
}

export async function setPreference(actor: Actor, input: { event: string; channel: string; muted: boolean }) {
  if (!can(actor, "notificationPreference", "write")) throw new ForbiddenError("notificationPreference", "write");
  if (!(MUTABLE_EVENTS as readonly string[]).includes(input.event)) {
    throw new PreferenceError(`${input.event} cannot be muted — it tells you about a decision on your account.`);
  }
  if (!(CHANNELS as readonly string[]).includes(input.channel)) throw new PreferenceError(`Unknown channel ${input.channel}.`);
  await prisma.notificationPreference.upsert({
    /* tenant-scope: keyed by the caller's own user id, never one from the request; a user belongs to one tenant. */
    where: { userId_event_channel: { userId: actor.userId, event: input.event, channel: input.channel } },
    create: { tenantId: actor.tenantId, userId: actor.userId, event: input.event, channel: input.channel, muted: input.muted },
    update: { muted: input.muted },
    select: { id: true },
  });
  return listPreferences(actor);
}

/**
 * POST /live-passes — a pass to the live socket service, for one channel.
 * 2S4-BE-18, option B (owner, 2026-11-19). Spec:
 * documentation/SponsorX-Socket-Service.md.
 *
 * A browser asks only when a chat is open or visible on its screen (a chat's
 * channel), or when its Messages list is (the person's inbox). The person is
 * already signed in — this request carries their session like every other —
 * and the API checks, right then:
 *
 *   - CHAT: they may read the chat (whereFor(dealChat, read), so a minor's
 *     chat is the guardian's), and the chat has begun and not ended (OPEN,
 *     and its order not cancelled, closed or refunded). Their side decides
 *     the channel: chat:<id>:sponsor | chat:<id>:seller | chat:<id>:btg. The
 *     socket service sends a held message's notice only to the sender's side
 *     and BTG, so the channel IS the permission.
 *   - INBOX: their own party has a chat in progress — the sponsor, the
 *     athlete (or the guardian acting for them), the team — or, for BTG's
 *     desk, there is one in their tenant.
 *
 * Nothing is live before a chat has begun or after it ends. The pass is good
 * for 60 seconds and one connection or one join; the socket service asks for
 * a fresh one every 15 minutes, so access is checked again.
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, can, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { env } from "../config/env";
import { limit } from "../lib/rate-limit";
import { issuePass, liveConfigured, SOCKET_PATH } from "../realtime/pass";
import { ENDED_ORDER_STATES, sideOf } from "./deal-chat";

export class LivePassError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "LivePassError";
    this.status = status;
  }
}

export type LivePassInput = { kind: "chat"; chatId: string } | { kind: "inbox" };
export type LivePass = { url: string; path: string; channel: string; pass: string; expiresAt: string };

/** Passes per person per minute: a few open chats re-joining, with room to spare. */
const PASSES_PER_MINUTE = 120;

export async function requestLivePass(actor: Actor, input: LivePassInput, now = new Date()): Promise<LivePass> {
  if (!actor.userId) throw new ForbiddenError("dealChat", "read");
  if (!liveConfigured()) throw new LivePassError("Live updates aren't switched on here.", 503);
  await limit("livePass", actor.userId, PASSES_PER_MINUTE, 60);
  const channel = input.kind === "chat" ? await chatChannel(actor, input.chatId) : await inboxChannel(actor);
  const { pass, expiresAt } = issuePass(actor.userId, channel, now);
  return { url: env.SOCKETSERVICE_PUBLIC_URL!, path: SOCKET_PATH, channel, pass, expiresAt };
}

async function chatChannel(actor: Actor, chatId: string): Promise<string> {
  assertAllowed(actor, "dealChat", "read");
  const c = await prisma.dealChat.findFirst({
    where: { ...whereFor(actor, "dealChat", "read"), id: chatId },
    select: { id: true, tenantId: true, sponsorId: true, athleteId: true, propertyId: true, state: true, order: { select: { state: true } } },
  });
  if (!c) throw new ForbiddenError("dealChat", "read");
  if (c.state !== "OPEN" || ENDED_ORDER_STATES.has(c.order.state)) throw new LivePassError("This chat has ended, so it isn't live any more.");
  const side = sideOf(actor, c);
  return `chat:${c.id}:${side === "SPONSOR" ? "sponsor" : side === "SELLER" ? "seller" : "btg"}`;
}

const SPONSOR_ROLES = ["SPONSOR_ADMIN", "SPONSOR_ANALYST"] as const;

async function inboxChannel(actor: Actor): Promise<string> {
  assertAllowed(actor, "dealChat", "read");
  const open = { state: "OPEN" } as const;
  const has = async (where: Record<string, unknown>) =>
    Boolean(await prisma.dealChat.findFirst({ where: { ...whereFor(actor, "dealChat", "read"), ...open, ...where }, select: { id: true } }));

  let channel: string | null = null;
  let party: Record<string, unknown> = {};
  if (actor.sponsorId && SPONSOR_ROLES.some((r) => actor.roles.includes(r))) {
    channel = `inbox:sponsor:${actor.sponsorId}`;
    party = { sponsorId: actor.sponsorId, tenantId: actor.tenantId };
  } else if (actor.athleteId && actor.roles.includes("ATHLETE")) {
    channel = `inbox:athlete:${actor.athleteId}`;
    party = { athleteId: actor.athleteId };
  } else if (actor.propertyId && actor.roles.includes("PROPERTY_MGR")) {
    channel = `inbox:property:${actor.propertyId}`;
    party = { propertyId: actor.propertyId };
  } else if (can(actor, "dealChatReview", "read")) {
    assertTenantWide(actor, "dealChatReview", "read");
    channel = `inbox:btg:${actor.tenantId}`;
    party = { tenantId: actor.tenantId };
  }
  if (!channel) throw new ForbiddenError("dealChat", "read");
  if (!(await has(party))) throw new LivePassError("No chat has begun yet, so there is nothing live to follow.");
  return channel;
}

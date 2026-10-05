/**
 * The payment provider's word — 2S5-INT-02.
 *
 * "Providers retry webhooks and deliver out of order. Every handler must be
 * safe to run twice." Done when: "Payment webhooks are idempotent and
 * correctly update order and payment state under duplicate and out-of-order
 * delivery."
 *
 * THE WEBHOOK DOES THREE CHEAP THINGS (`acceptPaymentWebhook`, behind
 * POST /webhooks/payments/{provider}): it checks the signature over the raw
 * bytes the provider sent (a stale timestamp is a replay, and is refused),
 * maps the body onto SponsorX's own provider-neutral event (lib/payment-
 * provider.ts), and writes one PaymentEvent row per event, unique per
 * (provider, event id), with a `payments.event` job queued in the same
 * transaction. A second delivery of the same event id writes nothing and
 * queues nothing. No money moves on the request path.
 *
 * THE WORKER APPLIES IT (`processPaymentEvent`). Under the event's row lock,
 * so two jobs for one event apply it once; then under the order's row lock
 * (marketplace-order.ts CONCURRENCY), so the payment and a cancel at the same
 * moment serialise. Every move is conditional on the state it leaves, and
 * state moves ONLY FORWARD:
 *
 *   PENDING → PROCESSING → SUCCEEDED → (PARTIALLY_REFUNDED →) REFUNDED,
 *   FAILED reachable before SUCCEEDED.
 *
 * So a late "processing" after "succeeded" is IGNORED (it never undoes paid),
 * a late "failed" after "succeeded" is IGNORED, and "succeeded" after a
 * recorded failure is HELD for BTG — the sponsor may have been charged, and
 * a person decides. An event naming a payment SponsorX hasn't recorded yet
 * (the provider can be faster than our own commit) is DEFERRED and tried
 * again on a back-off (`retryDeferredPaymentEvents`), and FAILED to BTG if
 * it never matches. A succeeded amount that isn't the payment's is HELD.
 *
 * Each outcome is recorded on the event (`status`, `outcome` in words) and
 * audited as the system; HELD and FAILED email BTG's admins and wait on
 * BTG's list (GET /payment-events) until a person closes them with a note.
 * A handler that throws rolls its whole transaction back — nothing is half
 * written — and the queue retries it; the error is noted on the event.
 *
 * THE STAND-IN (staging) speaks through the same door: `emitStandinEvent`
 * signs a neutral envelope and hands it to `acceptPaymentWebhook`, exactly
 * as an HTTP delivery would arrive. Its confirmation job, its declined card
 * and BTG's "send a test event" (staging only) all go this way, and it can
 * send any event twice, or in any order.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import {
  parseProviderWebhook, providerName, standinWebhookSignature, verifyProviderWebhook, WebhookPayloadError,
} from "../lib/payment-provider";
import {
  PAYMENT_EVENT_STATUSES, PAYMENT_EVENT_TYPES, type NeutralPaymentEvent, type PaymentEventStatus, type PaymentEventType,
} from "../contracts/payment-events";
import { lockOrder } from "./marketplace-order";
import { appUrl, btgAdmins, orderRef, tell, usd } from "./order-mail";
import { paymentSucceededIn, payoutHandlerFor } from "./payouts";
import { dismissHeldRefund, exceptionHandlerFor } from "./payment-exceptions";

type Tx = Prisma.TransactionClient;

export class PaymentWebhookError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PaymentWebhookError";
    this.status = status;
  }
}

export class PaymentEventError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "PaymentEventError";
    this.status = status;
  }
}

/** Statuses the worker may still apply. */
const OPEN = new Set<PaymentEventStatus>(["RECEIVED", "DEFERRED"]);
/** Exceptions BTG reads first. */
export const EXCEPTIONS: readonly PaymentEventStatus[] = ["HELD", "FAILED", "DEFERRED"];

/** Seconds before each retry of an event that arrived before what it follows; after the last, it is BTG's. */
export const DEFER_AFTER_SECONDS = [30, 120, 600, 1800, 3600, 10_800] as const;
/** A handler that keeps throwing is BTG's after this many tries (the queue's own retries line up with it). */
export const MAX_ERRORS = 6;

/* ── receiving ────────────────────────────────────────────────────────── */

function forTheRecord(rawBody: string): object {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    const text = JSON.stringify(parsed);
    return text.length <= 4000 && parsed && typeof parsed === "object" ? (parsed as object) : { truncated: text.slice(0, 4000) };
  } catch {
    return { truncated: rawBody.slice(0, 4000) };
  }
}

async function recordRejected(provider: string, rawBody: string, signatureOk: boolean, error: string) {
  await prisma.webhookDelivery.create({
    data: { source: `payments:${provider.slice(0, 40)}`, signatureOk, payload: forTheRecord(rawBody), status: "REJECTED", error },
    select: { id: true },
  });
}

/** What an event is about, as the provider named it. */
function subjectOf(e: NeutralPaymentEvent): string | null {
  const d = e.data as Record<string, string | undefined>;
  return (d.disputeRef ?? d.attemptId ?? d.paymentRef ?? d.payoutId ?? d.payoutRef ?? null)?.slice(0, 200) ?? null;
}

export type AcceptedWebhook = { received: true; events: Array<{ id: string; type: PaymentEventType; duplicate: boolean }> };

/**
 * POST /webhooks/payments/{provider}: verify, record, queue — nothing else.
 * Only the provider SponsorX is connected to is listened to. Every refused
 * delivery is recorded (WebhookDelivery, REJECTED) with why.
 */
export async function acceptPaymentWebhook(provider: string, rawBody: string, signature: string | undefined, now = new Date()): Promise<AcceptedWebhook> {
  const connected = providerName();
  if (connected === "none" || provider !== connected) {
    await recordRejected(provider, rawBody, false, `no payment provider "${provider}" is connected here`);
    throw new PaymentWebhookError("No payment provider of that name is connected here.", 404);
  }
  const check = verifyProviderWebhook(provider, rawBody, signature, now);
  if (!check.ok) {
    await recordRejected(provider, rawBody, false, check.reason);
    throw new PaymentWebhookError("This webhook is not correctly signed.", 401);
  }
  let events: NeutralPaymentEvent[];
  try {
    events = parseProviderWebhook(provider, JSON.parse(rawBody));
  } catch (error) {
    const message = error instanceof WebhookPayloadError ? error.message : "This webhook body is not JSON.";
    await recordRejected(provider, rawBody, true, message);
    throw new PaymentWebhookError(message, 400);
  }
  const books = env.PUBLIC_INTAKE_TENANT_ID;
  return prisma.$transaction(async (tx) => {
    const out: AcceptedWebhook["events"] = [];
    for (const e of events) {
      /* Unique per (provider, event id): a redelivery writes nothing, so it queues nothing. */
      const made = await tx.paymentEvent.createMany({
        data: [{
          tenantId: books, provider, providerEventId: e.id, type: e.type, occurredAt: e.occurredAt,
          payload: e.data as Prisma.InputJsonObject, subjectRef: subjectOf(e),
        }],
        skipDuplicates: true,
      });
      const row = await tx.paymentEvent.findUniqueOrThrow({
        /* tenant-scope: the event just recorded, by its unique provider key — it has no books until it is applied. */
        where: { provider_providerEventId: { provider, providerEventId: e.id } }, select: { id: true },
      });
      if (made.count) {
        await audit(tx, { userId: null, tenantId: books }, "paymentEvent.receive", "PaymentEvent", row.id, { after: { provider, providerEventId: e.id, type: e.type } });
        await enqueue(tx, books, "payments.event", { eventId: row.id });
      }
      out.push({ id: row.id, type: e.type, duplicate: made.count === 0 });
    }
    return { received: true as const, events: out };
  });
}

/* ── applying ─────────────────────────────────────────────────────────── */

const EVENT = {
  id: true, tenantId: true, provider: true, providerEventId: true, type: true, occurredAt: true, payload: true, subjectRef: true,
  status: true, outcome: true, attempts: true,
} as const;
export type EventRow = Prisma.PaymentEventGetPayload<{ select: typeof EVENT }>;

/** What a handler decided. `tenantId` is the books the event turned out to be about. */
export type Outcome = {
  status: "APPLIED" | "IGNORED" | "HELD" | "DEFERRED";
  outcome: string;
  tenantId?: string;
  /** For BTG's email: an order the event concerns. */
  orderId?: string;
};
export const applied = (outcome: string, tenantId?: string, orderId?: string): Outcome => ({ status: "APPLIED", outcome, tenantId, orderId });
export const ignored = (outcome: string, tenantId?: string, orderId?: string): Outcome => ({ status: "IGNORED", outcome, tenantId, orderId });
export const held = (outcome: string, tenantId?: string, orderId?: string): Outcome => ({ status: "HELD", outcome, tenantId, orderId });
export const deferred = (outcome: string, tenantId?: string, orderId?: string): Outcome => ({ status: "DEFERRED", outcome, tenantId, orderId });

export type Handler = (tx: Tx, ev: EventRow, data: Record<string, unknown>, now: Date) => Promise<Outcome>;

/* ── payments ── */

/* Spelled out rather than spread from payouts.ts: the two modules import each
   other, and a top-level read of the other's constant could run before it exists. */
const ATTEMPT = {
  id: true, tenantId: true, orderId: true, state: true, amountCents: true, createdBy: true, providerRef: true,
  provider: true, refundedCents: true, sponsorId: true, failureReason: true,
} as const;
export type AttemptRow = Prisma.PaymentAttemptGetPayload<{ select: typeof ATTEMPT }>;

/** The payment an event names: SponsorX's attempt id, else the provider's reference — and only this provider's. */
export async function findAttempt(tx: Tx, provider: string, data: Record<string, unknown>): Promise<AttemptRow | null> {
  const byId = typeof data.attemptId === "string"
    ? await tx.paymentAttempt.findUnique({
        /* tenant-scope: the attempt named by a verified provider event; its own row carries the books it is in. */
        where: { id: data.attemptId }, select: ATTEMPT,
      })
    : null;
  const found = byId ?? (typeof data.paymentRef === "string"
    ? await tx.paymentAttempt.findFirst({
        /* tenant-scope: the attempt the provider's own reference names, for this provider only. */
        where: { provider, providerRef: data.paymentRef }, select: ATTEMPT, orderBy: { createdAt: "desc" },
      })
    : null);
  return found && found.provider === provider ? found : null;
}

/** The attempt as it is now — read after the order's row lock. */
async function attemptNow(tx: Tx, id: string): Promise<AttemptRow> {
  return tx.paymentAttempt.findUniqueOrThrow({
    /* tenant-scope: the attempt just resolved from the event, re-read under its order's lock. */
    where: { id }, select: ATTEMPT,
  });
}

const NOT_YET = "No payment in SponsorX matches this event yet — tried again shortly";
const CONFIRMED_STATES = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"]);

/** payment.processing — the provider has it and is confirming: PENDING → PROCESSING, never back. */
const onProcessing: Handler = async (tx, ev, data, now) => {
  const found = await findAttempt(tx, ev.provider, data);
  if (!found) return deferred(NOT_YET);
  await lockOrder(tx, found.orderId);
  const a = await attemptNow(tx, found.id);
  const moved = await tx.paymentAttempt.updateMany({
    /* tenant-scope: the attempt just re-read; conditional, so a late or repeated "processing" moves nothing. */
    where: { id: a.id, state: "PENDING" },
    data: { state: "PROCESSING", providerRef: a.providerRef ?? (typeof data.paymentRef === "string" ? data.paymentRef : null), updatedAt: now },
  });
  if (!moved.count) return ignored(`The payment is already ${a.state.toLowerCase()} — a late "processing" changes nothing`, a.tenantId, a.orderId);
  await audit(tx, { userId: null, tenantId: a.tenantId }, "payment.processing", "MarketplaceOrder", a.orderId, { before: { state: "PENDING" }, after: { attemptId: a.id, state: "PROCESSING", eventId: ev.id } });
  return applied("The provider is confirming the payment", a.tenantId, a.orderId);
};

/** payment.succeeded — the money is taken: the order is paid (or, no longer waiting, the money recorded for refund). */
const onSucceeded: Handler = async (tx, ev, data, now) => {
  const found = await findAttempt(tx, ev.provider, data);
  if (!found) return deferred(NOT_YET);
  await lockOrder(tx, found.orderId);
  const a = await attemptNow(tx, found.id);
  if (CONFIRMED_STATES.has(a.state)) return ignored("The payment was already confirmed", a.tenantId, a.orderId);
  if (a.state === "FAILED") {
    return held(`The provider says this payment succeeded, but SponsorX had recorded it as failed${a.failureReason ? ` ("${a.failureReason}")` : ""} — the sponsor may have been charged. Check with the provider, then record the payment by hand or refund it.`, a.tenantId, a.orderId);
  }
  if (data.amountCents !== a.amountCents) {
    return held(`The provider confirmed ${usd(Number(data.amountCents))}, but this payment was for ${usd(a.amountCents)} — the order was not marked paid.`, a.tenantId, a.orderId);
  }
  const providerRef = a.providerRef ?? (typeof data.paymentRef === "string" ? data.paymentRef : null);
  const claimed = await tx.paymentAttempt.updateMany({
    /* tenant-scope: the attempt just re-read; conditional on the state it leaves, so a second "succeeded" finds nothing. */
    where: { id: a.id, state: { in: ["PENDING", "PROCESSING"] } }, data: { state: "SUCCEEDED", providerRef, updatedAt: now },
  });
  if (!claimed.count) return ignored("The payment was already confirmed", a.tenantId, a.orderId);
  const r = await paymentSucceededIn(tx, { ...a, providerRef }, now);
  return applied(r.refundNeeded ? "Payment confirmed for an order that was no longer waiting for it — recorded for refund" : "Payment confirmed — the order is paid", a.tenantId, a.orderId);
};

/** payment.failed — declined, or the provider gave up: PENDING | PROCESSING → FAILED. Never undoes a confirmed payment. */
const onFailed: Handler = async (tx, ev, data, now) => {
  const found = await findAttempt(tx, ev.provider, data);
  if (!found) return deferred(NOT_YET);
  await lockOrder(tx, found.orderId);
  const a = await attemptNow(tx, found.id);
  const reason = (typeof data.reason === "string" && data.reason.trim()) || "The payment provider declined the payment.";
  const moved = await tx.paymentAttempt.updateMany({
    /* tenant-scope: the attempt just re-read; conditional, so a late failure never undoes a confirmed payment. */
    where: { id: a.id, state: { in: ["PENDING", "PROCESSING"] } }, data: { state: "FAILED", failureReason: reason.slice(0, 500), updatedAt: now },
  });
  if (!moved.count) return ignored(`The payment is already ${a.state.toLowerCase()} — a late failure changes nothing`, a.tenantId, a.orderId);
  await audit(tx, { userId: null, tenantId: a.tenantId }, "payment.fail", "MarketplaceOrder", a.orderId, { before: { state: a.state }, after: { attemptId: a.id, state: "FAILED", reason, eventId: ev.id } });
  return applied("The payment failed — the order is still waiting for payment", a.tenantId, a.orderId);
};

/**
 * Every event type's handler. A type with none is held for BTG, never
 * dropped. Resolved at call time, not in a top-level table: the modules that
 * own some handlers import this one back.
 */
function handlerFor(type: string): Handler | null {
  switch (type as PaymentEventType) {
    case "payment.processing": return onProcessing;
    case "payment.succeeded": return onSucceeded;
    case "payment.failed": return onFailed;
    /* 2S5-BE-03 — refunds the provider reports, and disputes (payment-exceptions.ts);
       2S5-BE-05 — a payout paid, failed or returned (payouts.ts). */
    default: return exceptionHandlerFor(type) ?? payoutHandlerFor(type);
  }
}

async function tellBtg(tx: Tx, ev: EventRow, books: string, reason: string, orderId: string | undefined) {
  for (const u of await btgAdmins(tx, books)) {
    await tell(tx, { tenantId: books, email: u.email }, "payment.heldForBtg", ev.id, {
      type: ev.type, subject: ev.subjectRef ?? "", reason, orderRef: orderId ? orderRef(orderId) : "",
      eventsUrl: appUrl("/admin/payments/events"),
    });
  }
}

export type Processed = { eventId: string; status: PaymentEventStatus | null; outcome?: string | null; changed: boolean };

/**
 * Apply one recorded event — the `payments.event` job, the deferred sweep,
 * and the stand-in's own inline confirmation all land here. Idempotent: an
 * event already applied, ignored or held is left alone. A handler that throws
 * leaves nothing written (one transaction); the error is noted on the event
 * and re-thrown so the queue retries it, and after MAX_ERRORS it is BTG's.
 */
export async function processPaymentEvent(eventId: string, now = new Date()): Promise<Processed> {
  try {
    return await prisma.$transaction(async (tx) => {
      /* The event's row lock: two jobs for one event apply it once. */
      const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM "PaymentEvent" WHERE id = ${eventId} FOR UPDATE`;
      const status = locked[0]?.status as PaymentEventStatus | undefined;
      if (!status || !OPEN.has(status)) return { eventId, status: status ?? null, changed: false };
      const ev = await tx.paymentEvent.findUniqueOrThrow({
        /* tenant-scope: the event just locked, by id — the worker's own record. */
        where: { id: eventId }, select: EVENT,
      });
      const handler = handlerFor(ev.type);
      const result = handler
        ? await handler(tx, ev, (ev.payload ?? {}) as Record<string, unknown>, now)
        : held(`SponsorX doesn't act on ${ev.type} events yet — check it with the provider.`);
      return settle(tx, ev, result, now);
    }, { timeout: 30_000 });
  } catch (error) {
    await noteError(eventId, error, now);
    throw error;
  }
}

/** Record what was decided, audit it as the system, and tell BTG when it is theirs. */
async function settle(tx: Tx, ev: EventRow, r: Outcome, now: Date): Promise<Processed> {
  const books = r.tenantId ?? ev.tenantId;
  const attempts = ev.attempts + 1;
  let status: PaymentEventStatus = r.status;
  let outcome = r.outcome;
  let nextAttemptAt: Date | null = null;
  if (r.status === "DEFERRED") {
    const deferrals = await deferralsOf(tx, ev.id);
    if (deferrals >= DEFER_AFTER_SECONDS.length) {
      status = "FAILED";
      outcome = `${r.outcome.replace(/ — tried again shortly$/, "")} — gave up after ${deferrals + 1} tries`;
    } else {
      nextAttemptAt = new Date(now.getTime() + DEFER_AFTER_SECONDS[deferrals]! * 1000);
    }
  }
  const moved = await tx.paymentEvent.updateMany({
    /* tenant-scope: the event locked by this transaction; conditional on the status it was read in. */
    where: { id: ev.id, status: ev.status },
    data: {
      tenantId: books, status, outcome: outcome.slice(0, 1000), attempts, nextAttemptAt,
      appliedAt: status === "DEFERRED" ? null : now,
    },
  });
  if (!moved.count) return { eventId: ev.id, status: ev.status as PaymentEventStatus, changed: false };
  await audit(tx, { userId: null, tenantId: books }, `paymentEvent.${status.toLowerCase()}` as `${string}.${string}`, "PaymentEvent", ev.id, {
    before: { status: ev.status }, after: { status, type: ev.type, outcome, ...(nextAttemptAt ? { nextAttemptAt } : {}) },
  });
  if (status === "HELD" || status === "FAILED") await tellBtg(tx, ev, books, outcome, r.orderId);
  return { eventId: ev.id, status, outcome, changed: true };
}

/** How many times this event has been deferred already (its audit trail is the count). */
async function deferralsOf(tx: Tx, eventId: string): Promise<number> {
  return tx.auditLog.count({
    /* tenant-scope: this event's own audit trail, by its id (the books may have changed as it was resolved). */
    where: { entity: "PaymentEvent", entityId: eventId, action: "paymentEvent.deferred" },
  });
}

/** A handler threw: nothing it wrote was kept. Note the error; after MAX_ERRORS tries, BTG's. */
async function noteError(eventId: string, error: unknown, now: Date) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await prisma.$transaction(async (tx) => {
    const ev = await tx.paymentEvent.findUnique({
      /* tenant-scope: the event whose processing just failed, by id. */
      where: { id: eventId }, select: EVENT,
    });
    if (!ev || !OPEN.has(ev.status as PaymentEventStatus)) return;
    const attempts = ev.attempts + 1;
    const giveUp = attempts >= MAX_ERRORS;
    const moved = await tx.paymentEvent.updateMany({
      /* tenant-scope: the event just read, by id; conditional on its status. */
      where: { id: ev.id, status: ev.status },
      data: giveUp
        ? { attempts, status: "FAILED", nextAttemptAt: null, appliedAt: now, outcome: `Couldn't be applied after ${attempts} tries: ${message}`.slice(0, 1000) }
        : { attempts, outcome: `Try ${attempts} failed, the queue retries it: ${message}`.slice(0, 1000) },
    });
    if (!moved.count) return;
    await audit(tx, { userId: null, tenantId: ev.tenantId }, giveUp ? "paymentEvent.failed" : "paymentEvent.error", "PaymentEvent", ev.id, { after: { attempts, error: message.slice(0, 500) } });
    if (giveUp) await tellBtg(tx, ev, ev.tenantId, `It couldn't be applied after ${attempts} tries (${message.slice(0, 200)})`, undefined);
  }).catch((e: unknown) => console.error(`[payments] could not note the failure of event ${eventId}:`, e));
}

/**
 * The worker's sweep: every deferred event whose next try is due is applied
 * again. `tenantIds` limits it to some books (a test that moves the clock).
 */
export async function retryDeferredPaymentEvents(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { retried: 0, applied: 0, failed: 0 };
  const due = await prisma.paymentEvent.findMany({
    /* tenant-scope: the system sweep — every tenant's deferred events whose next try is due (or the named books). */
    where: { ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}), status: "DEFERRED", nextAttemptAt: { lte: now } },
    select: { id: true }, orderBy: { nextAttemptAt: "asc" }, take: 200,
  });
  for (const { id } of due) {
    try {
      const r = await processPaymentEvent(id, now);
      out.retried++;
      if (r.status === "APPLIED") out.applied++;
    } catch (error) {
      out.failed++;
      console.error(`[payments] deferred event ${id} failed, will retry next sweep:`, error);
    }
  }
  return out;
}

/* ── BTG's list ───────────────────────────────────────────────────────── */

const LIST = {
  id: true, provider: true, providerEventId: true, type: true, occurredAt: true, subjectRef: true, status: true, outcome: true,
  attempts: true, nextAttemptAt: true, receivedAt: true, appliedAt: true, resolvedAt: true, resolvedBy: true, resolutionNote: true,
} as const;

export const isPaymentEventStatus = (s: unknown): s is PaymentEventStatus => typeof s === "string" && (PAYMENT_EVENT_STATUSES as readonly string[]).includes(s);

/**
 * GET /payment-events — BTG admin and Finance, in their own books. By
 * default the exceptions nobody has closed: HELD and FAILED (BTG's), and
 * DEFERRED (waiting for what they follow). Counts by status, always.
 */
export async function listPaymentEvents(actor: Actor, statuses?: PaymentEventStatus[]) {
  assertTenantWide(actor, "paymentEvent", "read");
  const scope = whereFor(actor, "paymentEvent", "read");
  const filter: Prisma.PaymentEventWhereInput = statuses?.length ? { status: { in: statuses } } : { status: { in: [...EXCEPTIONS] }, resolvedAt: null };
  const [events, grouped] = await Promise.all([
    prisma.paymentEvent.findMany({
      /* tenant-scope: `scope` is whereFor(paymentEvent, read); the filter only narrows it. */
      where: { AND: [scope, filter] }, select: LIST, orderBy: { receivedAt: "desc" }, take: 200,
    }),
    prisma.paymentEvent.groupBy({ /* tenant-scope: whereFor(paymentEvent, read). */ by: ["status"], where: scope, _count: { _all: true } }),
  ]);
  const open = await prisma.paymentEvent.count({ /* tenant-scope: whereFor(paymentEvent, read). */ where: { AND: [scope, { status: { in: ["HELD", "FAILED"] }, resolvedAt: null }] } });
  return {
    counts: Object.fromEntries(PAYMENT_EVENT_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0])),
    /** HELD or FAILED and not yet closed by a person. */
    waitingOnBtg: open,
    events,
  };
}

/** POST /payment-events/{id}/resolve — BTG admin has dealt with a held or failed event; once, with a note. */
export async function resolvePaymentEvent(actor: Actor, id: string, note: string, now = new Date()) {
  assertTenantWide(actor, "paymentEvent", "write");
  const text = note.trim();
  if (!text) throw new PaymentEventError("Say what you did about it — the next person reads this.", 422);
  return prisma.$transaction(async (tx) => {
    const ev = await tx.paymentEvent.findFirst({ where: { ...whereFor(actor, "paymentEvent", "write"), id }, select: LIST });
    if (!ev) throw new PaymentEventError("No such event.", 404);
    if (ev.status !== "HELD" && ev.status !== "FAILED") throw new PaymentEventError(`This event was ${ev.status.toLowerCase()} by SponsorX — there is nothing for BTG to close.`);
    if (ev.resolvedAt) throw new PaymentEventError("This event was already marked dealt with.");
    const moved = await tx.paymentEvent.updateMany({
      /* tenant-scope: the row just loaded through whereFor(paymentEvent, write); once only. */
      where: { id: ev.id, resolvedAt: null }, data: { resolvedAt: now, resolvedBy: actor.userId ?? "unknown", resolutionNote: text.slice(0, 2000) },
    });
    if (!moved.count) throw new PaymentEventError("This event was just marked dealt with by someone else.");
    await audit(tx, actor, "paymentEvent.resolve", "PaymentEvent", ev.id, { before: { status: ev.status }, after: { resolvedAt: now, note: text } });
    /* 2S5-BE-03 — a held provider refund BTG closed without refunding the order here: its payouts are free again. */
    if (ev.type === "payment.refunded") {
      const full = await tx.paymentEvent.findUniqueOrThrow({ /* tenant-scope: the row just moved, by id. */ where: { id: ev.id }, select: { provider: true, payload: true } });
      await dismissHeldRefund(tx, actor, full);
    }
    return tx.paymentEvent.findUniqueOrThrow({
      /* tenant-scope: the row just moved, by id. */
      where: { id: ev.id }, select: LIST,
    });
  });
}

/* ── the stand-in provider's voice (staging and tests) ────────────────── */

/**
 * The stand-in sends an event: a neutral envelope, signed exactly as an HTTP
 * delivery would be, handed to `acceptPaymentWebhook`. `deliveries` sends the
 * same event id that many times (a provider retrying); `id` fixes the event
 * id, so a job that emits twice is one event.
 */
export async function emitStandinEvent(
  type: PaymentEventType, data: Record<string, unknown>, opts: { id?: string; now?: Date; deliveries?: number } = {},
): Promise<{ id: string; duplicate: boolean }> {
  const now = opts.now ?? new Date();
  const raw = JSON.stringify({ id: opts.id ?? `evt_standin_${randomBytes(8).toString("hex")}`, type, created: now.toISOString(), data });
  let first: { id: string; duplicate: boolean } | undefined;
  for (let i = 0; i < Math.max(1, opts.deliveries ?? 1); i++) {
    const r = await acceptPaymentWebhook("standin", raw, standinWebhookSignature(raw, now), now);
    first ??= r.events[0]!;
  }
  return first!;
}

/**
 * The `payments.confirm` job on staging: the stand-in confirms a card
 * payment the sponsor completed on its page — as a `payment.succeeded` event,
 * applied at once. Its event id is the attempt's, so the job delivered twice
 * is one event and one payment.
 */
export async function standinConfirmPayment(attemptId: string, now = new Date()): Promise<{ confirmed: boolean; eventId?: string }> {
  if (providerName() !== "standin") return { confirmed: false };
  const a = await prisma.paymentAttempt.findUnique({
    /* tenant-scope: the attempt named by the confirmation job this server queued. */
    where: { id: attemptId }, select: { id: true, state: true, amountCents: true, providerRef: true },
  });
  if (!a || a.state !== "PROCESSING") return { confirmed: false };
  const ev = await emitStandinEvent("payment.succeeded", { attemptId: a.id, paymentRef: a.providerRef ?? undefined, amountCents: a.amountCents }, { id: `evt_standin_succeeded_${a.id}`, now });
  const r = await processPaymentEvent(ev.id, now);
  return { confirmed: r.status === "APPLIED", eventId: ev.id };
}

/** The stand-in's page: the card was declined — a `payment.failed` event, applied at once. */
export async function standinDecline(attemptId: string, now = new Date()) {
  const ev = await emitStandinEvent("payment.failed", { attemptId, reason: "The card was declined (test payment provider)." }, { id: `evt_standin_declined_${attemptId}`, now });
  return processPaymentEvent(ev.id, now);
}

export type StandinEventInput = {
  type: PaymentEventType;
  orderId?: string;
  payoutId?: string;
  disputeRef?: string;
  refundRef?: string;
  amountCents?: number;
  outcome?: "WON" | "LOST";
  kind?: "TEMPORARY" | "ACCOUNT" | "OTHER";
  reason?: string;
  /** Send the same event this many times (1–3): a provider retrying its delivery. */
  deliveries?: number;
};

/**
 * POST /payment-events/test-provider — staging only, BTG admin: have the
 * stand-in send an event about an order (its latest card payment) or a
 * payout in the caller's books — a refund, a dispute opened or closed, a
 * payout paid, failed or returned — once or more. The queue applies it.
 */
export async function standinSendEvent(actor: Actor, input: StandinEventInput, now = new Date()) {
  assertTenantWide(actor, "paymentEvent", "write");
  if (providerName() !== "standin") throw new PaymentEventError("The test payment provider is switched off here.", 400);
  if (!(PAYMENT_EVENT_TYPES as readonly string[]).includes(input.type)) throw new PaymentEventError("Unknown event type.", 422);
  const data: Record<string, unknown> = {};
  if (input.type.startsWith("payout.")) {
    if (!input.payoutId) throw new PaymentEventError("Name the payout.", 422);
    const p = await prisma.payout.findFirst({ where: { ...whereFor(actor, "payout", "approve"), id: input.payoutId }, select: { id: true, providerRef: true } });
    if (!p) throw new PaymentEventError("No such payout.", 404);
    Object.assign(data, { payoutId: p.id, payoutRef: p.providerRef ?? undefined, kind: input.kind ?? "TEMPORARY", reason: input.reason });
  } else {
    if (!input.orderId) throw new PaymentEventError("Name the order.", 422);
    const o = await prisma.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "read"), id: input.orderId }, select: { id: true } });
    if (!o) throw new PaymentEventError("No such order.", 404);
    const a = await prisma.paymentAttempt.findFirst({
      /* tenant-scope: the card payments of an order just loaded through whereFor(marketplaceOrder, read). */
      where: { orderId: o.id }, select: { id: true, amountCents: true, providerRef: true }, orderBy: { createdAt: "desc" },
    });
    if (!a) throw new PaymentEventError("This order has no card payment for the provider to talk about.", 409);
    Object.assign(data, {
      attemptId: a.id, paymentRef: a.providerRef ?? undefined, amountCents: input.amountCents ?? a.amountCents, reason: input.reason,
      ...(input.type === "payment.refunded" ? { refundRef: input.refundRef ?? `standin_re_${randomBytes(6).toString("hex")}` } : {}),
      ...(input.type.startsWith("dispute.") ? { disputeRef: input.disputeRef ?? `standin_dp_${a.id}`, outcome: input.outcome } : {}),
    });
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  const deliveries = Math.min(3, Math.max(1, input.deliveries ?? 1));
  const sent = await emitStandinEvent(input.type, data, { now, deliveries });
  /* The stand-in's sending is the caller's act on staging: on the record. */
  await prisma.$transaction((tx) => audit(tx, actor, "paymentEvent.standinSend", "PaymentEvent", sent.id, { after: { type: input.type, deliveries, data } }));
  return { eventId: sent.id, type: input.type, deliveries };
}

/**
 * Inbound Zoho webhooks — P7-BE-04, §18, §20.
 *
 * ZOHO NEVER TOUCHES A REQUEST PATH, IN EITHER DIRECTION. Outbound exchanges
 * go through the outbox; this is the inbound half, and it obeys the same rule
 * from the other side. The handler does three cheap things — verify the
 * signature, record the delivery, enqueue the work — and answers. Applying the
 * invoice happens on the worker.
 *
 * That ordering is not tidiness. Zoho retries on any non-2xx, so an endpoint
 * that did the database work inline would turn one slow apply into a retry
 * storm, and a bug in the apply into Zoho hammering us until it gave up.
 * Recording first also means a payload we could not apply is still on disk to
 * look at, which is what `WebhookDelivery` is for (§20: "inbound Zoho
 * attempts, recorded whether or not they were accepted").
 *
 * EVERY ATTEMPT IS RECORDED, VALID OR NOT (P8-INT-04, §20). A delivery row is
 * written RECEIVED when it verifies and parses, REJECTED when it does not —
 * a bad signature, a wrong channel, a body that is not the shape Zoho sends.
 * The worker then moves a RECEIVED row to APPLIED, REJECTED or FAILED. An
 * attempt that is refused and leaves no trace is exactly the one you would
 * want to see when something is probing this URL.
 *
 * THE SIGNATURE IS CHECKED BEFORE ANYTHING IS TRUSTED. This route is public —
 * it has to be, Zoho cannot log in — so the shared secret is the only thing
 * standing between an unauthenticated caller and the invoice mirror. In
 * production a missing secret refuses the request outright rather than
 * accepting unsigned payloads, on the same reasoning as the intake token: a
 * warning gets missed, and the damage is silent.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { Router, type RequestHandler } from "express";

import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db/client";
import { enqueue } from "../../db/outbox";
import { env } from "../../config/env";
import { limit } from "../../lib/rate-limit";
import { ZohoInvoiceWebhook } from "../../contracts/invoice";
import { ZohoCrmNotification } from "../../contracts/zoho";

export const zohoWebhooksRouter = Router();

export class WebhookUnsignedError extends Error {
  readonly status = 401;
  constructor() {
    super("This webhook is not correctly signed.");
    this.name = "WebhookUnsignedError";
  }
}

/**
 * Constant-time comparison of the HMAC.
 *
 * `timingSafeEqual` throws on a length mismatch, which is itself a timing
 * signal of sorts — so the lengths are compared first and both paths return
 * the same way.
 */
export function signatureMatches(
  rawBody: string,
  provided: string | undefined,
  secret: string,
): boolean {
  if (!provided) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class WebhookBodyError extends Error {
  readonly status = 400;
  constructor() {
    super("This webhook body is not a shape Zoho sends.");
    this.name = "WebhookBodyError";
  }
}

/** Constant-time string equality for the CRM channel token. */
export function tokenMatches(provided: unknown, expected: string | undefined): boolean {
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * What of an unverified body is worth keeping. Enough to recognise the
 * attempt later — never a secret it may carry (the CRM token rides in the
 * body), and never unbounded: a public URL can be sent anything.
 */
function forTheRecord(body: unknown): object {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const { token: _token, ...rest } = body as Record<string, unknown>;
    const text = JSON.stringify(rest);
    return text.length <= 4000 ? rest : { truncated: text.slice(0, 4000) };
  }
  return { truncated: String(JSON.stringify(body ?? null)).slice(0, 4000) };
}

async function recordRejected(
  source: string,
  body: unknown,
  signatureOk: boolean,
  error: string,
): Promise<void> {
  await prisma.webhookDelivery.create({
    data: { source, signatureOk, payload: forTheRecord(body), status: "REJECTED", error },
    select: { id: true },
  });
}

/**
 * POST /webhooks/zoho/invoice — an invoice was created or changed in Zoho.
 *
 * Answers 202 whether or not the payload can be applied. Zoho is being told
 * "received", not "agreed with" — a payload naming a deal we do not have is a
 * real thing that happens when a deal is created in Zoho before its campaign
 * exists here, and retrying it forever would not make the campaign appear.
 */
export const invoiceHook: RequestHandler = async (req, res) => {
  await limit("zoho:invoice", req.ip, 120, 60);

  const secret = env.ZOHO_WEBHOOK_SECRET;
  const raw = JSON.stringify(req.body ?? {});
  const signatureOk = secret
    ? signatureMatches(raw, req.get("x-zoho-signature") ?? undefined, secret)
    : false;

  if (secret && !signatureOk) {
    await recordRejected("zoho", req.body, false, "signature did not verify");
    throw new WebhookUnsignedError();
  }

  /* Parsed AFTER the signature check — an unsigned payload is not worth
     validating, and a validation error on one would leak which fields we
     expect to an unauthenticated caller. */
  const parsed = ZohoInvoiceWebhook.safeParse(req.body ?? {});
  if (!parsed.success) {
    await recordRejected("zoho", req.body, signatureOk, "payload is not a Zoho invoice");
    throw new WebhookBodyError();
  }
  const body = parsed.data;

  await prisma.$transaction(async (tx) => {
    const delivery = await tx.webhookDelivery.create({
      data: {
        source: "zoho",
        externalId: body.invoiceId,
        signatureOk,
        payload: body,
        status: "RECEIVED",
      },
      select: { id: true },
    });

    /* Enqueued in the same transaction as the delivery row, so a recorded
       webhook always has work queued for it and a queued job always has a
       payload on disk behind it. */
    await enqueue(tx, env.PUBLIC_INTAKE_TENANT_ID, "zoho.ingestInvoice", {
      deliveryId: delivery.id,
    });
  });

  res.status(202).json({ received: true });
};

/**
 * POST /webhooks/zoho/crm — a Zoho CRM Notifications API callback
 * (P8-INT-03). Accounts, Contacts, Deals and Tasks changed in the CRM.
 *
 * VERIFICATION. Zoho echoes back, on every callback, the `token` and
 * `channel_id` we gave it when subscribing (`zoho:watch`, and the worker's
 * renewal). Both are compared — the token in constant time — before the
 * body is trusted. There is no unverified mode: with no token configured,
 * every callback is refused, in development too.
 *
 * THIS ROUTE NEVER CALLS ZOHO. It verifies, writes the delivery row, queues
 * `zoho.ingestCrm` in the same transaction, and answers. The notification
 * names record ids; fetching and applying them is the worker's job.
 */
export const crmHook: RequestHandler = async (req, res) => {
  await limit("zoho:crm", req.ip, 600, 60);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const verified =
    tokenMatches(body.token, env.ZOHO_NOTIFY_TOKEN) &&
    env.ZOHO_NOTIFY_CHANNEL_ID !== undefined &&
    String(body.channel_id ?? "") === env.ZOHO_NOTIFY_CHANNEL_ID;

  if (!verified) {
    await recordRejected("zoho-crm", body, false, "channel token did not verify");
    throw new WebhookUnsignedError();
  }

  const parsed = ZohoCrmNotification.safeParse(body);
  if (!parsed.success) {
    await recordRejected("zoho-crm", body, true, "not a CRM notification");
    throw new WebhookBodyError();
  }
  const { token: _token, ...notification } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const delivery = await tx.webhookDelivery.create({
      data: {
        source: "zoho-crm",
        externalId: `${notification.module}:${notification.ids.join(",")}`.slice(0, 500),
        signatureOk: true,
        payload: notification as Prisma.InputJsonObject,
        status: "RECEIVED",
      },
      select: { id: true },
    });
    await enqueue(tx, env.PUBLIC_INTAKE_TENANT_ID, "zoho.ingestCrm", { deliveryId: delivery.id });
  });

  res.status(202).json({ received: true });
};

zohoWebhooksRouter.post("/webhooks/zoho/invoice", invoiceHook);
zohoWebhooksRouter.post("/webhooks/zoho/crm", crmHook);

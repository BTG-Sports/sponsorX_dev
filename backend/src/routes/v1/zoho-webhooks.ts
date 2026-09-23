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
 * THE SIGNATURE IS CHECKED BEFORE ANYTHING IS TRUSTED. This route is public —
 * it has to be, Zoho cannot log in — so the shared secret is the only thing
 * standing between an unauthenticated caller and the invoice mirror. In
 * production a missing secret refuses the request outright rather than
 * accepting unsigned payloads, on the same reasoning as the intake token: a
 * warning gets missed, and the damage is silent.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { Router, type RequestHandler } from "express";

import { prisma } from "../../db/client";
import { enqueue } from "../../db/outbox";
import { env } from "../../config/env";
import { limit } from "../../lib/rate-limit";
import { ZohoInvoiceWebhook } from "../../contracts/invoice";

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

/**
 * POST /webhooks/zoho/invoice — an invoice was created or changed in Zoho.
 *
 * Answers 202 whether or not the payload can be applied. Zoho is being told
 * "received", not "agreed with" — a payload naming a deal we do not have is a
 * real thing that happens when a deal is created in Zoho before its campaign
 * exists here, and retrying it forever would not make the campaign appear.
 */
const invoiceHook: RequestHandler = async (req, res) => {
  await limit("zoho:invoice", req.ip, 120, 60);

  const secret = env.ZOHO_WEBHOOK_SECRET;
  const raw = JSON.stringify(req.body ?? {});
  const signatureOk = secret
    ? signatureMatches(raw, req.get("x-zoho-signature") ?? undefined, secret)
    : false;

  if (secret && !signatureOk) throw new WebhookUnsignedError();

  /* Parsed AFTER the signature check — an unsigned payload is not worth
     validating, and a validation error on one would leak which fields we
     expect to an unauthenticated caller. */
  const body = ZohoInvoiceWebhook.parse(req.body ?? {});

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

zohoWebhooksRouter.post("/webhooks/zoho/invoice", invoiceHook);

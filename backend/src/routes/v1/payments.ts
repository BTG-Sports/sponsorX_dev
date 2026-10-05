/**
 * /api/v1 — the payment provider's events (2S5-INT-02). Rules live in
 * domain/payment-events.ts; this file only parses and hands over.
 *
 * POST /webhooks/payments/{provider} is public — a provider cannot log in —
 * so its signature, checked over the raw bytes the provider sent (captured by
 * express.json's verify hook in app.ts for /api/v1/webhooks/*), is the only
 * thing standing between a stranger and the payment records. It records and
 * queues; it never applies anything on the request path.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { WEBHOOK_SIGNATURE_HEADER } from "../../lib/payment-provider";
import { PaymentEventResolveInput, PaymentEventsQuery, StandinEventInput } from "../../contracts/payment-events";
import {
  acceptPaymentWebhook, isPaymentEventStatus, listPaymentEvents, PaymentWebhookError, resolvePaymentEvent, standinSendEvent,
} from "../../domain/payment-events";

export const paymentsRouter = Router();
type Id = { id: string };

paymentsRouter.post("/webhooks/payments/:provider", (async (req, res) => {
  const provider = req.params.provider;
  const header = (WEBHOOK_SIGNATURE_HEADER as Record<string, string | undefined>)[provider];
  const raw = (req as { rawBody?: Buffer }).rawBody;
  const rawBody = raw ? raw.toString("utf8") : JSON.stringify(req.body ?? {});
  try {
    const out = await acceptPaymentWebhook(provider, rawBody, header ? req.get(header) ?? undefined : undefined);
    res.status(202).json(out);
  } catch (error) {
    /* Only refused attempts are rate-limited: a verified delivery is the provider, never throttled (as the Zoho hooks, 2S8-SEC-02). */
    if (error instanceof PaymentWebhookError) await limit("payments:webhook", req.ip, 120, 60);
    throw error;
  }
}) as RequestHandler<{ provider: string }>);

/* BTG's side: the exceptions, and closing one with a note. */
paymentsRouter.get("/payment-events", requireActor, (async (req, res) => {
  const q = PaymentEventsQuery.parse(req.query);
  const statuses = q.status ? q.status.split(",").map((s) => s.trim()).filter(isPaymentEventStatus) : undefined;
  res.json(await listPaymentEvents(req.actor!, statuses));
}) as RequestHandler);
paymentsRouter.post("/payment-events/:id/resolve", requireActor, (async (req, res) => {
  res.json(await resolvePaymentEvent(req.actor!, req.params.id, PaymentEventResolveInput.parse(req.body).note));
}) as RequestHandler<Id>);

/* Staging only: have the stand-in provider send an event. */
paymentsRouter.post("/payment-events/test-provider", requireActor, (async (req, res) => {
  res.status(202).json(await standinSendEvent(req.actor!, StandinEventInput.parse(req.body)));
}) as RequestHandler);

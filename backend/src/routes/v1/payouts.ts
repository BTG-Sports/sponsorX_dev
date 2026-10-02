/**
 * /api/v1 — payout accounts, card payments and payouts (2S5-INT-01,
 * 2S5-INT-03, 2S5-BE-04, 2S5-BE-05). Rules and the provider story live in
 * domain/payouts.ts; this file only parses and hands over.
 *
 * The /public/test-provider routes serve the stand-in payment provider's own
 * pages on staging. They are refused (400) wherever the stand-in is off, and
 * the stand-in itself cannot be switched on in production (config/env.ts).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import { PayoutAccountLinkInput, PayoutDecisionInput, PayoutListQuery, StandinAccountInput, StandinCheckoutInput } from "../../contracts/payouts";
import {
  completeStandinAccount, completeStandinCheckout, decidePayout, failedPayments, getPayout, isPayoutState, listPayouts, myPayoutAccount,
  myPayouts, orderPayment, payoutAccountLink, requestPayout, retryPayout, standinDetails, startCardPayment, type PayoutState,
} from "../../domain/payouts";

export const payoutsRouter = Router();
type Id = { id: string };

/* The payee's side. */
payoutsRouter.get("/payouts/account", requireActor, (async (req, res) => { res.json(await myPayoutAccount(req.actor!)); }) as RequestHandler);
payoutsRouter.post("/payouts/account/link", requireActor, (async (req, res) => {
  res.json(await payoutAccountLink(req.actor!, PayoutAccountLinkInput.parse(req.body ?? {}).returnPath));
}) as RequestHandler);
payoutsRouter.get("/payouts/me", requireActor, (async (req, res) => { res.json(await myPayouts(req.actor!)); }) as RequestHandler);
payoutsRouter.post("/payouts", requireActor, (async (req, res) => { res.status(201).json(await requestPayout(req.actor!)); }) as RequestHandler);

/* BTG's side. */
payoutsRouter.get("/payouts", requireActor, (async (req, res) => {
  const q = PayoutListQuery.parse(req.query);
  const states = q.state ? q.state.split(",").map((s) => s.trim()).filter(isPayoutState) : undefined;
  res.json(await listPayouts(req.actor!, states as PayoutState[] | undefined, q.waitingOn));
}) as RequestHandler);
payoutsRouter.get("/payouts/:id", requireActor, (async (req, res) => { res.json(await getPayout(req.actor!, req.params.id)); }) as RequestHandler<Id>);
payoutsRouter.post("/payouts/:id/decision", requireActor, (async (req, res) => {
  const b = PayoutDecisionInput.parse(req.body);
  res.json(await decidePayout(req.actor!, req.params.id, b.decision, b.note));
}) as RequestHandler<Id>);
payoutsRouter.post("/payouts/:id/retry", requireActor, (async (req, res) => { res.json(await retryPayout(req.actor!, req.params.id)); }) as RequestHandler<Id>);

/* BTG's failed card payments (2S7-FE-02, the marketplace console). Not under
   /marketplace-orders, where it would read as an order id. */
payoutsRouter.get("/payments/failed", requireActor, (async (req, res) => { res.json(await failedPayments(req.actor!)); }) as RequestHandler);

/* The sponsor paying an approved order. */
payoutsRouter.get("/marketplace-orders/:id/payment", requireActor, (async (req, res) => { res.json(await orderPayment(req.actor!, req.params.id)); }) as RequestHandler<Id>);
payoutsRouter.post("/marketplace-orders/:id/pay", requireActor, (async (req, res) => { res.json(await startCardPayment(req.actor!, req.params.id)); }) as RequestHandler<Id>);

/* The stand-in provider's own pages (staging only). */
payoutsRouter.get("/public/test-provider/details", (async (req, res) => {
  await limit("standin:read", clientIp(req), 240, 3600);
  res.json(await standinDetails(String(req.query.token ?? "")));
}) as RequestHandler);
payoutsRouter.post("/public/test-provider/account", (async (req, res) => {
  await limit("standin:write", clientIp(req), 120, 3600);
  const b = StandinAccountInput.parse(req.body);
  res.json(await completeStandinAccount(b.token, b.outcome));
}) as RequestHandler);
payoutsRouter.post("/public/test-provider/checkout", (async (req, res) => {
  await limit("standin:write", clientIp(req), 120, 3600);
  const b = StandinCheckoutInput.parse(req.body);
  res.json(await completeStandinCheckout(b.token, b.outcome));
}) as RequestHandler);

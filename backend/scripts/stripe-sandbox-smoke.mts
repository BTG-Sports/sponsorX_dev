/**
 * Stripe sandbox smoke test — 2S5-INT-01 / 2S5-INT-03. A MANUAL tool, not
 * part of vitest: it calls the real Stripe sandbox through SponsorX's real
 * adapter, then feeds the events Stripe actually emitted back through
 * SponsorX's webhook processing (record → worker handler), so the mapping
 * is proven against real Stripe JSON, not hand-written fixtures.
 *
 * RUN IT (from backend/), with the sandbox key read from Railway staging and
 * never typed, printed or written anywhere:
 *
 *   railway run --project 1c11f29a-b569-4d14-98cf-e97a4d3ae209 \
 *     --environment staging --service api -- \
 *     env DATABASE_URL=postgresql://sponsorx@127.0.0.1:55432/<local test db> \
 *         PAYMENT_PROVIDER=stripe STRIPE_WEBHOOK_SECRET=whsec_smoke_local \
 *     node --import tsx scripts/stripe-sandbox-smoke.mts
 *
 * DATABASE_URL must be a LOCAL database (staging's is private, and this
 * writes and then deletes its own rows in a throwaway tenant).
 * STRIPE_WEBHOOK_SECRET is a local value: the real events are re-signed with
 * it, because no webhook endpoint is registered yet. The script refuses a
 * live key, and never logs the key: every error is scrubbed first.
 *
 * What it does:
 *   1. a Checkout Session for a seeded order — retrieved: exists, `open`;
 *   2. an Express-equivalent connected account (Accounts v2 — Stripe refuses
 *      v1 account creation for new platforms) and its Account Link;
 *   3. a payment: a PaymentIntent confirmed with pm_card_bypassPending
 *      (hosted Checkout can't be completed without a browser; this card also
 *      makes the money available at once, so a transfer can follow);
 *   4. a transfer: Stripe's test identity data onboards a recipient account
 *      instantly (a fresh Express account can't receive transfers until a
 *      person onboards it), then SponsorX's own `sendPayout` transfers to it;
 *   5. a refund through SponsorX's own worker step (`sendRefund`), and a
 *      dispute (pm_card_createDispute);
 *   6. the session expired (cleanup), then every event Stripe emitted for
 *      these objects — platform and connected-account snapshot events, and
 *      the Accounts v2 thin events — signed and fed into
 *      acceptPaymentWebhook + processPaymentEvent;
 *   7. cleanup: accounts deleted, seeded rows removed.
 */
import { randomBytes } from "node:crypto";

import Stripe from "stripe";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
const check = (step: string, ok: boolean, detail = "") => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://x@nowhere/x");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) {
  console.error("Refusing: DATABASE_URL must be a local database (this seeds and deletes its own rows).");
  process.exit(2);
}
if (process.env.PAYMENT_PROVIDER !== "stripe") {
  console.error("Refusing: run with PAYMENT_PROVIDER=stripe.");
  process.exit(2);
}

const { env } = await import("../src/config/env.ts");
const { stripeKeyMode } = await import("../src/config/stripe-guard.ts");
const { scrub, stripeClient, accountReadinessV2 } = await import("../src/lib/stripe.ts");
if (stripeKeyMode(env.STRIPE_SECRET_KEY ?? "") !== "test") {
  console.error("Refusing: this smoke test runs against a Stripe sandbox (test-mode key) only.");
  process.exit(2);
}
console.log("key mode: test (sandbox)");

const { prisma } = await import("../src/db/client.ts");
const adapter = await import("../src/lib/payment-provider.ts");
const { acceptPaymentWebhook, processPaymentEvent } = await import("../src/domain/payment-events.ts");
const { sendPayout } = await import("../src/domain/payouts.ts");
const { sendRefund } = await import("../src/domain/refunds.ts");

/* 2S8-SEC-06 — SponsorX's own calls (the adapter) always use STRIPE_SECRET_KEY,
   which may be a restricted key under test. The script's scaffolding and
   inspection (creating payments, reading objects back, cleanup) use
   STRIPE_SMOKE_ADMIN_KEY when set, so a restricted key is proven on exactly
   the calls the app makes — never widened to let the scaffolding pass. */
const adminKey = process.env.STRIPE_SMOKE_ADMIN_KEY?.trim();
if (adminKey && stripeKeyMode(adminKey) !== "test") {
  console.error("Refusing: STRIPE_SMOKE_ADMIN_KEY must be a test key.");
  process.exit(2);
}
const stripe = adminKey ? new Stripe(adminKey, { telemetry: false }) : stripeClient();
console.log(`adapter key: ${(env.STRIPE_SECRET_KEY ?? "").startsWith("rk_") ? "restricted" : "full"}; scaffolding key: ${adminKey ? "separate" : "same"}`);
const tag = randomBytes(4).toString("hex");
const T = `smoke_stripe_${tag}`;
const ids = (s: string) => `smoke_${s}_${tag}`;
const started = Math.floor(Date.now() / 1000) - 5;
const AMOUNT = 5_000;
env.PUBLIC_INTAKE_TENANT_ID = T; // events that name nothing wait in the smoke tenant, and are deleted with it
const made = { accounts: [] as string[] };

async function cleanDb() {
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = $1)`, T);
  for (let pass = 0; pass < 4; pass++) {
    for (const { table_name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
  }
  await prisma.tenant.deleteMany({ where: { id: T } });
}

async function main() {
  /* ── seed: a tenant, a sponsor, an order waiting for payment, its card attempt ── */
  await prisma.tenant.create({ data: { id: T, name: `Stripe smoke ${tag}` }, select: { id: true } });
  await prisma.sponsor.create({ data: { id: ids("sponsor"), tenantId: T, name: `Smoke Sponsor ${tag}`, categories: ["RESTAURANT"] }, select: { id: true } });

  /* 3 first: the paid PaymentIntent the order is paid by (pm_card_bypassPending — available balance at once). */
  const paidAttempt = ids("attempt_paid");
  const pi = await stripe.paymentIntents.create({
    amount: AMOUNT, currency: "usd", payment_method: "pm_card_bypassPending", confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: { attemptId: paidAttempt, sponsorx: "smoke" }, description: `SponsorX smoke ${tag}`,
  }, { idempotencyKey: `smoke:pi:${tag}` });
  check("3. a card payment on the sandbox (PaymentIntent, pm_card_bypassPending)", pi.status === "succeeded", `${pi.id} ${pi.status}`);

  await prisma.reservation.create({ data: { id: ids("res"), tenantId: T, sponsorId: ids("sponsor"), cartId: ids("cart"), state: "CONVERTED", expiresAt: new Date() }, select: { id: true } });
  const orderId = ids("order");
  await prisma.marketplaceOrder.create({
    data: {
      id: orderId, tenantId: T, sponsorId: ids("sponsor"), reservationId: ids("res"), state: "PAID", subtotalCents: AMOUNT, feesCents: 0, totalCents: AMOUNT,
      requiresApproval: false, approvalReasons: [], paidAt: new Date(), paidVia: "CARD", paymentReference: pi.id,
    },
    select: { id: true },
  });
  const openAttempt = ids("attempt_open");
  await prisma.paymentAttempt.createMany({ data: [
    { id: openAttempt, tenantId: T, orderId, sponsorId: ids("sponsor"), amountCents: AMOUNT, provider: "stripe" },
    { id: paidAttempt, tenantId: T, orderId, sponsorId: ids("sponsor"), amountCents: AMOUNT, provider: "stripe", providerRef: pi.id, state: "SUCCEEDED" },
  ] });

  /* ── 1. Checkout Session, through the real adapter ── */
  const checkoutAt = new Date();
  const checkoutReq = { attemptId: openAttempt, orderId, orderRef: `SX-SMOKE-${tag}`, amountCents: AMOUNT, returnPath: `/sponsor/orders/${orderId}?payment=returned`, cancelPath: `/sponsor/orders/${orderId}`, now: checkoutAt };
  const opened = await adapter.openCheckout(checkoutReq);
  const session = await stripe.checkout.sessions.retrieve(opened.sessionRef!);
  check("1. Checkout Session created by openCheckout, retrieved from Stripe", session.status === "open" && session.url === opened.url && session.metadata?.attemptId === openAttempt && session.amount_total === AMOUNT,
    `${session.id} status=${session.status} amount_total=${session.amount_total} metadata.attemptId matches=${session.metadata?.attemptId === openAttempt}`);
  const again = await adapter.openCheckout(checkoutReq); // a retry: the same request, the same key
  check("1b. the same attempt again is the same session (idempotency key)", again.sessionRef === session.id, again.sessionRef ?? "");

  /* ── 2. Express-equivalent account (Accounts v2) + Account Link, through the real adapter ── */
  const express = await adapter.createPayoutAccount({
    payeeType: "PROPERTY", payeeId: ids("prop_express"), tenantId: T, contactEmail: `smoke-express+${tag}@example.com`, displayName: `Smoke Property ${tag}`,
  });
  made.accounts.push(express.accountRef);
  const expressAcct = await stripe.v2.core.accounts.retrieve(express.accountRef, { include: ["configuration.recipient", "requirements"] });
  check("2. Express-equivalent connected account created (Accounts v2: Express dashboard, recipient)", expressAcct.dashboard === "express" && expressAcct.applied_configurations.includes("recipient") && !expressAcct.applied_configurations.includes("merchant"),
    `${express.accountRef} dashboard=${expressAcct.dashboard} configurations=${expressAcct.applied_configurations.join(",")} readiness=${accountReadinessV2(expressAcct).status} (${accountReadinessV2(expressAcct).reason ?? ""})`);
  const linkUrl = await adapter.payoutAccountLinkUrl({ accountRef: express.accountRef, returnPath: "/property/earnings", manage: false, requestId: `smoke-${tag}` });
  check("2b. Account Link for hosted onboarding returned", /^https:\/\/connect\.stripe\.com\//.test(linkUrl), linkUrl.replace(/\/[^/]+$/, "/…"));
  /* 2c — the login link (manage=true: v1 login_links on a v2 account) needs an
     ONBOARDED account. Never add it to made.accounts: cleanup would delete it. */
  const loginAcct = process.env.STRIPE_SMOKE_LOGIN_ACCOUNT?.trim();
  if (loginAcct) {
    const url = await adapter.payoutAccountLinkUrl({ accountRef: loginAcct, returnPath: "/property/earnings", manage: true, requestId: `smoke-login-${tag}` });
    check("2c. Express dashboard login link (v1 login_links on a v2 account)", /^https:\/\/connect\.stripe\.com\//.test(url), url.replace(/\/[^/]+$/, "/…"));
  }
  await prisma.payoutAccount.create({ data: { tenantId: T, payeeType: "PROPERTY", payeeId: ids("prop_express"), provider: "stripe", providerAccountId: express.accountRef }, select: { id: true } });

  /* ── 4. a recipient account onboarded with Stripe's test identity data, then SponsorX's own sendPayout ── */
  const target = await stripe.v2.core.accounts.create({
    dashboard: "none",
    contact_email: `smoke-payee+${tag}@example.com`,
    display_name: `Smoke Payee ${tag}`,
    identity: {
      country: "us", entity_type: "individual",
      attestations: { terms_of_service: { account: { date: new Date().toISOString(), ip: "127.0.0.1" } } },
      individual: {
        given_name: "Smoke", surname: "Payee", email: `smoke-payee+${tag}@example.com`, phone: "+12025550123",
        date_of_birth: { day: 1, month: 1, year: 1901 },
        id_numbers: [{ type: "us_ssn", value: "000000000" }],
        address: { line1: "address_full_match", city: "Baltimore", state: "MD", postal_code: "21201", country: "us" },
      },
    },
    defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" }, profile: { product_description: "SponsorX smoke-test payee" } },
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
    metadata: { sponsorx: "smoke" },
  } as never, { idempotencyKey: `smoke:recipient:${tag}` }) as Stripe.V2.Core.Account;
  made.accounts.push(target.id);
  /* A bank account so payouts can be enabled too (Stripe's test token). */
  const bank = await stripe.accounts.createExternalAccount(target.id, { external_account: "btok_us_verified" }).then(() => "added", (e: unknown) => `not added: ${scrub(String((e as Error).message)).slice(0, 160)}`);
  let targetAcct = await stripe.v2.core.accounts.retrieve(target.id, { include: ["configuration.recipient", "requirements"] });
  for (let i = 0; i < 10 && targetAcct.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status !== "active"; i++) {
    await sleep(2_000);
    targetAcct = await stripe.v2.core.accounts.retrieve(target.id, { include: ["configuration.recipient", "requirements"] });
  }
  const transfersStatus = targetAcct.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  const ready = accountReadinessV2(targetAcct);
  check("4a. test recipient account (Stripe test identity data) can receive transfers", transfersStatus === "active",
    `${target.id} stripe_transfers=${transfersStatus} payouts=${targetAcct.configuration?.recipient?.capabilities?.stripe_balance?.payouts?.status} bank=${bank} → SponsorX readiness ${ready.status}${ready.reason ? ` (${ready.reason})` : ""}`);
  await prisma.payoutAccount.create({ data: { tenantId: T, payeeType: "PROPERTY", payeeId: ids("prop_custom"), provider: "stripe", providerAccountId: target.id, status: "READY" }, select: { id: true } });
  const payoutId = ids("payout");
  await prisma.payout.create({ data: { id: payoutId, tenantId: T, payeeType: "PROPERTY", payeeId: ids("prop_custom"), payeeTenantId: T, amountCents: 1_000, state: "APPROVED" }, select: { id: true } });
  const sent = await sendPayout(payoutId);
  const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId }, select: { state: true, providerRef: true, failureReason: true } });
  check("4b. SponsorX's sendPayout made a Stripe transfer to the connected account", sent.sent && payout.state === "SENDING" && /^tr_/.test(payout.providerRef ?? ""), `${payout.state} ${payout.providerRef ?? payout.failureReason ?? ""}`);
  if (payout.providerRef) {
    const tr = await stripe.transfers.retrieve(payout.providerRef);
    check("4c. the transfer carries the payout id and hand-over in metadata", tr.metadata?.payoutId === payoutId && tr.metadata?.handOver === `${payoutId}:1` && tr.destination === target.id, `${tr.id} amount=${tr.amount}`);
  }
  /* Sandbox only: the row was set READY so the transfer could go; set it back so the account's own
     events have something to decide (the worker reads the account from Stripe). */
  await prisma.payoutAccount.updateMany({ where: { tenantId: T, payeeId: ids("prop_custom") }, data: { status: ready.status === "READY" ? "NEEDS_INFO" : "READY" } });

  /* ── 5. a refund through SponsorX's worker step; a dispute ── */
  const due = await prisma.refundDue.create({ data: { tenantId: T, orderId, sponsorId: ids("sponsor"), amountCents: AMOUNT, cause: "BTG_REFUNDED_ORDER", paidVia: "CARD", provider: "stripe" }, select: { id: true } });
  const refunded = await sendRefund(due.id);
  const dueRow = await prisma.refundDue.findUniqueOrThrow({ where: { id: due.id }, select: { state: true, reference: true } });
  check("5a. SponsorX's sendRefund refunded the card through Stripe", refunded.sent && dueRow.state === "SENT" && /^re_/.test(dueRow.reference ?? ""), `${dueRow.state} ${dueRow.reference ?? ""}`);
  if (dueRow.reference) {
    const re = await stripe.refunds.retrieve(dueRow.reference);
    check("5b. the refund carries SponsorX's refund id in metadata", re.metadata?.refundDueId === due.id && re.payment_intent === pi.id, `${re.id} status=${re.status}`);
  }
  const disputedAttempt = ids("attempt_disputed");
  const disputedPi = await stripe.paymentIntents.create({
    amount: AMOUNT, currency: "usd", payment_method: "pm_card_createDispute", confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" }, metadata: { attemptId: disputedAttempt, sponsorx: "smoke" },
  }, { idempotencyKey: `smoke:pi-dispute:${tag}` });
  await prisma.paymentAttempt.create({ data: { id: disputedAttempt, tenantId: T, orderId, sponsorId: ids("sponsor"), amountCents: AMOUNT, provider: "stripe", providerRef: disputedPi.id, state: "SUCCEEDED" }, select: { id: true } });

  /* ── 6. expire the session (also cleanup), then feed every real event through the processing path ── */
  await stripe.checkout.sessions.expire(session.id);
  const ours = new Set([session.id, pi.id, disputedPi.id, payout.providerRef, dueRow.reference, express.accountRef, target.id].filter(Boolean) as string[]);
  const relevant = (e: Stripe.Event) => {
    const o = e.data.object as unknown as Record<string, unknown>;
    return ours.has(String(o.id)) || ours.has(String(o.payment_intent)) || (e.account ? ours.has(e.account) : false);
  };
  const want = new Set<string>(["checkout.session.expired", "refund.created", "transfer.created", "charge.dispute.created"]);
  type Incoming = { id: string; type: string; at: number; raw: string };
  let collected: Incoming[] = [];
  for (let i = 0; i < 12; i++) {
    const snapshot: Stripe.Event[] = [...(await stripe.events.list({ created: { gte: started }, limit: 100 })).data];
    for (const acct of [express.accountRef, target.id]) snapshot.push(...(await stripe.events.list({ created: { gte: started }, limit: 100 }, { stripeAccount: acct })).data);
    /* Accounts v2 sends its account changes as THIN events (an event destination); read them by object. */
    const thin: Array<{ id: string; type: string; created: string }> = [];
    for (const acct of [express.accountRef, target.id]) {
      const page = await stripe.v2.core.events.list({ object_id: acct, limit: 50 } as never) as unknown as { data: Array<{ id: string; type: string; created: string }> };
      thin.push(...page.data);
    }
    collected = [
      ...snapshot.filter(relevant).map((e) => ({ id: e.id, type: e.type, at: e.created * 1000, raw: JSON.stringify(e) })),
      ...thin.map((e) => ({ id: e.id, type: e.type, at: Date.parse(e.created), raw: JSON.stringify(e) })),
    ];
    const types = new Set<string>(collected.map((e) => e.type));
    if ([...want].every((t) => types.has(t)) && thin.length) break;
    await sleep(3_000);
  }
  const unique = [...new Map(collected.map((e) => [e.id, e])).values()].sort((a, b) => a.at - b.at);
  console.log(`\nStripe emitted ${unique.length} event(s) for these objects: ${[...new Set(unique.map((e) => e.type))].join(", ")}`);
  const outcomes: Record<string, string[]> = {};
  for (const e of unique) {
    const sig = Stripe.webhooks.generateTestHeaderString({ payload: e.raw, secret: env.STRIPE_WEBHOOK_SECRET!, timestamp: Math.floor(Date.now() / 1000) });
    const accepted = await acceptPaymentWebhook("stripe", e.raw, sig);
    const line: string[] = [];
    if (!accepted.events.length) line.push("acknowledged, nothing to apply");
    for (const n of accepted.events) {
      if (n.duplicate) {
        line.push(`${n.type} → duplicate (already recorded)`);
        continue;
      }
      const r = await processPaymentEvent(n.id);
      line.push(`${n.type} → ${r.status}${r.outcome ? ` (${r.outcome})` : ""}`);
    }
    (outcomes[e.type] ??= []).push(line.join("; "));
    console.log(`  ${e.type.padEnd(66)} ${line.join("; ")}`);
  }
  const has = (type: string, re: RegExp) => (outcomes[type] ?? []).some((l) => re.test(l));
  check("6a. real checkout.session.expired → payment.failed, applied (the attempt FAILED)", has("checkout.session.expired", /payment\.failed → APPLIED/));
  check("6b. real refund.created → payment.refunded, confirming SponsorX's refund", has("refund.created", /payment\.refunded → APPLIED .*confirmed SponsorX's refund/));
  check("6c. real transfer.created → payout.paid, applied (payout PAID)", has("transfer.created", /payout\.paid → APPLIED/));
  const thinLines = Object.entries(outcomes).filter(([t]) => t.startsWith("v2.core.account")).flatMap(([, l]) => l);
  check("6d. real thin v2.core.account… events → account.updated, the account read afresh and applied", thinLines.some((l) => /account\.updated → APPLIED/.test(l)), thinLines.slice(0, 3).join(" | "));
  check("6e. real charge.dispute.created → dispute.opened, applied", has("charge.dispute.created", /dispute\.opened → APPLIED/), outcomes["charge.dispute.created"] ? "" : "no dispute event yet (Stripe creates it asynchronously)");
  const attemptNow = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: openAttempt }, select: { state: true } });
  const payoutNow = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId }, select: { state: true } });
  check("6f. SponsorX's records reflect it", attemptNow.state === "FAILED" && payoutNow.state === "PAID", `attempt ${attemptNow.state}, payout ${payoutNow.state}`);
}

try {
  await main();
} catch (error) {
  check("smoke run", false, scrub(error instanceof Error ? `${error.name}: ${error.message}` : String(error)));
} finally {
  /* ── 7. cleanup ── */
  for (const acct of made.accounts) {
    try {
      await stripe.accounts.del(acct);
    } catch (error) {
      console.log(`  (could not delete ${acct}: ${scrub(String((error as Error).message))})`);
    }
  }
  await cleanDb().catch((e: unknown) => console.log(`  (db cleanup: ${scrub(String(e))})`));
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

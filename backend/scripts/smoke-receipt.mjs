#!/usr/bin/env node
/* --------------------------------------------------------------------------
   npm run smoke:receipt — prove on staging that a paid order's receipt is
   SENT to the billing contact the checkout names (2S5-FE-05).

   No browser and no person: Stripe's payment page shows a captcha to
   automated browsers, so the order is paid the other way the receipt is sent —
   Finance records the payment by hand (cheque). Both ways run the same
   tellSponsorPaid() and the same `payment.received` email; only one sentence
   differs. The card payment itself is covered by the automated suite and by
   the staging run of 2026-10-06 (order SX-BK6HZ86G).

     1. sign in as a test sponsor and as Finance through staging's real login
        page with a one-time Clerk ticket, in a headless browser, as the e2e
        suite does (e2e/support/auth.ts). The API only accepts tokens minted
        by our own web origin (their `azp`, 2S8-PMO-02), so a token from
        Clerk's Backend API alone is refused. It REFUSES to run against a
        production Clerk instance;
     2. the sponsor carts a live listing, holds it and places the order with
        billing email delivered+smoke-<run>@resend.dev (Resend's test inbox,
        which always delivers);
     3. Finance marks the order paid by cheque;
     4. staging's own email queue is read (over `railway ssh`, read-only)
        until that order's `payment.received` job to the billing contact is
        `completed` — Resend accepted it. Staging's RESEND_API_KEY may only
        send, so Resend's own delivery log cannot be read from here, and
        that key stays send-only on purpose.

   Run it with staging's variables (nothing is printed from them), on a
   machine where the Railway CLI is logged in:
     railway run --environment staging --service api -- npm run smoke:receipt -w @sponsorx/backend

   Needs CLERK_SECRET_KEY (sk_test_ only). Optional:
     SMOKE_API_URL   default https://api-staging-07ea.up.railway.app/api/v1
     SMOKE_WEB_URL   default https://web-staging-904a.up.railway.app
     SMOKE_SPONSOR   default harbor.coffee+clerk_test@example.com
     SMOKE_FINANCE   default btg.finance+clerk_test@example.com

   It leaves one paid test order on staging per run (reference SMOKE-<run>).
   The test accounts' own addresses are @example.com, which Resend refuses, so
   the order's other emails (the sponsor's copy, order approved, the sellers'
   sale notices) end as failed notify.email jobs — expected noise on staging.
   -------------------------------------------------------------------------- */

/* A plain Node script, plus `window` inside the page.evaluate() callbacks, which run in the browser. */
/* global process, console, fetch, setTimeout, Buffer, window */

import { execFileSync } from "node:child_process";

import { chromium } from "playwright";

const API = (process.env.SMOKE_API_URL ?? "https://api-staging-07ea.up.railway.app/api/v1").replace(/\/$/, "");
const WEB = (process.env.SMOKE_WEB_URL ?? "https://web-staging-904a.up.railway.app").replace(/\/$/, "");
const SPONSOR = process.env.SMOKE_SPONSOR ?? "harbor.coffee+clerk_test@example.com";
const FINANCE = process.env.SMOKE_FINANCE ?? "btg.finance+clerk_test@example.com";
const CLERK_KEY = process.env.CLERK_SECRET_KEY ?? "";
const RUN = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const BILLING = `delivered+smoke-${RUN}@resend.dev`;
const SEND_TIMEOUT_MS = 4 * 60_000;

const step = (msg) => console.log(`· ${msg}`);
function fail(msg) {
  console.error(`\nFAIL — ${msg}`);
  process.exit(1);
}

if (!CLERK_KEY.startsWith("sk_test_")) fail("CLERK_SECRET_KEY is missing or not a test instance key (sk_test_). This check never runs against production.");

/**
 * The order's receipt jobs on staging's queue, read inside the api container (read-only).
 * The query travels base64-encoded so no shell quoting can bend it, and runs from /app so it finds `pg`.
 */
function receiptJobs(orderRef) {
  const js = `const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL});
(async()=>{await c.connect();
const r=await c.query("select state, data->>'to' as to from pgboss.job where name='notify.email' and data->>'template'='payment.received' and data->'data'->>'orderRef'=$1",[process.argv[2]]);
console.log("ROWS"+JSON.stringify(r.rows));await c.end()})().catch(e=>{console.log("ROWS[]");console.error(e.message)});`;
  const b64 = Buffer.from(js).toString("base64");
  const out = execFileSync("railway", ["ssh", "--environment", "staging", "--service", "api", "--",
    `sh -c "cd /app && echo ${b64} | base64 -d > /app/.smoke-receipt-q.cjs && node /app/.smoke-receipt-q.cjs ${orderRef}; rm -f /app/.smoke-receipt-q.cjs"`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const line = out.split("\n").find((l) => l.startsWith("ROWS"));
  return line ? JSON.parse(line.slice(4)) : [];
}

async function clerk(method, path, body) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method, headers: { Authorization: `Bearer ${CLERK_KEY}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) fail(`Clerk ${method} ${path} answered ${r.status}: ${JSON.stringify(json?.errors?.[0]?.message ?? json)}`);
  return json;
}

/**
 * Signed in on staging's own login page with a one-time ticket, as e2e/support/auth.ts does.
 * `token()` asks the page's Clerk for a current session token (60 s, refreshed by Clerk).
 */
async function signIn(browser, email) {
  const users = await clerk("GET", `/users?email_address=${encodeURIComponent(email)}`);
  if (!users?.length) fail(`no Clerk user ${email} on this instance`);
  const context = await browser.newContext();
  const page = await context.newPage();
  /* Now and then Clerk's <SignIn> renders an empty card and never consumes the ticket; a ticket is
     single-use, so a retry mints a fresh one. */
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { token } = await clerk("POST", "/sign_in_tokens", { user_id: users[0].id, expires_in_seconds: 600 });
    await page.goto(`${WEB}/login?__clerk_ticket=${encodeURIComponent(token)}`);
    const ok = await page
      .waitForFunction(() => Boolean(window.Clerk?.session), null, { timeout: 45_000 })
      .then(() => true, () => false);
    if (ok) {
      const token = () => page.evaluate(async () => (await window.Clerk.session.getToken()) ?? "");
      return { email, context, page, token };
    }
  }
  fail(`could not sign ${email} in at ${WEB}/login`);
}

async function api(who, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${await who.token()}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, json, text };
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Carts the first listing that takes a 1-unit line on some day it is available. */
async function cartSomething(sponsor) {
  const search = await api(sponsor, "GET", "/marketplace/search");
  if (search.status !== 200) fail(`GET /marketplace/search answered ${search.status}: ${search.text.slice(0, 200)}`);
  const listings = Array.isArray(search.json) ? search.json : (search.json?.listings ?? search.json?.results ?? []);
  if (!listings.length) fail("the marketplace shows this sponsor no live listing to buy");
  const created = await api(sponsor, "POST", "/cart");
  if (![200, 201].includes(created.status)) fail(`POST /cart answered ${created.status}: ${created.text.slice(0, 200)}`);
  const tries = [];
  for (const l of listings.slice(0, 10)) {
    const from = l.item?.availableFrom ? new Date(l.item.availableFrom) : null;
    const until = l.item?.availableUntil ? new Date(l.item.availableUntil) : null;
    for (let i = 0; i < 4; i += 1) {
      /* A day 30–330 days out, inside the listing's window, picked at random so runs don't collide. */
      let day = new Date(Date.now() + (30 + Math.floor(Math.random() * 300)) * 86_400_000);
      if (from && day < from) day = new Date(from.getTime() + i * 86_400_000);
      if (until && day > until) day = new Date(until.getTime() - i * 86_400_000);
      const r = await api(sponsor, "POST", "/cart/lines", { listingId: l.id, quantity: 1, startsOn: day.toISOString(), endsOn: day.toISOString() });
      if (r.status === 201 || r.status === 200) return { listing: l, day: isoDay(day) };
      tries.push(`${l.title ?? l.id} on ${isoDay(day)}: ${r.status} ${r.text.slice(0, 120)}`);
    }
  }
  fail(`no listing could be added to the cart:\n  ${tries.slice(0, 6).join("\n  ")}`);
}

async function main() {
  console.log(`Receipt smoke check · run ${RUN}\n  API ${API}\n  billing contact ${BILLING}\n`);

  const browser = await chromium.launch();
  process.on("exit", () => { browser.close().catch(() => {}); });
  const sponsor = await signIn(browser, SPONSOR);
  const finance = await signIn(browser, FINANCE);
  step(`signed in on ${WEB} as ${SPONSOR} (sponsor) and ${FINANCE} (Finance)`);

  const { listing, day } = await cartSomething(sponsor);
  step(`carted "${listing.title ?? listing.id}" for ${day}`);

  const hold = await api(sponsor, "POST", "/cart/reserve");
  if (hold.status !== 201) fail(`POST /cart/reserve answered ${hold.status}: ${hold.text.slice(0, 200)}`);
  const reservation = await api(sponsor, "GET", `/reservations/${hold.json.id}`);
  const terms = reservation.json?.checkout?.terms;
  if (!terms?.id || !terms?.bodyHash) fail(`the hold carries no order terms to accept: ${reservation.text.slice(0, 200)}`);
  step(`held it (reservation ${hold.json.id})`);

  const placed = await api(sponsor, "POST", "/marketplace-orders", {
    reservationId: hold.json.id, agreementId: terms.id, bodyHashShown: terms.bodyHash,
    billing: { name: "Smoke Check", email: BILLING, reference: `SMOKE-${RUN}` },
  });
  if (placed.status !== 201) fail(`POST /marketplace-orders answered ${placed.status}: ${placed.text.slice(0, 200)}`);
  const order = placed.json;
  const ref = `SX-${order.id.slice(-8).toUpperCase()}`;
  step(`placed order ${ref} — state ${order.state}`);
  if (!["APPROVED", "AWAITING_PAYMENT"].includes(order.state)) {
    fail(`order ${ref} is ${order.state}, not approved for payment — it needs a person's approval first, so this run cannot go on`);
  }

  const paid = await api(finance, "POST", `/marketplace-orders/${order.id}/transition`, {
    to: "PAID", payment: { method: "CHEQUE", reference: `SMOKE-${RUN}`, receivedOn: isoDay(new Date()) },
  });
  if (paid.status !== 200) fail(`Finance's mark-paid answered ${paid.status}: ${paid.text.slice(0, 200)}`);
  step(`Finance marked ${ref} paid (cheque SMOKE-${RUN})`);

  /* The worker sends the receipt a moment later; read the queue until the billing contact's job is done. */
  const deadline = Date.now() + SEND_TIMEOUT_MS;
  let jobs = [];
  while (Date.now() < deadline) {
    jobs = receiptJobs(ref);
    if (jobs.some((j) => j.to === BILLING && j.state === "completed")) break;
    await new Promise((res) => setTimeout(res, 10_000));
  }
  const billingJob = jobs.find((j) => j.to === BILLING);
  if (!billingJob) fail(`no receipt for ${ref} was queued to ${BILLING} within ${SEND_TIMEOUT_MS / 60_000} minutes (queued: ${JSON.stringify(jobs)})`);
  if (billingJob.state !== "completed") fail(`the receipt to ${BILLING} is "${billingJob.state}", not sent — see the notify.email job for ${ref}`);
  step(`receipt for ${ref} sent to the billing contact ${BILLING} — accepted by Resend`);
  const copy = jobs.find((j) => j.to.toLowerCase() === SPONSOR.toLowerCase());
  step(copy ? `the sponsor's copy was queued to ${SPONSOR} (${copy.state}; Resend refuses @example.com test addresses)` : `no copy to ${SPONSOR}`);

  for (const who of [sponsor, finance]) await who.page.evaluate(() => window.Clerk.signOut()).catch(() => {});
  await browser.close();

  console.log(`\nPASS — order ${ref}: the receipt went to the billing contact the checkout named.`);
}

main().catch((e) => fail(e?.stack ?? String(e)));

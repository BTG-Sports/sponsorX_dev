import { expect, test, type Page } from "@playwright/test";

import { apiAs, desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs } from "./support/auth";
import { q } from "./support/loop-db";
import { useObjectStore } from "./support/object-store";
import { runWorker } from "./support/worker";

/**
 * QA of the nine Phase 2 screens (2026-10-07) on REAL data: a paid,
 * delivered order with a paid payout, as the marketplace walk leaves it
 * (run `e2e/_qa-seed-marketplace.spec.ts` or `e2e/marketplace-path.spec.ts`
 * first). Every money event is raised through the stand-in provider's
 * `POST /payment-events/test-provider`, waited for (the worker applies it a
 * moment later), then the screen is read as the person who sees it. Two
 * more orders are bought on the way: one paid and refunded whole at the
 * provider (Finance's provider-refund row), one left unpaid for the busy
 * checkout check (which needs the API restarted with
 * PAYMENT_PROVIDER_TIMEOUT_MS=10 — done by hand after this walk).
 * Screenshots land in SHOT_DIR or the test output.
 *
 * Skipped without the loop stack, or when no such order exists.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const ADMIN = { key: "walk-admin", roles: ["BTG_ADMIN" as const] };
const FINANCE = { key: "p7.finance", roles: ["FINANCE" as const] };
const OUT = () => process.env.SHOT_DIR ?? test.info().outputPath("");
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT()}/qa-${name}.png`, fullPage: true });
const day = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type Seed = { orderId: string; sponsorId: string; payoutId: string; athleteId: string; athleteSlug: string; propertyId: string; lineId: string; totalCents: number; listingTitle: string };
let seed: Seed | null = null;
let admin: Page;
let secondOrderId = "";

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip(!desktopOnly(testInfo), "QA — desktop project only");
  const [row] = await q<Seed>(
    `select o.id as "orderId", o."sponsorId", o."totalCents",
            p.id as "payoutId", p."payeeId" as "athleteId", a.slug as "athleteSlug",
            l.id as "lineId", l."propertyId", l.title as "listingTitle"
       from "MarketplaceOrder" o
       join "PaymentAttempt" pa on pa."orderId" = o.id and pa.state in ('SUCCEEDED', 'PARTIALLY_REFUNDED')
       join "MarketplaceOrderLine" l on l."orderId" = o.id
       join "Payout" p on p."payeeType" = 'ATHLETE' and p.state in ('PAID', 'FAILED')
       join "Athlete" a on a.id = p."payeeId"
      where o.state = 'FULFILLED'
      order by o."createdAt" desc, p."requestedAt" desc limit 1`,
  );
  seed = row ?? null;
  test.skip(!seed, "no paid, delivered order with a paid payout — run the marketplace seed first");
  /* Each run buys two more of the clinic; keep it in stock. */
  await q(`update "InventoryItem" set quantity = greatest(coalesce(quantity, 0), 8) where id = (select "inventoryItemId" from "MarketplaceOrderLine" where id = $1)`, [seed!.lineId]);
  admin = await pageAs(browser, testInfo, ADMIN);
  admin.on("pageerror", (e) => { throw new Error(`page error: ${e.message}`); });
});

const raise = (body: Record<string, unknown>) => apiAs<{ eventId: string }>(admin, "POST", "/payment-events/test-provider", body);
/* The stand-in route only RECEIVES the event; the worker applies it a moment later (outbox drain every second). */
async function settled(eventId: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const [e] = await q<{ status: string }>(`select status from "PaymentEvent" where id = $1`, [eventId]);
    /* DEFERRED waits for the event it follows; the worker retries it, so keep waiting a while. */
    if (e && e.status !== "RECEIVED" && !(e.status === "DEFERRED" && i < 30)) return e.status;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`event ${eventId} was never applied by the worker`);
}
/** The provider's own event for a payment (payment.succeeded) is applied by the worker after the checkout; wait for it. */
async function paymentApplied(attemptId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const [e] = await q<{ status: string }>(`select status from "PaymentEvent" where "subjectRef" = $1 and type = 'payment.succeeded' order by "receivedAt" desc limit 1`, [attemptId]);
    if (e?.status === "APPLIED") return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`payment.succeeded for ${attemptId} was never applied`);
}
async function raised(body: Record<string, unknown>): Promise<string> {
  const r = await raise(body);
  expect(r.status, JSON.stringify(r.body)).toBe(202);
  const status = await settled(r.body.eventId);
  console.log("event", body.type, "→", status);
  return status;
}
const tile = (page: Page, label: string) => page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");

/** The sponsor buys `qty` of the seeded clinic and lands on the new order's page. */
async function buy(sponsor: Page, qty: number, startIn: number): Promise<string> {
  await sponsor.goto("/sponsor/shop");
  const card = sponsor.locator("li, article, div.rounded-xl").filter({ hasText: seed!.listingTitle }).filter({ has: sponsor.getByRole("button", { name: "Add to cart" }) }).last();
  await card.getByRole("button", { name: "Add to cart" }).click();
  const addForm = sponsor.locator("form").filter({ has: sponsor.getByLabel("Quantity") });
  await addForm.getByLabel("Quantity").fill(String(qty));
  await addForm.getByLabel("Starts").fill(day(startIn));
  await addForm.getByLabel("Ends").fill(day(startIn + 7));
  await addForm.getByRole("button", { name: "Add to cart" }).click();
  await expect(sponsor.getByRole("status").filter({ hasText: "Added." }).first()).toBeVisible({ timeout: 30_000 });
  await sponsor.goto("/sponsor/cart");
  await sponsor.getByRole("button", { name: "Reserve & check out" }).click();
  await sponsor.waitForURL(/\/sponsor\/checkout\?reservation=/, { timeout: 30_000 });
  const billing = sponsor.locator("section[aria-labelledby=checkout-billing]");
  await billing.getByLabel("Name").fill("QA Buyer");
  await billing.getByLabel("Email").fill("qa.buyer@example.invalid");
  await billing.getByLabel(/PO number or your reference/).fill(`QA ${Date.now().toString(36)}`);
  await sponsor.locator("section[aria-labelledby=checkout-terms]").getByRole("checkbox").check();
  await sponsor.getByRole("button", { name: "Place order" }).click();
  await sponsor.waitForURL(/\/sponsor\/orders\/[^/?]+/, { timeout: 30_000 });
  return new URL(sponsor.url()).pathname.split("/").pop()!;
}

/** The sponsor pays the order on the stand-in provider; the worker confirms it and applies the provider's own event. */
async function payOrder(sponsor: Page, orderId: string): Promise<void> {
  await sponsor.getByRole("button", { name: /Pay \$[\d,.]+ by card/ }).click();
  await sponsor.waitForURL(/\/test-provider\/checkout/, { timeout: 30_000 });
  await sponsor.locator("button[name=outcome][value=SUCCEED]").click();
  await sponsor.waitForURL((u) => u.pathname === `/sponsor/orders/${orderId}`, { timeout: 30_000 });
  const [attempt] = await q<{ id: string }>(`select id from "PaymentAttempt" where "orderId" = $1 order by "createdAt" desc limit 1`, [orderId]);
  await runWorker("payments.confirm", { ids: [attempt.id] });
  await paymentApplied(attempt.id);
}
let disputeOrderId = "";
let disputeId = "";

test("2S5-FE-07 · a HELD payment event shows on the desk and BTG resolves it", async () => {
  await raised({ type: "payment.refunded", orderId: seed!.orderId, amountCents: 1000 });
  await admin.goto("/admin/payments/events");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Payment events");
  await expect(tile(admin, "Needs BTG")).toHaveText(/[1-9]/, { timeout: 8_000 });
  await expect(tile(admin, "Held")).toHaveText(/[1-9]/);
  const table = admin.locator("table.sx-table");
  await expect(table).toBeVisible();
  const held = table.locator("tbody tr", { hasText: "Held" }).first();
  await expect(held).toBeVisible();
  await shot(admin, "events-held");
  await held.getByRole("button", { name: /Resolve/ }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await admin.waitForTimeout(400);
  await shot(admin, "events-dialog");
  await dialog.getByRole("textbox").first().fill("QA: the provider refunded $10 on its own; nothing owed back. Closed.");
  await dialog.getByRole("button", { name: "Mark dealt with" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await admin.goto("/admin/payments/events?tab=resolved");
  await expect(admin.locator("table.sx-table tbody tr").first()).toContainText("QA: the provider refunded");
  await shot(admin, "events-resolved");
});

test("2S5-FE-12 · a second order, refunded whole at the provider, is on Finance's Sent list, not sendable", async ({ browser }, testInfo) => {
  const sponsor = await pageAs(browser, testInfo, { key: "walk-sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: seed!.sponsorId });
  secondOrderId = await buy(sponsor, 1, 12);
  await payOrder(sponsor, secondOrderId);
  await sponsor.context().close();
  const status = await raised({ type: "payment.refunded", orderId: secondOrderId });
  expect(status, "a whole refund of an untouched paid order is applied, not held").toBe("APPLIED");
  await admin.goto("/admin/refunds?tab=sent");
  const row = admin.locator("table.sx-table tbody tr", { hasText: "Provider refund" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Refunded by the payment provider");
  await expect(row.getByRole("button", { name: /Mark/ })).toHaveCount(0);
  await shot(admin, "refunds-provider");
  await admin.goto("/admin/payments/events?tab=all");
  await expect(admin.locator("table.sx-table tbody tr", { hasText: "Applied" }).first()).toBeVisible();
});

test("2S5-FE-08 · a dispute opens, BTG takes it for review; the payee sees the money frozen", async ({ browser }, testInfo) => {
  /* The provider opens one dispute per payment, so each run disputes a fresh paid order. */
  const sponsor = await pageAs(browser, testInfo, { key: "walk-sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: seed!.sponsorId });
  disputeOrderId = await buy(sponsor, 1, 20);
  await payOrder(sponsor, disputeOrderId);
  await sponsor.context().close();
  await raised({ type: "dispute.opened", orderId: disputeOrderId });
  const [d] = await q<{ id: string; state: string }>(`select id, state from "PaymentDispute" where "orderId" = $1 order by "openedAt" desc limit 1`, [disputeOrderId]);
  expect(d?.state, "a fresh OPEN dispute on the order").toBe("OPEN");
  disputeId = d.id;
  await admin.goto("/admin/payments/disputes");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Disputes");
  await expect(tile(admin, "Open")).toHaveText(/[1-9]/, { timeout: 8_000 });
  const row = admin.locator("table.sx-table tbody tr").first();
  await expect(row).toBeVisible();
  await shot(admin, "disputes-open");
  await admin.goto(`/admin/payments/disputes/${disputeId}`);
  await shot(admin, "dispute-detail-open");
  await admin.getByRole("button", { name: /dispute for review/ }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await admin.waitForTimeout(400);
  await shot(admin, "dispute-review-dialog");
  await dialog.getByRole("textbox").first().fill("QA: reviewing the sponsor's chargeback.");
  await dialog.getByRole("button", { name: "Take for review" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(admin.getByText(/Under review/i).first()).toBeVisible();
  await shot(admin, "dispute-detail-review");

  /* the athlete whose payout the dispute freezes */
  const athlete = await pageAs(browser, testInfo, { key: "walk-athlete", roles: ["ATHLETE"], athleteId: seed!.athleteId });
  await athlete.goto("/athlete/money");
  await expect(athlete.getByText("BTG is reviewing a problem with the sponsor's payment").first()).toBeVisible();
  await shot(athlete, "athlete-money-frozen");
  await athlete.setViewportSize({ width: 390, height: 844 });
  expect(await athlete.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await shot(athlete, "athlete-money-frozen-390");
  await athlete.context().close();

  /* Finance reads, no buttons */
  const finance = await pageAs(browser, testInfo, FINANCE);
  await finance.goto(admin.url());
  await expect(finance.getByRole("button", { name: /Resolve|Take for review/ })).toHaveCount(0);
  await expect(finance.getByText(/BTG admin/).first()).toBeVisible();
  await shot(finance, "dispute-detail-finance");
  await finance.context().close();
});

test("2S5-FE-08 · the provider decides LOST for part of the order; BTG resolves it naming the lines", async () => {
  const [o] = await q<{ totalCents: number }>(`select "totalCents" from "MarketplaceOrder" where id = $1`, [disputeOrderId]);
  await raised({ type: "dispute.closed", orderId: disputeOrderId, outcome: "LOST", amountCents: Math.round(o.totalCents / 2) });
  await admin.goto(`/admin/payments/disputes/${disputeId}`);
  await admin.getByRole("button", { name: /Resolve the .* dispute/ }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const boxes = dialog.getByRole("checkbox");
  if (await boxes.count()) await boxes.first().check();
  await admin.waitForTimeout(400);
  await shot(admin, "dispute-resolve-dialog");
  await dialog.getByRole("textbox").first().fill("QA: the provider sided with the sponsor on half the order.");
  await dialog.getByRole("button", { name: /^Resolve as/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(admin.getByText(/Lost/).first()).toBeVisible();
  await shot(admin, "dispute-detail-lost");
  await admin.goto("/admin/payments/disputes?tab=lost");
  await expect(admin.locator("table.sx-table tbody tr").first()).toBeVisible();
});

test("2S5-FE-10 · a payout returned by the bank shows on BTG's detail and in the payee's history", async ({ browser }, testInfo) => {
  await raised({ type: "payout.returned", payoutId: seed!.payoutId });
  await admin.goto(`/admin/payouts/${seed!.payoutId}`);
  await expect(admin.getByText(/Handed to the provider/)).toBeVisible();
  await expect(admin.getByText(/Returned by the bank/)).toBeVisible();
  await shot(admin, "payout-returned-admin");
  const athlete = await pageAs(browser, testInfo, { key: "walk-athlete", roles: ["ATHLETE"], athleteId: seed!.athleteId });
  await athlete.goto("/athlete/money");
  await expect(athlete.getByText("Returned by your bank: fix your payout account").first()).toBeVisible();
  await shot(athlete, "payout-returned-athlete");
  await athlete.context().close();
});

test("2S1-FE-14 · a support message with a file reaches BTG's page and the file opens", async ({ browser }, testInfo) => {
  const visitor = await browser.newPage();
  await useObjectStore(visitor);
  await visitor.goto("/contact");
  const form = visitor.getByRole("form", { name: "Message BTG" });
  await form.getByLabel("Name").fill("QA Visitor");
  await form.getByLabel("Email").fill("qa.visitor@example.invalid");
  await form.getByLabel(/Message/).fill("QA: here is the file you asked for.");
  await form.locator("input[type=file]").setInputFiles({ name: "qa-note.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 qa") });
  await form.getByRole("button", { name: /Send/ }).click();
  await expect(visitor.getByRole("status", { name: "Message sent" })).toBeVisible({ timeout: 30_000 });
  await visitor.close();
  const [m] = await q<{ id: string }>(`select id from "SupportMessage" where email = $1 order by "createdAt" desc limit 1`, ["qa.visitor@example.invalid"]);
  expect(m?.id).toBeTruthy();
  await admin.goto(`/admin/support/${m.id}`);
  await expect(admin.getByText("QA: here is the file you asked for.")).toBeVisible();
  await expect(admin.locator("table.sx-table tbody tr", { hasText: "qa-note.pdf" })).toBeVisible();
  await shot(admin, "support-message");
  const popup = admin.context().waitForEvent("page", { timeout: 15_000 }).catch(() => null);
  await admin.getByRole("button", { name: /^Open qa-note/ }).click();
  const opened = await popup;
  expect(opened, "the signed link opened in a new tab").not.toBeNull();
  await opened?.close();
  const finance = await pageAs(browser, testInfo, FINANCE);
  await finance.goto(`/admin/support/${m.id}`);
  await expect(finance.getByText(/Outside your role|not in your role|BTG admin/i).first()).toBeVisible();
  await finance.context().close();
});

test("2S8-FE-02 · the claim banners on the athlete's profile", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(`/athletes/${seed!.athleteSlug}?claim=confirmed`);
  await expect(page.getByText(/email is confirmed/i)).toBeVisible();
  await page.goto(`/athletes/${seed!.athleteSlug}?claim=expired-resent`);
  await expect(page.getByText(/sent you a fresh one/i)).toBeVisible();
  await shot(page, "claim-banner");
  await page.close();
});

test("leaves an unpaid order for the busy-checkout check", async ({ browser }, testInfo) => {
  const sponsor = await pageAs(browser, testInfo, { key: "walk-sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: seed!.sponsorId });
  const id = await buy(sponsor, 1, 28);
  console.log("UNPAID ORDER", id);
  await shot(sponsor, "unpaid-order");
  await sponsor.context().close();
});

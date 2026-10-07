import { expect, test } from "@playwright/test";

import { hasLoopStack, LOOP_SKIP_REASON, pageAs } from "./support/auth";
import { q } from "./support/loop-db";

/**
 * QA of 2S5-FE-11 (2026-10-07): with the API started as
 * `STANDIN_OUTAGE=checkout` the stand-in provider refuses to open a
 * checkout, so the route answers 503 `busy`. The sponsor's pay button must say
 * "The payment service is busy. Try again in a minute." and stay usable,
 * and the order must still be AWAITING_PAYMENT. Run only with the API in
 * that state (QA_BUSY=1); it needs an unpaid order of the walk-sponsor.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);
test.skip(!process.env.QA_BUSY, "set QA_BUSY=1 with the API started as STANDIN_OUTAGE=checkout");

test("the pay button says the service is busy and the order is unchanged", async ({ browser }, testInfo) => {
  const OUT = process.env.SHOT_DIR ?? testInfo.outputPath("");
  const [order] = await q<{ id: string; sponsorId: string }>(
    `select id, "sponsorId" from "MarketplaceOrder" where state = 'AWAITING_PAYMENT' order by "createdAt" desc limit 1`,
  );
  test.skip(!order, "no unpaid order — run qa-phase2.spec.ts first");
  const sponsor = await pageAs(browser, testInfo, { key: "walk-sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: order.sponsorId });
  const attemptsBefore = Number((await q<{ n: string }>(`select count(*)::text as n from "PaymentAttempt" where "orderId" = $1`, [order.id]))[0].n);
  await sponsor.goto(`/sponsor/orders/${order.id}`);
  const pay = sponsor.getByRole("button", { name: /Pay \$[\d,.]+ by card/ });
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(sponsor.getByRole("alert").filter({ hasText: "busy" })).toHaveText("The payment service is busy. Try again in a minute.", { timeout: 30_000 });
  await expect(pay).toBeEnabled();
  await sponsor.screenshot({ path: `${OUT}/qa-busy.png`, fullPage: true });
  const [after] = await q<{ state: string }>(`select state from "MarketplaceOrder" where id = $1`, [order.id]);
  expect(after.state).toBe("AWAITING_PAYMENT");
  const [attempts] = await q<{ n: string }>(`select count(*)::text as n from "PaymentAttempt" where "orderId" = $1`, [order.id]);
  expect(Number(attempts.n), "nothing recorded").toBe(attemptsBefore);
  await sponsor.context().close();
});

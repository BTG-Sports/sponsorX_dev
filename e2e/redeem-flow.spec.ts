import { expect, test } from "@playwright/test";

import { cleanup, eventCounts, hasDatabase, seedToken } from "./support/fan-db";

/**
 * P6-QA-01 — E2E: scan → landing → claim → redeem.
 *
 * "All four events recorded separately; a second redeem attempt is rejected."
 *
 * The real stack end to end: the browser opens a seeded reward link on the web
 * app, which calls the API, which writes Postgres. JavaScript is OFF for the
 * whole walk — the fan page is plain HTML forms and a 1×1 beacon, and this
 * proves a phone with scripts blocked can still claim and redeem.
 */
test.use({ javaScriptEnabled: false });
test.skip(!hasDatabase, "needs DATABASE_URL and the API — CI's e2e job provides both");
test.afterAll(cleanup);

async function waitForEvents(token: string, want: Record<string, number>) {
  /* SCAN is written after the response (Next `after()`), LANDING by the
     beacon request — both asynchronous to the page itself. */
  await expect.poll(() => eventCounts(token), { timeout: 10_000 }).toMatchObject(want);
}

test("a fan scans, lands, claims and redeems — once", async ({ page, request }) => {
  const token = await seedToken("flow");

  // SCAN + LANDING — opening the link.
  const opened = await page.goto(`/r/${token}`);
  expect(opened?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You've got a reward");
  await expect(page.getByText("E2E free slice")).toBeVisible();
  await waitForEvents(token, { SCAN: 1, LANDING: 1 });

  // CLAIM — the form, with an email and the consent box.
  await page.getByLabel(/Email for your code/).fill("fan@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Claim reward" }).click();
  await expect(page.getByText(/Claimed\./)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your reward is ready");

  // REDEEM — the booth taps once.
  await page.getByRole("button", { name: "Staff: redeem now" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Redeemed ✓");

  // A SECOND redeem is refused — the redeemed page offers no button, so the
  // attempt is the raw form POST a second booth (or a replay) would send.
  const again = await request.post(`/r/${token}/redeem`, { maxRedirects: 0 });
  expect(again.status()).toBe(303);
  expect(again.headers()["location"]).toBe(`/r/${token}?flash=used`);
  await page.goto(`/r/${token}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Already used");

  // Four distinct events, one of each — and still exactly one REDEEM.
  await waitForEvents(token, { SCAN: 1, LANDING: 1, CLAIM: 1, REDEEM: 1 });
  const counts = await eventCounts(token);
  expect(counts).toEqual({ SCAN: 1, LANDING: 1, CLAIM: 1, REDEEM: 1 });
});

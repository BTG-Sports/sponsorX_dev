import { expect, test } from "@playwright/test";

/**
 * The public surfaces — P2-QA-01.
 *
 * What a browser can prove and a unit test cannot: that the page renders at
 * all, that its critical text survives the server/client boundary, and that
 * it works at the width it was designed for. These are deliberately thin —
 * the harness is what this task delivers, and the loop tests belong to
 * P3-QA-01 and the other QA rows.
 */

test("the marketing page renders and is navigable", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status(), "the home page must not error").toBeLessThan(400);
  await expect(page.locator("body")).toBeVisible();
  /* Next renders an error overlay's text into the DOM on a server exception,
     which a status check alone would miss. */
  await expect(page.locator("body")).not.toContainText("Application error");
});

test("every public route answers without a server error", async ({ page }) => {
  /* A smoke sweep. It has caught more in this codebase than any single
     assertion would: a fixture rename breaks one route and nothing else. */
  for (const path of ["/packages", "/map", "/join", "/brief"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} returned ${response?.status()}`).toBeLessThan(400);
    await expect(page.locator("body"), path).not.toContainText("Application error");
  }
});

test("an unknown route renders the not-found page, not a crash", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText("Application error");
});

test("the layout has no horizontal scroll at 390px", async ({ page }, testInfo) => {
  /* The NEXT student portal is designed at 390px first and every public page
     is reached from a phone. A horizontal scrollbar is the failure that only
     shows in a browser at a real width. */
  test.skip(testInfo.project.name !== "mobile", "width-specific");
  await page.goto("/");
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows, "the page scrolls sideways at 390px").toBe(false);
});

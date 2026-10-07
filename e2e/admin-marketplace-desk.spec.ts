import { expect, test } from "@playwright/test";

import { desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs } from "./support/auth";

/**
 * P1-ART-20 — the marketplace desk. As BTG_ADMIN: the queue strip renders
 * its five tiles, a tile switches the panel in place and writes `?queue=`,
 * the listings queue's three tabs switch in place, an old `?listings=auto`
 * email link lands on the listings queue's "Published automatically" tab;
 * no console error; no horizontal overflow at 390. Screenshots land in the
 * test's output folder. Needs the loop stack, like the loop walks.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);
const ADMIN = { key: "p7.admin", roles: ["BTG_ADMIN" as const] };

test("P1-ART-20 · the marketplace desk", async ({ browser }, testInfo) => {
  test.skip(!desktopOnly(testInfo), "desktop only");
  const OUT = process.env.SHOT_DIR ?? testInfo.outputPath("");
  const admin = await pageAs(browser, testInfo, ADMIN);
  const errors: string[] = [];
  admin.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.setViewportSize({ width: 1440, height: 900 });
  await admin.goto("/admin/marketplace");
  /* The strip is an <ol> laid out as a grid, which Chrome no longer exposes as a list — so by its region. */
  const tiles = admin.getByRole("region", { name: "Queues" }).getByRole("button");
  await expect(tiles).toHaveCount(5);
  await admin.waitForTimeout(900);
  await admin.screenshot({ path: `${OUT}/marketplace-after.png`, fullPage: true });

  /* a tile switches the panel in place and writes the URL */
  await tiles.nth(3).click();
  await expect(admin.getByRole("region", { name: "Failed payments" })).toBeVisible();
  await admin.waitForURL((u) => u.searchParams.get("queue") === "payments");
  await admin.screenshot({ path: `${OUT}/marketplace-after-payments.png`, fullPage: true });

  /* the listings queue and its tabs */
  await tiles.nth(1).click();
  await expect(admin.getByRole("region", { name: "Listings" })).toBeVisible();
  await admin.getByRole("link", { name: /^Live listings/ }).click();
  await admin.waitForURL((u) => u.searchParams.get("listings") === "live");
  await admin.waitForTimeout(600);
  await admin.screenshot({ path: `${OUT}/marketplace-after-live.png`, fullPage: true });

  /* an old email link */
  await admin.goto("/admin/marketplace?listings=auto");
  await expect(admin.getByRole("region", { name: "Listings" })).toBeVisible();
  await expect(admin.getByRole("link", { name: /^Published automatically/ })).toHaveAttribute("aria-current", "page");

  /* phone */
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.waitForTimeout(500);
  await admin.screenshot({ path: `${OUT}/marketplace-after-390.png`, fullPage: true });
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

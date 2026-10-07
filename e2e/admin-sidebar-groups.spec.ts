import { expect, test } from "@playwright/test";

import { desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs } from "./support/auth";

/**
 * P1-ART-21 — the admin sidebar's collapsible groups. As BTG_ADMIN: the
 * dashboard shows Dashboard plus seven closed groups; opening a desk opens
 * its group (and only it); a group header toggles its desks; a group the
 * viewer opened stays open after a reload; the phone drawer lists the
 * groups. No console error. Screenshots land in the test's output folder.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);
const ADMIN = { key: "p7.admin", roles: ["BTG_ADMIN" as const] };
const GROUPS = ["Intake", "Campaigns", "Marketplace", "Money", "Accounts", "NEXT", "System"];

test("P1-ART-21 · the sidebar groups", async ({ browser }, testInfo) => {
  test.skip(!desktopOnly(testInfo), "desktop only");
  const OUT = process.env.SHOT_DIR ?? testInfo.outputPath("");
  const admin = await pageAs(browser, testInfo, ADMIN);
  const errors: string[] = [];
  admin.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.setViewportSize({ width: 1440, height: 900 });
  const aside = admin.locator("aside");
  const header = (name: string) => aside.getByRole("button", { name: new RegExp(`^${name}\\b`) });

  await admin.goto("/admin");
  for (const g of GROUPS) await expect(header(g)).toHaveAttribute("aria-expanded", "false");
  await expect(aside.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Payouts" })).toBeHidden();
  await admin.waitForTimeout(700);
  await admin.screenshot({ path: `${OUT}/sidebar-closed.png` });

  /* a desk opens its own group */
  await admin.goto("/admin/payouts");
  await expect(header("Money")).toHaveAttribute("aria-expanded", "true");
  await expect(header("Intake")).toHaveAttribute("aria-expanded", "false");
  await expect(aside.getByRole("link", { name: "Payouts" })).toBeVisible();

  /* a header toggles, and the choice is remembered across a reload */
  await header("Intake").click();
  await expect(aside.getByRole("link", { name: "Sponsor requests" })).toBeVisible();
  await admin.waitForTimeout(500);
  await admin.screenshot({ path: `${OUT}/sidebar-open.png` });
  await admin.reload();
  await expect(header("Intake")).toHaveAttribute("aria-expanded", "true");
  await header("Intake").click();
  await expect(aside.getByRole("link", { name: "Sponsor requests" })).toBeHidden();

  /* the LAST group's desks show at once when it opens — their entrance is timed from
     the group's own first row, not the top of the nav (owner: "showing takes to long") */
  await header("System").click();
  const last = aside.getByRole("link", { name: "Integrations" });
  await expect(last).toBeVisible({ timeout: 300 });
  await expect.poll(() => last.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 600 }).toBeGreaterThan(0.9);

  /* the phone drawer */
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.getByRole("button", { name: /menu|open navigation/i }).first().click();
  await expect(admin.getByText("Money", { exact: true }).last()).toBeVisible();
  await admin.waitForTimeout(1200);
  await admin.screenshot({ path: `${OUT}/sidebar-phone.png`, fullPage: true });

  expect(errors).toEqual([]);
});

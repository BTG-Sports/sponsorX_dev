import { expect, test } from "@playwright/test";

import { desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs } from "./support/auth";

/**
 * P1-ART-19 — the commission desk. As BTG_ADMIN: the split strip renders,
 * the sample order works out a split, "Add a rule" opens the dialog, whose
 * "Preview with this rule" draws the split with and without the unsaved
 * rule, the named dropdown opens, Escape closes the dropdown then the
 * dialog; no console error; no horizontal overflow at 390. Screenshots land
 * in the test's output folder. Needs the loop stack, like the loop walks.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);
const ADMIN = { key: "p7.admin", roles: ["BTG_ADMIN" as const] };

test("P1-ART-19 · the commission desk", async ({ browser }, testInfo) => {
  test.skip(!desktopOnly(testInfo), "desktop only");
  const OUT = process.env.SHOT_DIR ?? testInfo.outputPath("");
  const admin = await pageAs(browser, testInfo, ADMIN);
  const errors: string[] = [];
  admin.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.setViewportSize({ width: 1440, height: 900 });
  await admin.goto("/admin/commission");
  await admin.getByRole("button", { name: /Platform fee/ }).first().waitFor();
  await admin.waitForTimeout(900);
  await admin.screenshot({ path: `${OUT}/commission-after.png`, fullPage: true });

  /* the sample order */
  await admin.getByRole("button", { name: "Work out the split" }).click();
  await admin.getByText("Whole order").waitFor();
  await admin.waitForTimeout(400);
  await admin.screenshot({ path: `${OUT}/commission-after-split.png`, fullPage: true });

  /* the add-rule dialog, with a preview against the sample */
  await admin.getByRole("button", { name: "+ Add a rule" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByPlaceholder("15").fill("12.5");
  await dialog.getByPlaceholder("0.30").fill("0.30");
  await dialog.getByRole("button", { name: "Preview with this rule" }).click();
  await dialog.getByRole("columnheader", { name: "With this rule" }).waitFor();
  await admin.waitForTimeout(400);
  await admin.screenshot({ path: `${OUT}/commission-after-dialog.png` });
  /* the dropdown */
  await dialog.getByRole("button", { name: /Applies to/ }).click();
  await admin.waitForTimeout(300);
  await admin.screenshot({ path: `${OUT}/commission-after-dropdown.png` });
  await admin.keyboard.press("Escape");
  await admin.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  /* phone */
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.waitForTimeout(500);
  await admin.screenshot({ path: `${OUT}/commission-after-390.png`, fullPage: true });
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

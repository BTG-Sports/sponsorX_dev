import { expect, test, type Page } from "@playwright/test";

import { desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs } from "./support/auth";

/**
 * P1-FE-31 — the admin desks that list records are server-paged tables.
 *
 * Walks the ten desks as BTG_ADMIN and checks, on each, that the page is on
 * the stage, that it renders either the stage table (or the briefs' rows)
 * with the house pager above it — "… per page" and the page list — or an
 * honest empty state, with no console error and no horizontal overflow.
 * Then checks the URL drives the pager: `?size=24` is what the control
 * shows, and a tab link resets `?page`.
 *
 * Needs the loop stack (a database and Clerk's dev instance); skipped
 * without it, like the loop walks.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);

const ADMIN = { key: "p7.admin", roles: ["BTG_ADMIN" as const] };

const DESKS = [
  { path: "/admin/sponsor-requests", noun: "Requests" },
  { path: "/admin/onboarding", noun: "Applications" },
  { path: "/admin/payouts", noun: "Payouts" },
  { path: "/admin/refunds", noun: "Refunds" },
  { path: "/admin/delivery-issues", noun: "Issues" },
  { path: "/admin/guardian-handoffs", noun: "Handoffs" },
  { path: "/admin/closed-accounts", noun: "Accounts" },
  { path: "/admin/offers", noun: "Offers" },
  { path: "/admin/audit", noun: "Changes" },
  { path: "/admin/briefs", noun: "Briefs" },
];

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("P1-FE-31 · paged admin tables", () => {
  let admin: Page;
  const errors: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(!desktopOnly(testInfo), "desks — desktop project only");
    admin = await pageAs(browser, testInfo, ADMIN);
    admin.on("console", (m) => {
      if (m.type() === "error") errors.push(`${admin.url()}: ${m.text()}`);
    });
    admin.on("pageerror", (e) => errors.push(`${admin.url()}: ${e.message}`));
  });

  for (const desk of DESKS) {
    test(`${desk.path} lists a paged table or an empty state`, async () => {
      await admin.goto(desk.path);
      await expect(admin.locator("body")).toHaveClass(/sx-ops/);
      const table = admin.locator("table.sx-table").first();
      const briefRows = admin.locator("ul li button[aria-pressed]").first();
      /* EmptyState (components/states.tsx) is a Card with its title in a bold <p>; the briefs desk's in-list empty item is the same line. */
      const empty = admin.locator("main p.text-sm.font-semibold").first();
      const outcome = await Promise.race([
        table.waitFor({ state: "visible", timeout: 15_000 }).then(() => "table" as const),
        briefRows.waitFor({ state: "visible", timeout: 15_000 }).then(() => "rows" as const),
        empty.waitFor({ state: "visible", timeout: 15_000 }).then(() => "empty" as const),
      ]);
      if (outcome !== "empty") {
        /* The house pager, above and below. */
        const pagers = admin.getByRole("button", { name: `${desk.noun} per page` });
        await expect(pagers).toHaveCount(2);
        await expect(admin.getByRole("navigation", { name: /pagination/i }).first()).toBeVisible();
        if (outcome === "table") {
          /* A real table with a header row. */
          expect(await table.locator("thead th").count()).toBeGreaterThan(3);
          expect(await table.locator("tbody tr").count()).toBeGreaterThan(0);
        }
      }
      expect(await overflow(admin)).toBe(0);
      await admin.screenshot({ path: test.info().outputPath(`${desk.path.slice(7).replace(/\//g, "-")}.png`), fullPage: true });
    });
  }

  test("the URL drives the pager and a tab resets the page", async () => {
    await admin.goto("/admin/audit?size=24&page=2");
    const sizeMenu = admin.getByRole("button", { name: "Changes per page" }).first();
    if (await sizeMenu.isVisible()) {
      await expect(sizeMenu).toContainText("24");
    }
    await admin.goto("/admin/refunds?tab=sent&page=3");
    await admin.getByRole("link", { name: /^To send/ }).first().click();
    await admin.waitForURL((u) => !u.searchParams.has("page"));
  });

  test("no console errors across the desks", () => {
    expect(errors).toEqual([]);
  });
});

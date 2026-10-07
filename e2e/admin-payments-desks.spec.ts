import { expect, test, type Page } from "@playwright/test";

import { API_URL, desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs, signInExisting } from "./support/auth";

/**
 * 2S5-FE-07 / 2S5-FE-08 / 2S1-FE-14 — BTG's payment desks and the support
 * message page (Stream A of the Phase 2 frontend batch, 2026-10-07).
 *
 * Walks /admin/payments/events and /admin/payments/disputes as BTG_ADMIN:
 * the Mission Control stage, the small title, the four KPI tiles, the tab
 * strip with the API's counts, and either the stage table with the house
 * pager or an honest empty state — no console error, no horizontal overflow
 * at 1440 or 390. Then seeds a support message through the public API and
 * walks /admin/support/<id>. As FINANCE, the desks render without a Resolve
 * button.
 *
 * The dev database may hold no provider events or disputes: the empty
 * states are the acceptable outcome then. An attachment needs a real upload
 * to the private bucket, so the support message is seeded without one and
 * the page's "no files" line is what is asserted.
 *
 * Needs the loop stack (a database and Clerk's dev instance); skipped
 * without it, like the loop walks.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);

const ADMIN = { key: "p7.admin", roles: ["BTG_ADMIN" as const] };
const FINANCE = { key: "p7.finance", roles: ["FINANCE" as const] };

const DESKS = [
  { path: "/admin/payments/events", title: "Payment events", noun: "Events", tiles: ["Needs BTG", "Held", "Failed", "Deferred"], tabs: ["Needs BTG", "Deferred", "Resolved", "All"] },
  { path: "/admin/payments/disputes", title: "Disputes", noun: "Disputes", tiles: ["Open", "Under review", "Won", "Lost"], tabs: ["Open", "Under review", "Won", "Lost"] },
];

/**
 * A navigation that stays signed in. Clerk's session token lives a minute
 * and clerk-js refreshes it only while a page is open, so a server
 * navigation right at the boundary can answer 401 → /login; sign in again
 * and go once more rather than fail the walk on the session's clock.
 */
async function go(page: Page, key: string, path: string): Promise<void> {
  await page.goto(path);
  if (/\/login(\?|$)/.test(page.url())) {
    await signInExisting(page, key);
    await page.goto(path);
  }
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The desk's body: the stage table with the house pager, or the empty state. */
async function tableOrEmpty(page: Page, noun: string): Promise<"table" | "empty"> {
  const table = page.locator("table.sx-table").first();
  const empty = page.locator("main p.text-sm.font-semibold").first();
  const outcome = await Promise.race([
    table.waitFor({ state: "visible", timeout: 15_000 }).then(() => "table" as const),
    empty.waitFor({ state: "visible", timeout: 15_000 }).then(() => "empty" as const),
  ]);
  if (outcome === "table") {
    await expect(page.getByRole("button", { name: `${noun} per page` })).toHaveCount(2);
    expect(await table.locator("thead th").count()).toBeGreaterThan(3);
    expect(await table.locator("tbody tr").count()).toBeGreaterThan(0);
  }
  return outcome;
}

test.describe("Stream A · payment desks and the support page", () => {
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
    test(`${desk.path} is a dashboard: title, tiles, tabs, a paged table or an empty state`, async () => {
      await admin.setViewportSize({ width: 1440, height: 900 });
      await go(admin, ADMIN.key, desk.path);
      await expect(admin.locator("body")).toHaveClass(/sx-ops/);
      await expect(admin.getByRole("heading", { level: 1, name: desk.title })).toBeVisible();
      for (const tile of desk.tiles) await expect(admin.locator("dl dt", { hasText: new RegExp(`^${tile}$`, "i") }).first()).toBeVisible();
      const strip = admin.getByRole("navigation", { name: desk.title });
      await expect(strip).toBeVisible();
      for (const tab of desk.tabs) await expect(strip.getByRole("link", { name: new RegExp(`^${tab}`) })).toBeVisible();
      const outcome = await tableOrEmpty(admin, desk.noun);
      test.info().annotations.push({ type: "outcome", description: `${desk.path}: ${outcome}` });
      expect(await overflow(admin)).toBe(0);
      await admin.screenshot({ path: test.info().outputPath(`${desk.path.slice(7).replace(/\//g, "-")}-1440.png`), fullPage: true });
      await admin.setViewportSize({ width: 390, height: 844 });
      await admin.waitForTimeout(300);
      expect(await overflow(admin)).toBe(0);
      await admin.screenshot({ path: test.info().outputPath(`${desk.path.slice(7).replace(/\//g, "-")}-390.png`), fullPage: true });
      await admin.setViewportSize({ width: 1440, height: 900 });
    });
  }

  test("a dispute's tab link resets the pager, and the Resolved tab of events is reachable", async () => {
    await go(admin, ADMIN.key, "/admin/payments/disputes?tab=lost&page=3");
    await admin.getByRole("link", { name: /^Open/ }).first().click();
    await admin.waitForURL((u) => !u.searchParams.has("page"));
    await go(admin, ADMIN.key, "/admin/payments/events?tab=resolved");
    await expect(admin.getByRole("navigation", { name: "Payment events" }).getByRole("link", { name: /^Resolved/ })).toHaveAttribute("aria-current", "page");
    await tableOrEmpty(admin, "Events");
  });

  test("a support message seeded through the public API renders on /admin/support/<id>", async () => {
    const stamp = Date.now().toString(36);
    const res = await fetch(`${API_URL}/api/v1/public/support/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Walk ${stamp}`, email: `walk.${stamp}@example.com`, topic: "ACCOUNT", message: `Stream A walk ${stamp}: can you check my account?` }),
    });
    test.skip(res.status === 429, "the public support form is rate-limited for this address — try again in an hour");
    expect(res.status, await res.clone().text()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    await go(admin, ADMIN.key, `/admin/support/${id}`);
    await expect(admin.locator("body")).toHaveClass(/sx-ops/);
    await expect(admin.getByRole("heading", { level: 1, name: "Support message" })).toBeVisible();
    await expect(admin.getByText(`Walk ${stamp}`).first()).toBeVisible();
    await expect(admin.getByText(`Stream A walk ${stamp}: can you check my account?`)).toBeVisible();
    await expect(admin.getByText("Account", { exact: true }).first()).toBeVisible();
    await expect(admin.getByText("No files were attached to this message.")).toBeVisible();
    expect(await overflow(admin)).toBe(0);
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.waitForTimeout(300);
    expect(await overflow(admin)).toBe(0);
    await admin.setViewportSize({ width: 1440, height: 900 });
    /* A link that matches no message in these books is an honest empty state, not a crash. */
    await go(admin, ADMIN.key, "/admin/support/no_such_message");
    await expect(admin.getByText("No support message matches this link")).toBeVisible();
  });

  test("no console errors across the desks", () => {
    expect(errors).toEqual([]);
  });
});

test.describe("Stream A · Finance reads, never resolves", () => {
  let finance: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(!desktopOnly(testInfo), "desks — desktop project only");
    finance = await pageAs(browser, testInfo, FINANCE);
  });

  for (const desk of DESKS) {
    test(`${desk.path} as FINANCE: the desk, without a Resolve button`, async () => {
      await go(finance, FINANCE.key, desk.path);
      await expect(finance.getByRole("heading", { level: 1, name: desk.title })).toBeVisible();
      await tableOrEmpty(finance, desk.noun);
      await expect(finance.getByRole("button", { name: /^Resolve/ })).toHaveCount(0);
    });
  }

  test("/admin/support/<id> as FINANCE is not in role", async () => {
    await go(finance, FINANCE.key, "/admin/support/anything");
    await expect(finance.getByText("Not in your role")).toBeVisible();
  });
});

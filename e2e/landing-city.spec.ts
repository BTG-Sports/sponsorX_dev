import { expect, test } from "@playwright/test";

/**
 * The landing page's 3D city backdrop — P1-ART-09.
 *
 * What a browser can prove here: the home page still renders its content
 * over the poster with no client error whether or not WebGL is available,
 * and when the scene does mount it does so behind the page (never above the
 * header, never intercepting clicks). Headless Chromium renders WebGL through
 * SwiftShader, so the scene may mount and then be retired by the FPS
 * watchdog — both outcomes are correct; a thrown error is not.
 */

// Headless Chromium renders the scene on the CPU (SwiftShader) until the
// watchdog retires it, which starves the main thread for a few seconds.
test.setTimeout(120_000);

test("home renders over the poster and the scene never breaks the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The poster is the permanent fallback: always present, decorative, behind the page.
  const poster = page.locator('[data-city-poster="true"]');
  await expect(poster).toHaveCount(1);
  await expect(poster).toHaveAttribute("aria-hidden", "true");

  // Give the capability gate, the dynamic import and the GLB a moment; the
  // canvas either appears behind the page or stays absent (gate/watchdog).
  await page.waitForTimeout(6000);
  const canvases = page.locator("canvas");
  const n = await canvases.count();
  if (n > 0) {
    const wrapper = canvases.first().locator("xpath=ancestor::div[contains(@class,'fixed')][1]");
    await expect(wrapper).toHaveClass(/pointer-events-none/);
    // Behind the page: z-0 under the content and the z-20 header (it was
    // -z-10 before the fly-through stage, P1-ART-10, took over the layout).
    await expect(wrapper).toHaveClass(/(^|\s)z-0(\s|$)/);
  }

  // The hero's primary CTA is still visible and reachable through everything.
  // "Get Started" also names the header button, so pick the hero's by target.
  const cta = page.locator('a[href="#start"]', { hasText: /Get Started/i }).first();
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "#start");

  expect(errors, errors.join("\n")).toEqual([]);
});

test("?orbit=1 lifts the scene into review mode without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?orbit=1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(4000);
  const canvases = page.locator("canvas");
  if ((await canvases.count()) > 0) {
    const wrapper = canvases.first().locator("xpath=ancestor::div[contains(@class,'fixed')][1]");
    await expect(wrapper).toHaveClass(/pointer-events-auto/);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

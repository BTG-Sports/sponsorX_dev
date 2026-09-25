import { expect, test, type Request } from "@playwright/test";

import { cleanup, hasDatabase, seedToken } from "./support/fan-db";

/**
 * P6-QA-02 — the redeem page's performance budget, on a throttled phone.
 *
 * "Verified on a throttled mobile connection: no client bundle, no
 * render-blocking font, plain dynamic route — no ISR, no edge middleware."
 *
 * Pixel 7 profile, Lighthouse's "Slow 4G" network (150 ms latency, 1.6 Mbps
 * down, 750 kbps up) and a 4× slower CPU. The static half — no caching, no
 * pre-rendering, no edge runtime, no proxy on the route — is
 * frontend/tests/fan-route-budget.test.ts.
 */
const BUDGET = { maxBytes: 20 * 1024, maxLoadMs: 2_500 };

test.afterAll(cleanup);

test("the redeem page loads with no scripts, no fonts, under budget", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "a phone budget — measured on the mobile profile");
  const token = hasDatabase ? await seedToken("budget") : "e2e-budget-no-database";

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));

  await page.goto(`/r/${token}`, { waitUntil: "load" });

  const loadMs = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return nav.loadEventEnd - nav.startTime;
  });
  let bytes = 0;
  for (const r of requests) bytes += (await r.sizes()).responseBodySize + (await r.sizes()).responseHeadersSize;

  const scripts = requests.filter((r) => r.resourceType() === "script");
  const fonts = requests.filter((r) => r.resourceType() === "font");
  const stylesheets = requests.filter((r) => r.resourceType() === "stylesheet");
  const inlineScripts = await page.locator("script").count();

  testInfo.annotations.push({
    type: "budget",
    description: `${requests.length} requests · ${(bytes / 1024).toFixed(1)} KB · load ${Math.round(loadMs)} ms (Slow 4G, 4× CPU)`,
  });

  expect(scripts.map((r) => r.url()), "no client bundle").toEqual([]);
  expect(inlineScripts, "no inline scripts either").toBe(0);
  expect(fonts.map((r) => r.url()), "no web font to block rendering").toEqual([]);
  expect(stylesheets.map((r) => r.url()), "no external stylesheet to block rendering").toEqual([]);
  expect(bytes, "whole page under 20 KB").toBeLessThan(BUDGET.maxBytes);
  expect(loadMs, "loads in under 2.5 s on Slow 4G").toBeLessThan(BUDGET.maxLoadMs);
});

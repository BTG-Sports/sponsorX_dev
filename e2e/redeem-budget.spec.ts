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
const BUDGET = { maxBytes: 20 * 1024 };

test.afterAll(cleanup);

test("the redeem page loads with no scripts, no fonts, under budget", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "a phone budget — measured on the mobile profile");
  const token = hasDatabase ? await seedToken("budget") : "e2e-budget-no-database";

  /* The e2e server is `next dev`, which compiles a route on its first hit —
     seconds of build time that no fan ever sees in production. Warm the page
     and its beacon (and the API's database pool) before throttling, so the
     budget measures the page, not the compiler. An unknown code runs the
     same handler without touching the seeded token's funnel. */
  await page.request.get("/r/e2e-budget-warmup");
  await page.request.get("/r/e2e-budget-warmup/landing");

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

  /* Load time is RECORDED, not gated. The e2e server is `next dev` on a
     shared runner, and its response time swung 1.2–5.7 s between identical
     CI runs — noise from the dev server, not the page. Production latency
     is measured against the real build on staging (P8-OPS-02,
     documentation/SponsorX-Fan-QR-Load-Test.md). What this test gates is what
     a throttled phone would otherwise pay for: scripts, fonts, CSS, bytes. */
  testInfo.annotations.push({
    type: "budget",
    description: `${requests.length} requests · ${(bytes / 1024).toFixed(1)} KB · load ${Math.round(loadMs)} ms (Slow 4G, 4× CPU)`,
  });

  expect(scripts.map((r) => r.url()), "no client bundle").toEqual([]);
  expect(inlineScripts, "no inline scripts either").toBe(0);
  expect(fonts.map((r) => r.url()), "no web font to block rendering").toEqual([]);
  expect(stylesheets.map((r) => r.url()), "no external stylesheet to block rendering").toEqual([]);
  expect(bytes, "whole page under 20 KB").toBeLessThan(BUDGET.maxBytes);
});

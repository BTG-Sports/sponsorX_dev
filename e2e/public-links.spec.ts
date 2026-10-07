import { createHmac } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

/**
 * 2S8-FE-01 / 2S8-FE-02 — the nine public link pages and the profile
 * claim's confirm-your-email page, without signing in.
 *
 * What a browser can prove: that each page answers a bad token with its
 * "isn't valid" notice (or, for a genuine link that is too old, the shared
 * "This link has expired" notice with its "Send me a fresh link" button)
 * rather than a crash, with no console error and no sideways scroll at
 * 390px; and that the claim page confirms nothing on open — its one button
 * is what POSTs, and a bad token lands on the invalid notice.
 *
 * The API must be up (E2E_API_URL); the pages call it server-side. The
 * expired case mints a genuine athlete-email link dated 15 days ago under
 * the API's INTAKE_TOKEN_SECRET (lib/signed-link.ts's format), so the
 * notice seen is the real 410, not a mock.
 */

const DAY = 86_400_000;

/** `<subject>.<expiry-seconds>.<hmac>` — backend/src/lib/signed-link.ts, kind athlete-email. */
function expiredAthleteEmailToken(): string {
  const secret = process.env.INTAKE_TOKEN_SECRET ?? "dev-intake-secret-not-for-production";
  const subject = "e2e_expired_links";
  const exp = Math.floor((Date.now() - 15 * DAY + 14 * DAY) / 1000);
  const sig = createHmac("sha256", secret).update(`athlete-email:v2:${subject}.${exp}`).digest("base64url");
  return `${subject}.${exp}.${sig}`;
}

type Watch = { errors: string[] };

function watch(page: Page): Watch {
  const w: Watch = { errors: [] };
  page.on("console", (m) => {
    if (m.type() === "error") w.errors.push(m.text());
  });
  page.on("pageerror", (e) => w.errors.push(e.message));
  return w;
}

async function noOverflowAt390(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflows, "the page scrolls sideways at 390px").toBe(false);
}

/** Either notice is the page's own answer; a crash is neither. */
const NOTICE = /isn[’']t valid|isn[’']t complete|doesn[’']t work|doesn[’']t match|no longer exists|no longer valid|has expired/i;

const PAGES = [
  { path: "/join/confirm?t=expired-fake", name: "join confirm" },
  { path: "/onboarding/confirm?t=x", name: "onboarding confirm" },
  { path: "/sponsor-request/confirm?t=x", name: "sponsor-request confirm" },
  { path: "/guardian/setup?t=x", name: "guardian setup" },
  { path: "/guardian/handoff?r=x", name: "guardian handoff" },
  { path: "/onboarding/not-a-token", name: "onboarding resume" },
  { path: "/sponsor-request/not-a-token", name: "sponsor-request status" },
  { path: "/coming-of-age/not-a-token", name: "coming of age" },
];

for (const p of PAGES) {
  test(`${p.name}: a bad token renders the page's notice, not a crash`, async ({ page }) => {
    const w = watch(page);
    const res = await page.goto(p.path);
    expect(res?.status(), `${p.path} returned ${res?.status()}`).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("main h1").first()).toContainText(NOTICE);
    await noOverflowAt390(page);
    expect(w.errors, `console errors on ${p.path}`).toEqual([]);
  });
}

test("a genuine link older than 14 days: the expired notice and a fresh-link button (2S8-FE-01)", async ({ page }) => {
  const w = watch(page);
  await page.goto(`/join/confirm?t=${encodeURIComponent(expiredAthleteEmailToken())}`);
  await expect(page.locator("main h1").first()).toHaveText("This link has expired");
  await expect(page.locator("main")).toContainText("Links last 14 days.");
  const button = page.getByRole("button", { name: "Send me a fresh link" });
  await expect(button).toBeEnabled();
  await button.click();
  /* The API answers 202 for every well-formed token, even one that names
     nobody — the page cannot be used to probe. Then the button is spent. */
  await expect(page.locator("main")).toContainText(/Sent — check your email|lot of requests/);
  await expect(button).toBeDisabled();
  await noOverflowAt390(page);
  expect(w.errors).toEqual([]);
});

test("the claim page confirms nothing on open; its button lands a bad token on the invalid notice (2S8-FE-02)", async ({ page }) => {
  const w = watch(page);
  await page.goto("/athletes/claim/confirm?t=not-a-token");
  await expect(page.locator("main h1").first()).toHaveText("Confirm your email");
  const button = page.getByRole("button", { name: "Confirm my email" });
  await expect(button).toBeVisible();
  await noOverflowAt390(page);
  await button.click();
  await expect(page.locator("main h1").first()).toContainText(/isn[’']t valid|no longer exists/);
  await expect(page.locator("body")).not.toContainText("Application error");
  expect(w.errors).toEqual([]);
});

test("the claim page without a token says the link isn't complete", async ({ page }) => {
  await page.goto("/athletes/claim/confirm");
  await expect(page.locator("main h1").first()).toContainText(/isn[’']t complete/);
  await expect(page.getByRole("button", { name: "Confirm my email" })).toHaveCount(0);
});

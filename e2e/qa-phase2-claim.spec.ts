import { expect, test } from "@playwright/test";

import { hasLoopStack, LOOP_SKIP_REASON } from "./support/auth";
import { q, TENANT } from "./support/loop-db";

/**
 * QA of 2S8-FE-02 end to end (2026-10-07): a FEATURED profile is claimed,
 * the claimant is told to check their email, the claim email (queued in the
 * outbox, never sent from the harness) now links to the confirm page, the
 * page confirms on a button press, and the profile shows the banner.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);

const run = Date.now().toString(36);
const ID = `qa_feat_${run}`;
const SLUG = ID.replace(/_/g, "-");
const EMAIL = `qa.claimant.${run}@example.invalid`;

test.beforeAll(async () => {
  await q(
    `insert into "Athlete"(id, "tenantId", slug, "legalName", "displayName", email, sport, city, "stateCode",
                           "birthDate", "ageBand", state, tier, "contentCapabilities", "brandInterests", "restrictedCategories")
     values ($1, $2, $3, $4, $4, $5, 'Soccer', 'Silver Spring', 'MD', '2003-04-01', '18_PLUS', 'FEATURED', 'CREATOR', '{}', '{}', '{}')`,
    [ID, TENANT, SLUG, `QA Featured ${run}`, `${ID}@example.invalid`],
  );
});

test("a claimant confirms their email on the new page and sees the banner", async ({ page }) => {
  const OUT = process.env.SHOT_DIR ?? test.info().outputPath("");
  await page.goto(`/athletes/${SLUG}`);
  await page.getByRole("button", { name: "Claim this profile" }).click();
  const form = page.locator("form").filter({ has: page.getByLabel(/Email/) });
  await form.getByLabel(/name/i).first().fill(`QA Featured ${run}`);
  await form.getByLabel(/Email/).fill(EMAIL);
  await form.getByLabel(/birth/i).fill("2003-04-01");
  await form.getByRole("button", { name: /That|Claim|Send|Submit/ }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/qa-claim-check-email.png`, fullPage: true });

  /* the email, from the outbox */
  let link: string | undefined;
  await expect.poll(async () => {
    const rows = await q<{ payload: { data?: Record<string, unknown> } }>(
      `select payload from "OutboxJob" where name = 'notify.email' and lower(payload->>'to') = lower($1)
         and payload::text like $2 order by "createdAt" desc limit 1`,
      [EMAIL, "%/athletes/claim/confirm?t=%"],
    );
    link = Object.values(rows[0]?.payload.data ?? {}).find((v): v is string => typeof v === "string" && v.includes("/athletes/claim/confirm?t="));
    return Boolean(link);
  }, { message: "a claim email linking to the confirm page", timeout: 20_000 }).toBe(true);
  const url = new URL(link!);
  expect(url.pathname, "the email points at the page, not the API").toBe("/athletes/claim/confirm");

  /* the page: no side effect on GET, one button */
  await page.goto(`${url.pathname}${url.search}`);
  await expect(page.getByRole("button", { name: "Confirm my email" })).toBeVisible();
  const [before] = await q<{ state: string }>(`select state from "AthleteClaim" where "claimantEmail" = $1 order by "createdAt" desc limit 1`, [EMAIL]);
  expect(before.state, "opening the page confirms nothing").toBe("PENDING_EMAIL");
  await page.screenshot({ path: `${OUT}/qa-claim-confirm-page.png`, fullPage: true });
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await page.waitForURL((u) => u.pathname === `/athletes/${SLUG}` && u.searchParams.get("claim") === "confirmed", { timeout: 20_000 });
  await expect(page.getByText(/email is confirmed/i)).toBeVisible();
  await page.screenshot({ path: `${OUT}/qa-claim-confirmed.png`, fullPage: true });
  const [after] = await q<{ state: string }>(`select state from "AthleteClaim" where "claimantEmail" = $1 order by "createdAt" desc limit 1`, [EMAIL]);
  expect(after.state).toBe("SUBMITTED");

  /* pressing it again is honest, not an error */
  await page.goto(`${url.pathname}${url.search}`);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await page.waitForURL((u) => u.pathname === `/athletes/${SLUG}`, { timeout: 20_000 });
});

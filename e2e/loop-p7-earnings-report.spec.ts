import { expect, test } from "@playwright/test";

import { apiAs, desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs, releaseUser } from "./support/auth";
import { ensureBase, purge, q, seedAthlete, seedCampaign, seedSponsor, TENANT, tx } from "./support/loop-db";

/**
 * P7-QA-01 — E2E: deliverable → earnings → sponsor report.
 *
 * "The final loop segment runs green end to end."
 *
 * Starts where P5 ends — an accepted order whose one deliverable the athlete
 * has marked PUBLISHED (seeded exactly as acceptOrder and the publish step
 * leave it: order ACCEPTED with its acceptance, the deliverable, a PENDING
 * earning) — and closes the §39 loop:
 *   BTG_ADMIN  verifies the publication on the content desk, which releases
 *              the earning PENDING → ELIGIBLE and — under $2,000, every check
 *              passed (2S5-BE-08, the programme owner's automatic-approval
 *              rule) — on to APPROVED_FOR_PAYOUT as the system, all in the
 *              same transaction;
 *   ATHLETE    sees it approved on their earnings page — pay only;
 *   BTG_ADMIN  sees it on the finance workspace with commission and the
 *              Zoho reconciliation; FINANCE sees the earning but, by the
 *              2026-09-24 matrix decision, not the invoices;
 *   a FAN      clicks the post's tracking link (the public /t route);
 *   SPONSOR    opens the campaign's ROI report from their dashboard and
 *              reads verified and self-reported reach as separate layers,
 *              the attributed click, and the delivery.
 *
 * DRIVEN BELOW THE UI, and why:
 *   - Metrics (`POST /deliverables/:id/metrics`) and the tracking link
 *     (`POST /deliverables/:id/tracking-link`) — BTG's own session, no screen
 *     records either yet (platform ingestion is Phase 3).
 *   - The Zoho Books invoice is a seeded CampaignInvoice row: it is a mirror
 *     of Zoho, written by the sync, and no route creates one.
 * Paying it (PAID) is NOT driven: the finance screen still blocks payout
 * actions on the unwritten Phase 1 payment policy (§37 gate one), and a test
 * must not do what the product deliberately refuses to offer. The approval
 * before it is the system's, and is asserted.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);

const SPONSOR = "e2e_p7_sponsor";
const SPONSOR_NAME = "E2E Pseven Pantry";
const CAMPAIGN = "e2e_p7_campaign";
const CAMPAIGN_NAME = "E2E Pseven — harvest reels";
const ATHLETE = { id: "e2e_p7_athlete", name: "Ebere Pseven" };
const ORDER = "e2e_p7_order";
const DELIVERABLE = "e2e_p7_deliverable";
const TITLE = "Story drop";
const POST_URL = "https://www.instagram.com/p/e2e-p7-post/";
const ADMIN = { key: "p7.admin", roles: ["BTG_ADMIN" as const] };

async function clean() {
  await releaseUser("p7.athlete");
  await releaseUser("p7.sponsor");
  await purge({ sponsorIds: [SPONSOR], athleteIds: [ATHLETE.id], campaignIds: [CAMPAIGN] });
}

test.beforeAll(async ({}, testInfo) => {
  test.skip(!desktopOnly(testInfo), "portal loop — desktop project only (shared seed rows)");
  await ensureBase();
  await clean();
  await seedSponsor(SPONSOR, SPONSOR_NAME);
  await seedAthlete({ ...ATHLETE, rates: { "SX-01": 3000 } });
  await seedCampaign({ id: CAMPAIGN, sponsorId: SPONSOR, name: CAMPAIGN_NAME, state: "ACTIVE" });
  await tx(async (c) => {
    const [agreement] = (await c.query<{ id: string; bodyHash: string }>(
      `select id, "bodyHash" from "Agreement" where "tenantId" = $1 and kind = 'CAMPAIGN_ORDER' and version = 1`,
      [TENANT])).rows;
    await c.query(
      `insert into "AgreementAcceptance"(id, "tenantId", "agreementId", "athleteId", "bodyHash", ip, "userAgent", "acceptedAt")
       values ('e2e_p7_acceptance', $1, $2, $3, $4, '127.0.0.1', 'e2e', now() - interval '6 day')`,
      [TENANT, agreement.id, ATHLETE.id, agreement.bodyHash]);
    await c.query(
      `insert into "CampaignOrder"(id, "tenantId", "campaignId", "athleteId", "jobId", compensation, "sellPrice",
                                   "usageRights", "dueDate", state, "acceptedAt", "acceptanceId")
       values ($1, $2, $3, $4, 'SX-01', 3000, 8000, 'Organic social, 90 days', now() - interval '1 day',
               'ACCEPTED', now() - interval '6 day', 'e2e_p7_acceptance')`,
      [ORDER, TENANT, CAMPAIGN, ATHLETE.id]);
    await c.query(
      `insert into "Deliverable"(id, "tenantId", "orderId", title, "dueDate", state, "publishedUrl", "publishedAt")
       values ($1, $2, $3, $4, now() - interval '1 day', 'PUBLISHED', $5, now() - interval '1 day')`,
      [DELIVERABLE, TENANT, ORDER, TITLE, POST_URL]);
    await c.query(
      `insert into "CreativeAsset"(id, "tenantId", "deliverableId", version, "r2Key", "uploadedBy", "uploadedAt")
       values ('e2e_p7_asset', $1, $2, 1, $3, 'e2e', now() - interval '3 day')`,
      [TENANT, DELIVERABLE, `t/${TENANT}/deliverable/${DELIVERABLE}/e2e`]);
    await c.query(
      `insert into "Earning"(id, "tenantId", "athleteId", "orderId", gross, state, "taxYear")
       values ('e2e_p7_earning', $1, $2, $3, 3000, 'PENDING', extract(year from now())::int)`,
      [TENANT, ATHLETE.id, ORDER]);
    /* Zoho Books' side: $50 of the $80 invoiced and paid — so the
       reconciliation has a real gap to report. */
    await c.query(
      `insert into "CampaignInvoice"(id, "tenantId", "campaignId", "zohoInvoiceId", number, status, amount, "issuedAt", "dueAt", "paidAt")
       values ('e2e_p7_invoice', $1, $2, 'e2e-p7-zoho-invoice', 'INV-E2E-P7', 'paid', 5000,
               now() - interval '5 day', now() + interval '25 day', now() - interval '1 day')`,
      [TENANT, CAMPAIGN]);
  });
});
test.afterAll(async ({}, testInfo) => {
  if (desktopOnly(testInfo)) await clean();
});

const earning = async () =>
  (await q<{ id: string; state: string; approvedAutomatically: boolean }>(
    `select id, state, "approvedAutomatically" from "Earning" where "orderId" = $1`, [ORDER]))[0];
const earningState = async () => (await earning())?.state;

/** A table row on the finance page, by the text it must contain. */
const rowWith = (page: import("@playwright/test").Page, ...texts: string[]) => {
  let row = page.getByRole("row");
  for (const t of texts) row = row.filter({ hasText: t });
  return row;
};

test("a verified post releases the earning, shows in finance, and lands in the sponsor's report", async ({ browser, request }, testInfo) => {
  test.setTimeout(240_000);

  // 1. VERIFY — BTG checks the live link on the content desk.
  const desk = await pageAs(browser, testInfo, ADMIN);
  await desk.goto(`/admin/approvals?tab=all&q=${encodeURIComponent(ATHLETE.name)}`);
  await desk.getByRole("button", { name: new RegExp(TITLE) }).first().click();
  const drawer = desk.getByRole("dialog", { name: `${TITLE} — content review` });
  await expect(drawer.getByText(POST_URL).first()).toBeVisible();
  await drawer.getByRole("button", { name: "Verify publication" }).click();
  await expect(drawer.getByText("Verified — it now counts toward the athlete's earning.")).toBeVisible();
  const [d] = await q<{ state: string }>(`select state from "Deliverable" where id = $1`, [DELIVERABLE]);
  expect(d.state).toBe("VERIFIED");
  // The order's last deliverable verified → its earning is released, and —
  // $30, nothing held — approved for payout by the system, same transaction.
  await expect.poll(earningState).toBe("APPROVED_FOR_PAYOUT");
  const released = await earning();
  expect(released.approvedAutomatically, "approved by the rule, not by a person").toBe(true);
  const approvals = await q<{ actorId: string | null; before: { state?: string } | null }>(
    `select "actorId", before from "AuditLog" where "entityId" = $1 and after->>'state' = 'APPROVED_FOR_PAYOUT'`,
    [released.id]);
  expect(approvals).toEqual([expect.objectContaining({ actorId: null, before: { state: "ELIGIBLE" } })]);

  // 2. METRICS + TRACKING LINK — BTG, through the API (no screen yet).
  const today = new Date().toISOString().slice(0, 10);
  for (const m of [
    { views: 4200, engagements: 310, source: "VERIFIED_MANUAL" },
    { views: 900, engagements: 40, source: "SELF_REPORTED" },
  ]) {
    const put = await apiAs(desk, "POST", `/deliverables/${DELIVERABLE}/metrics`, { day: today, ...m });
    expect(put.status, JSON.stringify(put.body)).toBe(201);
  }
  const link = await apiAs<{ code: string }>(desk, "POST", `/deliverables/${DELIVERABLE}/tracking-link`, { destinationUrl: POST_URL });
  expect(link.status, JSON.stringify(link.body)).toBe(201);

  // 3. A FAN CLICKS — the public redirect, no login; the click is written after.
  const click = await request.get(`/t/${link.body.code}`, { maxRedirects: 0 });
  expect(click.status()).toBe(302);
  expect(click.headers()["location"]).toBe(POST_URL);
  await expect.poll(async () =>
    (await q<{ n: number }>(
      `select count(*)::int n from "LinkEvent" e join "TrackingLink" l on l.id = e."linkId" where l."deliverableId" = $1`,
      [DELIVERABLE]))[0].n,
  ).toBe(1);

  // 4. THE ATHLETE — approved for payout, their pay only, never the sponsor's price.
  const athlete = await pageAs(browser, testInfo, { key: "p7.athlete", roles: ["ATHLETE"], athleteId: ATHLETE.id });
  await athlete.goto("/athlete/earnings");
  await expect(athlete.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();
  await expect(athlete.getByText(/1 of 1/).first()).toBeVisible();
  const activity = athlete.getByRole("button", { name: new RegExp(CAMPAIGN_NAME) });
  await expect(activity).toContainText("Approved for payout");
  await expect(activity).toContainText("$30");
  await expect(athlete.getByText("$80"), "no sponsor price on the athlete's side").toHaveCount(0);
  await expect(athlete.getByText("$50"), "no commission either").toHaveCount(0);

  // 5. FINANCE — BTG admin: the earning with commission, and the reconciliation.
  await desk.goto("/admin/finance");
  await expect(desk.getByRole("heading", { level: 1, name: "Finance" })).toBeVisible();
  await expect(desk.getByText(/Payout actions are blocked on the written Phase 1 payment policy/)).toBeVisible();
  await expect(desk.getByText(/under \$2,000 move to .approved for payout. on their own/)).toBeVisible();
  const earningRow = rowWith(desk, ATHLETE.name, CAMPAIGN_NAME);
  await expect(earningRow).toContainText("Approved for payout");
  await expect(earningRow).toContainText("$30");
  await expect(earningRow, "sponsor price").toContainText("$80");
  await expect(earningRow, "commission = $80 − $30").toContainText("$50");
  const reconciliation = rowWith(desk, CAMPAIGN_NAME, "not invoiced");
  await expect(reconciliation, "contracted $80, Zoho invoiced $50").toContainText("$30 not invoiced");
  await expect(rowWith(desk, "INV-E2E-P7")).toContainText("paid");

  //    FINANCE role: sees the earning, not what the sponsor was billed.
  const finance = await pageAs(browser, testInfo, { key: "p7.finance", roles: ["FINANCE"] });
  await finance.goto("/admin/finance");
  await expect(finance.getByText(/Invoices are visible to BTG admin only/).first()).toBeVisible();
  await expect(rowWith(finance, ATHLETE.name, CAMPAIGN_NAME)).toContainText("Approved for payout");
  await expect(finance.getByText("INV-E2E-P7")).toHaveCount(0);

  // 6. THE SPONSOR'S REPORT — from their dashboard.
  const sponsor = await pageAs(browser, testInfo, { key: "p7.sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: SPONSOR });
  await sponsor.goto("/sponsor");
  await sponsor.getByRole("link", { name: `${CAMPAIGN_NAME} →` }).click();
  await expect(sponsor).toHaveURL(new RegExp(`/sponsor/campaigns/${CAMPAIGN}/report`));
  await expect(sponsor.getByRole("heading", { level: 1, name: "Campaign ROI Report" })).toBeVisible();
  // Reach, layer by layer — 4,200 verified and 900 self-reported, never 5,100.
  await expect(sponsor.getByText("4,200").first()).toBeVisible();
  await expect(sponsor.getByText("900").first()).toBeVisible();
  await expect(sponsor.getByText("Self-reported views")).toBeVisible();
  await expect(sponsor.getByText("5,100")).toHaveCount(0);
  // Media value is ESTIMATED, on verified views only: $80 of spend / 4,200 × 1,000.
  await expect(sponsor.getByText("Cost per 1,000 verified views")).toBeVisible();
  await expect(sponsor.getByText("$19.05")).toBeVisible();
  await expect(sponsor.getByText(/1\s*of 1 verified/).first()).toBeVisible();
  const clicks = sponsor.locator("div").filter({ hasText: /^Link clicks/ }).filter({ hasText: "counted on our own tracking links" }).last();
  await expect(clicks).toContainText("1");
  await expect(sponsor.getByText(/NaN/), "an empty fan funnel reads as words, not NaN").toHaveCount(0);
  await expect(sponsor.getByRole("link", { name: "view post" })).toHaveAttribute("href", POST_URL);
  await expect(sponsor.getByText(ATHLETE.name).first()).toBeVisible();
  await expect(sponsor.getByText("$30"), "the athlete's pay stays off the sponsor's report").toHaveCount(0);

  for (const p of [desk, athlete, finance, sponsor]) await p.context().close();
});

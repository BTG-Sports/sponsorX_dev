import { expect, test, type Page } from "@playwright/test";

import { apiAs, desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs, releaseUser } from "./support/auth";
import { ensureBase, purge, q, seedAthlete, seedSponsor, TENANT } from "./support/loop-db";
import { runWorker } from "./support/worker";

/**
 * P4-QA-01 — E2E: brief → matching → offer → response.
 *
 * "The full segment runs green, including decline and expiry paths."
 *
 * Real stack, real roles — and, since the programme owner's Phase 2 decision
 * (2026-10-03, CLAUDE.md), no person in the middle when every check passes:
 *
 *   - P4-BE-11: a SPONSOR_ADMIN files a ready brief from the live
 *     Marketplace, and it is approved as the system on the spot — DRAFT →
 *     QUALIFIED → APPROVED → CAMPAIGN_CREATED.
 *   - P4-BE-12: the campaign staffs itself. Offers go to the ranked
 *     shortlist, one per package line, up to the package's maximum, each
 *     with a three-day window.
 *
 * Then each athlete answers in their own portal — one accepts (a Campaign
 * Order is created), one declines (the system looks for a replacement in
 * the same transaction, finds nobody left, and hands the campaign to BTG
 * with the reason), and one lets the window lapse (the offer can no longer
 * be answered, and the worker's staffing sweep — run here with the worker's
 * own code — offers nobody twice). BTG's campaign page reads it all back.
 *
 * DRIVEN BELOW THE UI, and why:
 *   - Expiry — the three-day window is time passing, not an event. The spec
 *     backdates the one offer's `expiresAt` and runs the worker's own
 *     `sweepAutoStaffing` against the same database, as its ten-minute timer
 *     does.
 *
 * Seeds: one sponsor and three ACTIVE adult athletes with an SX-01 rate (the
 * Test Drive package's one line; it needs exactly three athletes), all
 * `e2e_p4_*`, purged before and after.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);

const SPONSOR = "e2e_p4_sponsor";
const SPONSOR_NAME = "E2E Pfour Outfitters";
const ATHLETES = {
  accept: { id: "e2e_p4_ath_accept", name: "Amara Pfour-Accept" },
  decline: { id: "e2e_p4_ath_decline", name: "Bola Pfour-Decline" },
  lapse: { id: "e2e_p4_ath_lapse", name: "Chioma Pfour-Lapse" },
};
const ATHLETE_IDS = Object.values(ATHLETES).map((a) => a.id);
const ADMIN = { key: "p4.admin", roles: ["BTG_ADMIN" as const] };

async function clean() {
  for (const k of Object.keys(ATHLETES)) await releaseUser(`p4.${k}`);
  await releaseUser("p4.sponsor");
  await purge({ sponsorIds: [SPONSOR], athleteIds: ATHLETE_IDS });
}

test.beforeAll(async ({}, testInfo) => {
  test.skip(!desktopOnly(testInfo), "portal loop — desktop project only (shared seed rows)");
  await ensureBase();
  await clean();
  await seedSponsor(SPONSOR, SPONSOR_NAME);
  for (const a of Object.values(ATHLETES)) {
    /* $30 for a Story Drop — well inside the 1.4× margin against the
       catalogue's sell floor, so the offers pass the margin check. */
    await seedAthlete({ ...a, rates: { "SX-01": 3000 } });
  }
});
test.afterAll(async ({}, testInfo) => {
  if (desktopOnly(testInfo)) await clean();
});

type OfferRow = { id: string; athleteId: string; state: string; jobId: string; compensation: number; expiresAt: Date; sentAt: Date | null; orderId: string | null };
async function offers(): Promise<OfferRow[]> {
  return q<OfferRow>(
    `select o.id, o."athleteId", o.state, o."jobId", o.compensation, o."expiresAt", o."sentAt", o."orderId"
       from "Offer" o join "Campaign" c on c.id = o."campaignId" where c."sponsorId" = $1`,
    [SPONSOR],
  );
}
const offerOf = async (athleteId: string) => (await offers()).find((o) => o.athleteId === athleteId);

/** The athlete's own offer page — the full terms, and their answer. */
async function openOffer(page: Page, offerId: string) {
  await page.goto("/athlete/offers");
  await expect(page.getByRole("heading", { level: 1, name: "Offers" })).toBeVisible();
  await page.locator(`a[href="/athlete/offers/${offerId}"]`).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(SPONSOR_NAME) })).toBeVisible();
}

test("a sponsor brief is approved, staffs itself, and is answered — accept, decline and expiry", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const run = Date.now().toString(36);
  /* Ready by P4-BE-07's checklist: eight words or more, and the drawer's
     default dates (two weeks out, four weeks long). */
  const objective = `E2E P4 spring launch ${run}: three soccer players post one story each`;

  // 1. BRIEF — the sponsor requests one from the live Marketplace, and every
  //    check passes, so it is approved there and then.
  const sponsor = await pageAs(browser, testInfo, { key: "p4.sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: SPONSOR });
  await sponsor.goto("/sponsor/marketplace");
  await expect(sponsor.getByRole("heading", { name: "Packages" })).toBeVisible();
  await sponsor
    .locator(`xpath=//*[normalize-space()='SponsorX Test Drive']/ancestor::*[.//button[normalize-space()='Request a brief']][1]`)
    .getByRole("button", { name: "Request a brief" })
    .click();
  const drawer = sponsor.getByRole("dialog", { name: "Request a brief" });
  await drawer.getByLabel("Objective").fill(objective);
  await expect(drawer.getByLabel("Budget")).toHaveValue(/\$750/);
  await drawer.getByRole("button", { name: "Target sport" }).click();
  await sponsor.getByRole("option", { name: "Soccer", exact: true }).click();
  await drawer.getByRole("button", { name: "Target geography" }).click();
  await sponsor.getByRole("option", { name: "Silver Spring, MD" }).click();
  await drawer.getByRole("button", { name: "Submit brief to BTG" }).click();
  await expect(drawer.getByText("Approved — your campaign is being staffed")).toBeVisible({ timeout: 20_000 });

  const [brief] = await q<{
    id: string; state: string; sports: string[]; stateCodes: string[]; packageId: string | null; budget: number;
    autoApproved: boolean; heldReasons: string[];
  }>(
    `select id, state, sports, "stateCodes", "packageId", budget, "autoApproved", "heldReasons"
       from "CampaignBrief" where "sponsorId" = $1 and objective like $2`,
    [SPONSOR, `${objective}%`],
  );
  expect(brief, `held for: ${JSON.stringify(brief?.heldReasons)}`).toMatchObject({
    state: "CAMPAIGN_CREATED", autoApproved: true, sports: ["Soccer"], stateCodes: ["MD"], budget: 75000,
  });
  expect(brief.packageId).not.toBeNull();
  const [briefApproval] = await q<{ n: number }>(
    `select count(*)::int n from "AuditLog" where "entityId" = $1 and "actorId" is null and after->>'state' = 'APPROVED'`,
    [brief.id],
  );
  expect(briefApproval.n, "approved as the system, audited").toBe(1);

  // 2. STAFFING — the campaign exists, staffs itself, and offers are out to
  //    the three, ranked, one per package line, three days to answer.
  const [campaign] = await q<{ id: string; name: string; state: string; autoStaffing: boolean }>(
    `select id, name, state, "autoStaffing" from "Campaign" where "briefId" = $1`,
    [brief.id],
  );
  expect(campaign).toMatchObject({ state: "STAFFING", autoStaffing: true });
  await expect.poll(async () => (await offers()).length).toBe(3);
  const sent = await offers();
  expect(sent.map((o) => o.athleteId).sort()).toEqual([...ATHLETE_IDS].sort());
  for (const o of sent) {
    expect(o).toMatchObject({ state: "SENT", jobId: "SX-01", orderId: null });
    const days = (o.expiresAt.getTime() - (o.sentAt as Date).getTime()) / 864e5;
    expect(days, "the automatic offer window").toBeCloseTo(3, 1);
  }
  const accepted = sent.find((o) => o.athleteId === ATHLETES.accept.id)!;
  const declined = sent.find((o) => o.athleteId === ATHLETES.decline.id)!;
  const lapsed = sent.find((o) => o.athleteId === ATHLETES.lapse.id)!;

  // 3a. ACCEPT — the athlete reads the terms and the agreement, and signs.
  const accepter = await pageAs(browser, testInfo, { key: "p4.accept", roles: ["ATHLETE"], athleteId: ATHLETES.accept.id });
  await openOffer(accepter, accepted.id);
  const accept = accepter.getByRole("button", { name: "Accept offer" });
  await expect(accept, "not before the agreement is read").toBeDisabled();
  await accepter.getByText(/I have read the agreement \(version \d+\)/).click();
  await accept.click();
  await expect(accepter.getByText("Accepted. The deliverables are now scheduled on your Campaign Order.")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await offerOf(ATHLETES.accept.id))?.state).toBe("ACCEPTED");
  const [order] = await q<{ state: string; compensation: number; jobId: string }>(
    `select o.state, o.compensation, o."jobId" from "CampaignOrder" o join "Offer" f on f."orderId" = o.id where f.id = $1`,
    [accepted.id],
  );
  expect(order, "the accepted offer became a signed Campaign Order").toEqual({ state: "ACCEPTED", compensation: accepted.compensation, jobId: "SX-01" });

  // 3b. DECLINE — after reading it. The system looks for the next athlete
  //     in the same transaction; with nobody left, the package's minimum of
  //     three can no longer be reached, so staffing stops and BTG takes over.
  const decliner = await pageAs(browser, testInfo, { key: "p4.decline", roles: ["ATHLETE"], athleteId: ATHLETES.decline.id });
  await openOffer(decliner, declined.id);
  await decliner.getByRole("button", { name: "Decline", exact: true }).click();
  await decliner.getByRole("button", { name: "Yes, decline" }).click();
  await expect(decliner.getByText("Declined. BTG has been told; no reason needed.")).toBeVisible();
  await expect.poll(async () => (await offerOf(ATHLETES.decline.id))?.state).toBe("DECLINED");
  await openOffer(decliner, declined.id);
  await expect(decliner.getByRole("button", { name: "Accept offer" }), "a declined offer can't be reopened").toHaveCount(0);
  const stopped = async () =>
    (await q<{ staffingStopReason: string | null }>(`select "staffingStopReason" from "Campaign" where id = $1`, [campaign.id]))[0]
      .staffingStopReason;
  await expect.poll(stopped).toMatch(/No eligible athlete is left to offer: 1 signed and 1 waiting, below the package's minimum of 3/);
  expect(await offers(), "nobody is offered twice").toHaveLength(3);

  // 3c. EXPIRY — three days pass unanswered. The offer can't be taken any
  //     more, and the worker's staffing sweep offers nobody in its place:
  //     the campaign is BTG's now.
  await q(
    `update "Offer" set "expiresAt" = now() - interval '1 minute', "sentAt" = now() - interval '3 days' where id = $1`,
    [lapsed.id],
  );
  const lapser = await pageAs(browser, testInfo, { key: "p4.lapse", roles: ["ATHLETE"], athleteId: ATHLETES.lapse.id });
  await openOffer(lapser, lapsed.id);
  await expect(lapser.getByText("This offer has expired. BTG can send a new one.")).toBeVisible();
  await expect(lapser.getByRole("button", { name: "Accept offer" }), "a lapsed offer can't be answered").toHaveCount(0);
  const late = await apiAs<{ error?: { message?: string } }>(lapser, "POST", `/offers/${lapsed.id}/respond`, { decision: "DECLINE" });
  expect(late.status).toBe(409);
  expect(late.body.error?.message).toMatch(/expired/i);
  const swept = await runWorker<{ sent: number }>("sweepAutoStaffing", { tenantIds: [TENANT] });
  expect(swept.sent, "a stopped campaign is left to BTG").toBe(0);
  expect(await offers()).toHaveLength(3);
  expect((await offerOf(ATHLETES.lapse.id))?.state, "a lapse is time, not a decision").toBe("SENT");

  // 4. BTG's campaign page reads it back: why staffing stopped, and the
  //    switch to take it on.
  const desk = await pageAs(browser, testInfo, ADMIN);
  await desk.goto(`/admin/campaigns/${campaign.id}`);
  await expect(desk.getByText("Automatic staffing stopped — over to BTG")).toBeVisible();
  await expect(desk.getByText(/No eligible athlete is left to offer/)).toBeVisible();
  await expect(desk.getByText("Package needs 3 athletes")).toBeVisible();

  for (const p of [sponsor, desk, accepter, decliner, lapser]) await p.context().close();
});

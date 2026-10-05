import { expect, test, type Page } from "@playwright/test";

import { desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs, releaseUser } from "./support/auth";
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
 *     shortlist, one per package line, up to the package's maximum (the
 *     Test Drive takes exactly three athletes), each with a three-day window.
 *
 * Four athletes fit, so one is held in reserve by the ranking. Then:
 *   ACCEPT   one athlete accepts in their portal — a Campaign Order is made;
 *   DECLINE  one declines — and the system offers the reserve athlete the
 *            place in the same transaction, which they find in their portal;
 *   EXPIRY   one lets the window lapse — the worker's staffing sweep (its own
 *            code, its clock moved past the three days, as the backend tests
 *            move it) finds nobody left to ask while the minimum can no
 *            longer be reached, and hands the campaign to BTG with the
 *            reason, offering nobody twice.
 * BTG's campaign page reads it back.
 *
 * Seeds: one sponsor and four ACTIVE adult athletes with an SX-01 rate, all
 * `e2e_p4_*`, purged before and after. Which three the ranking picks is the
 * ranking's business, so the roles are dealt from the offers as sent.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);

const SPONSOR = "e2e_p4_sponsor";
const SPONSOR_NAME = "E2E Pfour Outfitters";
const ATHLETES = [
  { id: "e2e_p4_ath_a", name: "Amara Pfour-A" },
  { id: "e2e_p4_ath_b", name: "Bola Pfour-B" },
  { id: "e2e_p4_ath_c", name: "Chioma Pfour-C" },
  { id: "e2e_p4_ath_d", name: "Dayo Pfour-D" },
];
const ATHLETE_IDS = ATHLETES.map((a) => a.id);
const ROLES = ["accept", "decline", "lapse", "reserve"] as const;
const ADMIN = { key: "p4.admin", roles: ["BTG_ADMIN" as const] };

async function clean() {
  for (const r of ROLES) await releaseUser(`p4.${r}`);
  await releaseUser("p4.sponsor");
  await purge({ sponsorIds: [SPONSOR], athleteIds: ATHLETE_IDS });
}

test.beforeAll(async ({}, testInfo) => {
  test.skip(!desktopOnly(testInfo), "portal loop — desktop project only (shared seed rows)");
  await ensureBase();
  await clean();
  await seedSponsor(SPONSOR, SPONSOR_NAME);
  for (const a of ATHLETES) {
    /* $30 for a Story Drop — well inside the 1.4× margin against the
       catalogue's sell floor, so the offers pass the margin check. */
    await seedAthlete({ ...a, rates: { "SX-01": 3000 } });
  }
});
test.afterAll(async ({}, testInfo) => {
  if (desktopOnly(testInfo)) await clean();
});

type OfferRow = { id: string; athleteId: string; state: string; jobId: string; compensation: number; expiresAt: Date; sentAt: Date | null };
async function offers(): Promise<OfferRow[]> {
  return q<OfferRow>(
    `select o.id, o."athleteId", o.state, o."jobId", o.compensation, o."expiresAt", o."sentAt"
       from "Offer" o join "Campaign" c on c.id = o."campaignId" where c."sponsorId" = $1 order by o."createdAt", o.id`,
    [SPONSOR],
  );
}

/** The athlete's own offers, and the one offer's page — the full terms, and their answer. */
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

  // 2. STAFFING — the campaign exists and staffs itself: offers to three of
  //    the four, ranked, one per package line, three days to answer.
  const [campaign] = await q<{ id: string; state: string; autoStaffing: boolean }>(
    `select id, state, "autoStaffing" from "Campaign" where "briefId" = $1`,
    [brief.id],
  );
  expect(campaign).toMatchObject({ state: "STAFFING", autoStaffing: true });
  await expect.poll(async () => (await offers()).length).toBe(3);
  const sent = await offers();
  for (const o of sent) {
    expect(ATHLETE_IDS).toContain(o.athleteId);
    expect(o).toMatchObject({ state: "SENT", jobId: "SX-01" });
    const days = (o.expiresAt.getTime() - (o.sentAt as Date).getTime()) / 864e5;
    expect(days, "the automatic offer window").toBeCloseTo(3, 1);
  }
  expect(new Set(sent.map((o) => o.athleteId)).size, "one offer per athlete — the package has one line").toBe(3);
  const [accepted, declined, lapsed] = sent;
  const reserveId = ATHLETE_IDS.find((id) => !sent.some((o) => o.athleteId === id))!;
  const as = (role: (typeof ROLES)[number], athleteId: string) =>
    pageAs(browser, testInfo, { key: `p4.${role}`, roles: ["ATHLETE"], athleteId });

  // 3a. ACCEPT — the athlete reads the terms and the agreement, and signs.
  const accepter = await as("accept", accepted.athleteId);
  await openOffer(accepter, accepted.id);
  const accept = accepter.getByRole("button", { name: "Accept offer" });
  await expect(accept, "not before the agreement is read").toBeDisabled();
  await accepter.getByText(/I have read the agreement \(version \d+\)/).click();
  await accept.click();
  /* The answer panel confirms, then the page refreshes into the offer's
     status — either is the accepted outcome; asserting only the first races
     the refresh. */
  await expect(
    accepter.getByText(/Accepted\. The deliverables are now scheduled on your Campaign Order\.|You accepted these terms\./).first(),
  ).toBeVisible({ timeout: 20_000 });
  const stateOf = async (offerId: string) => (await offers()).find((o) => o.id === offerId)?.state;
  await expect.poll(() => stateOf(accepted.id)).toBe("ACCEPTED");
  const [order] = await q<{ state: string; compensation: number; jobId: string }>(
    `select o.state, o.compensation, o."jobId" from "CampaignOrder" o join "Offer" f on f."orderId" = o.id where f.id = $1`,
    [accepted.id],
  );
  expect(order, "the accepted offer became a signed Campaign Order").toEqual({ state: "ACCEPTED", compensation: accepted.compensation, jobId: "SX-01" });

  // 3b. DECLINE — after reading it. The system offers the place to the next
  //     athlete in the same transaction: the one the ranking held back.
  const decliner = await as("decline", declined.athleteId);
  await openOffer(decliner, declined.id);
  await decliner.getByRole("button", { name: "Decline", exact: true }).click();
  await decliner.getByRole("button", { name: "Yes, decline" }).click();
  /* As for accept: the brief confirmation or the refreshed status. */
  await expect(
    decliner.getByText(/Declined\. BTG has been told; no reason needed\.|You declined this offer\. No Campaign Order was created\./).first(),
  ).toBeVisible();
  await expect.poll(() => stateOf(declined.id)).toBe("DECLINED");
  await openOffer(decliner, declined.id);
  await expect(decliner.getByRole("button", { name: "Accept offer" }), "a declined offer can't be reopened").toHaveCount(0);
  const afterDecline = await offers();
  expect(afterDecline, "one replacement, no more").toHaveLength(4);
  const replacement = afterDecline[3];
  expect(replacement).toMatchObject({ athleteId: reserveId, state: "SENT", jobId: "SX-01" });
  const [replacedBy] = await q<{ createdBy: string | null }>(`select "createdBy" from "Offer" where id = $1`, [replacement.id]);
  expect(replacedBy.createdBy, "offered by the system, not a person").toBeNull();
  const reserve = await as("reserve", reserveId);
  await openOffer(reserve, replacement.id);
  await expect(reserve.getByRole("button", { name: "Accept offer" })).toBeVisible();

  // 3c. EXPIRY — three days pass and one offer is never answered. Time
  //     passing is the worker's to notice: its staffing sweep, clock moved
  //     past that window, finds nobody left to ask (all four approached)
  //     while one signed and one waiting can no longer reach the minimum of
  //     three — so it stops and hands the campaign to BTG. Nobody is offered
  //     twice, and a lapse is time, not the athlete's decision.
  const past = new Date(lapsed.expiresAt.getTime() + 1);
  expect(replacement.expiresAt.getTime(), "the replacement's own window still runs").toBeGreaterThan(past.getTime());
  const swept = await runWorker<{ sent: number; stopped: number }>("sweepAutoStaffing", { tenantIds: [TENANT], at: past.toISOString() });
  expect(swept).toMatchObject({ sent: 0, stopped: 1 });
  const [stoppedCampaign] = await q<{ staffingStopReason: string | null }>(
    `select "staffingStopReason" from "Campaign" where id = $1`, [campaign.id]);
  expect(stoppedCampaign.staffingStopReason).toBe("No eligible athlete is left to offer: 1 signed and 1 waiting, below the package's minimum of 3.");
  expect(await offers(), "nobody is offered twice").toHaveLength(4);
  expect(await stateOf(lapsed.id)).toBe("SENT");
  const again = await runWorker<{ sent: number; checked: number }>("sweepAutoStaffing", { tenantIds: [TENANT], at: past.toISOString() });
  expect(again.sent, "a stopped campaign is left to BTG").toBe(0);

  // 4. BTG's campaign page reads it back: why staffing stopped, for the
  //    package's three.
  const desk = await pageAs(browser, testInfo, ADMIN);
  await desk.goto(`/admin/campaigns/${campaign.id}`);
  await expect(desk.getByText("Automatic staffing stopped — over to BTG")).toBeVisible();
  await expect(desk.getByRole("status").getByText(/No eligible athlete is left to offer/)).toBeVisible();
  await expect(desk.getByText("Package needs 3 athletes")).toBeVisible();

  for (const p of [sponsor, desk, accepter, decliner, reserve]) await p.context().close();
});

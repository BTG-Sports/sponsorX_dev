import { expect, test, type Page } from "@playwright/test";

import { apiAs, desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs, releaseUser } from "./support/auth";
import { ensureBase, pool, purge, q, seedAthlete, seedSponsor } from "./support/loop-db";
import { expireInvitations } from "../backend/worker/jobs/expire-invitations.mts";

/**
 * P4-QA-01 — E2E: brief → matching → invitation → response.
 *
 * "The full segment runs green, including decline and expiry paths."
 *
 * Real stack, real roles. A SPONSOR_ADMIN files a brief from the live
 * Marketplace; BTG qualifies and approves it; a BTG_ADMIN shortlists three
 * athletes in the Matching Studio and sends; then each athlete answers in
 * their own inbox — one accepts, one declines, and one lets it lapse. The
 * Studio's roster reads all three outcomes back.
 *
 * DRIVEN BELOW THE UI, and why:
 *   - Qualify / approve the brief — `POST /briefs/:id/transition` with the
 *     BTG admin's own session. No screen calls it yet (the Studio's empty
 *     state only mentions qualifying).
 *   - Expiry — the sweep is the worker's hourly timer, not an endpoint, and
 *     the harness runs no worker. The spec backdates the one invite's
 *     `expiresAt` (standing in for seven days passing) and then runs the
 *     worker's own `expireInvitations()` against the same database, so the
 *     code that expires invitations in production is the code under test.
 *     It sweeps every overdue open invite, as the hourly timer does.
 *
 * Seeds: one sponsor and three ACTIVE adult athletes with an SX-01 rate
 * (the Test Drive package's one line), all `e2e_p4_*`, purged before and
 * after. The roster also lists whatever else in the tenant matches the
 * brief; the spec only ever acts on its own three.
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
       catalogue's sell floor, so the Studio needs no margin acknowledgement. */
    await seedAthlete({ ...a, rates: { "SX-01": 3000 } });
  }
});
test.afterAll(async ({}, testInfo) => {
  if (desktopOnly(testInfo)) await clean();
});

async function invites() {
  return q<{ athleteId: string; state: string; offered: number; jobId: string }>(
    `select i."athleteId", i.state, i.offered, i."jobId" from "CampaignInvite" i
       join "Campaign" c on c.id = i."campaignId" where c."sponsorId" = $1`,
    [SPONSOR],
  );
}
const stateOf = async (athleteId: string) => (await invites()).find((i) => i.athleteId === athleteId)?.state;

async function inbox(page: Page) {
  await page.goto("/athlete/invitations");
  await expect(page.getByRole("heading", { level: 1, name: "Campaign invitations" })).toBeVisible();
}

test("a sponsor brief is matched, invited, and answered — accept, decline and expiry", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const objective = `E2E P4 spring launch ${Date.now().toString(36)}`;

  // 1. BRIEF — the sponsor requests one from the live Marketplace.
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
  await expect(drawer.getByText("Brief received")).toBeVisible({ timeout: 20_000 });

  const [brief] = await q<{ id: string; state: string; sports: string[]; stateCodes: string[]; packageId: string | null; budget: number }>(
    `select id, state, sports, "stateCodes", "packageId", budget from "CampaignBrief" where "sponsorId" = $1 and objective = $2`,
    [SPONSOR, objective],
  );
  expect(brief).toMatchObject({ state: "DRAFT", sports: ["Soccer"], stateCodes: ["MD"], budget: 75000 });
  expect(brief.packageId).not.toBeNull();

  // 2. QUALIFY + APPROVE — BTG, through the API (no screen yet).
  const desk = await pageAs(browser, testInfo, ADMIN);
  for (const to of ["QUALIFIED", "APPROVED"]) {
    const moved = await apiAs<{ state: string }>(desk, "POST", `/briefs/${brief.id}/transition`, { to });
    expect(moved.status, `${to}: ${JSON.stringify(moved.body)}`).toBe(200);
  }

  // 3. MATCH + INVITE — the Matching Studio on the real brief.
  await desk.goto(`/admin/campaigns/match?brief=${brief.id}`);
  for (const a of Object.values(ATHLETES)) {
    await desk.getByRole("checkbox", { name: `Add ${a.name} to the shortlist` }).check();
    await expect(desk.getByRole("checkbox", { name: `Remove ${a.name} from the shortlist` })).toBeChecked();
  }
  await desk.getByRole("button", { name: "Review 3 and send invitations" }).click();
  await expect(desk.getByRole("heading", { name: "Review & send invitations" })).toBeVisible();
  await desk.getByRole("button", { name: "Send 3 invitations" }).click();
  await expect(desk.getByText("3 of 3 athletes invited")).toBeVisible({ timeout: 30_000 });

  const sent = await invites();
  expect(sent).toHaveLength(3);
  for (const i of sent) expect(i).toMatchObject({ state: "INVITED", jobId: "SX-01", offered: 3000 });
  const [{ state: briefState }] = await q<{ state: string }>(`select state from "CampaignBrief" where id = $1`, [brief.id]);
  expect(briefState, "the first send turns the approved brief into its campaign").toBe("CAMPAIGN_CREATED");

  // 4a. ACCEPT — open (INVITED → VIEWED), then the armed two-step accept.
  const accepter = await pageAs(browser, testInfo, { key: "p4.accept", roles: ["ATHLETE"], athleteId: ATHLETES.accept.id });
  await inbox(accepter);
  await expect(accepter.getByText("New invitation").first()).toBeVisible();
  await expect(accepter.getByText(SPONSOR_NAME).first()).toBeVisible();
  await expect(accepter.getByRole("button", { name: "Accept", exact: true }), "§21: never INVITED → ACCEPTED").toHaveCount(0);
  await accepter.getByRole("button", { name: "Open offer" }).click();
  await expect.poll(() => stateOf(ATHLETES.accept.id)).toBe("VIEWED");
  await accepter.getByRole("button", { name: "Accept", exact: true }).click();
  await accepter.getByRole("button", { name: "Confirm — accept" }).click();
  await expect(accepter.getByText("BTG is drafting your Campaign Order.")).toBeVisible();
  await expect.poll(() => stateOf(ATHLETES.accept.id)).toBe("ACCEPTED");

  // 4b. DECLINE — after reading it.
  const decliner = await pageAs(browser, testInfo, { key: "p4.decline", roles: ["ATHLETE"], athleteId: ATHLETES.decline.id });
  await inbox(decliner);
  await decliner.getByRole("button", { name: "Open offer" }).click();
  await expect.poll(() => stateOf(ATHLETES.decline.id)).toBe("VIEWED");
  await decliner.getByRole("button", { name: "Decline", exact: true }).click();
  await expect.poll(() => stateOf(ATHLETES.decline.id)).toBe("DECLINED");
  await inbox(decliner);
  await expect(decliner.getByText("Declined", { exact: true }).first()).toBeVisible();
  await expect(decliner.getByRole("button", { name: "Open offer" })).toHaveCount(0);

  // 4c. EXPIRY — seven days pass unanswered; the worker's sweep expires it.
  await q(
    `update "CampaignInvite" set "expiresAt" = now() - interval '1 minute', "sentAt" = now() - interval '7 days'
      where "athleteId" = $1 and state = 'INVITED'`,
    [ATHLETES.lapse.id],
  );
  const db = pool();
  try {
    const swept = await expireInvitations(db, process.env.APP_URL ?? "http://localhost:3000");
    expect(swept.expired).toBeGreaterThanOrEqual(1);
  } finally {
    await db.end();
  }
  expect(await stateOf(ATHLETES.lapse.id)).toBe("EXPIRED");
  const [audit] = await q<{ n: number }>(
    `select count(*)::int n from "AuditLog" a join "CampaignInvite" i on i.id = a."entityId"
      where i."athleteId" = $1 and a.action = 'invitation.expire'`,
    [ATHLETES.lapse.id],
  );
  expect(audit.n, "the sweep audits what it expires").toBe(1);
  const lapser = await pageAs(browser, testInfo, { key: "p4.lapse", roles: ["ATHLETE"], athleteId: ATHLETES.lapse.id });
  await inbox(lapser);
  await expect(lapser.getByText("Expired", { exact: true }).first()).toBeVisible();
  await expect(lapser.getByRole("button", { name: "Open offer" }), "a lapsed offer can't be answered").toHaveCount(0);

  // 5. The Studio reads every outcome back — and a lapsed or declined athlete
  //    can be invited again, an accepted one can't.
  await desk.goto(`/admin/campaigns/match?brief=${brief.id}`);
  const roster = (name: string) => desk.locator("li").filter({ hasText: name });
  await expect(roster(ATHLETES.accept.name).getByText("Accepted", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(roster(ATHLETES.decline.name).getByText("Declined", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(roster(ATHLETES.lapse.name).getByText("Expired", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(roster(ATHLETES.accept.name).getByRole("checkbox"), "an accepted athlete can't be re-invited").toHaveCount(0);
  await expect(desk.getByRole("checkbox", { name: `Add ${ATHLETES.lapse.name} to the shortlist` })).toBeEnabled();
  await expect(desk.getByRole("checkbox", { name: `Add ${ATHLETES.decline.name} to the shortlist` })).toBeEnabled();

  for (const p of [sponsor, desk, accepter, decliner, lapser]) await p.context().close();
});


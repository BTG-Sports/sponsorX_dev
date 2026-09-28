import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { hashAgreementBody } from "../backend/src/domain/agreement-hash";
import { desktopOnly, hasLoopStack, LOOP_SKIP_REASON, pageAs, releaseUser } from "./support/auth";
import { ensureBase, purge, q, seedAcceptedInvite, seedAthlete, seedCampaign, seedSponsor } from "./support/loop-db";
import { useObjectStore } from "./support/object-store";

/**
 * P5-QA-01 — E2E: acceptance → deliverable → approval → published.
 *
 * "The full segment runs green, including the revision loop."
 *
 * Starts where P4 ends — a campaign with an athlete who accepted the
 * invitation (seeded) — and walks every screen after it as the people who
 * use them:
 *   BTG_ADMIN   drafts and sends the Campaign Order from the ops board;
 *   ATHLETE     reads it and accepts it (hash of the exact text shown);
 *   ATHLETE     uploads a draft straight to storage and submits it;
 *   BTG_ADMIN   starts review and REQUESTS A REVISION with a reason;
 *   ATHLETE     sees the reason and uploads version 2;
 *   BTG_ADMIN   reviews again, sends to the sponsor, approves on their
 *               sign-off (there is no sponsor-side approval screen yet — the
 *               matrix lets BTG record it, and the desk offers exactly that);
 *   ATHLETE     marks it published with the live link.
 * Verification and what it releases (the earning) are P7-QA-01's.
 *
 * Nothing here is driven below the UI except the seed. The one outside
 * dependency is the object store: see support/object-store.ts — real MinIO
 * locally, the signed PUT answered by the test where there is none (CI).
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);

const SPONSOR = "e2e_p5_sponsor";
const SPONSOR_NAME = "E2E Pfive Provisions";
const CAMPAIGN = "e2e_p5_campaign";
const CAMPAIGN_NAME = "E2E Pfive — summer stories";
const ATHLETE = { id: "e2e_p5_athlete", name: "Dara Pfive" };
const ADMIN = { key: "p5.admin", roles: ["BTG_ADMIN" as const] };
const AGREEMENT = path.resolve(__dirname, "../backend/agreements/CAMPAIGN_ORDER.v1.txt");

async function clean() {
  await releaseUser("p5.athlete");
  await purge({ sponsorIds: [SPONSOR], athleteIds: [ATHLETE.id], campaignIds: [CAMPAIGN] });
}

test.beforeAll(async ({}, testInfo) => {
  test.skip(!desktopOnly(testInfo), "portal loop — desktop project only (shared seed rows)");
  await ensureBase();
  await clean();
  await seedSponsor(SPONSOR, SPONSOR_NAME);
  await seedAthlete({ ...ATHLETE, rates: { "SX-01": 3000 } });
  await seedCampaign({ id: CAMPAIGN, sponsorId: SPONSOR, name: CAMPAIGN_NAME });
  await seedAcceptedInvite({ id: "e2e_p5_invite", campaignId: CAMPAIGN, athleteId: ATHLETE.id, jobId: "SX-01", offeredCents: 3000 });
});
test.afterAll(async ({}, testInfo) => {
  if (desktopOnly(testInfo)) await clean();
});

type Deliverable = { id: string; title: string; state: string; publishedUrl: string | null; versions: number };
async function deliverable(): Promise<Deliverable | undefined> {
  const [row] = await q<Deliverable>(
    `select d.id, d.title, d.state, d."publishedUrl",
            (select count(*)::int from "CreativeAsset" a where a."deliverableId" = d.id) as versions
       from "Deliverable" d join "CampaignOrder" o on o.id = d."orderId" where o."campaignId" = $1`,
    [CAMPAIGN],
  );
  return row;
}
const deliverableState = async () => (await deliverable())?.state;

/** The content desk's drawer for this campaign's one deliverable — a fresh
 *  load each time, because the drawer keeps its own view of moves it made. */
async function reviewDrawer(desk: Page, title: string) {
  await desk.goto(`/admin/approvals?tab=all&q=${encodeURIComponent(ATHLETE.name)}`);
  await desk.getByRole("button", { name: new RegExp(title) }).first().click();
  const drawer = desk.getByRole("dialog", { name: `${title} — content review` });
  await expect(drawer).toBeVisible();
  return drawer;
}

function dueIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

test("an accepted invite becomes a signed order, a reviewed and revised deliverable, and a published post", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);

  // 1. DRAFT & SEND THE ORDER — BTG, on the campaign ops board.
  const desk = await pageAs(browser, testInfo, ADMIN);
  await desk.goto(`/admin/campaigns/${CAMPAIGN}`);
  const row = desk.getByRole("button", { name: new RegExp(ATHLETE.name) }).first();
  await expect(row).toContainText("Order not drafted");
  await row.click();
  const orderDrawer = desk.getByRole("dialog", { name: `${ATHLETE.name} — Campaign Order` });
  await orderDrawer.getByRole("button", { name: "Draft the Campaign Order" }).click();
  await expect(orderDrawer.getByLabel("Athlete pay ($)"), "pay is prefilled from the accepted offer").toHaveValue("30");
  await orderDrawer.getByLabel("Sponsor price ($)").fill("80");
  await orderDrawer.getByLabel("Usage rights").fill("Organic social, 90 days");
  await orderDrawer.getByLabel("Due date").fill(dueIn(14));
  await orderDrawer.getByRole("button", { name: "Draft & send order" }).click();
  await expect(orderDrawer.getByText(`Campaign Order sent — ${ATHLETE.name} can now read and sign it.`)).toBeVisible({ timeout: 20_000 });
  const [order] = await q<{ id: string; state: string; compensation: number; sellPrice: number }>(
    `select id, state, compensation, "sellPrice" from "CampaignOrder" where "campaignId" = $1`, [CAMPAIGN]);
  expect(order).toMatchObject({ state: "SENT", compensation: 3000, sellPrice: 8000 });

  // 2. ACCEPT THE ORDER — the athlete, from the inbox, against the exact text.
  const athlete = await pageAs(browser, testInfo, { key: "p5.athlete", roles: ["ATHLETE"], athleteId: ATHLETE.id });
  await athlete.goto("/athlete/invitations");
  await athlete.getByRole("link", { name: /Campaign Order ready to sign/ }).click();
  await expect(athlete).toHaveURL(new RegExp(`/athlete/orders/${order.id}`));
  await expect(athlete.getByText("Ready to sign").first()).toBeVisible();
  await expect(athlete.getByText("SPONSORX CAMPAIGN ORDER — STANDARD TERMS, VERSION 1")).toBeVisible();
  await expect(athlete.getByText("$80"), "the athlete never sees the sponsor price").toHaveCount(0);
  const accept = athlete.getByRole("button", { name: "Accept this order" });
  await expect(accept).toBeDisabled();
  await athlete.getByRole("checkbox", { name: /read the order details and the Campaign Order agreement/ }).check();
  await accept.click();
  await expect(athlete.getByText("Its deliverables are now on your calendar.")).toBeVisible({ timeout: 20_000 });

  const [signed] = await q<{ state: string; bodyHash: string; earning: string }>(
    `select o.state, a."bodyHash", e.state as earning from "CampaignOrder" o
       join "AgreementAcceptance" a on a.id = o."acceptanceId" join "Earning" e on e."orderId" = o.id where o.id = $1`,
    [order.id]);
  expect(signed).toMatchObject({
    state: "ACCEPTED",
    bodyHash: hashAgreementBody(readFileSync(AGREEMENT, "utf8")),
    earning: "PENDING",
  });
  const first = await deliverable();
  expect(first).toMatchObject({ title: "Story drop", state: "NOT_STARTED", versions: 0 });
  const title = first!.title;

  // 3. UPLOAD + SUBMIT v1 — from the athlete's deliverables calendar.
  const stubbed = await useObjectStore(athlete);
  if (stubbed) testInfo.annotations.push({ type: "object store", description: "unreachable — signed PUT answered by the test" });
  await athlete.goto("/athlete/deliverables");
  await athlete.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(athlete).toHaveURL(new RegExp(`/athlete/deliverables/${first!.id}`));
  await expect(athlete.getByRole("heading", { name: "Upload your draft" })).toBeVisible();
  await athlete.getByLabel(/Choose your draft/).setInputFiles({
    name: "story-v1.png", mimeType: "image/png", buffer: Buffer.from("e2e draft v1"),
  });
  await athlete.getByRole("button", { name: "Upload and submit" }).click();
  await expect(athlete.getByText("Submitted — waiting for BTG").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(deliverable).toMatchObject({ state: "DRAFT_SUBMITTED", versions: 1 });

  // 4. REVIEW → REVISION — BTG sends it back with words the athlete will read.
  const reason = `Show the logo in the first two seconds (${Date.now().toString(36)})`;
  let review = await reviewDrawer(desk, title);
  await review.getByRole("button", { name: "Start BTG review" }).click();
  await expect(review.getByText("Review started — it's on the BTG desk now.")).toBeVisible();
  await expect.poll(deliverableState).toBe("BTG_REVIEW");
  await review.getByRole("button", { name: "Request revision" }).click();
  const send = review.getByRole("button", { name: "Send revision request" });
  await expect(send, "a revision needs a reason").toBeDisabled();
  await review.getByLabel("What needs to change?").fill(reason);
  await send.click();
  await expect(review.getByText(`Sent back to ${ATHLETE.name} with your notes.`)).toBeVisible();
  await expect.poll(deliverableState).toBe("DRAFT_SUBMITTED");
  const [revisionAudit] = await q<{ after: { reason?: string } | null }>(
    `select after from "AuditLog" where "entityId" = $1 and action = 'deliverable.requestRevision' order by at desc limit 1`, [first!.id]);
  expect(JSON.stringify(revisionAudit?.after)).toContain(reason);

  // 5. THE ATHLETE ANSWERS IT — reads the reason verbatim, uploads v2.
  await athlete.goto(`/athlete/deliverables/${first!.id}`);
  await expect(athlete.getByText("Changes requested")).toBeVisible();
  await expect(athlete.getByText(reason)).toBeVisible();
  await expect(athlete.getByRole("heading", { name: "Upload the revised version" })).toBeVisible();
  await athlete.getByLabel(/Choose your draft/).setInputFiles({
    name: "story-v2.png", mimeType: "image/png", buffer: Buffer.from("e2e draft v2"),
  });
  await athlete.getByRole("button", { name: "Upload new version" }).click();
  await expect.poll(deliverable, { timeout: 30_000 }).toMatchObject({ state: "DRAFT_SUBMITTED", versions: 2 });
  await athlete.goto(`/athlete/deliverables/${first!.id}`);
  await expect(athlete.getByText("Changes requested"), "a new version answers the revision").toHaveCount(0);

  // 6. REVIEW AGAIN → SPONSOR → APPROVED.
  review = await reviewDrawer(desk, title);
  await expect(review.getByText(/v2/).first()).toBeVisible();
  await review.getByRole("button", { name: "Start BTG review" }).click();
  await expect.poll(deliverableState).toBe("BTG_REVIEW");
  await review.getByRole("button", { name: "Send to sponsor" }).click();
  await expect(review.getByText(`Sent to ${SPONSOR_NAME} for their sign-off.`)).toBeVisible();
  await expect.poll(deliverableState).toBe("SPONSOR_REVIEW");
  await review.getByRole("button", { name: "Approve (sponsor signed off)" }).click();
  await expect(review.getByText("Approved — the athlete has been told to publish.")).toBeVisible();
  await expect.poll(deliverableState).toBe("APPROVED");

  // 7. PUBLISHED — a bad link is refused on the page; the real one lands.
  const live = `https://www.instagram.com/p/e2e-p5-${Date.now().toString(36)}/`;
  await athlete.goto(`/athlete/deliverables/${first!.id}`);
  await expect(athlete.getByRole("heading", { name: "Publish it" })).toBeVisible();
  const link = athlete.getByLabel("Link to the live post");
  await link.fill("instagram.com/my-post");
  await athlete.getByRole("button", { name: "Mark as published" }).click();
  await expect(athlete.getByRole("alert").filter({ hasText: "Paste the full link to the live post" })).toBeVisible();
  expect(await deliverableState()).toBe("APPROVED");
  await link.fill(live);
  await athlete.getByRole("button", { name: "Mark as published" }).click();
  await expect(athlete.getByText("Published — BTG verifying").first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(deliverable).toMatchObject({ state: "PUBLISHED", publishedUrl: live });

  // The desk now shows the link, ready for P7's verification.
  review = await reviewDrawer(desk, title);
  await expect(review.getByRole("button", { name: "Verify publication" })).toBeVisible();

  await desk.context().close();
  await athlete.context().close();
});

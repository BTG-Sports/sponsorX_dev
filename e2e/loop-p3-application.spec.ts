import { expect, test, type Page } from "@playwright/test";

import { apiAs, emailFor, hasLoopStack, LOOP_SKIP_REASON, pageAs, releaseUser, desktopOnly } from "./support/auth";
import { auditActions, clearRateLimit, ensureBase, purge, q, TENANT } from "./support/loop-db";

/**
 * P3-QA-01 — E2E: application → approval → ACTIVE.
 *
 * "The full path runs green in CI, including the minor/guardian branch."
 *
 * The real stack, as the real people: an applicant with no account fills the
 * public /join wizard (web → server action → POST /applications/intake →
 * Postgres); a BTG reviewer, signed in through Clerk, claims and approves it
 * on the applications desk, then activates it there; and the athlete signs in
 * and finds their own profile ACTIVE.
 *
 * ONE STEP HAS NO SCREEN YET and goes through the API with the reviewer's own
 * session token — nothing elevated, the matrix decides exactly as for a click:
 * the guardian (`POST /athletes/:id/guardian`, `POST /guardians/:id/verify`).
 * /join collects the guardian's details but the intake contract does not
 * carry them (a recorded gap on P3-BE-14), and there is no BTG capture UI.
 * The desk is re-read after each, so the screen is still what is asserted.
 * (Activation had no screen either until this task added "Activate athlete"
 * to the desk — the §39 loop could not otherwise be walked in the UI.)
 *
 * Provisioning the athlete's login (a `User` row linked to the new athlete)
 * is what BTG does by hand after activation — Phase 1 never self-provisions —
 * so the spec does it the same way, through the sign-in helper.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);
/* Several signed-in people and a ten-screen wizard per test — well past the
   30 s default on a `next dev` server. */
test.describe.configure({ timeout: 180_000 });

const ADULT_EMAIL = emailFor("p3.athlete");
const MINOR_EMAIL = emailFor("p3.minor");
const ADMIN = { key: "p3.admin", roles: ["BTG_ADMIN" as const] };

async function applicantIds(): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `select id from "Athlete" where "tenantId" = $1 and email = any($2)`,
    [TENANT, [ADULT_EMAIL, MINOR_EMAIL]],
  );
  return rows.map((r) => r.id);
}

async function clean() {
  await releaseUser("p3.athlete");
  await purge({ athleteIds: await applicantIds() });
}

test.beforeAll(async ({}, testInfo) => {
  /* One set of applicants per run: the mobile project would file a second
     application with the same address and race the first on the desk. */
  test.skip(!desktopOnly(testInfo), "portal loop — desktop project only");
  await ensureBase();
  await clean();
  /* Every intake in a run reaches the API from the web server's one address,
     and the limiter allows five an hour. */
  await clearRateLimit("intake:");
});
test.afterAll(async ({}, testInfo) => {
  if (desktopOnly(testInfo)) await clean();
});

function isoDate(yearsAgo: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
  return d.toISOString().slice(0, 10);
}

type Applicant = { first: string; last: string; dob: string; email: string; guardian?: boolean };

/** The public wizard, section by section, as a phone-first applicant sees it. */
async function apply(page: Page, a: Applicant): Promise<string> {
  await page.goto("/join");
  await page.getByRole("button", { name: "Start application" }).click();
  const next = page.getByRole("button", { name: "Save and continue" });
  const heading = (name: string) => expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await heading("Who you are");
  await page.getByLabel("Legal first name").fill(a.first);
  await page.getByLabel("Legal last name").fill(a.last);
  await page.getByLabel("Date of birth").fill(a.dob);
  await page.getByLabel("Email", { exact: true }).fill(a.email);
  if (a.guardian) await expect(page.getByText("One extra section is added")).toBeVisible();
  await next.click();

  await heading("Your sport");
  await page.getByLabel("Primary sport").fill("Soccer");
  await page.getByLabel("Position").fill("Midfielder");
  await page.getByLabel("Level").fill("College");
  await page.getByLabel("Team or school").fill("E2E University");
  await next.click();

  await heading("Where you are");
  await page.getByLabel("City").fill("Silver Spring");
  await page.getByLabel("State / region").fill("MD");
  await page.getByLabel("Country").fill("USA");
  await next.click();

  await heading("Your channels");
  // The text box, by role: since 2026-09-30 the footer's social icon is
  // labelled "Instagram — not linked yet", and getByLabel matches substrings —
  // two elements, a strict-mode failure, on every run.
  await page.getByRole("textbox", { name: "Instagram", exact: true }).fill(`@${a.first.toLowerCase()}e2e`);
  await next.click();

  await heading("What you can make");
  await page.getByLabel("Formats").fill("Reels, stories");
  await page.getByLabel("Typical turnaround").fill("3–5 days");
  await next.click();

  await heading("Brands you'd work with");
  await page.getByLabel("Interested categories").fill("Apparel, local businesses");
  await next.click();

  await heading("Restrictions and conflicts");
  await next.click();

  if (a.guardian) {
    /* The one branch: only a minor ever sees this section. */
    await heading("Your guardian");
    await page.getByLabel("Guardian legal name").fill(`Parent ${a.last}`);
    await page.getByLabel("Relationship").fill("Parent");
    await page.getByLabel("Guardian email").fill(emailFor("p3.guardian"));
    await next.click();
  }

  await heading("Payment recipient");
  await page.getByLabel("Recipient name").fill(`${a.first} ${a.last}`);
  await next.click();

  await heading("The agreement");
  const submit = page.getByRole("button", { name: "Submit application" });
  await expect(submit, "submit stays locked until the agreement is accepted").toBeDisabled();
  /* The box is visually replaced by its label (the tick draws in), so a
     person clicks the words — and so does this. */
  const agree = page.getByRole("checkbox", { name: /I have read and accept the Content Collaboration Agreement/ });
  await page.getByText(/I have read and accept the Content Collaboration Agreement/).click();
  await expect(agree).toBeChecked();
  await submit.click();

  await expect(page.getByRole("heading", { level: 1, name: "Application submitted" })).toBeVisible({ timeout: 20_000 });
  const reference = page.getByText(/^Reference:/);
  await expect(reference).toBeVisible();
  const id = (await reference.locator("span").innerText()).trim();
  expect(id).not.toBe("");
  return id;
}

async function athlete(id: string) {
  const [row] = await q<{ state: string; email: string; birthDate: Date | null; guardianId: string | null }>(
    `select state, email, "birthDate", "guardianId" from "Athlete" where id = $1`,
    [id],
  );
  return row;
}

/** Open one application's review drawer on the desk, found by name. */
async function openOnDesk(desk: Page, name: string, tab = "all") {
  await desk.goto(`/admin/applications?tab=${tab}&q=${encodeURIComponent(name)}`);
  await desk.getByRole("button", { name: new RegExp(name) }).first().click();
  const drawer = desk.getByRole("dialog", { name: `${name} — application review` });
  await expect(drawer).toBeVisible();
  return drawer;
}

const run = Date.now().toString(36);

test("an adult applies, is approved and activated, and signs in ACTIVE", async ({ page, browser }, testInfo) => {
  const a = { first: "Adaeze", last: `Adult${run}`, dob: isoDate(20), email: ADULT_EMAIL };
  const name = `${a.first} ${a.last}`;

  // 1. Apply — anonymous, public, no login.
  const id = await apply(page, a);
  expect(await athlete(id)).toMatchObject({ state: "SUBMITTED", email: ADULT_EMAIL });

  // 2. Review — a BTG reviewer claims it, then approves it.
  const desk = await pageAs(browser, testInfo, ADMIN);
  let drawer = await openOnDesk(desk, name, "review");
  await expect(drawer.getByText("Adult athlete — no guardian needed.")).toBeVisible();
  await drawer.getByRole("button", { name: "Start review" }).click();
  await expect.poll(async () => (await athlete(id)).state).toBe("UNDER_REVIEW");
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(drawer.getByText(`${name} approved`)).toBeVisible();
  await expect.poll(async () => (await athlete(id)).state).toBe("APPROVED");

  // 3. Activate — the desk's last step for an approved athlete.
  await drawer.getByRole("button", { name: "Activate athlete" }).click();
  await expect(drawer.getByText(`${name} is active`)).toBeVisible();
  await expect.poll(async () => (await athlete(id)).state).toBe("ACTIVE");
  drawer = await openOnDesk(desk, name, "approved");
  await expect(drawer.getByText("Live in the network and able to take paid work.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Activate athlete" })).toHaveCount(0);

  // Every step left its audit trail, in order.
  await expect.poll(() => auditActions(id)).toEqual(
    expect.arrayContaining(["athlete.apply"]),
  );
  const [transitions] = await q<{ n: number }>(
    `select count(*)::int n from "AuditLog" where "entityId" = $1 and action <> 'athlete.apply'`, [id]);
  expect(transitions.n, "SUBMITTED, UNDER_REVIEW, APPROVED and ACTIVE each audited").toBeGreaterThanOrEqual(4);

  // 4. The athlete signs in and finds themselves live.
  const own = await pageAs(browser, testInfo, { key: "p3.athlete", roles: ["ATHLETE"], athleteId: id });
  await expect(own).toHaveURL(/\/athlete/);
  await own.goto("/athlete/profile");
  await expect(own.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible();
  await expect(own.getByText(name).first()).toBeVisible();
  await expect(own.getByText("Active", { exact: true }).first()).toBeVisible();

  await desk.context().close();
  await own.context().close();
});

test("a minor cannot go ACTIVE until a guardian is linked and verified", async ({ page, browser }, testInfo) => {
  const a = { first: "Chidi", last: `Minor${run}`, dob: isoDate(16), email: MINOR_EMAIL, guardian: true };
  const name = `${a.first} ${a.last}`;

  // 1. Apply — the DOB opens the guardian branch, and the receipt says so.
  const id = await apply(page, a);
  await expect(page.getByText("Waiting on your guardian")).toBeVisible();
  expect(await athlete(id)).toMatchObject({ state: "SUBMITTED", guardianId: null });

  // 2. Review — the desk flags the minor before and inside the drawer.
  const desk = await pageAs(browser, testInfo, ADMIN);
  await desk.goto(`/admin/applications?tab=review&q=${encodeURIComponent(name)}`);
  const row = desk.getByRole("button", { name: new RegExp(name) }).first();
  await expect(row.getByText("Minor", { exact: true })).toBeVisible();
  let drawer = await openOnDesk(desk, name, "review");
  await expect(drawer.getByText(/Minor with no guardian linked/)).toBeVisible();
  await drawer.getByRole("button", { name: "Start review" }).click();
  await expect(drawer.getByText(/Minor without a verified guardian — approving is allowed/)).toBeVisible();
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(drawer.getByText(`${name} approved`)).toBeVisible();
  await expect.poll(async () => (await athlete(id)).state).toBe("APPROVED");

  // 3. Activation is refused — §37's gate. The desk says why and offers no
  //    live button; the API refuses the same move for anyone who asks.
  const activate = drawer.getByRole("button", { name: "Activate athlete" });
  await expect(activate).toBeDisabled();
  await expect(drawer.getByText(/no guardian is linked yet/)).toBeVisible();
  const refused = await apiAs<{ error?: { message?: string } }>(desk, "POST", `/applications/${id}/activate`);
  expect(refused.status).toBe(409);
  expect(refused.body.error?.message).toMatch(/guardian/i);
  expect((await athlete(id)).state).toBe("APPROVED");

  // 4. BTG links the guardian (API — no capture screen yet). Linked is not enough.
  const linked = await apiAs<{ guardianId: string }>(desk, "POST", `/athletes/${id}/guardian`, {
    legalName: `Parent ${a.last}`,
    email: emailFor("p3.guardian"),
    relationship: "PARENT",
  });
  expect(linked.status, JSON.stringify(linked.body)).toBe(201);
  const guardianId = linked.body.guardianId;
  drawer = await openOnDesk(desk, name);
  await expect(drawer.getByText(/Guardian linked but not verified/)).toBeVisible();
  await expect(drawer.getByText(/guardian is linked but not verified yet/)).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Activate athlete" })).toBeDisabled();

  // 5. BTG verifies the guardian (API) — now the desk says go, and activating lands.
  const verified = await apiAs<{ verifiedAt: string }>(desk, "POST", `/guardians/${guardianId}/verify`);
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  drawer = await openOnDesk(desk, name);
  await expect(drawer.getByText("Guardian verified — this minor can go live once approved.")).toBeVisible();
  await drawer.getByRole("button", { name: "Activate athlete" }).click();
  await expect(drawer.getByText(`${name} is active`)).toBeVisible();
  await expect.poll(async () => (await athlete(id)).state).toBe("ACTIVE");
  expect(await athlete(id)).toMatchObject({ guardianId });

  const [g] = await q<{ verifiedAt: Date | null }>(`select "verifiedAt" from "Guardian" where id = $1`, [guardianId]);
  expect(g.verifiedAt, "who confirmed this adult, and when, survives").not.toBeNull();

  await desk.context().close();
});

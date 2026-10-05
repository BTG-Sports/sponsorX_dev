import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { apiAs, clerkUserFor, desktopOnly, emailFor, hasLoopStack, LOOP_SKIP_REASON, pageAs, pageAsExisting } from "./support/auth";
import { ensureAgreements, ensureBase, q, seedSponsor, TENANT } from "./support/loop-db";
import { runWorker } from "./support/worker";

/**
 * 2S8-QA-01 — the marketplace, end to end, as one automated run.
 *
 * "Onboarding through listing, purchase, fulfilment, earnings and payout."
 *
 * In a real browser against the real API, signed in as each person in turn,
 * with nobody at BTG approving anything — Phase 2 automates every step whose
 * safety checks pass (CLAUDE.md, 2026-10-03):
 *
 *   1. A TEAM applies at /onboarding (documents, terms, its contact's email
 *      link) and is approved automatically.
 *   2. An ATHLETE applies at /join (the wizard, a government ID, the email
 *      link) and is approved — and ACTIVE — automatically.
 *   3. The team invites the athlete to its roster at a 20% team share; the
 *      athlete accepts. Both set up their payout account on the stand-in
 *      provider (/test-provider/account).
 *   4. The athlete adds a clinic to their inventory; the team lists it, and
 *      it is published automatically.
 *   5. A SPONSOR adds it to the cart, holds it, accepts the order terms and
 *      places the order — approved automatically within its spending limit,
 *      with the split frozen.
 *   6. The sponsor pays on the stand-in provider (/test-provider/checkout).
 *   7. The athlete marks it delivered; the sponsor confirms.
 *   8. The athlete's money is available; a payout is requested, approved
 *      automatically, and sent and paid by the stand-in provider.
 *   9. The order closes on its own 30 days after delivery was confirmed,
 *      releasing the reserve — which is paid out too.
 *
 * THE WORKER. The harness runs no worker, so what the worker does in
 * production is done by the worker's own handlers (support/worker.ts): the
 * provider's payment confirmation (payments.confirm), sending and paying a
 * payout (payouts.send), and the delivery sweep that closes the order —
 * run with its clock 31 days ahead, since it takes `now` as an argument.
 *
 * THE MONEY. BTG's commission rules are set through the API as BTG's admin
 * (the call the Commission rules page makes), at the ledger design's
 * simulated rates: platform 15%, management 5%, processing 2.9% + 30¢,
 * referral 2%, reserve 10%. On a $1,000 order that is $200 of fees, $29.30
 * processing and $15.41 referral; of the $755.29 left, the team's 20% share
 * is $151.05 and the athlete's $604.24 — 10% of each held in reserve until
 * the order closes.
 *
 * DATA. Fresh names every run; the people's addresses are stable
 * (e2e.mkt.*@example.com, one Clerk identity each). Orders, their split and
 * the ledger are immutable, so nothing is deleted afterwards: a re-run on
 * the same database first retires the previous run's logins and addresses,
 * so the new applications are new people. CI's database is fresh each run.
 */
test.skip(!hasLoopStack, LOOP_SKIP_REASON);
test.describe.configure({ timeout: 600_000 });

const run = Date.now().toString(36);
const KEY = { team: "mkt.team", athlete: "mkt.athlete" };
const TEAM = {
  orgName: `E2E Westfield Hawks ${run}`,
  contact: { name: "Marcus Hill", role: "Team manager", email: emailFor(KEY.team), phone: "(301) 555-0142" },
  legalEntityName: `E2E Westfield Hawks ${run} LLC`,
  league: "Mid-Atlantic Amateur League",
  sport: "Basketball",
};
const ATHLETE = { first: "Rory", last: `Mkt${run}`, email: emailFor(KEY.athlete) };
const ATHLETE_NAME = `${ATHLETE.first} ${ATHLETE.last}`;
const SPONSOR = { id: `e2e_mkt_sponsor_${run}`, name: `E2E Harbor Coffee ${run}`, key: "mkt.sponsor" };
const ADMIN = { key: "mkt.admin", roles: ["BTG_ADMIN" as const] };
const CLINIC = {
  title: `Basketball clinic ${run}`,
  price: "500.00",
  quantity: "4",
  description: "A 90-minute youth basketball clinic at the team's home gym. Your business is named at the session and on the clinic banner.",
};
const COMMISSION = [
  { kind: "PLATFORM_FEE", bps: 1500, fixedCents: 0, note: "Platform fee 15%" },
  { kind: "MANAGEMENT_FEE", bps: 500, fixedCents: 0, note: "Management fee 5%" },
  { kind: "PROCESSING", bps: 290, fixedCents: 30, note: "Card processing 2.9% + 30¢ per order" },
  { kind: "REFERRAL", bps: 200, fixedCents: 0, note: "Referral 2%" },
  { kind: "RESERVE", bps: 1000, fixedCents: 0, note: "Reserve 10%, released when the order closes" },
] as const;

const day = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A minimal one-page PDF, so every upload carries a real document. */
function pdf(file: string, title: string): string {
  const text = `BT /F1 18 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(file, body);
  return file;
}

/** The newest queued email (an OutboxJob row — nothing is sent from the harness) to `to` carrying a link with `marker`. */
async function emailLink(to: string, marker: string): Promise<string> {
  let found: string | undefined;
  await expect.poll(async () => {
    const rows = await q<{ payload: { data?: Record<string, unknown> } }>(
      `select payload from "OutboxJob" where name = 'notify.email' and lower(payload->>'to') = lower($1)
         and payload::text like $2 order by "createdAt" desc limit 1`,
      [to, `%${marker}%`],
    );
    found = Object.values(rows[0]?.payload.data ?? {}).find((v): v is string => typeof v === "string" && v.includes(marker));
    return Boolean(found);
  }, { message: `an email to ${to} with a ${marker} link` }).toBe(true);
  const url = new URL(found!);
  return `${url.pathname}${url.search}`;
}

/**
 * A re-run on the same database: the previous run's team contact and athlete
 * used the same addresses. Their rows stay (orders are immutable) but let go
 * of the addresses and the Clerk identities, so today's applications are new
 * people rather than duplicates of yesterday's. A no-op on a fresh database.
 */
async function retirePreviousRun() {
  const emails = [TEAM.contact.email, ATHLETE.email];
  const clerkIds = [await clerkUserFor(KEY.team), await clerkUserFor(KEY.athlete)];
  await q(
    `update "User" set "clerkId" = 'released_' || id, email = 'retired.' || id || '@example.invalid'
      where lower(email) = any($1) or "clerkId" = any($2)`,
    [emails, clerkIds],
  );
  await q(`update "Athlete" set email = 'retired.' || id || '@example.invalid' where lower(email) = any($1)`, [emails]);
  for (const e of emails) {
    await q(
      `update "PropertyOnboarding" set contacts = replace(contacts::text, $1, 'retired.' || id || '@example.invalid')::jsonb
        where contacts::text ilike $2`,
      [e, `%${e}%`],
    );
  }
}

test.beforeAll(async ({}, testInfo) => {
  test.skip(!desktopOnly(testInfo), "marketplace path — desktop project only (one set of people per run)");
  await ensureBase();
  await ensureAgreements();
  await retirePreviousRun();
  await seedSponsor(SPONSOR.id, SPONSOR.name);
  /* A coffee shop, as the sponsor request files one ("Coffee" → Restaurant):
     nothing can be bought until the buyer's brand category is set, because
     the sellers' restrictions are checked against it. */
  await q(`update "Sponsor" set categories = '{RESTAURANT}' where id = $1`, [SPONSOR.id]);
});

/** Set up the payout account on the stand-in provider, from a money page. */
async function payoutAccount(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { name: /^Set up payouts with Stripe/ }).click();
  await page.waitForURL(/\/test-provider\/account/);
  await page.getByRole("button", { name: "Finish set-up (test)" }).click();
  await page.waitForURL((u) => u.pathname === path, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: /^Manage payouts on Stripe/ })).toBeVisible({ timeout: 30_000 });
}

/** Ask for everything available from a money page; returns the dialog's amount ("$542.58"). */
async function requestPayout(page: Page, path: string): Promise<string> {
  await page.goto(path);
  const ask = page.getByRole("button", { name: /^Request payout/ });
  await expect(ask).toBeEnabled({ timeout: 30_000 });
  await ask.click();
  const dialog = page.getByRole("dialog");
  const go = dialog.getByRole("button", { name: /^Request \$/ });
  await expect(go).toBeVisible();
  const label = (await go.innerText()).trim();
  await go.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  return label.replace(/^Request /, "");
}

test("a team and an athlete join, list, sell, deliver, get paid — and the order closes, with nobody approving", async ({ page, browser }, testInfo) => {
  const { useObjectStore } = await import("./support/object-store");

  /* ─────────────────────────────────────────── 1 · the team applies ── */
  await useObjectStore(page);
  await page.goto("/onboarding");
  await page.locator("input[name=orgType][value=TEAM]").check();
  await page.getByLabel("Organisation name").fill(TEAM.orgName);
  await page.getByRole("button", { name: "Start the application" }).click();
  await page.waitForURL(/\/onboarding\/[^/]+$/);
  const resume = new URL(page.url()).pathname;
  const next = () => page.getByRole("button", { name: /^(Save and continue|Continue|Accept and continue)$/ });

  await expect(page.getByRole("heading", { name: "Organisation" })).toBeVisible();
  await page.getByLabel("State you operate in").selectOption("MD");
  await next().click();

  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await page.getByLabel("Full name").fill(TEAM.contact.name);
  await page.getByLabel("Role").fill(TEAM.contact.role);
  await page.getByLabel("Email").fill(TEAM.contact.email);
  await page.getByLabel("Phone (optional)").fill(TEAM.contact.phone);
  await next().click();

  await expect(page.getByRole("heading", { name: "Team details" })).toBeVisible();
  await page.getByLabel("Legal entity name").fill(TEAM.legalEntityName);
  await page.getByLabel("League").fill(TEAM.league);
  await page.getByLabel("Sport", { exact: true }).fill(TEAM.sport);
  await next().click();

  await expect(page.getByRole("heading", { name: "How you get paid" })).toBeVisible();
  await page.getByRole("checkbox").check();
  await next().click();

  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  const uploads = page.locator('ul[aria-label="Required documents"] input[type=file]');
  const labels = await uploads.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.length, "the team's required documents").toBeGreaterThan(0);
  for (const [i, label] of labels.entries()) {
    const name = `team-document-${i + 1}.pdf`;
    await page.locator(`input[type=file][aria-label="${label}"]`).setInputFiles(pdf(testInfo.outputPath(name), `${TEAM.orgName} ${label}`));
    await expect(page.getByText(`${name} · received`)).toBeVisible({ timeout: 30_000 });
  }
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Property terms" })).toBeVisible();
  await page.getByRole("checkbox").check();
  await next().click();

  await expect(page.getByRole("heading", { name: "Review & submit" })).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Almost there")).toBeVisible({ timeout: 30_000 });

  // The contact's email link — and with it, approved by the system.
  await page.goto(await emailLink(TEAM.contact.email, "/onboarding/confirm?t="));
  await page.goto(resume);
  await expect(page.getByText("Approved — check your email to sign in.")).toBeVisible({ timeout: 30_000 });
  const [onboarding] = await q<{ state: string; autoApproved: boolean; propertyId: string | null; reviewReasons: string[] }>(
    `select state, "autoApproved", "propertyId", "reviewReasons" from "PropertyOnboarding" where "orgName" = $1`, [TEAM.orgName]);
  expect(onboarding, `review reasons: ${JSON.stringify(onboarding?.reviewReasons)}`).toMatchObject({ state: "APPROVED", autoApproved: true });
  expect(onboarding.propertyId, "the team is a Property now").not.toBeNull();
  const propertyId = onboarding.propertyId!;

  /* ───────────────────────────────────────── 2 · the athlete applies ── */
  const applicant = await (await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL })).newPage();
  await useObjectStore(applicant);
  await applicant.goto("/join");
  await applicant.getByRole("button", { name: "Start application" }).click();
  const save = applicant.getByRole("button", { name: "Save and continue" });
  const section = async (heading: string, fields: Array<[string, string]>) => {
    await expect(applicant.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    for (const [name, value] of fields) await applicant.locator(`input[name="${name}"]`).fill(value);
    await save.click();
  };
  await section("Who you are", [["firstName", ATHLETE.first], ["lastName", ATHLETE.last], ["dob", "2004-03-14"], ["email", ATHLETE.email], ["phone", "(301) 555-0187"]]);
  await section("Your sport", [["sport", TEAM.sport], ["position", "Guard"], ["level", "Club"], ["team", TEAM.orgName]]);
  await section("Where you are", [["city", "Laurel"], ["region", "MD"], ["country", "USA"]]);
  await section("Your channels", [["instagram", `@${ATHLETE.first.toLowerCase()}${run}`], ["followers", "4,800"]]);
  await section("What you can make", [["formats", "Reels, photo posts, in-person appearances"], ["turnaround", "3–5 days"]]);
  await section("Brands you'd work with", [["categories", "Coffee, local businesses, sportswear"]]);
  await section("Restrictions and conflicts", []);
  await section("Payment recipient", [["recipient", ATHLETE_NAME]]);
  await expect(applicant.getByRole("heading", { level: 1, name: "The agreement" })).toBeVisible();
  await applicant.getByText(/I have read and accept the Content Collaboration Agreement/).click();
  await applicant.getByRole("button", { name: "Submit application" }).click();
  await expect(applicant.getByRole("heading", { name: "Application submitted" })).toBeVisible({ timeout: 30_000 });

  // The ID, straight to the private bucket, from the receipt's checklist.
  await expect(applicant.getByText("A driver’s license, passport or state ID.")).toBeVisible({ timeout: 30_000 });
  await applicant.locator("input[type=file]").setInputFiles(pdf(testInfo.outputPath("athlete-id.pdf"), `${ATHLETE_NAME} driver's licence`));
  await expect(applicant.getByText("A driver’s license, passport or state ID.")).toBeHidden({ timeout: 30_000 });
  // The email link — the last thing missing, so the system approves.
  await applicant.goto(await emailLink(ATHLETE.email, "/join/confirm"));
  await expect(applicant.getByText("You’re approved").first()).toBeVisible({ timeout: 30_000 });
  await applicant.context().close();
  const [athleteRow] = await q<{ id: string; state: string; autoApproved: boolean }>(
    `select id, state, "autoApproved" from "Athlete" where lower(email) = lower($1)`, [ATHLETE.email]);
  expect(athleteRow).toMatchObject({ state: "ACTIVE", autoApproved: true });
  const athleteId = athleteRow.id;
  await page.context().close();

  /* ────────────────────── 3 · the roster, and both payout accounts ── */
  const team = await pageAsExisting(browser, testInfo, KEY.team);
  await expect(team).toHaveURL(/\/property/);
  await team.goto("/property/roster");
  await team.getByRole("button", { name: "Invite an athlete already on SponsorX" }).click();
  await team.getByLabel(/Athlete.s name/).fill(ATHLETE_NAME);
  await team.getByLabel("Team share %").fill("20");
  await team.getByRole("button", { name: "Search" }).click();
  await team.getByRole("button", { name: new RegExp(`^Invite ${ATHLETE.first}`) }).click();
  await expect(team.getByText(/is invited at 20%/)).toBeVisible();

  const athlete = await pageAsExisting(browser, testInfo, KEY.athlete);
  await expect(athlete).toHaveURL(/\/athlete/);
  await athlete.goto("/athlete/team");
  await athlete.getByRole("button", { name: /^Accept and join/ }).click();
  await expect(athlete.getByRole("button", { name: "Leave team" })).toBeVisible({ timeout: 30_000 });
  const [onRoster] = await q<{ propertyId: string | null; teamShareBps: number | null }>(
    `select "propertyId", "teamShareBps" from "Athlete" where id = $1`, [athleteId]);
  expect(onRoster).toEqual({ propertyId, teamShareBps: 2000 });

  await payoutAccount(athlete, "/athlete/money");
  await payoutAccount(team, "/property/earnings");

  /* ──────────────────── 4 · the athlete's clinic, listed by the team ── */
  await athlete.goto("/athlete/inventory");
  const form = athlete.getByRole("form", { name: "New inventory item" });
  await expect(form).toBeVisible();
  await athlete.locator("#inv-title").fill(CLINIC.title);
  await athlete.locator("#inv-kind").selectOption("CAMP");
  await athlete.locator("#inv-price").fill(CLINIC.price);
  await athlete.locator("#inv-qty").fill(CLINIC.quantity);
  await athlete.locator("#inv-from").fill(day(10));
  await athlete.locator("#inv-until").fill(day(40));
  await form.getByRole("button", { name: "Add item" }).click();
  await athlete.waitForURL(/\/athlete\/inventory\/[^/]+$/, { timeout: 30_000 });
  const [item] = await q<{ id: string; priceCents: number; quantity: number }>(
    `select id, "priceCents", quantity from "InventoryItem" where "athleteId" = $1 and title = $2`, [athleteId, CLINIC.title]);
  expect(item).toMatchObject({ priceCents: 50_000, quantity: 4 });

  await team.goto("/property/listings/new");
  await team.locator("li").filter({ hasText: CLINIC.title }).getByRole("link", { name: "List this" }).click();
  await team.waitForURL(/\/property\/listings\/new\?item=/);
  await team.getByLabel("What the sponsor gets").fill(CLINIC.description);
  await team.getByRole("button", { name: "Create draft listing" }).click();
  await team.waitForURL(/\/property\/listings\/(?!new)[^/?]+$/, { timeout: 30_000 });
  const listingId = new URL(team.url()).pathname.split("/").pop()!;
  await team.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(team.getByRole("status").filter({ hasText: "Live ✓" })).toBeVisible({ timeout: 30_000 });
  const [listing] = await q<{ state: string; inventoryItemId: string; propertyId: string | null; publishedAutomatically: boolean }>(
    `select state, "inventoryItemId", "propertyId", "publishedAutomatically" from "Listing" where id = $1`, [listingId]);
  expect(listing, "published automatically, its checks passed").toEqual({
    state: "PUBLISHED", inventoryItemId: item.id, propertyId, publishedAutomatically: true,
  });

  /* ─────────── 5 · BTG's commission rules, then the sponsor buys two ── */
  const desk = await pageAs(browser, testInfo, ADMIN);
  const have = await apiAs<{ rules?: Array<{ kind: string; scope: string; bps: number; fixedCents: number }> } | Array<{ kind: string; scope: string; bps: number; fixedCents: number }>>(desk, "GET", "/commission-rules?current=true");
  expect(have.status, JSON.stringify(have.body)).toBe(200);
  const existing = (Array.isArray(have.body) ? have.body : have.body.rules ?? []).filter((r) => r.scope === "GLOBAL");
  for (const r of COMMISSION) {
    const there = existing.find((e) => e.kind === r.kind);
    if (there) {
      expect(there, `the ${r.kind} rule this database already has`).toMatchObject({ bps: r.bps, fixedCents: r.fixedCents });
      continue;
    }
    const made = await apiAs(desk, "POST", "/commission-rules", { kind: r.kind, scope: "GLOBAL", bps: r.bps, fixedCents: r.fixedCents, priority: 0, note: r.note });
    expect(made.status, `${r.kind}: ${JSON.stringify(made.body)}`).toBe(201);
  }

  const sponsor = await pageAs(browser, testInfo, { key: SPONSOR.key, roles: ["SPONSOR_ADMIN"], sponsorId: SPONSOR.id });
  await sponsor.goto("/sponsor/shop");
  const card = sponsor.locator("li, article, div.rounded-xl")
    .filter({ hasText: CLINIC.title })
    .filter({ has: sponsor.getByRole("button", { name: "Add to cart" }) })
    .last();
  await card.getByRole("button", { name: "Add to cart" }).click();
  const addForm = sponsor.locator("form").filter({ has: sponsor.getByLabel("Quantity") });
  await addForm.getByLabel("Quantity").fill("2");
  await addForm.getByLabel("Starts").fill(day(12));
  await addForm.getByLabel("Ends").fill(day(19));
  await addForm.getByRole("button", { name: "Add to cart" }).click();
  const added = sponsor.getByRole("status").filter({ hasText: "Added." });
  const refused = addForm.getByRole("alert");
  await expect(added.or(refused).first()).toBeVisible({ timeout: 30_000 });
  expect(await refused.count() ? await refused.first().innerText() : "", "the line was refused").toBe("");
  await expect(added).toBeVisible();

  await sponsor.goto("/sponsor/cart");
  await sponsor.getByRole("button", { name: "Reserve & check out" }).click();
  await sponsor.waitForURL(/\/sponsor\/checkout\?reservation=/, { timeout: 30_000 });
  const billing = sponsor.locator("section[aria-labelledby=checkout-billing]");
  await billing.getByLabel("Name").fill("Dana Brooks");
  await billing.getByLabel("Email").fill(`dana.${run}@example.invalid`);
  await billing.getByLabel(/PO number or your reference/).fill(`Clinic ${run}`);
  const place = sponsor.getByRole("button", { name: "Place order" });
  await expect(place, "not before the order terms are accepted").toBeDisabled();
  await sponsor.locator("section[aria-labelledby=checkout-terms]").getByRole("checkbox").check();
  await place.click();
  await sponsor.waitForURL(/\/sponsor\/orders\/[^/?]+/, { timeout: 30_000 });
  const orderId = new URL(sponsor.url()).pathname.split("/").pop()!;

  const orderOf = async () => (await q<{ state: string; totalCents: number; requiresApproval: boolean; decidedBy: string | null }>(
    `select state, "totalCents", "requiresApproval", "decidedBy" from "MarketplaceOrder" where id = $1`, [orderId]))[0];
  expect(await orderOf(), "approved automatically within the spending limit").toMatchObject({
    state: "AWAITING_PAYMENT", totalCents: 100_000, requiresApproval: false,
  });

  // The split, frozen at approval, at the rules above.
  const [split] = await q<{
    grossCents: number; platformFeeCents: number; managementFeeCents: number; processingCents: number; referralCents: number;
    reserveCents: number; availableCents: number; teamShareBps: number | null; teamAvailableCents: number | null; teamReserveCents: number | null;
    athleteId: string | null;
  }>(`select "grossCents", "platformFeeCents", "managementFeeCents", "processingCents", "referralCents", "reserveCents",
             "availableCents", "teamShareBps", "teamAvailableCents", "teamReserveCents", "athleteId"
        from "OrderLineFinancials" where "orderId" = $1`, [orderId]);
  expect(split).toEqual({
    grossCents: 100_000, platformFeeCents: 15_000, managementFeeCents: 5_000, processingCents: 2_930, referralCents: 1_541,
    reserveCents: 7_707, availableCents: 67_822, teamShareBps: 2_000, teamAvailableCents: 13_564, teamReserveCents: 1_541,
    athleteId,
  });
  const athleteTotal = split.availableCents - split.teamAvailableCents! + split.reserveCents - split.teamReserveCents!;
  expect(athleteTotal, "the athlete's $604.24").toBe(60_424);
  expect(split.teamAvailableCents! + split.teamReserveCents!, "the team's $151.05").toBe(15_105);

  /* ───────────────────────────── 6 · paid on the stand-in provider ── */
  await sponsor.getByRole("button", { name: /Pay \$1,000\.00 by card/ }).click();
  await sponsor.waitForURL(/\/test-provider\/checkout/, { timeout: 30_000 });
  await sponsor.locator("button[name=outcome][value=SUCCEED]").click();
  await sponsor.waitForURL((u) => u.pathname === `/sponsor/orders/${orderId}`, { timeout: 30_000 });
  await expect(sponsor.getByText("Payment received — confirming…").first()).toBeVisible({ timeout: 30_000 });
  const [attempt] = await q<{ id: string }>(
    `select id from "PaymentAttempt" where "orderId" = $1 order by "createdAt" desc limit 1`, [orderId]);
  await runWorker("payments.confirm", { ids: [attempt.id] });
  await sponsor.goto(`/sponsor/orders/${orderId}`);
  await expect(sponsor.getByText(/Paid ✓ · confirmed by the payment provider/).first()).toBeVisible({ timeout: 30_000 });
  expect((await orderOf()).state).toBe("PAID");

  /* ──────────────────── 7 · delivered by the seller, confirmed by the sponsor ── */
  await athlete.goto("/athlete/sales");
  await athlete.goto((await athlete.locator(`a[href*="/athlete/sales/"]`).first().getAttribute("href"))!);
  await athlete.getByRole("button", { name: "Mark delivered" }).first().click();
  const mark = athlete.getByRole("dialog");
  await mark.locator("#mk-note").fill("Both clinics held at the team's gym — 18 kids each, the sponsor's banner up both days.");
  await mark.getByRole("button", { name: "Mark delivered" }).click();
  await expect(mark).toBeHidden({ timeout: 30_000 });

  await sponsor.goto(`/sponsor/orders/${orderId}`);
  const confirm = sponsor.getByRole("button", { name: "Confirm delivered" });
  await confirm.click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });
  const [delivery] = await q<{ state: string }>(
    `select d.state from "OrderLineDelivery" d join "MarketplaceOrderLine" l on l.id = d."lineId" where l."orderId" = $1`, [orderId]);
  expect(delivery.state).toBe("CONFIRMED");

  /* ──── 8 · the athlete's money is available; paid out with nobody approving ── */
  expect(await requestPayout(athlete, "/athlete/money"), "available now: the athlete's share less its reserve").toBe("$542.58");
  const payouts = async () => q<{ id: string; state: string; amountCents: number; approvedAutomatically: boolean }>(
    `select id, state, "amountCents", "approvedAutomatically" from "Payout"
      where "payeeType" = 'ATHLETE' and "payeeId" = $1 order by "requestedAt"`, [athleteId]);
  const [first] = await payouts();
  expect(first, "under $2,000, every check passed").toMatchObject({ state: "APPROVED", amountCents: 54_258, approvedAutomatically: true });
  await runWorker("payouts.send", { ids: [first.id] });
  expect((await payouts())[0]).toMatchObject({ state: "PAID", amountCents: 54_258 });

  await desk.goto("/admin/payouts?tab=paid");
  await expect(desk.getByText("Approved automatically").first()).toBeVisible({ timeout: 30_000 });

  /* ───────────── 9 · thirty days on, the order closes; the reserve is paid too ── */
  const swept = await runWorker<{ closed: number }>("sweepDeliveries", { daysAhead: 31, tenantIds: [TENANT] });
  expect(swept.closed).toBeGreaterThanOrEqual(1);
  expect((await orderOf()).state, "closed on its own, 30 days after delivery was confirmed").toBe("CLOSED");
  expect(await requestPayout(athlete, "/athlete/money"), "the reserve, released at the close").toBe("$61.66");
  const all = await payouts();
  expect(all).toHaveLength(2);
  expect(all[1]).toMatchObject({ state: "APPROVED", amountCents: 6_166, approvedAutomatically: true });
  await runWorker("payouts.send", { ids: [all[1].id] });
  const paid = await payouts();
  expect(paid.map((p) => p.state)).toEqual(["PAID", "PAID"]);
  expect(paid.reduce((n, p) => n + p.amountCents, 0), "every cent of the athlete's share, paid").toBe(athleteTotal);

  for (const p of [team, athlete, sponsor, desk]) await p.context().close();
});

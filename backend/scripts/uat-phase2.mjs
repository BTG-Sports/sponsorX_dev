#!/usr/bin/env node
/* --------------------------------------------------------------------------
   npm run uat:phase2 — the Phase 2 real-user test (2S8-PMO-01), played on
   STAGING by simulated people who sign up through the normal pages.

   Every person is new each run and joins the way a real one would: the team
   at /onboarding, the athlete at /join, two sponsors at /brief. Nothing is
   made by the tester facility or written to the database — the database is
   only READ (inside a read-only transaction, over `railway ssh`) to find the
   email links nobody has an inbox for and to record evidence.

   Seventeen steps, in the order of documentation/SponsorX-Phase2-Acceptance-
   Signoff.md's UAT script. The wallet step (18) is left out: #11 is parked.

   A PERSON IS NEEDED THREE TIMES, in their OWN browser. Stripe refuses a
   browser driven by a script (a captcha, then "User not found"), so for each
   Stripe step the script says — in the terminal and as a Mac notification —
   which test login to use (the address goes on the clipboard; the code is
   424242), and waits until staging shows the step done:
     · the athlete's and the team's payout set-up on Stripe (Stripe's test
       values — never a real bank account or SSN; bank: "Test (Non-OAuth)",
       the ••••6789 account);
     · the sponsor's payment: card 4000 0000 0000 0002 first (declined), then
       4000 0000 0000 0077 — a test card whose money is available at once, so
       the payouts that follow can be transferred (4242's money stays
       pending for days and the transfer would be refused).

   It waits out one real 15-minute hold (step 9), so a run takes about
   40 minutes plus the person's time.

   RESUME. UAT_RESUME=<run> picks up a stopped run where it stopped, with
   the same people, items, hold and order: every step that passed is kept,
   and a payout account already READY is not set up again.

   Run it with staging's variables, on a machine where the Railway CLI is
   logged in:
     railway run --environment staging --service api -- npm run uat:phase2 -w @sponsorx/backend

   Needs CLERK_SECRET_KEY (sk_test_ only — it refuses anything else). Optional:
     UAT_API_URL    default https://api-staging-07ea.up.railway.app/api/v1
     UAT_WEB_URL    default https://web-staging-904a.up.railway.app
     UAT_ADMIN      default btg.admin+clerk_test@example.com
     UAT_FINANCE    default btg.finance+clerk_test@example.com
     UAT_HEADLESS=1 no visible browser (only useful up to the first person step)
     UAT_WAIT_MINUTES how long to wait for the person at each Stripe step (default 120)
     UAT_RESUME     a stopped run's id (yyMMddHHmm) to pick up

   Evidence — every step's result, ids and screenshots — is written to
   documentation/uat-evidence/phase2-<run>/ (evidence.json + evidence.md).
   The run's people carry its tag (UAT <run>) in every name and address.
   -------------------------------------------------------------------------- */

/* A plain Node script, plus `window` inside the page.evaluate() callbacks, which run in the browser. */
/* global process, console, fetch, setTimeout, Buffer, URL, window */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const API = (process.env.UAT_API_URL ?? "https://api-staging-07ea.up.railway.app/api/v1").replace(/\/$/, "");
const WEB = (process.env.UAT_WEB_URL ?? "https://web-staging-904a.up.railway.app").replace(/\/$/, "");
const ADMIN = process.env.UAT_ADMIN ?? "btg.admin+clerk_test@example.com";
const FINANCE = process.env.UAT_FINANCE ?? "btg.finance+clerk_test@example.com";
const CLERK_KEY = process.env.CLERK_SECRET_KEY ?? "";
const HEADLESS = process.env.UAT_HEADLESS === "1";

const RESUME = process.env.UAT_RESUME ?? "";
const RUN = RESUME || new Date().toISOString().replace(/\D/g, "").slice(2, 12); // yyMMddHHmm
const TAG = `UAT ${RUN}`;
const mail = (who) => `uat.${who}.${RUN}+clerk_test@example.com`;
const BILLING = `delivered+uat-${RUN}@resend.dev`;
const OUT = fileURLToPath(new URL(`../../documentation/uat-evidence/phase2-${RUN}/`, import.meta.url));

const TEAM = {
  orgName: `${TAG} Chesapeake Ospreys`,
  legalEntityName: `${TAG} Chesapeake Ospreys LLC`,
  contact: { name: "Jordan Reyes", role: "Team manager", email: mail("team"), phone: "(410) 555-0163" },
  league: "Chesapeake Amateur League",
  sport: "Basketball",
};
const ATHLETE = { first: "Avery", last: `Uat${RUN}`, email: mail("athlete") };
const ATHLETE_NAME = `${ATHLETE.first} ${ATHLETE.last}`;
const SPONSOR_A = { company: `${TAG} Harborview Bakery`, name: "Dana Brooks", email: mail("sponsor"), category: "Restaurant" };
const SPONSOR_B = { company: `${TAG} Fells Point Outfitters`, name: "Sam Ortiz", email: mail("sponsor2"), category: "Local retail" };

const MINUTE = 60_000;
const HUMAN_TIMEOUT_MS = Number(process.env.UAT_WAIT_MINUTES ?? 120) * MINUTE;

/* ───────────────────────────────────────────────────────── evidence ── */

const resumed = RESUME && existsSync(`${OUT}evidence.json`) ? JSON.parse(readFileSync(`${OUT}evidence.json`, "utf8")) : null;
if (RESUME && !resumed) {
  console.error(`FAIL — no evidence for run ${RESUME} to resume (${OUT}evidence.json)`);
  process.exit(1);
}
/* Resuming keeps every step that passed — and the people, items, hold and order they made — and runs the rest. */
const evidence = resumed
  ? { ...resumed, resumedAt: [...(resumed.resumedAt ?? []), new Date().toISOString()], failedAt: undefined, steps: resumed.steps }
  : { run: RUN, tag: TAG, web: WEB, api: API, startedAt: new Date().toISOString(), people: {}, ids: {}, steps: [] };
let current = null;
mkdirSync(OUT, { recursive: true });

/** Whether step `n` already passed in the run being resumed. */
const done = (n) => evidence.steps.some((s) => s.step === n && s.pass === true);

function begin(n, who, what, expected, criteria) {
  /* A step tried before keeps what it recorded (its data and screenshots); its outcome starts again. */
  const before = evidence.steps.find((s) => s.step === n);
  current = { step: n, who, what, expected, criteria, result: null, pass: null, data: before?.data ?? {}, shots: before?.shots ?? [] };
  evidence.steps = [...evidence.steps.filter((s) => s.step !== n), current];
  console.log(`\n── Step ${n} · ${who} · ${what}`);
}
function skip(n, what) {
  console.log(`\n── Step ${n} · ${what} — passed earlier in run ${RUN}, kept`);
}
function note(msg, data = {}) {
  console.log(`   · ${msg}`);
  Object.assign(current.data, data);
}
function pass(result) {
  current.result = result;
  current.pass = true;
  console.log(`   ✓ ${result}`);
  save();
}
function save() {
  evidence.updatedAt = new Date().toISOString();
  writeFileSync(`${OUT}evidence.json`, JSON.stringify(evidence, null, 2));
  const md = [
    `# Phase 2 UAT on staging · run ${RUN}`, "",
    `Simulated people who signed up through the normal pages (2S8-PMO-01). Web ${WEB}.`, "",
    "| Step | Who | What | Expected | Result | Criteria |", "| --- | --- | --- | --- | --- | --- |",
    ...[...evidence.steps].sort((x, y) => parseFloat(x.step) - parseFloat(y.step) || String(x.step).localeCompare(String(y.step))).map((s) => `| ${s.step} | ${s.who} | ${s.what} | ${s.expected} | ${s.pass === true ? "PASS — " : s.pass === false ? "FAIL — " : ""}${(s.result ?? "not finished").replace(/\|/g, "/")} | ${s.criteria} |`),
    ...(evidence.reviewNotes?.length ? ["", "## Reviewer notes", "", ...evidence.reviewNotes.map((n) => `- ${n}`)] : []),
    "", "## Ids", "", "```json", JSON.stringify({ people: evidence.people, ids: evidence.ids }, null, 2), "```", "",
  ].join("\n");
  writeFileSync(`${OUT}evidence.md`, md);
}
function fail(msg) {
  console.error(`\nFAIL — ${msg}`);
  if (current) { current.pass = false; current.result = msg; }
  evidence.failedAt = new Date().toISOString();
  try { save(); } catch { /* best effort */ }
  console.error(`Evidence so far: ${OUT}`);
  process.exit(1);
}
function check(ok, msg) { if (!ok) fail(msg); }
async function shot(page, name) {
  const file = `step${current.step}-${name}.png`;
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true }).catch(() => {});
  current.shots.push(file);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────────────────────────── staging's database (read) ── */

/**
 * A read-only query inside staging's api container. Query and parameters travel base64-encoded,
 * so no shell quoting can bend them, and the query runs in a READ ONLY transaction.
 */
function sql(text, params = []) {
  const js = `const {Client}=require("pg");const [q,p]=JSON.parse(Buffer.from(process.argv[2],"base64").toString());
const c=new Client({connectionString:process.env.DATABASE_URL});
(async()=>{await c.connect();await c.query("BEGIN READ ONLY");const r=await c.query(q,p);await c.query("ROLLBACK");
console.log("ROWS"+JSON.stringify(r.rows));await c.end()})().catch(e=>{console.log("ERR"+JSON.stringify(e.message))});`;
  const prog = Buffer.from(js).toString("base64");
  const args = Buffer.from(JSON.stringify([text, params])).toString("base64");
  const file = `/app/.uat-q-${process.pid}.cjs`;
  const out = execFileSync("railway", ["ssh", "--environment", "staging", "--service", "api", "--",
    `sh -c "cd /app && echo ${prog} | base64 -d > ${file} && node ${file} ${args}; rm -f ${file}"`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  const err = out.split("\n").find((l) => l.startsWith("ERR"));
  if (err) fail(`staging query failed: ${JSON.parse(err.slice(3))}\n  ${text}`);
  const line = out.split("\n").find((l) => l.startsWith("ROWS"));
  return line ? JSON.parse(line.slice(4)) : [];
}

/** Poll `fn` until it returns something truthy, or fail with `what`. */
async function until(what, fn, { timeoutMs = 3 * MINUTE, everyMs = 8_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) fail(`timed out waiting for ${what}`);
    await sleep(everyMs);
  }
}

/** The link in the newest queued email to `to` that carries `marker` — read from the outbox, nobody's inbox. */
async function emailLink(to, marker) {
  const url = await until(`an email to ${to} with a ${marker} link`, () => {
    const rows = sql(`select payload from "OutboxJob" where name = 'notify.email' and lower(payload->>'to') = lower($1)
      and payload::text like $2 order by "createdAt" desc limit 1`, [to, `%${marker}%`]);
    return Object.values(rows[0]?.payload?.data ?? {}).find((v) => typeof v === "string" && v.includes(marker));
  });
  const u = new URL(url);
  return `${WEB}${u.pathname}${u.search}`;
}

/* ─────────────────────────────────────────────────── people and the API ── */

async function clerk(method, path, body) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method, headers: { Authorization: `Bearer ${CLERK_KEY}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) fail(`Clerk ${method} ${path} answered ${r.status}: ${JSON.stringify(json?.errors?.[0]?.message ?? json)}`);
  return json;
}

/**
 * The person's Clerk identity. SponsorX never creates one: approval leaves a login waiting for this
 * address, and the first sign-in claims it — so a new person needs a Clerk user, made here as the
 * e2e suite does (a +clerk_test address on the test instance).
 */
async function clerkUser(email, first, last) {
  const found = await clerk("GET", `/users?email_address=${encodeURIComponent(email)}`);
  if (found?.length) return found[0].id;
  /* Clerk refuses digits in a name ("invalid last name"), and the athlete's surname carries the run tag. */
  const name = (s) => s.replace(/[^\p{L} '-]/gu, "").trim() || "Tester";
  const made = await clerk("POST", "/users", { email_address: [email], first_name: name(first), last_name: name(last), skip_password_requirement: true });
  return made.id;
}

/** Signed in on staging's own login page with a one-time ticket; `token()` is the page's current session token. */
async function signIn(browser, email, label, { first = "UAT", last = label } = {}) {
  const userId = await clerkUser(email, first, last);
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { token } = await clerk("POST", "/sign_in_tokens", { user_id: userId, expires_in_seconds: 600 });
    await page.goto(`${WEB}/login?__clerk_ticket=${encodeURIComponent(token)}`);
    const ok = await page.waitForFunction(() => Boolean(window.Clerk?.session), null, { timeout: 45_000 }).then(() => true, () => false);
    if (ok) {
      /* The page may be mid-navigation (Clerk not loaded yet): wait for its session before asking. */
      const tokenFn = async () => {
        await page.waitForFunction(() => Boolean(window.Clerk?.session), null, { timeout: 60_000 });
        return page.evaluate(async () => (await window.Clerk.session.getToken()) ?? "");
      };
      return { email, label, context, page, token: tokenFn };
    }
  }
  fail(`could not sign ${email} in at ${WEB}/login`);
}

async function api(who, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${await who.token()}`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, json, text };
}
async function apiOk(who, method, path, body, statuses = [200, 201]) {
  const r = await api(who, method, path, body);
  if (!statuses.includes(r.status)) fail(`${who.label}: ${method} ${path} answered ${r.status}: ${r.text.slice(0, 300)}`);
  return r.json;
}
const errText = (r) => `${r.status} ${r.json?.error?.message ?? r.text.slice(0, 160)}`;
const reasonCodes = (r) => (r.json?.error?.reasons ?? []).map((x) => (typeof x === "string" ? x : x.code));

/* ──────────────────────────────────────────────── the person in the loop ── */

/**
 * A Stripe step for the person, in their OWN browser — Stripe refuses one driven by a script. They
 * sign in as the test person (the address is put on the clipboard; the code is always 424242), do
 * the step, and the script notices on its own: `doneWhen` is polled against staging.
 */
async function personDoes(email, path, text, doneWhen) {
  const say = `In your own browser (a private window, ⌘⇧N): sign in at ${WEB}/login as ${email} — code 424242 — then open ${WEB}${path}. ${text}`;
  console.log(`\n   >>> YOUR TURN, in your own browser:\n       ${say}\n`);
  if (process.platform === "darwin") {
    try {
      execFileSync("pbcopy", { input: email });
      /* A notification with a sound, so the person notices without watching the terminal. */
      execFileSync("osascript", ["-e", `display notification ${JSON.stringify(`Sign in as ${email} (copied) · code 424242 · ${text}`.slice(0, 220))} with title "SponsorX UAT — your turn" sound name "Glass"`]);
    } catch { /* no notification is no reason to stop */ }
  }
  await until("the person's step", doneWhen, { timeoutMs: HUMAN_TIMEOUT_MS, everyMs: 10_000 });
}

/* ──────────────────────────────────────────────────────────── helpers ── */

/** A minimal one-page PDF, so every upload carries a real document. */
function pdf(name, title) {
  const text = `BT /F1 18 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name, mimeType: "application/pdf", buffer: Buffer.from(body) };
}

const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (n) => `${day(n)}T00:00:00.000Z`;
const money = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const orderRef = (id) => `SX-${id.slice(-8).toUpperCase()}`;

async function newPublicPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  return context.newPage();
}

/* ════════════════════════════════════════════════════════════ the run ══ */

async function main() {
  check(CLERK_KEY.startsWith("sk_test_"), "CLERK_SECRET_KEY is missing or not a test instance key (sk_test_). This run never touches production.");
  check(!/sponsorx\.net/.test(WEB + API), "this run is for staging only");
  console.log(`Phase 2 UAT · run ${RUN}\n  web ${WEB}\n  api ${API}\n  evidence ${OUT}`);

  const users = await clerk("GET", "/users/count");
  check((users?.total_count ?? 0) <= 94, `the Clerk test instance holds ${users?.total_count} of its 100 users — this run adds 4. Remove old test users first.`);

  const browser = await chromium.launch({ headless: HEADLESS });
  process.on("exit", () => { browser.close().catch(() => {}); });
  const admin = await signIn(browser, ADMIN, "BTG admin");
  const finance = await signIn(browser, FINANCE, "Finance");
  evidence.people = { team: TEAM.contact.email, athlete: ATHLETE.email, sponsor: SPONSOR_A.email, sponsor2: SPONSOR_B.email, billing: BILLING, admin: ADMIN, finance: FINANCE };

  /* ─────────────────────────────── Day 1 · everyone signs up ── */

  if (done(1)) skip(1, "the team signed up");
  else {
    begin(1, "Team", "Apply at /onboarding and click the email link", "Approved automatically, or held with a reason; sign-in works", "1");
    const page = await newPublicPage(browser);
    await page.goto(`${WEB}/onboarding`);
    await page.locator("input[name=orgType][value=TEAM]").check();
    await page.getByLabel("Organisation name").fill(TEAM.orgName);
    await page.getByRole("button", { name: "Start the application" }).click();
    await page.waitForURL(/\/onboarding\/[^/]+$/, { timeout: 60_000 });
    const resume = page.url();
    const next = () => page.getByRole("button", { name: /^(Save and continue|Continue|Accept and continue)$/ });

    await page.getByRole("heading", { name: "Organisation" }).waitFor();
    await page.getByLabel("State you operate in").selectOption("MD");
    await next().click();
    await page.getByRole("heading", { name: "Contacts" }).waitFor();
    await page.getByLabel("Full name").fill(TEAM.contact.name);
    await page.getByLabel("Role").fill(TEAM.contact.role);
    await page.getByLabel("Email").fill(TEAM.contact.email);
    await page.getByLabel("Phone (optional)").fill(TEAM.contact.phone);
    await next().click();
    await page.getByRole("heading", { name: "Team details" }).waitFor();
    await page.getByLabel("Legal entity name").fill(TEAM.legalEntityName);
    await page.getByLabel("League").fill(TEAM.league);
    await page.getByLabel("Sport", { exact: true }).fill(TEAM.sport);
    await next().click();
    await page.getByRole("heading", { name: "How you get paid" }).waitFor();
    await page.getByRole("checkbox").check();
    await next().click();
    await page.getByRole("heading", { name: "Documents" }).waitFor();
    const labels = await page.locator('ul[aria-label="Required documents"] input[type=file]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    check(labels.length > 0, "the onboarding asked for no documents");
    for (const [i, label] of labels.entries()) {
      const name = `team-document-${i + 1}.pdf`;
      await page.locator(`input[type=file][aria-label="${label}"]`).setInputFiles(pdf(name, `${TEAM.orgName} ${label}`));
      await page.getByText(`${name} · received`).waitFor({ timeout: 60_000 });
    }
    note(`uploaded ${labels.length} documents to the private bucket`, { documents: labels });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Property terms" }).waitFor();
    await page.getByRole("checkbox").check();
    await next().click();
    await page.getByRole("heading", { name: "Review & submit" }).waitFor();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByText("Almost there").waitFor({ timeout: 60_000 });

    await page.goto(await emailLink(TEAM.contact.email, "/onboarding/confirm?t="));
    note("opened the contact's email link");
    const onboardingRow = () => sql(`select id, state, "autoApproved", "propertyId", "reviewReasons" from "PropertyOnboarding" where "orgName" = $1`, [TEAM.orgName])[0];
    /* Submitted, it waits in PENDING_REVIEW for the email link; approved a moment after it — or held with its reasons. */
    const deadline = Date.now() + 3 * MINUTE;
    let row = onboardingRow();
    while (row?.state !== "APPROVED" && Date.now() < deadline) {
      await sleep(8_000);
      row = onboardingRow();
    }
    await page.goto(resume);
    await shot(page, "onboarding-outcome");
    check(row.state === "APPROVED" && row.propertyId, `the team was not approved: ${row.state}, reasons ${JSON.stringify(row.reviewReasons)}`);
    evidence.ids.onboardingId = row.id;
    evidence.ids.propertyId = row.propertyId;
    await page.context().close();
    pass(`approved ${row.autoApproved ? "automatically" : "by BTG"}; property ${row.propertyId}`);
  }

  if (done(2)) skip(2, "the organisation is on BTG's desk");
  else {
    begin(2, "BTG admin", "Open the new organisation on the sign-ups desk", "It is there with its checks; Reject and Reinstate are available", "1");
    await admin.page.goto(`${WEB}/admin/onboarding/${evidence.ids.onboardingId}`);
    await admin.page.getByText(TEAM.orgName).first().waitFor({ timeout: 60_000 });
    await shot(admin.page, "admin-desk");
    const reject = await admin.page.getByRole("button", { name: /Reject/ }).count();
    pass(`the organisation is on BTG's desk${reject ? ", with Reject offered" : ""}`);
  }

  if (done(3)) skip(3, "the athlete signed up");
  else {
    begin(3, "Athlete", "Apply at /join with a government ID and click the email link", "Approved and active with no BTG step", "1");
    const page = await newPublicPage(browser);
    await page.goto(`${WEB}/join`);
    await page.getByRole("button", { name: "Start application" }).click();
    const save = page.getByRole("button", { name: "Save and continue" });
    const section = async (heading, fields) => {
      await page.getByRole("heading", { level: 1, name: heading }).waitFor({ timeout: 30_000 });
      for (const [name, value] of fields) await page.locator(`input[name="${name}"]`).fill(value);
      await save.click();
    };
    await section("Who you are", [["firstName", ATHLETE.first], ["lastName", ATHLETE.last], ["dob", "2003-06-21"], ["email", ATHLETE.email], ["phone", "(410) 555-0188"]]);
    await section("Your sport", [["sport", TEAM.sport], ["position", "Forward"], ["level", "Club"], ["team", TEAM.orgName]]);
    await section("Where you are", [["city", "Baltimore"], ["region", "MD"], ["country", "USA"]]);
    await section("Your channels", [["instagram", `@avery.uat${RUN}`], ["followers", "6,200"]]);
    await section("What you can make", [["formats", "Reels, photo posts, in-person appearances"], ["turnaround", "3–5 days"]]);
    await section("Brands you'd work with", [["categories", "Bakeries, local businesses, sportswear"]]);
    await section("Restrictions and conflicts", []);
    await section("Payment recipient", [["recipient", ATHLETE_NAME]]);
    await page.getByRole("heading", { level: 1, name: "The agreement" }).waitFor();
    await page.getByText(/I have read and accept the Content Collaboration Agreement/).click();
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.getByRole("heading", { name: "Application submitted" }).waitFor({ timeout: 60_000 });
    await page.getByText("A driver’s license, passport or state ID.").waitFor({ timeout: 60_000 });
    await page.locator("input[type=file]").setInputFiles(pdf("athlete-id.pdf", `${ATHLETE_NAME} driver licence`));
    await page.getByText("A driver’s license, passport or state ID.").waitFor({ state: "hidden", timeout: 60_000 });
    note("uploaded the government ID");
    await page.goto(await emailLink(ATHLETE.email, "/join/confirm"));
    await page.getByText("You’re approved").first().waitFor({ timeout: 60_000 }).catch(() => {});
    await shot(page, "athlete-approved");
    const [row] = sql(`select id, state, "autoApproved" from "Athlete" where lower(email) = lower($1)`, [ATHLETE.email]);
    check(row?.state === "ACTIVE", `the athlete is ${row?.state ?? "missing"}, not ACTIVE`);
    evidence.ids.athleteId = row.id;
    await page.context().close();
    pass(`approved and ACTIVE ${row.autoApproved ? "automatically" : "after BTG"}; athlete ${row.id}`);
  }

  const sponsorUp = async (s) => {
    const page = await newPublicPage(browser);
    await page.goto(`${WEB}/brief`);
    await page.getByRole("radio", { name: "Foot traffic" }).click();
    await page.locator('button[name="businessType"]').click();
    await page.getByRole("option", { name: s.category, exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("radio", { name: /^\$1.3k$/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('input[name="market"]').fill("Baltimore, MD");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('input[name="company"]').fill(s.company);
    await page.locator('input[name="name"]').fill(s.name);
    await page.locator('input[name="email"]').fill(s.email);
    await page.getByRole("button", { name: "Send to BTG" }).click();
    await page.getByRole("heading", { name: "Brief received" }).waitFor({ timeout: 60_000 });
    await page.locator('input[type="file"][name="proof"]').setInputFiles(pdf("business-licence.pdf", `${s.company} business licence`));
    await page.getByText("Proof of business received.").waitFor({ timeout: 60_000 });
    await page.goto(await emailLink(s.email, "/sponsor-request/confirm?t="));
    await page.getByRole("heading", { name: "Email confirmed" }).waitFor({ timeout: 60_000 });
    const row = await until(`${s.company}'s account to open`, () => sql(`select id, categories from "Sponsor" where name = $1`, [s.company])[0]);
    await page.reload();
    await shot(page, s === SPONSOR_A ? "sponsor-a-open" : "sponsor-b-open");
    await page.context().close();
    check(Array.isArray(row.categories) && row.categories.length > 0, `${s.company} opened with no brand category — it could buy nothing`);
    return row;
  };
  if (done(5)) skip(5, "both sponsors signed up");
  else {
    begin(5, "Sponsors", "Fill in the sponsor request (/brief), upload proof, confirm email — twice", "Each sponsor account opens automatically", "—");
    const a = await sponsorUp(SPONSOR_A);
    const b = await sponsorUp(SPONSOR_B);
    evidence.ids.sponsorA = a.id;
    evidence.ids.sponsorB = b.id;
    note(`sponsor A ${a.id} (${a.categories}), sponsor B ${b.id} (${b.categories})`);
    pass("both sponsor accounts opened automatically");
  }

  // Everyone signs in for the first time — the login waiting for each address is claimed.
  const team = await signIn(browser, TEAM.contact.email, "Team", { first: "Jordan", last: "Reyes" });
  const athlete = await signIn(browser, ATHLETE.email, "Athlete", { first: ATHLETE.first, last: ATHLETE.last });
  const sponsorA = await signIn(browser, SPONSOR_A.email, "Sponsor A", { first: "Dana", last: "Brooks" });
  const sponsorB = await signIn(browser, SPONSOR_B.email, "Sponsor B", { first: "Sam", last: "Ortiz" });

  if (done(4)) skip(4, "the athlete joined the team");
  else {
    begin(4, "Team, athlete", "Team invites the athlete at a 20% share; athlete accepts", "Athlete is on the roster at that share", "9");
    await team.page.goto(`${WEB}/property/roster`);
    await team.page.getByRole("button", { name: "Invite an athlete already on SponsorX" }).click();
    await team.page.getByLabel(/Athlete.s name/).fill(ATHLETE_NAME);
    await team.page.getByLabel("Team share %").fill("20");
    await team.page.getByRole("button", { name: "Search" }).click();
    await team.page.getByRole("button", { name: new RegExp(`^Invite ${ATHLETE.first}`) }).click();
    await team.page.getByText(/is invited at 20%/).waitFor({ timeout: 30_000 });
    await athlete.page.goto(`${WEB}/athlete/team`);
    await athlete.page.getByRole("button", { name: /^Accept and join/ }).click();
    await athlete.page.getByRole("button", { name: "Leave team" }).waitFor({ timeout: 30_000 });
    await shot(athlete.page, "athlete-joined");
    const [r] = sql(`select "propertyId", "teamShareBps" from "Athlete" where id = $1`, [evidence.ids.athleteId]);
    check(r.propertyId === evidence.ids.propertyId && r.teamShareBps === 2000, `roster is ${JSON.stringify(r)}`);
    pass("the athlete is on the team's roster at 20%");
  }

  begin(6, "Team, athlete", "Set up payouts on Stripe; try Request payout before it is READY", "Refused with the reason until READY, then READY", "10");
  const payoutSetup = async (who, path) => {
    const account = async () => (await apiOk(who, "GET", "/payouts/me"))?.account;
    const already = await account();
    if (already?.status === "READY") {
      /* Resumed: set up earlier in this run; its refusal before set-up is in this step's data already. */
      note(`${who.label}'s payout account was already READY`, { [`${who.label} account`]: already });
    } else {
      const early = await api(who, "POST", "/payouts");
      check(early.status === 409 && /payout account/i.test(early.text), `${who.label}'s early payout request answered ${errText(early)}`);
      note(`${who.label} asked for a payout before set-up: refused — "${early.json?.error?.message}"`, { [`${who.label} early request`]: errText(early) });
      await personDoes(who.email, path,
        `Click "Set up payouts with Stripe". On Stripe: "Use test phone number"; test values only (date of birth 01/01/1901, SSN 0000, address line address_full_match); bank "Test (Non-OAuth)" then the ••••6789 account, "Finish without saving"; Agree and submit.`,
        async () => (await account())?.status === "READY");
    }
    await who.page.goto(`${WEB}${path}`);
    await shot(who.page, `${who.label.toLowerCase().replace(/\W+/g, "-")}-payouts-ready`);
    note(`${who.label}'s payout account is READY`, { [`${who.label} account`]: await account() });
  };
  await payoutSetup(athlete, "/athlete/money");
  await payoutSetup(team, "/property/earnings");
  pass("both refused before set-up, then READY from Stripe's webhook");

  /* ─────────────────────────────── Day 2 · list, search, buy, pay ── */

  const CLINIC = { title: `${TAG} youth basketball clinic`, price: "500.00", quantity: "4" };
  if (done(7)) skip(7, "the listing was held for a restricted word, then went live");
  else {
    begin(7, "Athlete, team", "Athlete adds an item; team lists it once with a restricted word, then clean", "First held for BTG with the word named; the clean one goes live", "2");
    await athlete.page.goto(`${WEB}/athlete/inventory`);
    const form = athlete.page.getByRole("form", { name: "New inventory item" });
    await form.waitFor();
    await athlete.page.locator("#inv-title").fill(CLINIC.title);
    await athlete.page.locator("#inv-kind").selectOption("CAMP");
    await athlete.page.locator("#inv-price").fill(CLINIC.price);
    await athlete.page.locator("#inv-qty").fill(CLINIC.quantity);
    await athlete.page.locator("#inv-from").fill(day(5));
    await athlete.page.locator("#inv-until").fill(day(90));
    await form.getByRole("button", { name: "Add item" }).click();
    await athlete.page.waitForURL(/\/athlete\/inventory\/[^/]+$/, { timeout: 30_000 });
    const [item] = sql(`select id from "InventoryItem" where "athleteId" = $1 and title = $2`, [evidence.ids.athleteId, CLINIC.title]);
    evidence.ids.itemA = item.id;
    note(`athlete added "${CLINIC.title}"`);

    await team.page.goto(`${WEB}/property/listings/new`);
    await team.page.locator("li").filter({ hasText: CLINIC.title }).getByRole("link", { name: "List this" }).click();
    await team.page.waitForURL(/\/property\/listings\/new\?item=/);
    const what = team.page.getByLabel("What the sponsor gets");
    await what.fill("A 90-minute youth clinic at our home gym, followed by a casino night for the parents. Your bakery is named at the session.");
    await team.page.getByRole("button", { name: "Create draft listing" }).click();
    await team.page.waitForURL(/\/property\/listings\/(?!new)[^/?]+$/, { timeout: 30_000 });
    const listingId = new URL(team.page.url()).pathname.split("/").pop();
    evidence.ids.listingA = listingId;
    await team.page.getByRole("button", { name: "Submit", exact: true }).click();
    await team.page.getByText(/BTG is taking a look/).first().waitFor({ timeout: 30_000 });
    await shot(team.page, "listing-held");
    const [held] = sql(`select state, "heldWords" from "Listing" where id = $1`, [listingId]);
    check(held.state === "PENDING_APPROVAL" && held.heldWords.includes("casino"), `the listing with "casino" is ${held.state} ${JSON.stringify(held.heldWords)}`);
    note(`held for BTG, words named: ${held.heldWords.join(", ")}`, { held });

    await what.fill("A 90-minute youth basketball clinic at our home gym. Your bakery is named at the session and on the clinic banner.");
    await team.page.getByRole("button", { name: /Save and submit again/ }).click();
    await team.page.getByText("Live ✓").first().waitFor({ timeout: 30_000 });
    await shot(team.page, "listing-live");
    const [live] = sql(`select state, "publishedAutomatically" from "Listing" where id = $1`, [listingId]);
    check(live.state === "PUBLISHED", `the clean listing is ${live.state}`);
    pass("held with \"casino\" named; once edited, published automatically");
  }

  // The other items the steps below need, set up by the same people through the API the pages call.
  if (!evidence.ids.listingE) {
    const item = async (title, extra) => (await apiOk(athlete, "POST", "/inventory", {
      title: `${TAG} ${title}`, description: `${title} — a UAT test item.`, kind: "APPEARANCE", priceCents: 30_000,
      availableFrom: at(5), availableUntil: at(90), ...extra,
    })).id;
    const list = async (itemId, title, description) => {
      const l = await apiOk(team, "POST", "/listings", { inventoryItemId: itemId, title: `${TAG} ${title}`, description, visibility: "PUBLIC" });
      const s = await apiOk(team, "POST", `/listings/${l.id}/submit`);
      return { id: l.id, state: s.state };
    };
    evidence.ids.itemB = await item("signed jersey meet-and-greet (one only)", { quantity: 1 });
    evidence.ids.itemC = await item("halftime appearance (exclusive)", { packageRules: { exclusive: true } });
    evidence.ids.itemD = await item("clinic banner (no restaurants)", { restrictedCategories: ["RESTAURANT"] });
    evidence.ids.itemE = await item("poker night appearance", {});
    const lb = await list(evidence.ids.itemB, "Signed jersey meet-and-greet", "One signed jersey and a 20-minute meet-and-greet with the athlete.");
    const lc = await list(evidence.ids.itemC, "Halftime appearance — exclusive", "The athlete appears at halftime for one sponsor only on the chosen dates.");
    const ld = await list(evidence.ids.itemD, "Clinic banner", "Your banner at the clinic all season. The team's league rule: no restaurants.");
    const le = await list(evidence.ids.itemE, "Poker night appearance", "The athlete hosts a poker night table for your guests, two hours.");
    Object.assign(evidence.ids, { listingB: lb.id, listingC: lc.id, listingD: ld.id, listingE: le.id });
    check(lb.state === "PUBLISHED" && lc.state === "PUBLISHED" && ld.state === "PUBLISHED", `set-up listings: B ${lb.state}, C ${lc.state}, D ${ld.state}`);
    check(le.state === "PENDING_APPROVAL", `the "poker" listing should be held, is ${le.state}`);
    console.log("   · set up: B (one unit), C (exclusive), D (won't sell to restaurants), E (held: \"poker\")");
  }

  if (done(8)) skip(8, "the search showed only what sponsor A may buy");
  else {
    begin(8, "Sponsor A", "Search the marketplace", "Sees the team's live listing; not held listings or those its category is barred from", "3");
    const search = await apiOk(sponsorA, "GET", "/marketplace/search");
    const listings = Array.isArray(search) ? search : (search?.listings ?? search?.results ?? []);
    const ids = new Set(listings.map((l) => l.id));
    note(`search returned ${listings.length} listings`, { seen: { A: ids.has(evidence.ids.listingA), B: ids.has(evidence.ids.listingB), C: ids.has(evidence.ids.listingC), D: ids.has(evidence.ids.listingD), E: ids.has(evidence.ids.listingE) } });
    check(ids.has(evidence.ids.listingA), "sponsor A does not see the team's live clinic");
    check(!ids.has(evidence.ids.listingE), "sponsor A sees the held listing E");
    check(!ids.has(evidence.ids.listingD), "sponsor A (a restaurant) sees listing D, which won't sell to restaurants");
    await sponsorA.page.goto(`${WEB}/sponsor/shop`);
    await shot(sponsorA.page, "shop");
    pass("live clinic shown; the held listing and the one barring restaurants are not");
  }

  let hold = evidence.ids.holdB ? { id: evidence.ids.holdB } : undefined;
  if (done(9) && done(10)) skip("9–10", "the hold, the exclusive date and the barred category");
  else {
  begin(9, "Sponsor B, sponsor A", "B holds the last unit and an exclusive date; A tries the same; the hold expires after 15 minutes", "A refused while held; the stock comes back when the hold expires", "4");
  {
    await apiOk(sponsorB, "POST", "/cart");
    await apiOk(sponsorB, "POST", "/cart/lines", { listingId: evidence.ids.listingB, quantity: 1, startsOn: at(12), endsOn: at(12) });
    await apiOk(sponsorB, "POST", "/cart/lines", { listingId: evidence.ids.listingC, quantity: 1, startsOn: at(20), endsOn: at(22) });
    hold = await apiOk(sponsorB, "POST", "/cart/reserve", undefined, [201]);
    evidence.ids.holdB = hold.id;
    note(`sponsor B holds B and C until ${hold.expiresAt}`, { hold: { id: hold.id, expiresAt: hold.expiresAt } });
    await apiOk(sponsorA, "POST", "/cart");
    const lastUnit = await api(sponsorA, "POST", "/cart/lines", { listingId: evidence.ids.listingB, quantity: 1, startsOn: at(12), endsOn: at(12) });
    check(lastUnit.status === 409 && /0 left of 1/.test(lastUnit.text), `A's try at the held last unit answered ${errText(lastUnit)}`);
    note(`A's try at the last unit: refused — "${lastUnit.json?.error?.message}"`, { lastUnit: errText(lastUnit) });
  }

  begin(10, "Sponsor A", "Try an exclusive item on overlapping dates, and an item barred to its category", "Refused with the reason", "5");
  {
    const overlap = await api(sponsorA, "POST", "/cart/lines", { listingId: evidence.ids.listingC, quantity: 1, startsOn: at(21), endsOn: at(23) });
    check(overlap.status === 409 && reasonCodes(overlap).includes("DATE_OVERLAP"), `the overlapping exclusive answered ${errText(overlap)} ${JSON.stringify(reasonCodes(overlap))}`);
    const barred = await api(sponsorA, "POST", "/cart/lines", { listingId: evidence.ids.listingD, quantity: 1, startsOn: at(15), endsOn: at(15) });
    check(barred.status >= 400 && barred.status < 500, `the barred category answered ${errText(barred)}`);
    note(`exclusive overlap: "${overlap.json?.error?.message}"; barred category: ${errText(barred)}`, { overlap: errText(overlap), overlapReasons: reasonCodes(overlap), barred: errText(barred), barredReasons: reasonCodes(barred) });
    pass("both refused with the reason");
  }

  current = evidence.steps.find((s) => s.step === 9);
  {
    const wait = new Date(hold.expiresAt).getTime() - Date.now() + 20_000;
    console.log(`\n   · waiting ${Math.ceil(wait / MINUTE)} minutes for sponsor B's hold to expire…`);
    await sleep(Math.max(0, wait));
    const r = await apiOk(sponsorB, "GET", `/reservations/${hold.id}`);
    check(r.state === "EXPIRED", `B's hold is ${r.state} after its expiry`);
    const back = await api(sponsorA, "POST", "/cart/lines", { listingId: evidence.ids.listingB, quantity: 1, startsOn: at(12), endsOn: at(12) });
    check([200, 201].includes(back.status), `after the hold expired, A's add of the last unit answered ${errText(back)}`);
    note("B's hold EXPIRED; A carted the last unit, which came back");
    pass("refused while held; released on expiry and bought by A");
  }
  }

  let orderId = evidence.ids.orderId;
  if (done(11)) skip(11, `${evidence.ids.orderRef} was placed, paid on Stripe and its receipt delivered`);
  else {
    begin(11, "Sponsor A", "Accept the order terms, place the order, pay: card 0002, then 0077", "Approved within the spending limit; decline shown; then Paid ✓; receipt reaches the billing contact", "6, 7");
    await apiOk(sponsorA, "POST", "/cart/lines", { listingId: evidence.ids.listingA, quantity: 1, startsOn: at(10), endsOn: at(10) });
    const p = sponsorA.page;
    await p.goto(`${WEB}/sponsor/cart`);
    await p.getByRole("button", { name: "Reserve & check out" }).click();
    await p.waitForURL(/\/sponsor\/checkout\?reservation=/, { timeout: 30_000 });
    const billing = p.locator("section[aria-labelledby=checkout-billing]");
    await billing.getByLabel("Name").fill(SPONSOR_A.name);
    await billing.getByLabel("Email").fill(BILLING);
    await billing.getByLabel(/PO number or your reference/).fill(`UAT-${RUN}`);
    await p.locator("section[aria-labelledby=checkout-terms]").getByRole("checkbox").check();
    await p.getByRole("button", { name: "Place order" }).click();
    await p.waitForURL(/\/sponsor\/orders\/[^/?]+/, { timeout: 60_000 });
    orderId = new URL(p.url()).pathname.split("/").pop();
    evidence.ids.orderId = orderId;
    evidence.ids.orderRef = orderRef(orderId);
    const [o] = sql(`select state, "totalCents", "requiresApproval" from "MarketplaceOrder" where id = $1`, [orderId]);
    check(o.state === "AWAITING_PAYMENT" && !o.requiresApproval, `order ${orderRef(orderId)} is ${o.state}`);
    note(`order ${orderRef(orderId)} placed for ${money(o.totalCents)}, approved automatically`, { order: o });

    await p.getByRole("button", { name: /^Pay \$[\d,.]+ by card/ }).waitFor({ timeout: 30_000 });
    await shot(p, "order-awaiting-payment");
    const paidRow = () => {
      const [r] = sql(`select state, "paymentReference", "paidVia" from "MarketplaceOrder" where id = $1`, [orderId]);
      return r?.state === "PAID" ? r : null;
    };
    await personDoes(SPONSOR_A.email, `/sponsor/orders/${orderId}`,
      `Click "Pay … by card". On Stripe's page: FIRST card 4000 0000 0000 0002 (any future date, any CVC, any ZIP) — it is declined. THEN card 4000 0000 0000 0077 — it pays.`,
      paidRow);
    const paid = await until(`${orderRef(orderId)} to be PAID (from Stripe's webhook)`, paidRow);
    await p.goto(`${WEB}/sponsor/orders/${orderId}`);
    await p.getByText(/Paid ✓/).first().waitFor({ timeout: 30_000 });
    await shot(p, "order-paid");
    evidence.ids.paymentIntent = paid.paymentReference;
    const attempts = sql(`select state, "providerRef" from "PaymentAttempt" where "orderId" = $1 order by "createdAt"`, [orderId]);
    const declines = sql(`select type, status from "PaymentEvent" where payload::text like $1 order by "receivedAt"`, [`%${orderId}%`]).filter((e) => /fail|declin/i.test(e.type ?? ""));
    note(`paid by card, PaymentIntent ${paid.paymentReference}`, { attempts, declineEvents: declines });
    const receipt = await until("the receipt to the billing contact to be sent", () => {
      const jobs = sql(`select state, data->>'to' as to from pgboss.job where name = 'notify.email' and data->>'template' = 'payment.received' and data->'data'->>'orderRef' = $1`, [orderRef(orderId)]);
      return jobs.find((j) => j.to === BILLING && j.state === "completed");
    }, { timeoutMs: 5 * MINUTE, everyMs: 10_000 });
    note(`receipt sent to ${receipt.to} (accepted by Resend)`);
    pass(`${orderRef(orderId)} approved automatically and paid on Stripe; receipt delivered to the billing contact`);
  }

  if (done(12)) skip(12, "the order reached Zoho");
  else {
    begin(12, "BTG admin", "Find the order in Zoho CRM sandbox SponsorX-Dev", "Sponsor Account and Contact, team's Partner Account and manager Contact, linked Deal", "13");
    const z = await until("the Zoho ids to be written back", () => {
      const [r] = sql(`select s."zohoAccountId" as "sponsorAccount",
          (select c."zohoContactId" from "SponsorContact" c where c."sponsorId" = s.id and c."zohoContactId" is not null order by c."createdAt" limit 1) as "sponsorContact",
          (select c.id from "SponsorContact" c where c."sponsorId" = s.id order by c."createdAt" limit 1) as "sponsorContactSponsorxId",
          p."zohoId" as "teamAccount", p."zohoContactId" as "teamContact", o."zohoDealId" as deal
        from "MarketplaceOrder" o join "Sponsor" s on s.id = o."sponsorId", "Property" p
        where o.id = $1 and p.id = $2`, [orderId, evidence.ids.propertyId]);
      return r && r.sponsorAccount && r.sponsorContact && r.teamAccount && r.teamContact && r.deal ? r : null;
    }, { timeoutMs: 6 * MINUTE, everyMs: 15_000 });
    evidence.ids.zoho = { ...z, dealSponsorxId: `mkt-order:${orderId}`, teamSponsorxId: `property:${evidence.ids.propertyId}`, sponsorSponsorxId: evidence.ids.sponsorA };
    note("Zoho returned ids for all five records", { zoho: evidence.ids.zoho });
    pass("pushed to Zoho — the records are checked in the SponsorX-Dev sandbox by id (see evidence.ids.zoho)");
  }

  if (done(13)) skip(13, "the split held when a commission rule was edited");
  else {
    begin(13, "BTG admin", "Edit a commission rule, then reopen the order's split", "The order's split is unchanged; only new orders use the new rule", "8");
    const before = await apiOk(admin, "GET", `/marketplace-orders/${orderId}/financials`);
    const rules = await apiOk(admin, "GET", "/commission-rules?current=true");
    const list = Array.isArray(rules) ? rules : (rules?.rules ?? []);
    const fee = list.find((r) => r.kind === "PLATFORM_FEE" && r.scope === "GLOBAL");
    check(fee, "staging has no global platform-fee rule");
    const revised = await apiOk(admin, "POST", `/commission-rules/${fee.id}/revise`, { bps: fee.bps + 100, note: `UAT ${RUN}: +1% to prove snapshots hold` }, [200, 201]);
    let after;
    try {
      after = await apiOk(admin, "GET", `/marketplace-orders/${orderId}/financials`);
    } finally {
      await apiOk(admin, "POST", `/commission-rules/${revised.id}/revise`, { bps: fee.bps, note: `UAT ${RUN}: restored` }, [200, 201]);
    }
    const strip = (f) => JSON.stringify((f?.lines ?? []).map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== "computedAt" && k !== "rules"))));
    check(strip(before) === strip(after), "the order's split changed when the rule was edited");
    note(`platform fee ${fee.bps} → ${fee.bps + 100} bps and back; the split did not move`, { split: before.lines });
    pass("the split frozen at contract time did not change; the rule was restored");
  }

  /* ─────────────────────── Day 3 · deliver, get paid, reconcile, cross tenants ── */

  begin(14, "Athlete, sponsor A", "Athlete marks delivered; sponsor confirms", "Earnings show for the athlete and the team", "9");
  {
    const early = await api(athlete, "POST", "/payouts");
    check(early.status === 409, `the athlete's payout request before the sponsor confirmed answered ${errText(early)}`);
    evidence.steps = evidence.steps.filter((s) => s.step !== "15a");
    evidence.steps.push({ step: "15a", who: "Athlete", what: "Request payout before the sponsor confirms", expected: "Refused", criteria: "10", pass: true, result: `refused — "${early.json?.error?.message}"`, data: {}, shots: [] });
    note(`payout before delivery: refused — "${early.json?.error?.message}"`);

    await athlete.page.goto(`${WEB}/athlete/sales`);
    await athlete.page.goto(`${WEB}${await athlete.page.locator('a[href*="/athlete/sales/"]').first().getAttribute("href")}`);
    for (let i = 0; i < 4; i += 1) {
      /* A line already marked keeps its button, disabled ("Already marked delivered"): take the next active one. */
      const mark = athlete.page.locator("button:not([disabled])", { hasText: /^Mark delivered$/ }).first();
      if (!(await mark.isVisible().catch(() => false))) break;
      await mark.click();
      const dialog = athlete.page.getByRole("dialog");
      await dialog.locator("#mk-note").fill("Held as agreed — the sponsor's banner up and the name read out at the session.");
      await dialog.getByRole("button", { name: "Mark delivered" }).click();
      await dialog.waitFor({ state: "hidden", timeout: 30_000 });
      await athlete.page.reload();
    }
    await shot(athlete.page, "delivered");
    const states = () => sql(`select d.state from "OrderLineDelivery" d join "MarketplaceOrderLine" l on l.id = d."lineId" where l."orderId" = $1`, [orderId]).map((r) => r.state);
    await until("every line marked delivered", () => states().every((s) => s === "DELIVERED" || s === "CONFIRMED"));

    await sponsorA.page.goto(`${WEB}/sponsor/orders/${orderId}`);
    for (let i = 0; i < 4; i += 1) {
      const confirm = sponsorA.page.locator("button:not([disabled])", { hasText: /^Confirm delivered$/ }).first();
      if (!(await confirm.isVisible().catch(() => false))) break;
      await confirm.click();
      await sleep(3_000);
      await sponsorA.page.reload();
    }
    await until("every line confirmed by the sponsor", () => states().every((s) => s === "CONFIRMED"));
    await shot(sponsorA.page, "confirmed");
    const me = await apiOk(athlete, "GET", "/payouts/me");
    const teamMe = await apiOk(team, "GET", "/payouts/me");
    note(`athlete can request ${money(me.totals.requestableCents)}, team ${money(teamMe.totals.requestableCents)}`, { athleteTotals: me.totals, teamTotals: teamMe.totals });
    check(me.totals.requestableCents > 0 && teamMe.totals.requestableCents > 0, "no earnings are requestable after the sponsor confirmed");
    pass("delivered and confirmed; both have earnings to request");
  }

  begin(15, "Athlete, team", "Request payout after the sponsor confirms", "Approved automatically (under $2,000), sent by Stripe transfer, Paid", "10");
  {
    const request = async (who, path) => {
      await who.page.goto(`${WEB}${path}`);
      const ask = who.page.getByRole("button", { name: /^Request payout/ });
      await ask.waitFor({ timeout: 30_000 });
      await ask.click();
      const dialog = who.page.getByRole("dialog");
      await dialog.getByRole("button", { name: /^Request \$/ }).click();
      await dialog.waitFor({ state: "hidden", timeout: 30_000 });
    };
    await request(athlete, "/athlete/money");
    await request(team, "/property/earnings");
    const paidOut = await until("both payouts PAID with a Stripe transfer", () => {
      const rows = sql(`select "payeeType", state, "amountCents", "approvedAutomatically", "providerRef", "failureReason" from "Payout"
        where ("payeeType" = 'ATHLETE' and "payeeId" = $1) or ("payeeType" = 'PROPERTY' and "payeeId" = $2) order by "requestedAt"`,
      [evidence.ids.athleteId, evidence.ids.propertyId]);
      const failed = rows.find((r) => r.state === "FAILED");
      if (failed) fail(`a payout FAILED: ${failed.failureReason}`);
      return rows.length >= 2 && rows.every((r) => r.state === "PAID" && /^tr_/.test(r.providerRef ?? "")) ? rows : null;
    }, { timeoutMs: 8 * MINUTE, everyMs: 15_000 });
    evidence.ids.transfers = paidOut.map((r) => ({ payee: r.payeeType, amount: money(r.amountCents), transfer: r.providerRef, auto: r.approvedAutomatically }));
    await athlete.page.goto(`${WEB}/athlete/money`);
    await shot(athlete.page, "athlete-paid");
    note("both paid", { payouts: evidence.ids.transfers });
    check(paidOut.every((r) => r.approvedAutomatically), "a payout needed BTG's approval");
    pass(`approved automatically and paid by Stripe transfer: ${evidence.ids.transfers.map((t) => `${t.payee} ${t.amount} ${t.transfer}`).join("; ")}`);
  }

  begin(16, "Team, Finance", "Team opens its Earnings page; compared with the ledger and the order's split", "Booked, paid, reserve and balance match the ledger to the cent", "12");
  {
    const ledger = await apiOk(team, "GET", "/team/ledger");
    await team.page.goto(`${WEB}/property/earnings`);
    await team.page.getByText(/Reconciles|Doesn.t reconcile/).first().waitFor({ timeout: 30_000 });
    await shot(team.page, "team-earnings");
    const pageText = await team.page.locator("main").innerText();
    const fin = await apiOk(finance, "GET", `/marketplace-orders/${orderId}/financials`);
    const teamShare = (fin.lines ?? []).reduce((n, l) => n + (l.teamAvailableCents ?? 0) + (l.teamReserveCents ?? 0), 0);
    note("team ledger", { ledger, teamShareFromSplit: teamShare });
    check(ledger.reconciles === true, "the team's ledger does not reconcile");
    check(ledger.bookedRevenueCents === teamShare, `booked ${ledger.bookedRevenueCents} ≠ the team's share in the order's split ${teamShare}`);
    for (const c of [ledger.bookedRevenueCents, ledger.paidEarningsCents, ledger.ledgerBalanceCents]) {
      check(pageText.includes(money(c)), `the Earnings page does not show ${money(c)}`);
    }
    check(/Reconciles/.test(pageText) && !/Doesn.t reconcile/.test(pageText), "the Earnings page does not say it reconciles");
    pass(`booked ${money(ledger.bookedRevenueCents)} = the split's team share; paid ${money(ledger.paidEarningsCents)}; reserve ${money(ledger.pendingEarnings.reservedCents)}; balance ${money(ledger.ledgerBalanceCents)}; page and ledger agree`);
  }

  begin(17, "Each person", "Open another tenant's or another person's order, hold, listing and payout", "Refused every time", "14");
  {
    const [teamPayout] = sql(`select id from "Payout" where "payeeType" = 'PROPERTY' and "payeeId" = $1 limit 1`, [evidence.ids.propertyId]);
    const [athletePayout] = sql(`select id from "Payout" where "payeeType" = 'ATHLETE' and "payeeId" = $1 limit 1`, [evidence.ids.athleteId]);
    const [otherListing] = sql(`select id from "Listing" where "propertyId" is not null and "propertyId" <> $1 order by "createdAt" desc limit 1`, [evidence.ids.propertyId]);
    const [otherPayout] = sql(`select id from "Payout" where "payeeType" = 'PROPERTY' and "payeeId" <> $1 order by "requestedAt" desc limit 1`, [evidence.ids.propertyId]);
    const tries = [
      [sponsorB, `/marketplace-orders/${orderId}`, "sponsor B → sponsor A's order"],
      [sponsorB, `/marketplace-orders/${orderId}/payment`, "sponsor B → sponsor A's payment"],
      [sponsorA, `/reservations/${hold.id}`, "sponsor A → sponsor B's hold"],
      [sponsorA, `/payouts/${athletePayout.id}`, "sponsor A → the athlete's payout"],
      [sponsorA, "/team/ledger", "sponsor A → a team ledger"],
      [athlete, `/payouts/${teamPayout.id}`, "athlete → the team's payout"],
      ...(otherListing ? [[team, `/listings/${otherListing.id}`, "team → another property's listing"]] : []),
      ...(otherPayout ? [[team, `/payouts/${otherPayout.id}`, "team → another property's payout"]] : []),
    ];
    const results = [];
    for (const [who, path, label] of tries) {
      const r = await api(who, "GET", path);
      results.push({ try: label, status: r.status });
    }
    note("cross-tenant tries", { results });
    const leaked = results.filter((r) => ![403, 404].includes(r.status));
    check(!leaked.length, `reached what it should not: ${JSON.stringify(leaked)}`);
    pass(`refused all ${results.length}: ${results.map((r) => `${r.try} ${r.status}`).join("; ")}`);
  }

  for (const who of [admin, finance, team, athlete, sponsorA, sponsorB]) await who.page.evaluate(() => window.Clerk.signOut()).catch(() => {});
  evidence.finishedAt = new Date().toISOString();
  save();
  await browser.close();
  console.log(`\nPASS — all ${evidence.steps.length} steps. Order ${evidence.ids.orderRef}. Evidence: ${OUT}`);
}

main().catch((e) => fail(e?.stack ?? String(e)));

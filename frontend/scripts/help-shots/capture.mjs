#!/usr/bin/env node
/* --------------------------------------------------------------------------
   POL-FE-99 — captures the Help & FAQ screenshots.

   For each portal it signs in as that portal's QA accounts on a running app,
   walks every step of every help article, screenshots the screen at
   1280×800, measures the thing to click (the step's `capture.highlight`
   locator) and writes:
     frontend/public/help/<portal>/<file>.webp     the picture
     frontend/src/lib/help/shots/<portal>.json     id → { src, path, w, h, spot }
   The ring is drawn by the help page from `spot`, so re-running this after a
   redesign moves every picture and ring with the UI. Steps whose screen is
   identical (same URL, same scroll, same actions) share one picture.

   A step's `capture` (lib/help/types.ts → HelpCapture) can say:
     as        which account (ACCOUNTS below; default: the portal's own)
     actions   clicks / fills / key presses to do first — open a dialog, pick a tab
     query     a query string for the shot (e.g. "demo=sample" where the QA
               account has no such record)
     follow    for a record route ("…/[id]"): a CSS selector for the link to follow
     from      the page that lists such records, if it isn't the route's parent

   Usage (from frontend/, with `npm run dev` and the API up):
     npm run help:shots                                  every portal
     npm run help:shots -- sponsor athlete               some portals
     HELP_BASE_URL=http://localhost:3000                 (default)
     HELP_ONLY=checkout,pay-for-an-order                 only these articles
   Needs CLERK_SECRET_KEY (read from frontend/.env.local or the repo .env)
   to mint a sign-in token for each account. The accounts are the local dev
   instance's QA users; override one with HELP_USER_<ACCOUNT>=user_…
   (account in capitals, "-" as "_"). It imports the .ts content files
   directly (Node type stripping; the npm script passes the flag Node 22
   needs).
   -------------------------------------------------------------------------- */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "../..");
const REPO = path.resolve(FRONTEND, "..");
const HELP_SRC = path.join(FRONTEND, "src/lib/help");
const OUT_DIR = path.join(FRONTEND, "public/help");
const SHOTS_DIR = path.join(HELP_SRC, "shots");
const BASE = (process.env.HELP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const VIEW = { width: 1280, height: 800 };
const ALL = ["sponsor", "athlete", "property", "next", "advisor", "finance", "admin"];

/* The local dev instance's QA users (memory: local-qa-walk-setup). Not
   secrets: a sign-in token needs the secret key. */
/* 2026-11-16: the dev instance was pruned to 13 users, so these are the ones left. A guardian and a team's property manager have no identity now; their steps report as such until one is set with HELP_USER_GUARDIAN / HELP_USER_PROPERTY_TEAM. */
const ACCOUNTS = {
  sponsor: "user_3MBbUPao9nD9ssh9rrtIpsVaNy2", // Sponsor Admin (fixture sponsor): can buy; one order in delivery
  "sponsor-shopper": "user_3MBbUPao9nD9ssh9rrtIpsVaNy2", // the same Sponsor Admin
  "sponsor-viewer": "user_3Jv5Crg9FAUkTQR7Mp1UkpHqmc7", // Sponsor Analyst, seed_spn_1: campaigns, requests, 5 orders (read-only)
  athlete: "user_3Jngeh9h4ivHuFqTaTPMPlDIcOw", // seed_ath_adult: campaigns, offers, earnings, and the seller of seed_spn_1's orders
  "athlete-seller": "user_3Jngeh9h4ivHuFqTaTPMPlDIcOw", // the same athlete
  guardian: undefined,
  property: "user_3Jw7GpSP3QLa0oEuAwSjl0rdHZT", // PROPERTY_MGR, qa_nx_school_a
  "property-team": undefined,
  next:"user_3JvKTlXR6vyQWoK8JqQD77oG6Po", // STUDENT, qa_nx_st_active
  advisor: "user_3JvKTdF6CZVRUj3ljJASLtUEe0W", // ADVISOR, qa_nx_school_a
  finance: "user_3JvEebZeQOoNlGN2RdpMGn8RO9D", // FINANCE
  admin: "user_3JncfC3Pd7ISho4n3eVXZ9QGVeQ", // BTG_ADMIN
};
const accountId = (key) => process.env[`HELP_USER_${key.toUpperCase().replace(/-/g, "_")}`] ?? ACCOUNTS[key];

const require = createRequire(path.join(REPO, "package.json"));
const { chromium } = require("@playwright/test");
const sharp = createRequire(path.join(FRONTEND, "package.json"))("sharp");

function secretKey() {
  if (process.env.CLERK_SECRET_KEY) return process.env.CLERK_SECRET_KEY;
  for (const f of [path.join(FRONTEND, ".env.local"), path.join(REPO, ".env")]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(/^CLERK_SECRET_KEY=["']?([^"'\r\n]+)/m);
    if (m) return m[1];
  }
  throw new Error("CLERK_SECRET_KEY not found (env, frontend/.env.local or .env)");
}

async function signInUrl(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 900 }),
  });
  if (!res.ok) throw new Error(`sign_in_tokens ${res.status}: ${await res.text()}`);
  const { token } = await res.json();
  return `${BASE}/login?__clerk_ticket=${encodeURIComponent(token)}`;
}

/** "/sponsor/orders/[id]" → a matcher for real hrefs like "/sponsor/orders/abc?x=1". */
function patternOf(route) {
  const [p] = route.split("?");
  if (!p.includes("[")) return null;
  /* a record's id, never a sibling page like ".../new" */
  const rx = p
    .split(/\[[^\]]+\]/)
    .map((part) => part.replace(/[.*+?^${}()|\\]/g, "\\$&"))
    .join("(?!(?:new|edit|preview)(?:[/?#]|$))[^/?#]+");
  return new RegExp(`^${rx}(?:[?#].*)?$`);
}

/** A locator string from the content: "getByRole('link', { name: 'Shop' })", "css=…", or a plain CSS selector. */
function locate(page, expr) {
  const e = expr.trim();
  if (/^(getBy|locator\()/.test(e)) return new Function("page", `return page.${e};`)(page).first();
  return page.locator(e.replace(/^css=/, "")).first();
}

const CALM = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}
nextjs-portal{display:none!important}`;

/* Seed data typed by testers can be rude ("fuccckkkk" as a delivery note). A help
   picture is published, so before every shot any text node with profanity reads
   as a neutral note instead. The words a desk exists to show (the restricted
   words list) are left alone: this matches swearing, not sensitive topics. */
const RUDE = String.raw`\b(f+u+c*k+\w*|fu+c+k*\w*|sh[i1]t+\w*|b[i1]tch\w*|a+ss+hole\w*|c+u+n+t\w*|bastard\w*|wtf|stfu|motherf\w*)\b`;

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.addStyleTag({ content: CALM }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove())).catch(() => {});
  await page
    .evaluate((src) => {
      const rx = new RegExp(src, "i");
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (rx.test(n.nodeValue ?? "")) n.nodeValue = "“Done — link attached.”";
      document.querySelectorAll("input, textarea").forEach((el) => { if (rx.test(el.value)) el.value = "Done — link attached."; });
    }, RUDE)
    .catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(450);
}

async function act(page, actions) {
  for (const a of actions ?? []) {
    if (a.click) await locate(page, a.click).click({ timeout: 6000 });
    else if (a.fill) await locate(page, a.fill).fill(a.text ?? "", { timeout: 6000 });
    else if (a.press) await page.keyboard.press(a.press);
    else if (a.hover) await locate(page, a.hover).hover({ timeout: 6000 });
    else if (a.setText) {
      /* presentation only: swap test data that must not ship in a help picture (e.g. a rude seed note) */
      const l = locate(page, a.setText);
      if (await l.count()) await l.evaluate((el, t) => { el.textContent = t; }, a.text ?? "");
    }
    if (a.wait) await page.waitForTimeout(a.wait);
    else await page.waitForTimeout(500);
  }
  if (actions?.length) await settle(page);
}

async function collectHrefs(page, pool) {
  const hrefs = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
  for (const h of hrefs) if (h) pool.add(h);
}

async function run() {
  const want = process.argv.slice(2).filter((a) => ALL.includes(a));
  const portals = want.length ? want : ALL;
  const only = new Set((process.env.HELP_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const report = [];
  const browser = await chromium.launch({ channel: "chrome" });
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  for (const portal of portals) {
    const file = path.join(HELP_SRC, `${portal}.ts`);
    if (!fs.existsSync(file)) { report.push(`${portal}: no content file`); continue; }
    const { content } = await import(pathToFileURL(file).href);
    const manifestFile = path.join(SHOTS_DIR, `${portal}.json`);
    const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : {};
    fs.mkdirSync(path.join(OUT_DIR, portal), { recursive: true });

    /* one signed-in page per account, opened when first needed */
    const sessions = new Map();
    const pageFor = async (key) => {
      if (sessions.has(key)) return sessions.get(key);
      if (!accountId(key)) throw new Error(`unknown account "${key}"`);
      const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(await signInUrl(accountId(key)));
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 });
      await settle(page);
      console.log(`\n[${portal}] ${key} signed in → ${new URL(page.url()).pathname}`);
      const s = { page, pool: new Set(), dirty: false };
      sessions.set(key, s);
      return s;
    };

    const shotsByScreen = new Map();
    const seen = new Set();
    let n = 0;

    for (const article of content.articles) {
      if (only.size && !only.has(article.slug)) continue;
      for (const [i, step] of article.steps.entries()) {
        const id = `${portal}/${article.slug}-${i + 1}`;
        seen.add(id);
        const cap = step.capture ?? {};
        const account = cap.as ?? portal;
        /* a step that can't be shot this run shows "on its way", never an older, possibly wrong picture */
        delete manifest[id];
        try {
          const s = await pageFor(account);
          const { page, pool } = s;

          /* where to go */
          let url = step.route;
          const rx = patternOf(step.route);
          if (rx) {
            const pick = () => [...pool].find((h) => rx.test(h));
            let hit = cap.follow ? null : pick();
            for (const from of [cap.from, step.route.split("/[")[0]].filter(Boolean)) {
              if (hit) break;
              await page.goto(BASE + from);
              await settle(page);
              if (cap.follow) {
                const h = await page.locator(cap.follow).first().getAttribute("href", { timeout: 4000 }).catch(() => null);
                if (h && rx.test(h)) hit = h;
              }
              await collectHrefs(page, pool);
              hit ??= pick();
            }
            if (!hit) { report.push(`${id}: no record for ${step.route}${cap.needs ? ` (needs ${cap.needs})` : ""} [as ${account}]`); continue; }
            url = hit.split("#")[0];
          }
          if (cap.query) url += (url.includes("?") ? "&" : "?") + cap.query;
          /* a placeholder left in the query ("?item=[itemId]") means there's no real record to show */
          if (/\[[^\]]+\]|<[^>]+>/.test(url)) { report.push(`${id}: ${url} still has a placeholder; give it a follow/from or a real query [as ${account}]`); continue; }
          if (s.dirty || cap.actions?.length || page.url() !== BASE + url) {
            await page.goto(BASE + url);
            await settle(page);
          }
          s.dirty = !!cap.actions?.length;
          await collectHrefs(page, pool);
          const landed = new URL(page.url()).pathname;
          /* a portal step must stay in the portal; a step on a public page (/join, /guardian/setup) must land on that page */
          const want = step.route.split("?")[0].split("/[")[0];
          const ok = step.route.startsWith(`/${portal}`) ? landed.startsWith(`/${portal}`) : landed.startsWith(want) && !landed.startsWith("/login");
          if (!ok) { report.push(`${id}: ${url} redirected to ${landed} [as ${account}]`); continue; }

          if (cap.actions?.length) {
            try { await act(page, cap.actions); }
            catch (err) { report.push(`${id}: action failed — ${String(err?.message ?? err).split("\n")[0]}`); }
          }

          /* what to ring */
          let box = null;
          if (cap.highlight) {
            const loc = locate(page, cap.highlight);
            if (await loc.count().catch(() => 0)) {
              if (cap.scroll !== false) await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
              await page.waitForTimeout(150);
              box = await loc.boundingBox().catch(() => null);
              if (box && (box.width < 2 || box.height < 2)) box = null;
              /* a box larger than the screen rings nothing useful */
              if (box && box.height > VIEW.height * 0.9) box = null;
            }
            if (!box) report.push(`${id}: ring not found — ${cap.highlight} [as ${account}]`);
          } else if (!cap.actions?.length) {
            await page.evaluate(() => window.scrollTo(0, 0));
          }

          /* the picture, shared by steps that show the same screen */
          const scrollY = await page.evaluate(() => Math.round(window.scrollY));
          const key = `${account}|${landed}${new URL(page.url()).search}@${scrollY}|${JSON.stringify(cap.actions ?? [])}`;
          let src = shotsByScreen.get(key);
          if (!src) {
            const png = await page.screenshot({ type: "png" });
            const name = `${article.slug}-${i + 1}.webp`;
            await sharp(png).webp({ quality: 74, effort: 5 }).toFile(path.join(OUT_DIR, portal, name));
            src = `/help/${portal}/${name}`;
            shotsByScreen.set(key, src);
            n++;
          }
          /* the ring in percent of the picture, cut to the picture where the element runs off it */
          const pct = (v, of) => Math.max(0, Math.min(100, +((v / of) * 100).toFixed(2)));
          let spot = null;
          if (box) {
            const x = pct(box.x, VIEW.width);
            const y = pct(box.y, VIEW.height);
            spot = { x, y, w: Math.min(pct(box.x + box.width, VIEW.width), 100) - x, h: Math.min(pct(box.y + box.height, VIEW.height), 100) - y };
            spot.w = +spot.w.toFixed(2);
            spot.h = +spot.h.toFixed(2);
            if (spot.w < 0.3 || spot.h < 0.3) spot = null;
          }
          manifest[id] = {
            src,
            path: landed,
            w: VIEW.width,
            h: VIEW.height,
            spot,
            capturedAt: new Date().toISOString().slice(0, 10),
          };
          process.stdout.write(".");
        } catch (err) {
          report.push(`${id}: ${String(err?.message ?? err).split("\n")[0]}`);
        }
      }
    }
    for (const s of sessions.values()) await s.page.context().close();
    console.log(`\n[${portal}] ${n} pictures`);

    /* a full run forgets steps that no longer exist */
    if (!only.size) for (const id of Object.keys(manifest)) if (!seen.has(id)) delete manifest[id];
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(manifestFile, JSON.stringify(sorted, null, 1) + "\n");

    /* pictures nothing points at any more */
    const used = new Set(Object.values(sorted).map((m) => m.src));
    const dir = path.join(OUT_DIR, portal);
    for (const f of fs.readdirSync(dir)) if (!used.has(`/help/${portal}/${f}`)) fs.rmSync(path.join(dir, f));
  }

  await browser.close();
  console.log(report.length ? `\n${report.length} to look at:\n- ${report.join("\n- ")}` : "\nEvery step captured.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Signing a Playwright page in as a real role — P3/P4/P5/P7-QA-01.
 *
 * The loop specs drive the portals as the people who use them, so each needs
 * a real Clerk session on the web app AND a Postgres `User` row that the API
 * resolves that session to. Three steps, all against the real systems:
 *
 *   1. **Clerk identity.** Find-or-create a user on Clerk's DEVELOPMENT
 *      instance by a stable address (`e2e.<key>@example.com`) through the
 *      Backend API. Stable, so runs reuse the same few identities rather than
 *      filling the instance with thousands of one-off users.
 *   2. **Authorisation.** Upsert the app's `User` row for that Clerk id with
 *      the roles and the sponsor / athlete link the spec needs. This is what
 *      BTG does by hand when it provisions an account (Phase 1 is managed —
 *      `resolveActor` never invents a user), and the API reads it on every
 *      request, so a spec can re-grant between steps.
 *   3. **Session.** Mint a one-time sign-in token and open
 *      `/login?__clerk_ticket=…`. Clerk's <SignIn> consumes the ticket, sets
 *      the session cookie and `forceRedirectUrl` lands on `/portal`, which
 *      routes by the Postgres roles — the same door a person walks through.
 *
 * Needs CLERK_SECRET_KEY (the dev instance whose publishable key the web app
 * uses) and DATABASE_URL. CI's e2e job has both; without them the loop specs
 * skip with the reason rather than pass vacuously.
 *
 * Node `fetch`, not a Clerk SDK: `@clerk/backend` lives in the backend
 * workspace, and three REST calls do not justify a root dependency.
 */
import type { Browser, Page, TestInfo } from "@playwright/test";

import { hasDatabase, pool, TENANT } from "./loop-db";

export const hasClerk = Boolean(process.env.CLERK_SECRET_KEY);
export const hasLoopStack = hasDatabase && hasClerk;
export const LOOP_SKIP_REASON =
  "needs DATABASE_URL, CLERK_SECRET_KEY and the API — CI's e2e job provides all three";

/** Where the API listens — the same address playwright.config.ts starts it on. */
export const API_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4000}`;

export type Role =
  | "SUPER_ADMIN" | "BTG_ADMIN" | "SALES" | "CAMPAIGN_MGR" | "NETWORK_MGR" | "FINANCE"
  | "ATHLETE" | "GUARDIAN" | "PROPERTY_MGR" | "SPONSOR_ADMIN" | "SPONSOR_ANALYST";

export type Grant = {
  /** Stable identity key — the Clerk address is `e2e.<key>@example.com`. */
  key: string;
  roles: Role[];
  /** Defaults to the marketplace tenant (loop-db `TENANT`). */
  tenantId?: string;
  sponsorId?: string | null;
  athleteId?: string | null;
  guardianId?: string | null;
};

const CLERK_API = "https://api.clerk.com/v1";

async function clerk<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export function emailFor(key: string): string {
  return `e2e.${key}@example.com`;
}

const clerkIds = new Map<string, string>();

/** Find-or-create the Clerk dev-instance user behind a stable address. */
export async function clerkUserFor(key: string): Promise<string> {
  const cached = clerkIds.get(key);
  if (cached) return cached;
  const email = emailFor(key);
  const find = async () => {
    const { body } = await clerk<Array<{ id: string }>>(
      `/users?email_address=${encodeURIComponent(email)}`,
    );
    return Array.isArray(body) ? body[0]?.id : undefined;
  };
  let id = await find();
  if (!id) {
    const created = await clerk<{ id?: string; errors?: Array<{ code: string; message: string }> }>("/users", {
      method: "POST",
      body: JSON.stringify({
        email_address: [email],
        first_name: "E2E",
        last_name: key,
        skip_password_requirement: true,
      }),
    });
    /* A parallel worker may have created it between the find and the create. */
    id = created.body?.id ?? (await find());
    if (!id) {
      throw new Error(`Clerk refused to create ${email} (HTTP ${created.status}): ${JSON.stringify(created.body)}`);
    }
  }
  clerkIds.set(key, id);
  return id;
}

/**
 * Link the Clerk identity to a `User` row carrying exactly this grant.
 *
 * Keyed on the deterministic id `e2e_u_<key>`; the Clerk id is written over
 * whatever the row held (a recreated Clerk user gets a new id). An athlete
 * link is unique, so any other row still pointing at the athlete lets go
 * first — a previous run's leftover must never shadow this one.
 */
export async function provision(grant: Grant): Promise<{ userId: string; clerkId: string; email: string }> {
  const clerkId = await clerkUserFor(grant.key);
  const userId = `e2e_u_${grant.key.replace(/[^a-z0-9]/gi, "_")}`;
  const email = emailFor(grant.key);
  const db = pool();
  try {
    if (grant.athleteId) {
      await db.query(`update "User" set "athleteId" = null where "athleteId" = $1 and id <> $2`, [grant.athleteId, userId]);
    }
    /* Another row may hold the Clerk id (e.g. a hand-provisioned row claimed
       by email on an earlier sign-in); release it so the unique index lets
       this row take it. */
    await db.query(`update "User" set "clerkId" = 'released_' || id where "clerkId" = $1 and id <> $2`, [clerkId, userId]);
    const values = [
      userId, grant.tenantId ?? TENANT, clerkId, email, grant.roles,
      grant.athleteId ?? null, grant.sponsorId ?? null, grant.guardianId ?? null,
    ];
    await db.query(
      `insert into "User"(id, "tenantId", "clerkId", email, roles, "athleteId", "sponsorId", "guardianId")
       values ($1, $2, $3, $4, $5::"Role"[], $6, $7, $8)
       on conflict (id) do update set
         "tenantId" = excluded."tenantId", "clerkId" = excluded."clerkId", email = excluded.email,
         roles = excluded.roles, "athleteId" = excluded."athleteId",
         "sponsorId" = excluded."sponsorId", "guardianId" = excluded."guardianId",
         "propertyId" = null, "studentId" = null`,
      values,
    );
  } finally {
    await db.end();
  }
  return { userId, clerkId, email };
}

/** Unlink a spec's user from rows the spec is about to delete. */
export async function releaseUser(key: string): Promise<void> {
  const db = pool();
  try {
    await db.query(
      `update "User" set "athleteId" = null, "sponsorId" = null, "guardianId" = null where id = $1`,
      [`e2e_u_${key.replace(/[^a-z0-9]/gi, "_")}`],
    );
  } finally {
    await db.end();
  }
}

/**
 * Sign `page` in through the real login screen with a one-time ticket, and
 * wait until `/portal` has routed it to a workspace.
 */
export async function signIn(page: Page, grant: Grant): Promise<void> {
  const { clerkId } = await provision(grant);
  await ticketSignIn(page, clerkId, grant.key);
}

/**
 * Sign in as someone the product itself gave a login — an organisation's
 * contact once it is approved, an athlete once their application is — with
 * NO provisioning: the Clerk identity for `e2e.<key>@example.com` signs in,
 * and the API claims the `User` row the real flow created for that address
 * (first sign-in links by verified email). Nothing is granted here.
 */
export async function signInExisting(page: Page, key: string): Promise<void> {
  await ticketSignIn(page, await clerkUserFor(key), key);
}

export async function pageAsExisting(browser: Browser, testInfo: TestInfo, key: string): Promise<Page> {
  const context = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  await signInExisting(page, key);
  return page;
}

async function ticketSignIn(page: Page, clerkId: string, key: string): Promise<void> {
  /* Under a parallel run the dev instance's widget occasionally sits on an
     empty card and never consumes the ticket (seen once in ~40 sign-ins).
     A ticket is single-use, so a retry mints a fresh one and reloads — the
     same thing a person would do. Two tries, then fail loudly. */
  for (let attempt = 1; ; attempt++) {
    const minted = await clerk<{ token?: string }>("/sign_in_tokens", {
      method: "POST",
      body: JSON.stringify({ user_id: clerkId, expires_in_seconds: 600 }),
    });
    if (!minted.body?.token) {
      throw new Error(`Clerk would not mint a sign-in token (HTTP ${minted.status}): ${JSON.stringify(minted.body)}`);
    }
    await page.goto(`/login?__clerk_ticket=${encodeURIComponent(minted.body.token)}`);
    try {
      await page.waitForURL(
        (url) => !url.pathname.startsWith("/login") && url.pathname !== "/portal",
        { timeout: 30_000 },
      );
      return;
    } catch (e) {
      if (attempt >= 2) {
        throw new Error(`Signing in as ${key} never reached a workspace (stuck at ${page.url()}): ${(e as Error).message}`);
      }
    }
  }
}

/**
 * A fresh browser context signed in as `grant` — one per role, so a spec can
 * hold the sponsor, the desk and the athlete side by side, each with its own
 * cookie jar, exactly as three people on three machines would.
 */
/** The loop specs seed shared rows once per run, so they run on the desktop
 *  project only — call first thing in `beforeAll` AND `afterAll`, so the
 *  mobile project neither seeds nor cleans up under the desktop run. */
export function desktopOnly(testInfo: TestInfo): boolean {
  return testInfo.project.name === "chromium";
}

export async function pageAs(browser: Browser, testInfo: TestInfo, grant: Grant): Promise<Page> {
  const context = await browser.newContext({
    ...testInfo.project.use,
    baseURL: testInfo.project.use.baseURL,
  });
  const page = await context.newPage();
  await signIn(page, grant);
  return page;
}

/**
 * Call the API as the person signed in on `page`, with their own session
 * token — for the steps that have an endpoint and no screen yet. Nothing is
 * elevated: the API's matrix decides, exactly as it does for the portal.
 */
export async function apiAs<T = unknown>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  /* clerk-js loads after the page does; wait for it rather than race it. */
  await page.waitForFunction(() => {
    const w = window as unknown as { Clerk?: { loaded?: boolean; session?: unknown } };
    return Boolean(w.Clerk?.loaded && w.Clerk.session);
  }, undefined, { timeout: 20_000 });
  const token = await page.evaluate(async () => {
    const w = window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } };
    return (await w.Clerk?.session?.getToken()) ?? null;
  });
  if (!token) throw new Error("No Clerk session on this page — sign in first");
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T };
}

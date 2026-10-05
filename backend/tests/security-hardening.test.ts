import { readdirSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-SEC-05 — the security review's small hardening items, each pinned.
   documentation/SponsorX-Security-Review-2026-10.md has the table; item 5
   (`import "server-only"`) is in frontend/tests/security-review.test.ts and
   item 6 (the history secret scan) in scripts/security-scripts.test.mjs.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sh-test.invalid` } : null;
  },
}));

const root = join(import.meta.dirname, "..");

describe("2 · a Zoho CRM notification names a module we subscribe to, and ids that are digits", async () => {
  const { ZohoCrmNotification, ZOHO_CRM_MODULES } = await import("../src/contracts/zoho");
  const good = { module: "Accounts", ids: ["5000001", "6823000000123456789"], operation: "update", channel_id: "1", token: "t" };

  it("accepts the four subscribed modules with numeric ids", () => {
    for (const module of ZOHO_CRM_MODULES) expect(ZohoCrmNotification.safeParse({ ...good, module }).success, module).toBe(true);
  });

  it("refuses any other module, and any id that is not digits — they would land in a Zoho API path", () => {
    for (const module of ["Leads", "Users", "accounts", "Accounts/../Users", "../settings", ""]) {
      expect(ZohoCrmNotification.safeParse({ ...good, module }).success, module).toBe(false);
    }
    for (const id of ["12a", "../1", "1/2", "1?x=y", " 1", "", "1".repeat(41)]) {
      expect(ZohoCrmNotification.safeParse({ ...good, ids: [id] }).success, id).toBe(false);
    }
  });

  it("is exactly what the worker's watch channel subscribes to", async () => {
    const { WATCH_EVENTS } = await import("../worker/jobs/zoho-sync.mts");
    expect(WATCH_EVENTS.map((e) => e.replace(/\.all$/, ""))).toEqual([...ZOHO_CRM_MODULES]);
  });
});

describe("3 · the PDF renderer runs no script", async () => {
  const { renderPdf } = await import("../src/domain/report-render");
  const source = readFileSync(join(root, "src/domain/report-render.ts"), "utf8");

  it("the report template needs none: no <script>, no handler attribute, no javascript: link", () => {
    const template = source.slice(source.indexOf("export function renderReportHtml"), source.indexOf("export function reportKey"));
    expect(template.length).toBeGreaterThan(1000);
    expect(template).not.toMatch(/<script|\son[a-z]+\s*=|javascript:/i);
    expect(source).toMatch(/newPage\(\{ javaScriptEnabled: false \}\)/);
  });

  it("a script in the HTML does not run — the printed title is the static one", async () => {
    /* Chromium writes document.title into the PDF's /Title: if the script ran, it would say so. */
    const pdf = await renderPdf(`<!doctype html><html><head><title>static-title</title></head><body><p>Report</p>
      <script>document.title = "SCRIPT-RAN";</script></body></html>`);
    const text = pdf.toString("latin1");
    expect(text.slice(0, 5)).toBe("%PDF-");
    expect(text).toMatch(/\/Title \(static-title\)/);
    expect(text).not.toContain("SCRIPT-RAN");
  }, 60_000);
});

describe("4 · the worker logs no one's email address", async () => {
  const { maskEmail, redactEmails } = await import("../src/lib/redact");

  it("masks an address to its domain, in a value or anywhere in a line", () => {
    expect(maskEmail("rosa.lopez+sx@school.org")).toBe("…@school.org");
    expect(maskEmail(null)).toBe("…");
    expect(maskEmail("not-an-address")).toBe("…");
    expect(redactEmails('[worker] payouts.send {"to":"ath@a.invalid","cc":"Fin <fin@btg.example>"}'))
      .toBe('[worker] payouts.send {"to":"…@a.invalid","cc":"Fin <…@btg.example>"}');
  });

  it("every worker log line goes through the redaction, and none interpolates a recipient raw", () => {
    const index = readFileSync(join(root, "worker/index.mts"), "utf8");
    /* One console.log: inside log(), which redacts. */
    expect(index.match(/console\.log\(/g)).toHaveLength(1);
    expect(index).toMatch(/function log\(line: string\): void \{\n\s*console\.log\(redactEmails\(line\)\);/);
    const files = [join(root, "worker/index.mts"), ...readdirSync(join(root, "worker/jobs")).map((f) => join(root, "worker/jobs", f))];
    const raw: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/\b(console\.(log|error|warn|info)|log)\(/.test(line) && /\$\{(?!maskEmail\()[^}]*\b(email|to)\}/.test(line)) raw.push(`${f}:${i + 1}`);
      });
    }
    expect(raw).toEqual([]);
    /* The two that used to: notify.email and notify.invitationSent. */
    expect(index).toMatch(/: maskEmail\(job\.data\.to\);/);
    expect(index).toMatch(/queued mail to \$\{maskEmail\(outcome\.to\)\}/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("1 · GET /athletes/:id/rates answers another athlete's id exactly as a made-up one", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const T = "sh_tenant";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const get = async (path: string, who: string) => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": who } });
    return { status: res.status, text: await res.text() };
  };

  async function wipe() {
    await prisma.athleteRate.deleteMany({ where: { tenantId: T } });
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.athlete.deleteMany({ where: { tenantId: T } });
    await prisma.guardian.deleteMany({ where: { tenantId: T } });
    await prisma.nilJob.deleteMany({ where: { tenantId: T } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "SH Tenant" } });
    await prisma.guardian.create({ data: { id: "sh_guardian", tenantId: T, legalName: "SH Guardian", email: "g@sh.invalid", relationship: "PARENT" } });
    await prisma.athlete.createMany({ data: [
      { id: "sh_ath_a", tenantId: T, slug: "sh-ath-a", legalName: "SH Athlete A", displayName: "SHA", email: "a@sh.invalid", sport: "Soccer", stateCode: "MD", ageBand: "UNDER_18", state: "ACTIVE", guardianId: "sh_guardian" },
      { id: "sh_ath_b", tenantId: T, slug: "sh-ath-b", legalName: "SH Athlete B", displayName: "SHB", email: "b@sh.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.nilJob.create({ data: { id: "sh_job", tenantId: T, name: "SH Job", baseLow: 10000, baseHigh: 20000, sellLow: 20000, sellHigh: 40000, sellFloorEmerging: 15000, sellFloorCreator: 20000, sellFloorPremium: 30000 } });
    await prisma.athleteRate.create({ data: { tenantId: T, athleteId: "sh_ath_a", jobId: "sh_job", amount: 23456 } });
    await prisma.user.createMany({ data: [
      { id: "sh_u_a", tenantId: T, clerkId: "sh_u_a", email: "ua@sh.invalid", roles: ["ATHLETE"], athleteId: "sh_ath_a" },
      { id: "sh_u_b", tenantId: T, clerkId: "sh_u_b", email: "ub@sh.invalid", roles: ["ATHLETE"], athleteId: "sh_ath_b" },
      { id: "sh_u_g", tenantId: T, clerkId: "sh_u_g", email: "ug@sh.invalid", roles: ["GUARDIAN"], guardianId: "sh_guardian" },
      { id: "sh_u_admin", tenantId: T, clerkId: "sh_u_admin", email: "uadmin@sh.invalid", roles: ["BTG_ADMIN"] },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("another athlete's id and a made-up id: the same 403, word for word", async () => {
    const other = await get("/athletes/sh_ath_a/rates", "sh_u_b");
    const missing = await get("/athletes/sh_no_such_athlete/rates", "sh_u_b");
    expect(other.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(other.text.replace(/"reference":"[^"]*"/, "")).toBe(missing.text.replace(/"reference":"[^"]*"/, ""));
    expect(other.text).not.toContain("23456");
  });

  it("the rates themselves stay scoped: the athlete's own card, the guardian's ward's, BTG's tenant", async () => {
    for (const who of ["sh_u_a", "sh_u_g", "sh_u_admin"]) {
      const r = await get("/athletes/sh_ath_a/rates", who);
      expect(r.status, who).toBe(200);
      expect(JSON.parse(r.text).rates, who).toEqual([expect.objectContaining({ jobId: "sh_job", amount: 23456 })]);
    }
    /* A guardian is refused an athlete who is not their ward, as a made-up id is. */
    expect((await get("/athletes/sh_ath_b/rates", "sh_u_g")).status).toBe(403);
    expect((await get("/athletes/sh_no_such_athlete/rates", "sh_u_g")).status).toBe(403);
    expect((await get("/athletes/sh_no_such_athlete/rates", "sh_u_admin")).status).toBe(403);
    /* And an athlete with no rates yet still reads their own (empty) card. */
    expect(await get("/athletes/sh_ath_b/rates", "sh_u_b")).toEqual({ status: 200, text: JSON.stringify({ rates: [] }) });
  });
});

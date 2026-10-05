import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-SEC-02 — OWASP review and secrets rotation, the API side.

   Each block pins one finding or one rotation guarantee from
   documentation/SponsorX-Security-Review-2026-10.md and
   documentation/SponsorX-Secrets-Rotation.md. Nothing here needs the
   database: env.ts is re-imported under different variables (vi.resetModules)
   so the boot rules and the accepted-secret lists are exercised exactly as a
   redeploy with new Railway variables would.
   -------------------------------------------------------------------------- */

/* The HTTP blocks import the whole app fresh after vi.resetModules — every
   route and domain module — which takes seconds on a cold transform cache. */
vi.setConfig({ testTimeout: 30_000 });

const BASE_ENV = { ...process.env };
/* A syntactically real publishable key (pk_test_ + base64 of a Frontend API
   host), so the REAL Clerk verifier is built — no network is reached for a
   request that carries no session. */
const PK = `pk_test_${Buffer.from("security-review.clerk.accounts.dev$").toString("base64")}`;

function setEnv(vars: Record<string, string | undefined>) {
  process.env = { ...BASE_ENV, DATABASE_URL: BASE_ENV.DATABASE_URL ?? "postgresql://sponsorx@127.0.0.1:55432/none", CLERK_SECRET_KEY: "sk_test_x", CLERK_PUBLISHABLE_KEY: PK };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
}

afterEach(() => {
  process.env = { ...BASE_ENV };
  vi.resetModules();
});

const PROD = {
  NODE_ENV: "production",
  RAILWAY_ENVIRONMENT_NAME: "staging",
  INTAKE_TOKEN_SECRET: "a-real-intake-secret-for-the-review-0123456789",
  ZOHO_WEBHOOK_SECRET: "zoho-invoice-secret-current",
};

/* ── the rotation primitive ─────────────────────────────────────────────── */

describe("rotation · lib/rotating-secret", async () => {
  const { acceptedSecrets, matchesAny, hmacMatchesAny, safeEqual } = await import("../src/lib/rotating-secret");

  it("accepts the current value first, then each previous one; blanks and repeats dropped", () => {
    expect(acceptedSecrets("new", "old")).toEqual(["new", "old"]);
    expect(acceptedSecrets("new", " old , older ,,")).toEqual(["new", "old", "older"]);
    expect(acceptedSecrets("new", "new")).toEqual(["new"]);
    expect(acceptedSecrets("new", undefined)).toEqual(["new"]);
    expect(acceptedSecrets(undefined, undefined)).toEqual([]);
    expect(acceptedSecrets("", "")).toEqual([]);
  });

  it("compares in constant time and never matches nothing", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual(undefined, "abc")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
    expect(matchesAny("x", [])).toBe(false);
    expect(matchesAny("old", ["new", "old"])).toBe(true);
  });

  it("verifies an HMAC made under any accepted secret, and no other", () => {
    const sig = (s: string) => createHmac("sha256", s).update("payload").digest("hex");
    expect(hmacMatchesAny(["new", "old"], "payload", sig("old"), "hex")).toBe(true);
    expect(hmacMatchesAny(["new"], "payload", sig("old"), "hex")).toBe(false);
    expect(hmacMatchesAny(["new", "old"], "payload", sig("guess"), "hex")).toBe(false);
  });
});

/* ── each verifying secret, through a "redeploy" ───────────────────────── */

describe("rotation · ZOHO_WEBHOOK_SECRET (invoice webhook)", () => {
  const body = JSON.stringify({ invoiceId: "inv_1", status: "paid" });
  const signed = (s: string) => createHmac("sha256", s).update(body).digest("hex");

  it("during rotation both secrets verify; once _PREVIOUS is removed the old one is refused", async () => {
    setEnv({ ZOHO_WEBHOOK_SECRET: "zoho-new", ZOHO_WEBHOOK_SECRET_PREVIOUS: "zoho-old" });
    let m = await import("../src/routes/v1/zoho-webhooks");
    expect(m.signatureMatches(body, signed("zoho-new"), m.invoiceSecrets())).toBe(true);
    expect(m.signatureMatches(body, signed("zoho-old"), m.invoiceSecrets())).toBe(true);
    expect(m.signatureMatches(body, signed("zoho-guess"), m.invoiceSecrets())).toBe(false);

    setEnv({ ZOHO_WEBHOOK_SECRET: "zoho-new", ZOHO_WEBHOOK_SECRET_PREVIOUS: undefined });
    m = await import("../src/routes/v1/zoho-webhooks");
    expect(m.signatureMatches(body, signed("zoho-new"), m.invoiceSecrets())).toBe(true);
    expect(m.signatureMatches(body, signed("zoho-old"), m.invoiceSecrets())).toBe(false);
  });
});

describe("A08 · the invoice webhook signature is checked over the bytes Zoho sent", () => {
  it("accepts a signature over the raw body even when re-serialising would change it, and is never rate-limited when verified", async () => {
    setEnv({ ZOHO_WEBHOOK_SECRET: "zoho-raw-secret", ZOHO_WEBHOOK_SECRET_PREVIOUS: undefined });
    /* No database: the two writes the handler makes are captured instead. */
    const written: unknown[] = [];
    const limited: string[] = [];
    const tx = { webhookDelivery: { create: async (a: unknown) => (written.push(a), { id: "wd_sec_1" }) } };
    vi.doMock("../src/db/client", () => ({ prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }));
    vi.doMock("../src/db/outbox", () => ({ enqueue: async () => {} }));
    vi.doMock("../src/lib/rate-limit", () => ({ limit: async (k: string) => void limited.push(k), limitMultiplier: () => 1 }));
    const { createApp } = await import("../src/app");
    const server: Server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    try {
      const addr = server.address();
      const url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api/v1/webhooks/zoho/invoice`;
      /* Spaces and an amount written as 1500.0: JSON.stringify(parsed) is not these bytes. */
      const raw = '{ "invoiceId": "inv_raw", "dealId": "deal_raw", "status": "paid", "amount": 1500.0 }';
      expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw);
      const sig = (s: string) => createHmac("sha256", s).update(raw).digest("hex");
      const post = (signature: string) =>
        fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-zoho-signature": signature }, body: raw });

      expect((await post(sig("zoho-raw-secret"))).status).toBe(202);
      expect(written).toHaveLength(1);
      expect(limited).toEqual([]); // a verified delivery never touches the limiter

      expect((await post(sig("not-the-secret"))).status).toBe(401);
      expect(limited).toEqual(["zoho:invoice"]); // an unverified one does
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      vi.doUnmock("../src/db/client");
      vi.doUnmock("../src/db/outbox");
      vi.doUnmock("../src/lib/rate-limit");
    }
  });
});

describe("rotation · ZOHO_NOTIFY_TOKEN (CRM callbacks)", () => {
  it("accepts the old channel token only while it is listed as previous", async () => {
    setEnv({ ZOHO_NOTIFY_TOKEN: "notify-token-new-0123456789", ZOHO_NOTIFY_TOKEN_PREVIOUS: "notify-token-old-0123456789" });
    let m = await import("../src/routes/v1/zoho-webhooks");
    expect(m.tokenMatches("notify-token-new-0123456789", m.notifyTokens())).toBe(true);
    expect(m.tokenMatches("notify-token-old-0123456789", m.notifyTokens())).toBe(true);

    setEnv({ ZOHO_NOTIFY_TOKEN: "notify-token-new-0123456789", ZOHO_NOTIFY_TOKEN_PREVIOUS: undefined });
    m = await import("../src/routes/v1/zoho-webhooks");
    expect(m.tokenMatches("notify-token-new-0123456789", m.notifyTokens())).toBe(true);
    expect(m.tokenMatches("notify-token-old-0123456789", m.notifyTokens())).toBe(false);
    /* The worker subscribes Zoho with the CURRENT token only. */
    const { renewWatch } = await import("../worker/jobs/zoho-sync.mts");
    const watched: unknown[] = [];
    await renewWatch({ watch: async (w: unknown) => void watched.push(w) } as never, {
      ZOHO_NOTIFY_URL: "https://api.example/api/v1/webhooks/zoho/crm",
      ZOHO_NOTIFY_TOKEN: "notify-token-new-0123456789",
      ZOHO_NOTIFY_TOKEN_PREVIOUS: "notify-token-old-0123456789",
      ZOHO_NOTIFY_CHANNEL_ID: "1000000068001",
    });
    expect(watched).toMatchObject([{ token: "notify-token-new-0123456789" }]);
  });
});

describe("rotation · SPONSORX_EDGE_KEY (web → API forwarded address)", () => {
  const req = (key: string) => ({ ip: "10.0.0.9", get: (h: string) => ({ "x-sponsorx-client-ip": "203.0.113.7", "x-sponsorx-edge-key": key })[h] });

  it("believes the forwarded address under either key mid-rotation, and only the new one after", async () => {
    setEnv({ SPONSORX_EDGE_KEY: "edge-key-new-0123456789abcdef", SPONSORX_EDGE_KEY_PREVIOUS: "edge-key-old-0123456789abcdef" });
    let m = await import("../src/lib/client-ip");
    expect(m.clientIp(req("edge-key-new-0123456789abcdef"))).toBe("203.0.113.7");
    expect(m.clientIp(req("edge-key-old-0123456789abcdef"))).toBe("203.0.113.7");
    expect(m.clientIp(req("edge-key-guess-0123456789abcd"))).toBe("10.0.0.9");

    setEnv({ SPONSORX_EDGE_KEY: "edge-key-new-0123456789abcdef", SPONSORX_EDGE_KEY_PREVIOUS: undefined });
    m = await import("../src/lib/client-ip");
    expect(m.clientIp(req("edge-key-new-0123456789abcdef"))).toBe("203.0.113.7");
    expect(m.clientIp(req("edge-key-old-0123456789abcdef"))).toBe("10.0.0.9");
  });
});

describe("rotation · INTAKE_TOKEN_SECRET (every emailed link)", () => {
  it("a link emailed before the rotation still opens during it, and stops once _PREVIOUS is gone", async () => {
    setEnv({ INTAKE_TOKEN_SECRET: "intake-old" });
    const before = await import("../src/lib/intake-token");
    const purposeBefore = await import("../src/lib/purpose-token");
    const unsubBefore = await import("../src/lib/unsubscribe-token");
    const oldIntake = before.issueIntakeToken("ath_1");
    const oldPurpose = purposeBefore.issuePurposeToken("support", "msg_1", new Date(Date.now() + 3_600_000));
    const oldUnsub = unsubBefore.issueUnsubscribeToken("claim_1");

    setEnv({ INTAKE_TOKEN_SECRET: "intake-new", INTAKE_TOKEN_SECRET_PREVIOUS: "intake-old" });
    let intake = await import("../src/lib/intake-token");
    let purpose = await import("../src/lib/purpose-token");
    let unsub = await import("../src/lib/unsubscribe-token");
    expect(intake.readIntakeToken(oldIntake)).toBe("ath_1");
    expect(purpose.readPurposeToken("support", oldPurpose)).toBe("msg_1");
    expect(unsub.readUnsubscribeToken(oldUnsub)).toBe("claim_1");
    /* New links are signed with the new secret only. */
    const fresh = intake.issueIntakeToken("ath_1");
    expect(fresh).not.toBe(oldIntake);
    expect(intake.readIntakeToken(fresh)).toBe("ath_1");

    setEnv({ INTAKE_TOKEN_SECRET: "intake-new", INTAKE_TOKEN_SECRET_PREVIOUS: undefined });
    intake = await import("../src/lib/intake-token");
    purpose = await import("../src/lib/purpose-token");
    unsub = await import("../src/lib/unsubscribe-token");
    expect(intake.readIntakeToken(oldIntake)).toBeNull();
    expect(purpose.readPurposeToken("support", oldPurpose)).toBeNull();
    expect(unsub.readUnsubscribeToken(oldUnsub)).toBeNull();
    expect(intake.readIntakeToken(fresh)).toBe("ath_1");
  });

  it("refuses to boot in production with the development default kept as 'previous'", async () => {
    setEnv({ ...PROD, INTAKE_TOKEN_SECRET_PREVIOUS: "dev-intake-secret-not-for-production" });
    await expect(import("../src/config/env")).rejects.toThrow(/INTAKE_TOKEN_SECRET_PREVIOUS/);
  });
});

describe("rotation · STANDIN_PROVIDER_SECRET (staging test-provider links)", () => {
  it("accepts a link signed with the previous secret during rotation only", async () => {
    setEnv({ STANDIN_PROVIDER_SECRET: "standin-old" });
    const link = (await import("../src/lib/payment-provider")).standinLink({ kind: "checkout", attemptId: "pa_1", returnPath: "/x" });
    const token = new URL(link).searchParams.get("t")!;

    setEnv({ STANDIN_PROVIDER_SECRET: "standin-new", STANDIN_PROVIDER_SECRET_PREVIOUS: "standin-old" });
    expect((await import("../src/lib/payment-provider")).readStandinToken(token)).toMatchObject({ attemptId: "pa_1" });

    setEnv({ STANDIN_PROVIDER_SECRET: "standin-new", STANDIN_PROVIDER_SECRET_PREVIOUS: undefined });
    const { readStandinToken, StandinTokenError } = await import("../src/lib/payment-provider");
    expect(() => readStandinToken(token)).toThrow(StandinTokenError);
  });
});

/* ── findings ───────────────────────────────────────────────────────────── */

describe("A02/A07 · the stand-in provider's development secret never signs on staging", () => {
  it("with NODE_ENV=production and no secret set, a link forged with the public default is refused", async () => {
    setEnv({ ...PROD, STANDIN_PROVIDER_SECRET: undefined, PAYMENT_PROVIDER: undefined });
    const { env } = await import("../src/config/env");
    expect(env.STANDIN_PROVIDER_SECRET).not.toBe("dev-standin-provider-secret");
    expect(env.STANDIN_PROVIDER_SECRET.length).toBeGreaterThanOrEqual(32);
    const { readStandinToken, standinLink, providerName } = await import("../src/lib/payment-provider");
    expect(providerName()).toBe("standin"); // staging still has its stand-in…

    const body = Buffer.from(JSON.stringify({ kind: "account", payeeType: "ATHLETE", payeeId: "victim", tenantId: "t", returnPath: "/", exp: Date.now() + 60_000 })).toString("base64url");
    const forged = `${body}.${createHmac("sha256", "dev-standin-provider-secret").update(body).digest("base64url")}`;
    expect(() => readStandinToken(forged)).toThrow(); // …but nobody can forge its links
    const genuine = new URL(standinLink({ kind: "checkout", attemptId: "pa_2", returnPath: "/" })).searchParams.get("t")!;
    expect(readStandinToken(genuine)).toMatchObject({ attemptId: "pa_2" });
  });

  it("an explicitly set secret is used as given", async () => {
    setEnv({ ...PROD, STANDIN_PROVIDER_SECRET: "an-explicit-standin-secret-0123456789" });
    expect((await import("../src/config/env")).env.STANDIN_PROVIDER_SECRET).toBe("an-explicit-standin-secret-0123456789");
  });

  it("development keeps the readable default", async () => {
    setEnv({ NODE_ENV: "development", STANDIN_PROVIDER_SECRET: undefined });
    expect((await import("../src/config/env")).env.STANDIN_PROVIDER_SECRET).toBe("dev-standin-provider-secret");
  });
});

describe("A01 · open redirect: the payout account's return path", () => {
  it("refuses control characters that a browser strips into //host", async () => {
    setEnv({});
    const { safeReturnPath } = await import("../src/domain/payouts");
    for (const p of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "//evil.example", "/\\evil.example", "https://evil.example"]) {
      expect(safeReturnPath(p, "/fallback"), JSON.stringify(p)).toBe("/fallback");
    }
    expect(safeReturnPath("/property/earnings", "/fallback")).toBe("/property/earnings");
  });
});

describe("A03 · the public contact form's copy carries nothing the sender typed", () => {
  it("support.copy prints neither the message nor the name", async () => {
    setEnv({});
    const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");
    const out = EMAIL_TEMPLATES["support.copy"]!({ name: "Click https://evil.example now", message: "PHISH https://evil.example/login", topic: "Billing", reference: "sm_1" });
    expect(out.text).not.toContain("evil.example");
    expect(out.text).toContain("sm_1");
    expect(out.text).toContain("Billing");
  });
});

describe("A05 + A07 · the API over HTTP, in production mode", () => {
  it("sends the security headers, no X-Powered-By, and ignores a test-auth header", async () => {
    setEnv({ ...PROD });
    vi.doMock("../src/lib/rate-limit", () => ({ limit: async () => {}, limitMultiplier: () => 1 }));
    const { createApp } = await import("../src/app");
    const server: Server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    try {
      const addr = server.address();
      const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

      const missing = await fetch(`${base}/no-such-route`);
      expect(missing.status).toBe(404);
      expect(missing.headers.get("x-powered-by")).toBeNull();
      expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
      expect(missing.headers.get("x-frame-options")).toBe("DENY");
      expect(missing.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(missing.headers.get("referrer-policy")).toBe("no-referrer");

      /* The suites authenticate by MOCKING src/auth/clerk; the real module
         has no test branch at all. A header naming a user is just a header. */
      const me = await fetch(`${base}/api/v1/me`, { headers: { "x-test-clerk": "user_admin", "x-test-email": "admin@btg.example" } });
      expect(me.status).toBe(401);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      vi.doUnmock("../src/lib/rate-limit");
    }
  });

  it("no production source reads a test-auth header or branches on a test flag", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    let hits = "";
    try {
      hits = execFileSync("git", ["grep", "-n", "-I", "--untracked", "-i", "-E", "x-test-clerk|x-test-email|AUTH_BYPASS|MOCK_AUTH|TEST_AUTH", "--", "src", "worker"], { cwd: root, encoding: "utf8" });
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error; // 1 = no match
    }
    expect(hits).toBe("");
  });
});

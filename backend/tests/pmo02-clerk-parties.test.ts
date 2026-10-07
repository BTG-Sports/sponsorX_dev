import { createSign, generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-PMO-02, owner decision 3 — Clerk `authorizedParties`.

   The boundary: src/auth/clerk.ts is the only file that knows Clerk, and the
   other auth tests mock it whole. Here it is the thing under test, so the
   mock goes one level down: the REAL @clerk/backend verifier runs, with
   one change — it is handed this test's public key (`jwtKey`, Clerk's
   networkless verification) instead of fetching the instance's JWKS. Every
   check Clerk makes on a session token (signature, expiry, `azp`) is
   Clerk's own; the test only signs the tokens.
   -------------------------------------------------------------------------- */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

vi.mock("@clerk/backend", async (orig) => {
  const actual = await orig<typeof import("@clerk/backend")>();
  return {
    ...actual,
    createClerkClient: (opts: Parameters<typeof actual.createClerkClient>[0]) => {
      const real = actual.createClerkClient(opts);
      return {
        ...real,
        authenticateRequest: (req: Request, o: Record<string, unknown> = {}) =>
          real.authenticateRequest(req, { ...o, jwtKey: PEM } as Parameters<typeof real.authenticateRequest>[1]),
      };
    },
  };
});

const BASE_ENV = { ...process.env };
const PK = `pk_test_${Buffer.from("pmo02-parties.clerk.accounts.dev$").toString("base64")}`;

function setEnv(vars: Record<string, string | undefined>) {
  process.env = {
    ...BASE_ENV,
    DATABASE_URL: BASE_ENV.DATABASE_URL ?? "postgresql://sponsorx@127.0.0.1:55432/none",
    CLERK_SECRET_KEY: "sk_test_pmo02",
    CLERK_PUBLISHABLE_KEY: PK,
  };
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

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sessionToken(azp: string | undefined, sub = "user_pmo02") {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT", kid: "ins_pmo02" });
  const body = b64({ sub, sid: "sess_pmo02", iss: "https://pmo02-parties.clerk.accounts.dev", iat: now - 5, nbf: now - 5, exp: now + 60, ...(azp ? { azp } : {}) });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** Just what authenticateClerkRequest reads from an Express request. */
const request = (token: string) =>
  ({
    protocol: "http",
    originalUrl: "/api/v1/me",
    headers: { host: "127.0.0.1:4000", authorization: `Bearer ${token}` },
    get: (h: string) => (h.toLowerCase() === "host" ? "127.0.0.1:4000" : undefined),
  }) as unknown as import("express").Request;

describe("the list — config/authorized-parties.ts", async () => {
  const { authorizedPartiesFrom, toOrigin } = await import("../src/config/authorized-parties");

  it("unset: APP_URL's origin, plus the local web origins outside production", () => {
    expect(authorizedPartiesFrom(undefined, "https://sponsorx.net/", "production")).toEqual(["https://sponsorx.net"]);
    expect(authorizedPartiesFrom("", "https://web-staging-904a.up.railway.app", "production")).toEqual(["https://web-staging-904a.up.railway.app"]);
    expect(authorizedPartiesFrom(undefined, "http://127.0.0.1:3100", "development")).toEqual([
      "http://127.0.0.1:3100", "http://localhost:3100", "http://localhost:3000",
    ]);
  });

  it("set: exactly the origins listed, normalised", () => {
    expect(authorizedPartiesFrom(" https://SponsorX.net/ , https://web-staging-904a.up.railway.app ", "http://ignored", "production")).toEqual([
      "https://sponsorx.net", "https://web-staging-904a.up.railway.app",
    ]);
  });

  it("refuses anything that is not a bare http(s) origin", () => {
    for (const bad of ["sponsorx.net", "https://sponsorx.net/login", "ftp://sponsorx.net", "https://a@sponsorx.net", "https://sponsorx.net?x=1"]) {
      expect(() => toOrigin(bad), bad).toThrow(/CLERK_AUTHORIZED_PARTIES/);
    }
  });

  it("a malformed list refuses to boot", async () => {
    setEnv({ CLERK_AUTHORIZED_PARTIES: "sponsorx.net" });
    await expect(import("../src/config/env")).rejects.toThrow(/CLERK_AUTHORIZED_PARTIES/);
  });
});

describe("the API refuses a session minted on a foreign origin", () => {
  it("production: our origin is accepted, a foreign or local one is refused", async () => {
    setEnv({
      NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "staging", INTAKE_TOKEN_SECRET: "pmo02-real-intake-secret-0123456789",
      ZOHO_WEBHOOK_SECRET: "pmo02-zoho", APP_URL: "https://sponsorx.net", CLERK_AUTHORIZED_PARTIES: undefined,
    });
    const { authenticateClerkRequest } = await import("../src/auth/clerk");
    expect((await authenticateClerkRequest(request(sessionToken("https://sponsorx.net"))))?.clerkId).toBe("user_pmo02");
    expect(await authenticateClerkRequest(request(sessionToken("https://evil.example")))).toBeNull();
    expect(await authenticateClerkRequest(request(sessionToken("http://localhost:3000")))).toBeNull();
    expect(await authenticateClerkRequest(request(sessionToken("https://sponsorx.net.evil.example")))).toBeNull();
  });

  it("an explicit list is the whole list (staging with a Vercel test deployment)", async () => {
    setEnv({ APP_URL: "https://web-staging-904a.up.railway.app", CLERK_AUTHORIZED_PARTIES: "https://web-staging-904a.up.railway.app,https://sponsorx-test.vercel.app" });
    const { authenticateClerkRequest } = await import("../src/auth/clerk");
    expect(await authenticateClerkRequest(request(sessionToken("https://sponsorx-test.vercel.app")))).not.toBeNull();
    expect(await authenticateClerkRequest(request(sessionToken("https://web-staging-904a.up.railway.app")))).not.toBeNull();
    expect(await authenticateClerkRequest(request(sessionToken("http://127.0.0.1:3100")))).toBeNull();
  });

  it("locally and in the e2e harness the web origins still sign in", async () => {
    setEnv({ NODE_ENV: "development", APP_URL: "http://127.0.0.1:3100", CLERK_AUTHORIZED_PARTIES: undefined });
    const { authenticateClerkRequest } = await import("../src/auth/clerk");
    for (const origin of ["http://127.0.0.1:3100", "http://localhost:3100", "http://localhost:3000"]) {
      expect(await authenticateClerkRequest(request(sessionToken(origin))), origin).not.toBeNull();
    }
    expect(await authenticateClerkRequest(request(sessionToken("https://evil.example")))).toBeNull();
  });

  it("the verifier is real: a token signed by someone else is refused whatever its azp", async () => {
    setEnv({ APP_URL: "https://sponsorx.net" });
    const { authenticateClerkRequest } = await import("../src/auth/clerk");
    const forged = sessionToken("https://sponsorx.net").replace(/\.[^.]+$/, ".AAAA");
    expect(await authenticateClerkRequest(request(forged))).toBeNull();
  });
});

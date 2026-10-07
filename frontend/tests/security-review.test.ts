import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
/* src/server/{api,edge,payouts}.ts import "server-only" (2S8-SEC-05), which
   throws anywhere but a React Server bundle — as it should. Next resolves it
   to nothing on the server; so does this test. */
vi.mock("server-only", () => ({}));

/* --------------------------------------------------------------------------
   2S8-SEC-02 — the web app's findings from the OWASP review, each pinned.
   documentation/SponsorX-Security-Review-2026-10.md has the table.
   -------------------------------------------------------------------------- */

vi.mock("next/server", () => ({ after: () => {} }));

const { isSafeLocalPath } = await import("@/lib/safe-path");
const { safeReturnPath: standinReturn } = await import("@/lib/order-payment-live");
const { safeReturnPath: payoutReturn } = await import("@/lib/payouts-live");
const { GET: trackingGET } = await import("@/app/t/[code]/route");
const config = (await import("../next.config")).default;
const { securityHeaders } = await import("../next.config");

const src = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("A01 · open redirect: a return path stays on this site", () => {
  const hostile = [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/\t/evil.example", // browsers strip the tab → //evil.example
    "/\n/evil.example",
    "/\r/evil.example",
    "/\u0000/evil.example",
    "",
  ];
  it("refuses every way of naming another host", () => {
    for (const p of hostile) {
      expect(isSafeLocalPath(p), JSON.stringify(p)).toBe(false);
      expect(standinReturn(p)).toBe("/");
      expect(payoutReturn(p, "/fallback")).toBe("/fallback");
    }
  });
  it("still accepts an ordinary path with a query", () => {
    expect(standinReturn("/sponsor/orders/o1?payment=returned")).toBe("/sponsor/orders/o1?payment=returned");
    expect(payoutReturn("/property/earnings", "/x")).toBe("/property/earnings");
  });
});

describe("A01/A10 · the public short-link redirect", () => {
  const call = (code: string) => trackingGET(new Request("https://localhost:8080/t/x"), { params: Promise.resolve({ code }) });

  it('never asks the API about a code like ".." (which fetch would resolve to another endpoint)', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ destinationUrl: "https://brand.example" }));
    vi.stubGlobal("fetch", fetchSpy);
    for (const code of ["..", ".", "a/b", "a%2Fb", "x".repeat(65)]) {
      const res = await call(code);
      expect(res.headers.get("location")).toBe("/");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not follow a destination that is not absolute http(s)", async () => {
    for (const destinationUrl of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "/relative"]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ destinationUrl })));
      const res = await call("abcDEF123_-");
      expect(res.headers.get("location"), destinationUrl).toBe("/");
    }
  });
});

describe("A05 · security headers", () => {
  it("does not advertise the framework", () => {
    expect(config.poweredByHeader).toBe(false);
  });

  it("sends the baseline headers on every path, and no Referer from token pages", async () => {
    const rules = await config.headers!();
    expect(rules).toEqual(securityHeaders);
    const all = Object.fromEntries(rules.find((r) => r.source === "/:path*")!.headers.map((h) => [h.key, h.value]));
    expect(all["X-Content-Type-Options"]).toBe("nosniff");
    expect(all["X-Frame-Options"]).toBe("DENY");
    expect(all["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    /* 2S8-PMO-02 (owner, 2026-10-06): a year, includeSubDomains, never preload. */
    expect(all["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(all["Strict-Transport-Security"]).not.toMatch(/preload/);
    expect(all["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    for (const source of ["/r/:path*", "/u/:path*", "/test-provider/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule?.headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
      /* Later rules win in Next, so the override must come after the catch-all. */
      expect(rules.indexOf(rule!)).toBeGreaterThan(rules.findIndex((r) => r.source === "/:path*"));
    }
  });
});

describe("2S8-PMO-02 decision 1 · the full CSP, report-only", async () => {
  const { buildReportOnlyCsp, buildSecurityHeaders, clerkFrontendApi, apiRewrites, CSP_REPORT_PATH } = await import("../next.config");
  const pk = (host: string, live = false) => `pk_${live ? "live" : "test"}_${Buffer.from(`${host}$`).toString("base64")}`;
  const parse = (policy: string) =>
    Object.fromEntries(policy.split("; ").map((d) => { const [name, ...values] = d.split(" "); return [name!, values]; }));
  const PROD = { NODE_ENV: "production", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk("clerk.sponsorx.net", true), API_URL: "http://api.railway.internal:8080" };

  it("is sent beside the enforced headers, which are unchanged", () => {
    const all = Object.fromEntries(buildSecurityHeaders(PROD)[0]!.headers.map((h) => [h.key, h.value]));
    expect(all["Content-Security-Policy"]).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    expect(all["X-Frame-Options"]).toBe("DENY");
    expect(all["Content-Security-Policy-Report-Only"]).toBe(buildReportOnlyCsp(PROD));
    expect(all["Reporting-Endpoints"]).toBe(`csp="${CSP_REPORT_PATH}"`);
    /* The live config carries it too. */
    expect(securityHeaders[0]!.headers.map((h) => h.key)).toContain("Content-Security-Policy-Report-Only");
  });

  it("reads Clerk's Frontend API host out of the publishable key", () => {
    expect(clerkFrontendApi(pk("fond-cat-12.clerk.accounts.dev"))).toBe("https://fond-cat-12.clerk.accounts.dev");
    expect(clerkFrontendApi(pk("clerk.sponsorx.net", true))).toBe("https://clerk.sponsorx.net");
    expect(clerkFrontendApi("pk_test_x")).toBeNull();
    expect(clerkFrontendApi(undefined)).toBeNull();
    expect(clerkFrontendApi(`pk_test_${Buffer.from("evil.example; script-src *$").toString("base64")}`)).toBeNull();
  });

  it("production: allows exactly what the app loads — Next's inline scripts, Clerk, Turnstile, R2, the inline styles", () => {
    const d = parse(buildReportOnlyCsp({ ...PROD, R2_PUBLIC_BASE_URL: "https://cdn.sponsorx.net/assets" }));
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["script-src"]).toEqual(["'self'", "'unsafe-inline'", "https://clerk.sponsorx.net", "https://challenges.cloudflare.com"]);
    expect(d["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d["connect-src"]).toEqual(expect.arrayContaining(["'self'", "https://clerk.sponsorx.net", "https://challenges.cloudflare.com", "https://*.r2.cloudflarestorage.com"]));
    expect(d["frame-src"]).toEqual(expect.arrayContaining(["https://challenges.cloudflare.com", "https://*.r2.cloudflarestorage.com"]));
    expect(d["img-src"]).toEqual(expect.arrayContaining(["https://img.clerk.com", "https://cdn.sponsorx.net", "data:"]));
    expect(d["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(d["font-src"]).toEqual(["'self'", "data:"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["report-uri"]).toEqual([CSP_REPORT_PATH]);
    expect(d["report-to"]).toEqual(["csp"]);
    /* Nothing development-only reaches production. */
    const flat = Object.values(d).flat().join(" ");
    expect(flat).not.toMatch(/unsafe-eval|clerk\.accounts\.dev|clerk-telemetry|localhost|127\.0\.0\.1|ws:/);
  });

  it("a development instance (staging's pk_test_) and next dev get the development hosts", () => {
    const staging = parse(buildReportOnlyCsp({ NODE_ENV: "production", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk("fond-cat-12.clerk.accounts.dev") }));
    expect(staging["script-src"]).toEqual(expect.arrayContaining(["https://fond-cat-12.clerk.accounts.dev", "https://*.clerk.accounts.dev"]));
    expect(staging["script-src"]).not.toContain("'unsafe-eval'");
    const dev = parse(buildReportOnlyCsp({ NODE_ENV: "development" }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toEqual(expect.arrayContaining(["ws:", "http://127.0.0.1:9100", "http://localhost:9000"]));
  });

  it("reports (and the claim confirmation link, decision 5) go to the API through the web server — those two exact paths only", () => {
    expect(apiRewrites(PROD)).toEqual([
      { source: CSP_REPORT_PATH, destination: "http://api.railway.internal:8080/api/v1/public/csp-report" },
      { source: "/api/v1/public/athlete-claims/confirm", destination: "http://api.railway.internal:8080/api/v1/public/athlete-claims/confirm" },
    ]);
    expect(apiRewrites({})[0]!.destination).toBe("http://localhost:4000/api/v1/public/csp-report");
    for (const r of apiRewrites(PROD)) expect(r.source).not.toMatch(/[:*(]/);
  });
});

describe("2S8-PMO-02 decision 3 · Clerk authorizedParties on the web app", async () => {
  const { webAuthorizedParties } = await import("@/proxy");

  it("an explicit list wins, normalised to origins", () => {
    expect(webAuthorizedParties({ NODE_ENV: "production", CLERK_AUTHORIZED_PARTIES: "https://SponsorX.net/, https://web-staging-904a.up.railway.app" })).toEqual([
      "https://sponsorx.net", "https://web-staging-904a.up.railway.app",
    ]);
  });

  it("unset: APP_URL's origin, plus the local web origins (e2e on 127.0.0.1:3100) outside production", () => {
    expect(webAuthorizedParties({ NODE_ENV: "development" })).toEqual(["http://127.0.0.1:3100", "http://localhost:3100", "http://localhost:3000"]);
    expect(webAuthorizedParties({ NODE_ENV: "production", APP_URL: "https://sponsorx.net/" })).toEqual(["https://sponsorx.net"]);
  });

  it("unset in production with no APP_URL: Clerk's default, so nothing breaks (the API still enforces)", () => {
    expect(webAuthorizedParties({ NODE_ENV: "production" })).toBeUndefined();
  });

  it("the proxy passes the list to clerkMiddleware", () => {
    expect(src("src/proxy.ts")).toMatch(/clerkMiddleware\(\{ authorizedParties: webAuthorizedParties\(process\.env\) \}\)/);
  });
});

describe("A07 · signing out ends the session", () => {
  it("the portal user menu calls Clerk's signOut and clears our own cookies — not just a navigation", () => {
    const menu = src("src/components/user-menu.tsx");
    expect(menu).toMatch(/useClerk\(\)/);
    expect(menu).toMatch(/await signOut\(/);
    expect(menu).toMatch(/clearSessionCookiesAction\(\)/);
    expect(menu).not.toMatch(/router\.push\(["']\/login["']\)/);
    expect(src("src/server/sign-out-actions.ts")).toMatch(/jar\.delete\(WARD_COOKIE\)/);
  });
});

describe("A02/A07 · no test or mock auth reaches the web app", () => {
  it("nothing under src/ reads a test-auth header or a bypass flag", async () => {
    const { spawnSync } = await import("node:child_process");
    /* -I: skip binaries; untracked files too, so a new file is caught before it is committed. */
    const r = spawnSync("git", ["grep", "-n", "-i", "-I", "--untracked", "-E", "x-test-clerk|x-test-email|AUTH_BYPASS|MOCK_AUTH", "--", "src"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    });
    /* git grep: 1 = no match, 0 = matches found. */
    expect(r.stdout).toBe("");
    expect(r.status).toBe(1);
  });
});

describe("2S8-SEC-05 · the API client, edge forwarding and payout helpers are server-only", () => {
  const SERVER_ONLY = ["src/server/api.ts", "src/server/edge.ts", "src/server/payouts.ts"];

  it('each imports "server-only", and the marker resolves and refuses a non-server bundle', async () => {
    for (const f of SERVER_ONLY) expect(src(f), f).toMatch(/^import "server-only";$/m);
    /* The real package, not this file's mock: Next resolves it to an empty
       module under the react-server condition, and anything else throws. */
    const { createRequire } = await import("node:module");
    const req = createRequire(path.join(__dirname, "..", "package.json"));
    expect(req.resolve("server-only")).toMatch(/server-only[\\/]index\.js$/);
    expect(() => req("server-only")).toThrow(/Client Component/);
  });

  it('no "use client" module reaches them — what `import "server-only"` makes the build refuse', async () => {
    const { existsSync, readdirSync, statSync } = await import("node:fs");
    const root = path.join(__dirname, "..");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
      if (!base) return null;
      return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")].find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
    };
    const directive = (s: string) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use (client|server)["']/.exec(s)?.[1];
    const targets = new Set(SERVER_ONLY.map((f) => path.join(root, f)));
    const offenders: string[] = [];
    const clients = walk(path.join(root, "src")).filter((f) => directive(readFileSync(f, "utf8")) === "client");
    expect(clients.length).toBeGreaterThan(50);
    for (const start of clients) {
      const seen = new Set<string>();
      const stack: string[][] = [[start]];
      while (stack.length) {
        const chain = stack.pop()!;
        const file = chain[chain.length - 1]!;
        if (seen.has(file)) continue;
        seen.add(file);
        if (targets.has(file)) {
          offenders.push(chain.map((c) => path.relative(root, c)).join(" → "));
          continue;
        }
        const text = readFileSync(file, "utf8");
        /* A server action is a reference on the client, not its code. */
        if (file !== start && directive(text) === "server") continue;
        for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gm)) {
          const next = resolve(file, (m[1] ?? m[2])!);
          if (next) stack.push([...chain, next]);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

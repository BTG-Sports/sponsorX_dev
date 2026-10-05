import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(all["Strict-Transport-Security"]).toMatch(/max-age=\d{7,}/);
    expect(all["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    for (const source of ["/r/:path*", "/u/:path*", "/test-provider/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule?.headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
      /* Later rules win in Next, so the override must come after the catch-all. */
      expect(rules.indexOf(rule!)).toBeGreaterThan(rules.findIndex((r) => r.source === "/:path*"));
    }
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

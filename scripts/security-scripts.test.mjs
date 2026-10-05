/* --------------------------------------------------------------------------
   node --test scripts/ — 2S8-SEC-02. Proves the two CI gates catch what they
   claim to: the secret scanner's patterns, and the audit policy.

   The fake credentials are assembled from pieces so this file itself never
   matches the scanner it tests.
   -------------------------------------------------------------------------- */

import assert from "node:assert/strict";
import { test } from "node:test";

import { scanText } from "./secret-scan.mjs";
import { evaluate } from "./audit-check.mjs";

const j = (...parts) => parts.join("");
const A32 = "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6";

test("secret scan: flags each credential shape, and prints it masked", () => {
  const cases = {
    "stripe-or-clerk-secret-key": j("CLERK_SECRET_KEY=sk", "_live_", "Zx9Kq2Lm4Np6Rs8Tu0Vw"),
    "live-publishable-key": j("pk", "_live_", "Zx9Kq2Lm4Np6Rs8Tu0Vw"),
    "webhook-signing-secret": j("whsec", "_", "MfKQ9r8GKYqrTqBhyuAI7fUjB4v"),
    "aws-access-key-id": j("AKIA", "IOSFODNN7EXAMPLQ"),
    "s3-or-r2-secret-assignment": j("S3_SECRET", "_ACCESS_KEY=", A32, A32),
    "r2-access-key-assignment": j("R2_ACCESS", "_KEY_ID=", A32),
    "private-key": j("-----BEGIN ", "RSA PRIVATE", " KEY-----"),
    "zoho-oauth-token": j("1000.", A32, ".", A32),
    "resend-api-key": j("re", "_AbCd1234_", "QwErTyUiOpAsDfGhJk"),
    "database-url-with-password": j("postgresql://postgres:", "Hk3jdLq9", "@postgres.railway.internal:5432/railway"),
  };
  for (const [rule, line] of Object.entries(cases)) {
    const found = scanText(line, "f");
    assert.equal(found.length, 1, `${rule} should be found in: ${rule}`);
    assert.equal(found[0].rule, rule);
    assert.ok(!found[0].excerpt.includes(line.slice(-12)), "the finding never prints the secret in full");
  }
});

test("secret scan: leaves placeholders, publishable test keys and the local stack alone", () => {
  const clean = [
    'process.env.CLERK_SECRET_KEY ??= "sk_test_x";',
    j("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk", "_test_", "Y2xlcmsuZXhhbXBsZS5jb20k"),
    "DATABASE_URL: postgresql://sponsorx:sponsorx@localhost:5432/sponsorx_test",
    "postgresql://sponsorx@127.0.0.1:55432/sponsorx_test_c",
    "DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/sponsorx",
    'S3_SECRET_ACCESS_KEY: z.string().default("sponsorx-dev-secret"),',
    j("sk", "_live_", "Zx9Kq2Lm4Np6Rs8Tu0Vw  // secret-scan: allow"),
  ];
  for (const line of clean) assert.deepEqual(scanText(line), [], line);
});

const report = (vulns) => ({ vulnerabilities: vulns, metadata: { vulnerabilities: {} } });
const adv = (id, severity, title = "t") => ({ source: 1, url: `https://github.com/advisories/${id}`, severity, title });
const allowlist = {
  advisories: [{ id: "GHSA-dev-only", package: "braces", devOnly: true, reviewBy: "2099-01-01" }],
};

test("audit policy: clean when the only finding is the allowlisted dev-only one", () => {
  const all = report({
    braces: { severity: "high", via: [adv("GHSA-dev-only", "high")] },
    micromatch: { severity: "high", via: ["braces"] },
  });
  assert.deepEqual(evaluate({ prod: report({}), all, allowlist }).failures, []);
});

test("audit policy: a new high in production fails, even if its id is allowlisted as dev-only", () => {
  const prod = report({ next: { severity: "critical", via: [adv("GHSA-new", "critical")] } });
  assert.equal(evaluate({ prod, all: prod, allowlist }).failures.length, 2);
  const leaked = report({ braces: { severity: "high", via: [adv("GHSA-dev-only", "high")] } });
  const r = evaluate({ prod: leaked, all: leaked, allowlist });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /dev-only, but it ships/);
});

test("audit policy: a new moderate anywhere fails; a low is reported, not fatal", () => {
  const all = report({
    uuid: { severity: "moderate", via: [adv("GHSA-mod", "moderate")] },
    x: { severity: "low", via: [adv("GHSA-low", "low")] },
  });
  const r = evaluate({ prod: report({}), all, allowlist });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /GHSA-mod/);
  assert.ok(r.notes.some((n) => n.includes("GHSA-low")));
});

test("audit policy: an allowlist entry past its review date fails", () => {
  const stale = { advisories: [{ ...allowlist.advisories[0], reviewBy: "2026-01-01" }] };
  const r = evaluate({ prod: report({}), all: report({}), allowlist: stale, today: new Date("2026-10-05") });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /reviewBy/);
});

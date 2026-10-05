#!/usr/bin/env node
/* --------------------------------------------------------------------------
   npm run secrets:scan — 2S8-SEC-02.

   Greps every file git tracks for the shapes real credentials take: live and
   test API secret keys, cloud access keys, private keys, Zoho and Resend
   tokens, and database URLs that carry a password for a host that is not a
   local one. Exits 1 and names file:line for each hit, printing only a
   masked excerpt, so the CI log never becomes the leak.

   What it deliberately does NOT flag:
     - Clerk / Stripe publishable TEST keys (pk_test_…) — public by design;
     - the throwaway values tests use ("sk_test_x"): every key pattern needs
       a realistic length, which a placeholder never has;
     - the local-stack database URLs (sponsorx:sponsorx@localhost) that
       docker-compose.yml and CI use — a password for a database that only
       exists on a developer machine or a CI runner is not a secret.

   A line that must contain a match on purpose (a fixture proving this
   scanner works, say) carries the marker `secret-scan: allow`.

   Scope is the tracked tree as it stands, which is what a clone hands to
   anyone. A secret in history needs rotating, not just deleting — see
   documentation/SponsorX-Secrets-Rotation.md.
   -------------------------------------------------------------------------- */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOW_MARKER = "secret-scan: allow";

/* Integrity hashes and generated graphs: large, machine-written, and nothing
   a person pastes a key into. */
const SKIP = [/^package-lock\.json$/, /(^|\/)node_modules\//, /\.(png|jpe?g|gif|webp|avif|ico|pdf|glb|gltf|woff2?|ttf|otf|mp4|webm|zip|xlsx|docx|pptx)$/i];

/* Hosts a password in a URL may legitimately be written down for: the local
   stack and CI's service containers. Anything else — a *.railway.internal or
   *.rlwy.net host above all — is a real database. */
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "postgres", "db", "host.docker.internal"]);
const PLACEHOLDER_PASSWORD = /^(\$\{?[A-Z_]+\}?|<[^>]+>|\*+|x+|\.\.\.|password|pass|secret|changeme|PASSWORD|USER:PASSWORD)$/i;

export const RULES = [
  { id: "stripe-or-clerk-secret-key", re: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/g },
  { id: "live-publishable-key", re: /\bpk_live_[0-9A-Za-z]{16,}/g },
  { id: "webhook-signing-secret", re: /\bwhsec_[0-9A-Za-z+/=]{20,}/g },
  { id: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    id: "s3-or-r2-secret-assignment",
    re: /\b(?:AWS|S3|R2)_SECRET_ACCESS_KEY\s*[=:]\s*["']?([A-Za-z0-9/+=]{32,})/g,
  },
  { id: "r2-access-key-assignment", re: /\b(?:S3|R2)_ACCESS_KEY_ID\s*[=:]\s*["']?([0-9a-f]{32})\b/g },
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { id: "zoho-oauth-token", re: /\b1000\.[0-9a-f]{32}\.[0-9a-f]{32}\b/g },
  { id: "resend-api-key", re: /\bre_[0-9A-Za-z]{8}_[0-9A-Za-z]{16,}/g },
  { id: "github-token", re: /\bgh[pousr]_[0-9A-Za-z]{36,}/g },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    id: "database-url-with-password",
    re: /\bpostgres(?:ql)?:\/\/([^\s:@/'"`]+):([^\s@/'"`]+)@([^\s:/'"`?]+)/g,
    /* A finding only if the host is not local and the password is not an
       obvious placeholder. */
    accept: (m) => !LOCAL_DB_HOSTS.has(m[3].toLowerCase()) && !PLACEHOLDER_PASSWORD.test(m[2]),
  },
];

function mask(text) {
  if (text.length <= 8) return "*".repeat(text.length);
  return `${text.slice(0, 6)}…${"*".repeat(6)}…(${text.length} chars)`;
}

/** Scan one file's text; returns findings without the secret itself. */
export function scanText(text, file = "<text>") {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of line.matchAll(rule.re)) {
        if (rule.accept && !rule.accept(m)) continue;
        findings.push({ file, line: i + 1, rule: rule.id, excerpt: mask(m[0]) });
      }
    }
  });
  return findings;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean)
    .filter((f) => !SKIP.some((re) => re.test(f)));
}

function main() {
  const findings = [];
  let scanned = 0;
  for (const file of trackedFiles()) {
    const path = join(ROOT, file);
    let size;
    try {
      size = statSync(path).size;
    } catch {
      continue; // deleted in the working tree but still in the index
    }
    if (size > MAX_BYTES) continue;
    const buf = readFileSync(path);
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    scanned++;
    findings.push(...scanText(buf.toString("utf8"), file));
  }

  if (findings.length) {
    console.error(`✗ secret scan: ${findings.length} possible secret(s) in tracked files:`);
    for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.excerpt}`);
    console.error(
      "\nIf a hit is real: rotate the secret first (documentation/SponsorX-Secrets-Rotation.md), then remove it.\n" +
        `If it is a deliberate fixture, add the marker "${ALLOW_MARKER}" to that line.`,
    );
    process.exit(1);
  }
  console.log(`✓ secret scan: ${scanned} tracked files, no secrets found.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

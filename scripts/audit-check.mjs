#!/usr/bin/env node
/* --------------------------------------------------------------------------
   npm run audit:check — 2S8-SEC-02, the dependency scan CI enforces.

   Runs `npm audit` twice over the lockfile (no install needed):

     1. PRODUCTION dependencies only (--omit=dev) — what ships in the web and
        API images. Any high or critical advisory fails, allowlisted or not,
        unless its allowlist entry is explicitly not devOnly.
     2. The WHOLE tree — every advisory of moderate or higher that is not in
        scripts/audit-allowlist.json fails. Low ones are printed, not fatal.

   An allowlist entry past its `reviewBy` date also fails: an exception is
   re-justified on a schedule or it lapses, rather than living forever.

   Exit 0 = clean (bar the documented exceptions). Exit 1 = act on it.
   -------------------------------------------------------------------------- */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function audit(extra) {
  let out;
  try {
    out = execFileSync("npm", ["audit", "--json", ...extra], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    /* npm audit exits non-zero whenever it finds anything; the JSON is still
       on stdout. A real failure (no network, no lockfile) has no JSON. */
    out = err.stdout;
  }
  const json = JSON.parse(out || "{}");
  if (json.error) throw new Error(`npm audit failed: ${json.error.summary ?? JSON.stringify(json.error)}`);
  return json;
}

/** Every advisory in an audit report, flattened: one row per (GHSA, package). */
export function advisories(report) {
  const rows = [];
  for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via === "string") continue; // a dependent of a vulnerable package, not an advisory
      const id = String(via.url ?? "").split("/").pop() || String(via.source);
      rows.push({ id, package: name, severity: via.severity ?? vuln.severity, title: via.title, url: via.url });
    }
  }
  return rows;
}

/** Decide pass/fail. Pure, so the policy itself is testable. */
export function evaluate({ prod, all, allowlist, today = new Date() }) {
  const allowed = new Map((allowlist.advisories ?? []).map((a) => [a.id, a]));
  const failures = [];
  const notes = [];

  for (const entry of allowed.values()) {
    if (entry.reviewBy && new Date(entry.reviewBy) < today) {
      failures.push(`allowlist entry ${entry.id} (${entry.package}) passed its reviewBy date ${entry.reviewBy} — re-check it or remove it`);
    }
  }

  for (const a of advisories(prod)) {
    if (RANK[a.severity] < RANK.high) continue;
    const entry = allowed.get(a.id);
    if (!entry || entry.devOnly !== false) {
      failures.push(`PRODUCTION ${a.severity}: ${a.package} ${a.id} — ${a.title}${entry ? " (allowlisted as dev-only, but it ships)" : ""}`);
    }
  }

  const seen = new Set();
  for (const a of advisories(all)) {
    const key = `${a.id}:${a.package}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (allowed.has(a.id)) {
      notes.push(`allowlisted ${a.severity}: ${a.package} ${a.id}`);
      continue;
    }
    if (RANK[a.severity] >= RANK.moderate) failures.push(`${a.severity}: ${a.package} ${a.id} — ${a.title}`);
    else notes.push(`(not fatal) ${a.severity}: ${a.package} ${a.id} — ${a.title}`);
  }

  return { failures, notes };
}

function main() {
  const allowlist = JSON.parse(readFileSync(new URL("./audit-allowlist.json", import.meta.url), "utf8"));
  const prod = audit(["--omit=dev"]);
  const all = audit([]);
  const { failures, notes } = evaluate({ prod, all, allowlist });

  const count = (r) => JSON.stringify(r.metadata?.vulnerabilities ?? {});
  console.log(`npm audit — production: ${count(prod)}`);
  console.log(`npm audit — all:        ${count(all)}`);
  for (const n of notes) console.log(`  · ${n}`);

  if (failures.length) {
    console.error(`\n✗ dependency scan: ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  ${f}`);
    console.error("\nFix with `npm audit fix` (or an upgrade), or — only if it cannot be fixed and is not exploitable here — add it to scripts/audit-allowlist.json with the reason.");
    process.exit(1);
  }
  console.log("\n✓ dependency scan clean (production has no high/critical; everything else is fixed or allowlisted).");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

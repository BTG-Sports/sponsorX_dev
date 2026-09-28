/**
 * P6-SEC-02 — "Sponsors receive only the fields consent permits; the
 * restriction is enforced in select, not in the UI."
 *
 * What consent permits a sponsor in Phase 1 is NOTHING about the individual
 * fan. The fan agreed to be sent a voucher (the only consent purpose,
 * `reward-delivery`); the matrix makes reward events aggregate-only for every
 * role (§10 `rewardEvent`) and puts the address itself behind §7.2
 * `rewardClaim.fanContact`, denied to both sponsor roles. The "sponsor may
 * contact me" option that would change this is a Phase 2 requirement
 * (decided 2026-09-24).
 *
 * So the enforcement is structural, and this file is its guard: every read of
 * a RewardEvent in the codebase names its columns, none of them selects the
 * address, and the raw SQL that touches the table only ever tests it in a
 * WHERE clause. A future screen cannot show a sponsor a fan's email because
 * no query exists that would fetch one.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { canReadField } from "../src/auth/fields";

/** Every hand-written source file the API and the worker run. */
const files = execSync("git ls-files src worker scripts", { cwd: new URL("..", import.meta.url) })
  .toString()
  .split("\n")
  .filter((f) => /\.(m?ts)$/.test(f) && !f.startsWith("src/generated/"));
/* readFileSync, not a `cat` process per file — the per-spawn cost on Windows
   pushed this suite past the 5s test timeout (and `cat` assumes a POSIX
   shell). fileURLToPath, not URL.pathname: the repo path has a space (360743a). */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (f: string) => readFileSync(join(repoRoot, f), "utf8");

/** The argument block of each `rewardEvent.<method>(` call. */
function rewardEventCalls(): { file: string; method: string; args: string }[] {
  const out: { file: string; method: string; args: string }[] = [];
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/rewardEvent\.(\w+)\(/g)) {
      let depth = 0;
      let end = m.index! + m[0].length - 1;
      for (; end < src.length; end++) {
        if (src[end] === "(") depth++;
        else if (src[end] === ")" && --depth === 0) break;
      }
      out.push({ file, method: m[1]!, args: src.slice(m.index!, end + 1) });
    }
  }
  return out;
}

/* 2S6-BE-03 / 2S6-INT-03 (amended 2026-09-28, not replaced): a fan who
   ticked the separate "the sponsor may contact me" box may be given to the
   sponsor as a lead. So the address IS read — in exactly two places, and
   each read carries SPONSOR_CONTACTABLE in its own WHERE clause, so a claim
   without the tick, or withdrawn, is never fetched. Everywhere else the rule
   below still holds absolutely. */
const LEAD_READERS = ["src/domain/fan-leads.ts", "src/domain/zoho-sync.ts"];

describe("the address is never selected — except as a consented lead", () => {
  it("no Prisma select outside the two lead readers names fanEmail", () => {
    for (const file of files.filter((f) => !LEAD_READERS.includes(f))) {
      expect(read(file), file).not.toMatch(/fanEmail\s*:\s*true/);
    }
  });

  it("every read that selects the address carries the sponsor-contact condition in its WHERE", () => {
    const selecting = rewardEventCalls().filter((c) => /fanEmail\s*:\s*true/.test(c.args));
    expect(selecting.map((c) => c.file).sort()).toEqual([...LEAD_READERS].sort());
    for (const c of selecting) {
      expect(c.args, `${c.file}: rewardEvent.${c.method}`).toMatch(/where\s*:\s*\{[^}]*\.\.\.SPONSOR_CONTACTABLE/);
    }
  });

  it("every RewardEvent read names its columns — no whole-row reads", () => {
    const reads = rewardEventCalls().filter((c) => /^find/.test(c.method));
    expect(reads.length).toBeGreaterThan(0);
    for (const c of reads) {
      expect(c.args, `${c.file}: rewardEvent.${c.method} without select`).toMatch(/select\s*:/);
    }
  });

  it("nested reads of reward events select only their type", () => {
    for (const file of files) {
      for (const m of read(file).matchAll(/events\s*:\s*\{\s*select\s*:\s*\{([^}]*)\}/g)) {
        expect(m[1]!.trim(), file).toBe("type: true");
      }
    }
  });

  it("raw SQL on RewardEvent never puts the address in a SELECT list", () => {
    for (const file of files) {
      for (const m of read(file).matchAll(/SELECT([\s\S]*?)FROM\s+"RewardEvent"/g)) {
        expect(m[1], file).not.toContain("fanEmail");
      }
    }
  });
});

describe("what sponsors can reach about fans is counts — and consented leads", () => {
  it("§7.2 denies the fan's contact to both sponsor roles", () => {
    expect(canReadField(["SPONSOR_ADMIN"], "rewardClaim.fanContact")).toBe(false);
    expect(canReadField(["SPONSOR_ANALYST"], "rewardClaim.fanContact")).toBe(false);
  });

  it("§7.2 as amended: a sponsor-contact lead is the funding sponsor's and BTG's, nobody else's", () => {
    for (const r of ["SPONSOR_ADMIN", "SPONSOR_ANALYST", "BTG_ADMIN", "SUPER_ADMIN"] as const) {
      expect(canReadField([r], "rewardClaim.sponsorLead"), r).toBe(true);
    }
    for (const r of ["SALES", "CAMPAIGN_MGR", "ATHLETE", "GUARDIAN", "PROPERTY_MGR", "STUDENT", "ADVISOR"] as const) {
      expect(canReadField([r], "rewardClaim.sponsorLead"), r).toBe(false);
    }
  });

  it("the funnel is a groupBy count, and the report folds event types", () => {
    const reward = read("src/domain/reward.ts");
    expect(reward).toMatch(/rewardEvent\.groupBy\(\{[\s\S]*?_count/);
    const report = read("src/domain/sponsor-report.ts");
    expect(report).toContain("events: { select: { type: true } }");
  });
});

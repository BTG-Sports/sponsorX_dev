/**
 * P7-SEC-01 — "Every pricing, earnings and payout-status change writes an
 * audit entry." §26.
 *
 * This is a coverage check, not a behaviour test, and it is written
 * structurally on purpose. A behavioural test proves that the functions it
 * happens to call are audited; it says nothing about the one somebody adds
 * next month. What §26 needs is the opposite guarantee — that NOTHING in
 * these areas mutates money without a record — so the test enumerates the
 * money-mutating functions from the source and asserts each one audits.
 *
 * THE LIST IS DERIVED, NOT TYPED. Every exported async function in the
 * pricing and earnings modules is discovered by reading the file. A new
 * mutator is therefore covered the moment it is written, and the only way to
 * escape this test is to add a function and explicitly name it in
 * READ_ONLY below — which is a deliberate act a reviewer can see, rather
 * than an omission nobody notices.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** The modules §26 names as financial: pricing, earnings, payout status. */
const MONEY_MODULES = [
  "athlete-rate.ts",
  "earning.ts",
] as const;

/**
 * Functions in those modules that legitimately write nothing.
 *
 * Each is named individually rather than matched by a `read*` prefix,
 * because a prefix rule would let `readAndApplyCorrection` slip through.
 */
const READ_ONLY = new Set([
  "readRateCard",
  "readEarning",
  "breakdown",
  "clearsFloor",
]);

function sourceOf(file: string): string {
  return readFileSync(new URL(`../src/domain/${file}`, import.meta.url), "utf8");
}

/** Every exported function, with the body that follows it. */
function exportedFunctions(source: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /^export (?:async )?function (\w+)/gm;
  const hits = [...source.matchAll(re)];
  hits.forEach((m, i) => {
    const start = m.index!;
    const end = i + 1 < hits.length ? hits[i + 1]!.index! : source.length;
    out.push({ name: m[1]!, body: source.slice(start, end) });
  });
  return out;
}

describe("P7-SEC-01 · every money change is audited", () => {
  const discovered = MONEY_MODULES.flatMap((file) =>
    exportedFunctions(sourceOf(file)).map((fn) => ({ file, ...fn })),
  );

  it("finds the money modules and their functions", () => {
    expect(discovered.length).toBeGreaterThan(6);
  });

  const mutators = discovered.filter((fn) => !READ_ONLY.has(fn.name));

  it.each(mutators.map((fn) => [`${fn.file}:${fn.name}`, fn] as const))(
    "%s writes an audit entry",
    (_label, fn) => {
      expect(fn.body).toMatch(/\baudit\(/);
    },
  );

  /* The exemption list must not rot. A name left here after the function is
     renamed or deleted would silently exempt nothing, which is harmless —
     but a name here that DOES still exist and has grown a write is the
     failure this guards. */
  it.each([...READ_ONLY])("the exempt function %s still writes nothing", (name) => {
    const fn = discovered.find((f) => f.name === name);
    if (!fn) return; // renamed or removed; nothing to protect
    expect(fn.body).not.toMatch(/\.(create|update|upsert|delete|updateMany)\(/);
  });
});

describe("the payout states are audited under §26's payout area", () => {
  const earning = sourceOf("earning.ts");

  /* Every EarningState must map to an audit action — a state reachable with
     no action name would write an audit row saying nothing useful, or none
     at all. */
  it.each(["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID", "HELD", "DISPUTED"])(
    "%s has an audit action",
    (state) => {
      expect(earning).toMatch(new RegExp(`${state}:\\s*(AUDIT_ACTIONS|")`));
    },
  );

  it("the automatic eligibility transition audits too", () => {
    const fn = exportedFunctions(earning).find((f) => f.name === "maybeMakeEligible")!;
    expect(fn.body).toMatch(/\baudit\(/);
    expect(fn.body).toMatch(/markEligible/);
  });
});

describe("the audit helper cannot be bypassed by writing the row directly", () => {
  it.each(MONEY_MODULES)("%s does not insert into AuditLog itself", (file) => {
    /* Everything must go through `audit()`, which stamps the tenant and the
       actor. A hand-rolled auditLog.create would be one call away from an
       audit row on the wrong tenant — invisible to the tenant it belongs to
       and visible to one it does not. */
    expect(sourceOf(file)).not.toMatch(/auditLog\.create/);
  });
});

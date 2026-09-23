/**
 * P7-SEC-02 — "A codebase-wide check confirms no tax ID, bank credential or
 * card data field exists in any model." §26, Addendum A6.
 *
 * Phase 1 tracks earnings STATUS only. Money moves in Zoho Books, arranged by
 * a person, and nothing here initiates a payment. §26 forbids bank details
 * outright; Addendum A6 defers tax IDs to the phase that actually needs them.
 *
 * THE POINT OF THIS TEST IS THE DAY SOMEBODY ADDS ONE. Everyone knows the
 * rule today. In four months a well-meaning change adds `taxId` to Athlete so
 * a 1099 can be generated, and the review passes because it looks reasonable
 * in isolation. This fails that commit and makes the decision explicit
 * instead of accidental.
 *
 * IT SCANS THE WHOLE SOURCE, not a list of models. "In any model" is the
 * acceptance, and a check that enumerated models would miss the one added
 * next — which is precisely the case it exists for.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Field names that must not exist. Deliberately narrow and literal.
 *
 * Not a regex over "tax" or "card" — `taxYear` is legitimate and required
 * for reporting, and `cardinality` would be absurd to flag. A precise list
 * that someone must consciously work around beats a fuzzy one that gets
 * disabled the first time it cries wolf.
 */
const FORBIDDEN_FIELDS = [
  "taxId", "taxIdentifier", "tin", "ssn", "socialSecurity", "ein",
  "bankAccount", "accountNumber", "routingNumber", "sortCode", "iban", "swift",
  "cardNumber", "cvv", "cvc", "expiryMonth", "expiryYear", "pan",
] as const;

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

/** Field declarations only — `name Type`, ignoring comments and relations. */
function declaredFields(source: string): string[] {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("///"))
    .map((l) => /^\s{2}(\w+)\s+\w/.exec(l)?.[1])
    .filter((n): n is string => Boolean(n));
}

describe("P7-SEC-02 · no tax, bank or card field anywhere in the schema", () => {
  const fields = declaredFields(schema);

  it("reads a plausible number of fields", () => {
    expect(fields.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN_FIELDS)("no model declares %s", (forbidden) => {
    const hit = fields.find((f) => f.toLowerCase() === forbidden.toLowerCase());
    expect(hit, `schema.prisma declares a forbidden field: ${hit}`).toBeUndefined();
  });

  /* The legitimate near-misses, asserted present so that a future tightening
     of this test cannot quietly delete them. */
  it("keeps taxYear, which is reporting and not an identifier", () => {
    expect(fields).toContain("taxYear");
  });

  it("keeps Earning.reference, a pointer rather than a credential", () => {
    expect(fields).toContain("reference");
  });
});

describe("nor anywhere else in the source", () => {
  /* The schema is the authority, but a forbidden field could equally arrive
     in a Zod contract, a DTO or a route body and reach a JSON column. */
  /* fileURLToPath, not URL.pathname — the latter yields "/D:/…%20…" on
     Windows (leading slash, percent-encoded spaces), which spawnSync rejects
     with ENOENT before grep ever runs. */
  const sources = execSync(
    "grep -rl '' src --include='*.ts' | grep -v generated",
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  it("scans a plausible number of files", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN_FIELDS)("no source file declares %s as a property", (forbidden) => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(
        new URL(`../${file}`, import.meta.url), "utf8");
      /* `name:` as an object property or a Zod field — not a mention in
         prose, which is how this rule gets explained. */
      const re = new RegExp(`^\\s*${forbidden}\\s*:`, "im");
      if (re.test(text)) offenders.push(file);
    }
    expect(offenders, `declared in: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("and no payment provider is wired in", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  /* Addendum A6 again: nothing in Phase 1 moves money. A payment SDK in the
     dependency list would be the clearest possible signal that changed. */
  it.each(["stripe", "@stripe/stripe-js", "braintree", "square", "paypal", "plaid", "dwolla"])(
    "does not depend on %s",
    (vendor) => {
      expect(deps).not.toContain(vendor);
    },
  );
});

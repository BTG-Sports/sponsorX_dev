import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   The warehouse rule (user, 2026-10-13; documentation/SponsorX-Warehouse-
   Schema.md §2): ANYTHING THAT NEEDS THE CURRENT STATUS READS THE APP, NEVER
   THE WAREHOUSE. The warehouse is up to an hour behind by design, so a live
   decision — a payment, a payout, a refund, a cancellation, who may see what,
   whether a code can still be redeemed — must never be taken from it. Only
   the worker writes it; only analysis reads it.

   Enforced here: no app code (backend/src, frontend/src) connects to the
   warehouse or queries its schemas. When an analysis screen needs warehouse
   figures (3S7), it gets a reader of its own, named in this test on purpose.
   -------------------------------------------------------------------------- */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" || n === "node_modules" ? [] : files(p);
    return /\.(m?ts|tsx)$/.test(n) ? [p] : [];
  });
}

const FORBIDDEN = [/WAREHOUSE_(SOURCE_)?DATABASE_URL/, /worker\/warehouse\//, /\b(dw|stg|sem|raw)\.(fact_|dim_|snap_|campaign_|_ingest|"[A-Z])/];

describe("the warehouse rule: live decisions read the app, never the warehouse", () => {
  for (const root of ["../src", "../../frontend/src"]) {
    it(`no code under ${root.replace("../", "")} reaches the warehouse`, () => {
      /* fileURLToPath, not .pathname: on Windows the latter is "/D:/…" with the space still encoded (QA 2026-10-15). */
      const offenders = files(fileURLToPath(new URL(root, import.meta.url)))
        .filter((f) => FORBIDDEN.some((re) => re.test(readFileSync(f, "utf8"))));
      expect(offenders).toEqual([]);
    });
  }
});

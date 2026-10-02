import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   2S8-QA-04 — the backend suite runs its files in parallel on ONE database,
   so a file may only touch its own rows. Two ways that went wrong, each
   seen as a flake that passed alone:

   - A shared tenant id. next-public-apply and notification-preferences both
     used "np_tenant"; each one's clean-up deleted the other's users mid-run,
     so the advisor's login answered 403 (fixed in 1047420; reproduced
     2026-10-02 by putting the old id back — 3 failures in 6 paired runs).
   - A platform-wide sweep run with a moved clock. phase2-guardian-acts ran
     sweepComingOfAge 91 days ahead across every tenant, and started,
     reminded and terminated phase2-merge-gaps' athletes (traced 2026-10-02).

   This pins both shut for the next file written.
   -------------------------------------------------------------------------- */

const dir = resolve(dirname(fileURLToPath(import.meta.url)));
const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts"));
const source = new Map(files.map((f) => [f, readFileSync(resolve(dir, f), "utf8")]));

describe("suite isolation · static", () => {
  it("no tenant id is declared by two test files", () => {
    const owners = new Map<string, string[]>();
    for (const [file, text] of source) {
      const ids = new Set<string>();
      for (const m of text.matchAll(/\bconst (?:T|OTHER|X|T2|TB|OTHER_T|TENANT[A-Z_]*) = "([^"]+)"/g)) ids.add(m[1]!);
      for (const m of text.matchAll(/tenant\.create(?:Many)?\(\{\s*data:\s*\[?\s*\{\s*id:\s*"([^"]+)"/g)) ids.add(m[1]!);
      for (const id of ids) owners.set(id, [...(owners.get(id) ?? []), file]);
    }
    expect(owners.size).toBeGreaterThan(50); // the scan still finds the convention
    const shared = [...owners].filter(([, by]) => by.length > 1).map(([id, by]) => `${id}: ${by.join(", ")}`);
    expect(shared).toEqual([]);
  });

  /* A bare listen(0) binds `::` (every address). On macOS that can be handed
     a port another program already holds on 127.0.0.1 — VS Code's helper,
     here — and the test's own fetch to 127.0.0.1 then reaches THAT program:
     nul-input saw 404s with empty bodies, even for /api/v1/ (2026-10-02;
     reproduced by binding :: on the helper's port 49190). Bound to
     127.0.0.1, the address the requests go to, the port is refused instead. */
  it("every test server listens on 127.0.0.1, the address its requests go to", () => {
    const bare: string[] = [];
    for (const [file, text] of source) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!/\.listen\(/.test(line) || line.includes("/\\.listen")) return;
        /* With a host the bind is asynchronous: address() is null until "listening". */
        if (!/\.listen\(0, "127\.0\.0\.1"\)/.test(line) || !lines[i + 1]?.includes('once("listening"')) bare.push(`${file}:${i + 1}`);
      });
    }
    expect(bare).toEqual([]);
  });

  /* Each of these sweeps every tenant when called bare — right for the worker,
     wrong for a test, which must pass its own tenant. */
  const SWEEPS = [
    "sweepComingOfAge", "sweepDeliveries", "sweepSellerApprovals", "sweepUnpaidOrders",
    "expireReservations", "sendListingDigests", "sendOrderApprovalDigests", "purgeExpiredClosures",
  ];

  it("every platform-wide sweep a test runs is narrowed to that test's tenant", () => {
    const bare: string[] = [];
    for (const [file, text] of source) {
      if (file === "suite-isolation.static.test.ts") continue;
      text.split("\n").forEach((line, i) => {
        for (const fn of SWEEPS) {
          if (!new RegExp(`\\b${fn}\\(`).test(line) || /import\(|\bconst \{/.test(line)) continue;
          if (!/tenantIds:|, T\)|\[T\]/.test(line)) bare.push(`${file}:${i + 1} ${fn}`);
        }
      });
    }
    expect(bare).toEqual([]);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { config } from "@/proxy";

/* --------------------------------------------------------------------------
   P6-QA-02 (static half) — the fan routes stay plain dynamic routes.

   "No ISR, no edge middleware" (Addendum A10). Checked in code so it cannot
   quietly regress: no route under /r, /t or /u opts into caching,
   pre-rendering or the edge runtime, and the Clerk proxy never runs on them.
   The throttled-phone half is e2e/redeem-budget.spec.ts.
   -------------------------------------------------------------------------- */

const APP = join(__dirname, "..", "src", "app");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("the fan routes are plain dynamic routes", () => {
  const fan = ["r", "t", "u"].flatMap((d) => files(join(APP, d)));

  it("finds them", () => {
    expect(fan.some((f) => f.endsWith(join("r", "[token]", "route.ts")))).toBe(true);
  });

  it.each(["revalidate", "generateStaticParams", "force-static", "\"edge\"", "'edge'", "dynamicParams"])(
    "none of them uses %s",
    (needle) => {
      for (const f of fan) expect(readFileSync(f, "utf8"), f).not.toContain(needle);
    },
  );

  it("none of them is a React page — no client bundle can be attached", () => {
    expect(fan.filter((f) => /page\.(t|j)sx?$/.test(f))).toEqual([]);
  });
});

describe("the Clerk proxy never runs on a fan route", () => {
  /* The first matcher entry is a plain regex path; anchor it as Next does. */
  const matches = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));

  it.each(["/r/abc123", "/r/abc123/claim", "/t/xyz", "/u/ev.sig"])("skips %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  it.each(["/", "/sponsor", "/sponsor/marketplace", "/rewards-desk", "/admin"])("still runs on %s", (path) => {
    expect(matches(path)).toBe(true);
  });
});

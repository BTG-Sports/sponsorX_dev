import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   P8-SEC-02, the static half — every read on the request path is scoped.

   tests/tenant-isolation.test.ts proves the running API cannot be made to
   cross tenants. This proves the next query written cannot quietly start:
   every Prisma read in a file reachable from src/app.ts must carry its
   tenant in its own arguments — `whereFor(...)`, a `tenantId`, or a where
   built from them — or say, in a `tenant-scope:` note inside the call, why
   the key it uses was already scoped. A new unscoped read fails here with
   its file and line, and the note is where a reviewer looks.

   It also pins the fix to the defect the sweep found: whereFor returns its
   scope inside `AND`, so a caller's `id:` can never overwrite it.
   -------------------------------------------------------------------------- */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requestPathFiles(): string[] {
  const seen = new Set<string>();
  const stack = [resolve(root, "src/app.ts")];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+"(\.[^"]+)"/gm)) {
      const base = resolve(dirname(file), m[1]!);
      const next = [base, `${base}.ts`, `${base}/index.ts`].find((c) => existsSync(c) && c.endsWith(".ts"));
      if (next && !next.includes("/generated/")) stack.push(next);
    }
  }
  return [...seen];
}

const READ = /\b(tx|prisma|db)\.(\w+)\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy)\(/g;
const SCOPED = /whereFor\(|tenantId|\.\.\.tenant\b|where: tenant\b|\.\.\.where\b|tenant-scope:/;
/* Models with no tenant at all. */
const GLOBAL = new Set(["tenant"]);

describe("every request-path read carries its tenant, or says why not", () => {
  const files = requestPathFiles();

  it("walks the request path", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("finds no unscoped read", () => {
    const offenders: string[] = [];
    let reads = 0;
    for (const file of files) {
      const s = readFileSync(file, "utf8");
      for (const m of s.matchAll(READ)) {
        if (GLOBAL.has(m[2]!)) continue;
        let i = m.index! + m[0].length;
        let depth = 1;
        while (depth && i < s.length) {
          if (s[i] === "(") depth++;
          else if (s[i] === ")") depth--;
          i++;
        }
        reads++;
        const arg = s.slice(m.index! + m[0].length, i - 1);
        if (!SCOPED.test(arg)) {
          const line = s.slice(0, m.index).split("\n").length;
          offenders.push(`${relative(root, file)}:${line} ${m[2]}.${m[3]}`);
        }
      }
    }
    expect(reads).toBeGreaterThan(80);
    expect(offenders, "unscoped reads — scope them, or add a reviewed `tenant-scope:` note inside the call").toEqual([]);
  });

  it("wraps every scope in AND, so a caller's key cannot overwrite it", async () => {
    process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
    process.env.CLERK_SECRET_KEY ??= "sk_test_x";
    process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
    const { whereFor, MATCHES_NOTHING } = await import("../src/auth/scope");
    const athlete = { userId: "u", tenantId: "t1", roles: ["ATHLETE" as const], sponsorId: null, athleteId: "me", guardianId: null, propertyId: null };
    /* The exact shape of the defect: spread the scope, then name an id. */
    const where = { ...whereFor(athlete, "athlete", "read"), id: "someone_else" };
    expect(where).toEqual({ AND: [{ tenantId: "t1", id: "me" }], id: "someone_else" });
    const nobody = { ...athlete, athleteId: null };
    expect({ ...whereFor(nobody, "athlete", "read"), id: "x" }).toEqual({ AND: [MATCHES_NOTHING], id: "x" });
  });
});

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

   2S8-QA-07 — writes are held to the same rule: every update, updateMany,
   delete, deleteMany and upsert, and every raw SQL statement that writes,
   carries its tenant or a `tenant-scope:` note (inside the call, or the
   comment directly above it) naming the scoped read it relies on.
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
      /* normalize separators first — on Windows resolve() yields backslashes
         and a "/generated/" check waves the whole generated client through
         (the payment-policy scan hit the same class of bug, 360743a) */
      if (next && !next.replaceAll("\\", "/").includes("/generated/"))
        stack.push(next);
    }
  }
  return [...seen];
}

const READ = /\b(tx|prisma|db)\.(\w+)\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy)\(/g;
const SCOPED = /whereFor\(|tenantId|\.\.\.tenant\b|where: tenant\b|\.\.\.where\b|tenant-scope:/;
/* Models with no tenant at all. */
const GLOBAL = new Set(["tenant"]);

/* 2S8-QA-07 — writes too. An update, delete or upsert keyed by id alone is
   only as scoped as the read that found the id, so it must say so: carry its
   tenant (`whereFor`, a `tenantId`) or a `tenant-scope:` note naming the
   scoped read it relies on — inside the call, or in the comment directly
   above the statement. Raw SQL that writes (UPDATE / DELETE / INSERT) is
   held to the same rule, over its SQL and arguments. */
const WRITE = /\b(tx|prisma|db)\.(\w+)\.(update|updateMany|delete|deleteMany|upsert)\(/g;
const RAW = /\b(tx|prisma|db)\.\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)(?:<[^`(]*?>)?(`|\()/g;
const RAW_WRITE = /\bUPDATE\s+"|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b/i;

/** The text of a call's arguments: to its closing paren, or to the end of a tagged template. */
function extent(s: string, start: number, open: string): number {
  let i = start;
  if (open === "`") {
    while (i < s.length && s[i] !== "`") i++;
    return i + 1;
  }
  let depth = 1;
  while (depth && i < s.length) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    i++;
  }
  return i;
}

/** The comment block ending on the line just above `index`'s line, or "". */
function noteAbove(s: string, index: number): string {
  const lineStart = s.lastIndexOf("\n", index - 1) + 1;
  const before = s.slice(0, lineStart).replace(/\s+$/, "");
  if (!before.endsWith("*/")) return "";
  const open = before.lastIndexOf("/*");
  return open === -1 ? "" : before.slice(open);
}

/** A match inside a comment (a JSDoc example) is not code. */
function inComment(s: string, index: number): boolean {
  const lineStart = s.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\*|\/\/|\/\*)/.test(s.slice(lineStart, index));
}

/** Every unscoped write in one file's source, as `file:line model.op`. */
export function unscopedWrites(s: string, file: string): { writes: number; offenders: string[] } {
  const offenders: string[] = [];
  let writes = 0;
  const lineOf = (i: number) => s.slice(0, i).split("\n").length;
  for (const m of s.matchAll(WRITE)) {
    if (GLOBAL.has(m[2]!) || inComment(s, m.index!)) continue;
    writes++;
    const arg = s.slice(m.index! + m[0].length, extent(s, m.index! + m[0].length, "(") - 1);
    if (!SCOPED.test(arg) && !/tenant-scope:/.test(noteAbove(s, m.index!))) offenders.push(`${file}:${lineOf(m.index!)} ${m[2]}.${m[3]}`);
  }
  for (const m of s.matchAll(RAW)) {
    if (inComment(s, m.index!)) continue;
    const body = s.slice(m.index! + m[0].length, extent(s, m.index! + m[0].length, m[3]!) - 1);
    if (!RAW_WRITE.test(body)) continue;
    writes++;
    if (!SCOPED.test(body) && !/tenant-scope:/.test(noteAbove(s, m.index!))) offenders.push(`${file}:${lineOf(m.index!)} raw ${m[2]}`);
  }
  return { writes, offenders };
}

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

  it("finds no unscoped write — update, delete, upsert or raw SQL (2S8-QA-07)", () => {
    const offenders: string[] = [];
    let writes = 0;
    for (const file of files) {
      const found = unscopedWrites(readFileSync(file, "utf8"), relative(root, file));
      writes += found.writes;
      offenders.push(...found.offenders);
    }
    expect(writes).toBeGreaterThan(200);
    expect(offenders, "unscoped writes — scope them, or add a reviewed `tenant-scope:` note naming the scoped read they rely on").toEqual([]);
  });

  it("the write check catches what it claims to, and passes what it should", () => {
    const flagged = (src: string) => unscopedWrites(src, "x.ts").offenders.length;
    /* Unscoped: refused. */
    expect(flagged("await tx.campaignOrder.update({ where: { id }, data: { state } });")).toBe(1);
    expect(flagged("await prisma.listing.deleteMany({ where: { id: { in: ids } } });")).toBe(1);
    expect(flagged("await tx.cart.upsert({ where: { id }, create: data, update: data });")).toBe(1);
    expect(flagged('await tx.$executeRaw`UPDATE "Payout" SET state = ${s} WHERE id = ${id}`;')).toBe(1);
    expect(flagged('await tx.$executeRawUnsafe(`DELETE FROM "Cart" WHERE id = $1`, id);')).toBe(1);
    /* A note somewhere else in the function is not this call's note. */
    expect(flagged("/* tenant-scope: about the read */\nconst a = 1;\nawait tx.offer.update({ where: { id }, data });")).toBe(1);
    /* Scoped, or justified at the call: passed. */
    expect(flagged("await tx.campaignOrder.updateMany({ where: { ...whereFor(actor, \"campaignOrder\", \"write\"), id }, data });")).toBe(0);
    expect(flagged("await tx.campaignOrder.updateMany({ where: { id, tenantId: actor.tenantId }, data });")).toBe(0);
    expect(flagged("await tx.offer.update({\n  /* tenant-scope: the offer loaded above through whereFor. */\n  where: { id }, data });")).toBe(0);
    expect(flagged("    /* tenant-scope: the offer loaded above through whereFor. */\n    await tx.offer.update({ where: { id }, data });")).toBe(0);
    expect(flagged('await tx.$executeRaw`UPDATE "Payout" SET state = ${s} WHERE id = ${id} AND "tenantId" = ${t}`;')).toBe(0);
    /* Not writes: a row lock, a lock function, a JSDoc example. */
    expect(flagged('await tx.$queryRaw`SELECT id FROM "Edition" WHERE id = ${id} FOR UPDATE`;')).toBe(0);
    expect(flagged(" *   const c = await tx.campaign.update({ ... })")).toBe(0);
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

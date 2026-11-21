import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-123: a backend file the frontend imports never reaches the database.

   The frontend borrows some backend files (contracts, pure rules) so its
   screens and tests check against what the API really accepts. The website's
   build on Railway has no generated Prisma client and no database. If a
   borrowed file reaches backend/src/db/ or backend/src/generated/, even
   through a type-only import, that build cannot type-check it. CI generates
   the client first, so it would pass while every deploy of the website failed.
   That happened from 2026-11-20: contracts/student.ts took two word lists from
   domain/student.ts, which loads the database client.

   Walks every relative import (type-only ones included, because the type
   check needs those files too) from each backend file the frontend imports.
   -------------------------------------------------------------------------- */

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(backendRoot, "..");
const backendSrc = join(backendRoot, "src");
const frontendRoot = join(repoRoot, "frontend");

const norm = (p: string) => p.replaceAll("\\", "/");
const FORBIDDEN = [`${norm(backendSrc)}/db/`, `${norm(backendSrc)}/generated/`];

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}/index.ts`]) {
    if (existsSync(candidate) && /\.(m?ts|tsx)$/.test(candidate)) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specs = [
    ...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']/gm),
    ...text.matchAll(/^\s*import\s+["'](\.[^"']+)["']/gm),
    ...text.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g),
  ].map((m) => m[1]!);
  return specs.map((s) => resolveImport(file, s)).filter((f): f is string => f !== null);
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === ".next") return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.(m?ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

/** Each backend file the frontend imports, with the frontend files importing it. */
function borrowedBackendFiles(): Map<string, string[]> {
  const borrowed = new Map<string, string[]>();
  for (const file of [...sourceFiles(join(frontendRoot, "src")), ...sourceFiles(join(frontendRoot, "tests"))]) {
    for (const target of importsOf(file)) {
      if (!norm(target).startsWith(`${norm(backendSrc)}/`)) continue;
      borrowed.set(target, [...(borrowed.get(target) ?? []), norm(relative(repoRoot, file))]);
    }
  }
  return borrowed;
}

/** The import chain from `entry` to the first database file it reaches, or null. */
function pathToDatabase(entry: string): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (FORBIDDEN.some((f) => norm(file).startsWith(f))) {
      const chain: string[] = [];
      for (let at: string | null = file; at; at = parent.get(at) ?? null) chain.unshift(norm(relative(repoRoot, at)));
      return chain;
    }
    for (const next of importsOf(file)) {
      if (parent.has(next)) continue;
      parent.set(next, file);
      queue.push(next);
    }
  }
  return null;
}

describe("backend files the frontend imports stay free of the database (POL-BE-123)", () => {
  const borrowed = borrowedBackendFiles();

  it("finds the files the frontend borrows", () => {
    /* A walk that found nothing would pass for the wrong reason. */
    expect(borrowed.size).toBeGreaterThan(0);
    expect([...borrowed.keys()].map((f) => norm(relative(repoRoot, f)))).toContain("backend/src/contracts/student.ts");
  });

  it("none of them reaches backend/src/db/ or backend/src/generated/", () => {
    const problems = [...borrowed].flatMap(([file, users]) => {
      const chain = pathToDatabase(file);
      return chain ? [`${chain.join(" → ")}  (imported by ${users.join(", ")})`] : [];
    });
    expect(problems, "move what the frontend needs into a module with no database imports").toEqual([]);
  });

  it("the walk would catch the 2026-11-20 break", () => {
    /* domain/student.ts loads the database client; reaching it must count. */
    expect(pathToDatabase(join(backendSrc, "domain", "student.ts"))).not.toBeNull();
  });
});

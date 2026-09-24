import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   "Zoho never touches a request path" — CLAUDE.md, §18, P8-INT-03.

   Walks the import graph from the API's entry point, following every
   relative import, and fails if the Zoho client or the sync engine is
   reachable. A route that imports either — however indirectly — could call
   Zoho while a sponsor waits, and would stop working when Zoho does. The
   API may only enqueue.
   -------------------------------------------------------------------------- */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.mts`, `${base}/index.ts`]) {
    if (existsSync(candidate) && candidate.match(/\.m?ts$/)) return candidate;
  }
  return null;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    /* Type-only imports are erased at runtime and cannot call anything. */
    for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+"(\.[^"]+)"/gm)) {
      const next = resolveImport(file, m[1]!);
      if (next && !next.includes("/generated/")) stack.push(next);
    }
    for (const m of text.matchAll(/import\(\s*"(\.[^"]+)"\s*\)/g)) {
      const next = resolveImport(file, m[1]!);
      if (next) stack.push(next);
    }
  }
  return seen;
}

describe("the API cannot reach Zoho", () => {
  const graph = reachable(resolve(root, "src/app.ts"));

  it("walks the real graph", () => {
    expect(graph.size).toBeGreaterThan(40);
    expect([...graph].some((f) => f.endsWith("routes/v1/zoho-webhooks.ts"))).toBe(true);
    expect([...graph].some((f) => f.endsWith("routes/v1/inquiries.ts"))).toBe(true);
    expect([...graph].some((f) => f.endsWith("domain/sync-tasks.ts"))).toBe(true);
  });

  it.each(["src/lib/zoho.ts", "src/domain/zoho-sync.ts"])("never imports %s", (file) => {
    const hit = [...graph].find((f) => f === resolve(root, file));
    expect(hit, `${file} is reachable from src/app.ts — a request path could call Zoho`).toBeUndefined();
  });

  it("the worker is where the sync lives", () => {
    const worker = reachable(resolve(root, "worker/index.mts"));
    expect(worker.has(resolve(root, "src/lib/zoho.ts"))).toBe(true);
    expect(worker.has(resolve(root, "src/domain/zoho-sync.ts"))).toBe(true);
  });
});

/**
 * P2-BE-09 — "one repo, two deployables, one lockfile", in the layout
 * Addendum B settled on 2026-09-21: npm workspaces `frontend/` (the Next.js
 * web app) and `backend/` (the Express API, the pg-boss worker and Prisma).
 *
 * A layout test because the layout is load-bearing: the Railway services build
 * from these paths, and a second lockfile inside a workspace is how two
 * services end up running different versions of the same dependency.
 */
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const at = (p: string) => existsSync(new URL(p, root));

describe("the repository layout (Addendum B)", () => {
  it.each([
    "backend/src/contracts",
    "backend/src/domain",
    "backend/src/routes/v1",
    "backend/worker/jobs",
    "backend/prisma/sql",
    "backend/prisma/migrations",
    "backend/tests",
    "frontend/src/app",
    "frontend/src/server",
    "frontend/tests",
  ])("%s exists", (dir) => {
    expect(at(dir)).toBe(true);
  });

  it("is one repo of npm workspaces with ONE lockfile", () => {
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    expect(pkg.workspaces).toEqual(expect.arrayContaining(["frontend", "backend"]));
    expect(at("package-lock.json")).toBe(true);
    expect(at("frontend/package-lock.json")).toBe(false);
    expect(at("backend/package-lock.json")).toBe(false);
  });

  it("builds two deployables: the web app and the API (which carries the worker)", () => {
    expect(at("backend/Dockerfile")).toBe(true);
    const next = readFileSync(new URL("frontend/next.config.ts", root), "utf8");
    expect(next).toMatch(/output:\s*["']standalone["']/);
    const api = JSON.parse(readFileSync(new URL("backend/package.json", root), "utf8"));
    expect(api.scripts.start).toContain("src/combined.mts");
    expect(api.scripts["start:worker"]).toContain("worker/index.mts");
  });
});

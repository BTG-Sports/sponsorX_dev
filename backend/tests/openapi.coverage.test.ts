/**
 * P8-PMO-01 — "openapi.json is complete, generated from Zod contracts, and
 * covers every /api/v1 endpoint."
 *
 * The routes are read from the LIVE Express routers, not from source text, so
 * a route written in any style is seen. Mount prefixes come from
 * `routes/v1/index.ts`, the one place they are declared. Both directions are
 * checked: every mounted route is documented, and every documented path has a
 * route behind it — a spec listing an endpoint that 404s is its own drift.
 */
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

type Layer = { route?: { path: string; methods: Record<string, boolean> } };
type RouterLike = { stack: Layer[] };

let mounted: string[] = [];
let documented: string[] = [];
let doc: { paths: Record<string, Record<string, { requestBody?: unknown }>> };

beforeAll(async () => {
  /* Importing the routers imports env, Prisma and Redis. None of them connect
     on import (Redis is lazyConnect, Prisma connects on first query), but env
     refuses to load without these. */
  process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
  process.env.CLERK_SECRET_KEY ??= "sk_test_x";
  process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

  const index = readFileSync(new URL("../src/routes/v1/index.ts", import.meta.url), "utf8");
  const mounts = [...index.matchAll(/v1Router\.use\("([^"]*)",\s*(\w+)\)/g)].map((m) => ({
    prefix: m[1] === "/" ? "" : m[1]!,
    name: m[2]!,
  }));
  expect(mounts.length).toBeGreaterThan(5);

  const v1 = (await import("../src/routes/v1")) as unknown as { v1Router: RouterLike };
  const routers: Record<string, RouterLike> = {};
  for (const file of ["applications", "campaigns", "deliverables", "earnings", "guardians", "metrics", "zoho-webhooks", "inquiries", "catalogue", "rewards", "me", "openapi", "properties", "editions", "students"]) {
    Object.assign(routers, await import(`../src/routes/v1/${file}.ts`));
  }

  const toOpenApi = (p: string) => p.replace(/:(\w+)/g, "{$1}").replace(/(.)\/$/, "$1");
  const collect = (router: RouterLike, prefix: string) =>
    router.stack
      .filter((l) => l.route)
      .flatMap((l) =>
        Object.keys(l.route!.methods).map((m) => `${m.toUpperCase()} ${toOpenApi(prefix + l.route!.path) || "/"}`),
      );

  mounted = [
    ...collect(v1.v1Router, ""),
    ...mounts.flatMap(({ prefix, name }) => {
      const r = routers[name];
      expect(r, `index.ts mounts ${name}, which no route file exports`).toBeDefined();
      return collect(r!, prefix);
    }),
  ];

  const registry = await import("../src/contracts/registry");
  documented = registry.DOCUMENTED_PATHS;
  doc = registry.buildOpenApiDocument() as unknown as typeof doc;
});

describe("openapi.json covers every /api/v1 endpoint", () => {
  it("finds the whole API", () => {
    expect(mounted.length).toBeGreaterThanOrEqual(69);
  });

  it("documents every mounted route", () => {
    const missing = mounted.filter((r) => !documented.includes(r));
    expect(missing, "routes with no OpenAPI entry — add a row to PATHS in contracts/registry.ts").toEqual([]);
  });

  it("documents no route that does not exist", () => {
    const phantom = documented.filter((r) => !mounted.includes(r));
    expect(phantom, "PATHS rows with no route behind them").toEqual([]);
  });

  it("lists each route once", () => {
    expect(new Set(documented).size).toBe(documented.length);
  });

  it("emits every documented route into the generated document", () => {
    for (const r of documented) {
      const [method, path] = r.split(" ") as [string, string];
      expect(doc.paths[path]?.[method.toLowerCase()], r).toBeDefined();
    }
  });
});

describe("generated from the Zod contracts, not hand-written", () => {
  it("documents a request body for every handler that parses one", () => {
    /* A handler that calls `<Schema>.parse(req.body` must have a body in the
       spec, or a consumer cannot know what to send. */
    for (const file of ["applications", "campaigns", "deliverables", "earnings", "guardians", "metrics", "rewards", "zoho-webhooks"]) {
      const src = readFileSync(new URL(`../src/routes/v1/${file}.ts`, import.meta.url), "utf8");
      const parsers = [...src.matchAll(/(\w+)(?:\.partial\(\))?\.parse\(req\.body/g)].map((m) => m[1]!);
      for (const schema of parsers) {
        if (schema === "object") continue; // the inline socials schema, documented inline
        const registry = readFileSync(new URL("../src/contracts/registry.ts", import.meta.url), "utf8");
        expect(registry, `${file}: ${schema} is parsed but never used as a body in PATHS`).toMatch(
          new RegExp(`body: ${schema}\\b`),
        );
      }
    }
  });

  it("the served document is the generated one", () => {
    const route = readFileSync(new URL("../src/routes/v1/openapi.ts", import.meta.url), "utf8");
    expect(route).toContain("buildOpenApiDocument()");
  });
});

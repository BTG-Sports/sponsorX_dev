import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { errorBody } from "../src/lib/error-body";

/* --------------------------------------------------------------------------
   QA pass 7, F-1 — a NUL byte anywhere in a request is input Postgres can't
   store. Three public routes answered 500 for `/…/slug%00`. Each lookup now
   refuses a NUL itself with its own not-found (so every route keeps its
   stable error code — the reward routes' `unknown_token` included); anything
   that still reaches Postgres (a query value, a JSON field) comes back as
   22021 and maps to 400 invalid_input.
   -------------------------------------------------------------------------- */

describe("errorBody · Postgres 22021", () => {
  it("is a 400 invalid_input, never a 500, and names no internals", () => {
    const prismaLike = Object.assign(new Error("Invalid `prisma.property.findFirst()` invocation in D:\\secret\\path.ts"), {
      code: "P2039",
      meta: { driverAdapterError: { cause: { originalCode: "22021", message: "invalid byte sequence" } } },
    });
    const r = errorBody(prismaLike);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("invalid_input");
    expect(JSON.stringify(r.body)).not.toMatch(/secret|prisma|byte sequence/);
    expect(r.reference).toBeNull();
  });

  it("leaves a domain error that chose its own status alone", () => {
    const r = errorBody(Object.assign(new Error("x"), { status: 404, meta: { driverAdapterError: { cause: { originalCode: "22021" } } } }));
    expect(r.status).toBe(404);
  });
});

describe("the three public lookups over HTTP", async () => {
  process.env.CLERK_SECRET_KEY ??= "sk_test_x";
  process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
  const { createApp } = await import("../src/app");
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  beforeAll(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  for (const path of ["/api/v1/public/properties/x%00", "/api/v1/public/athletes/a%00b", "/api/v1/public/s/ab%00"]) {
    it(`404s ${path} with the route's own not-found, never a 500`, async () => {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string; reference?: string } };
      expect(body.error.code).not.toBe("internal_error");
      expect(body.error.reference).toBeUndefined();
    });
  }

  it("still serves a normal path", async () => {
    const res = await fetch(`${base}/api/v1/`);
    expect(res.status).toBe(200);
  });
});

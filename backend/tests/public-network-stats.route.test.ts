import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   GET /public/network-stats — the route, not just the read (P8-FE-09, QA
   pass 4). Three things only the route can get wrong: it needs no login,
   it reads the PUBLIC tenant from config (never from the caller), and it
   rate-limits each caller at 120 an hour before touching the database.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example", PUBLIC_INTAKE_TENANT_ID: "tenant_public" } }));

const limit = vi.fn(async () => {});
vi.mock("../src/lib/rate-limit", () => ({ limit: (...a: unknown[]) => limit(...(a as [])) }));
vi.mock("../src/lib/client-ip", () => ({ clientIp: () => "203.0.113.9" }));

const read = vi.fn(async (tenantId: string) => ({ athletes: 3, campaignsDelivered: 1, postsVerified: 2, rewardsRedeemed: 4, readAt: "2026-10-27T00:00:00.000Z", tenantId }));
vi.mock("../src/domain/public-network-stats", () => ({ readPublicNetworkStats: (t: string) => read(t) }));

const { catalogueRouter } = await import("../src/routes/v1/catalogue");

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: unknown, res: unknown, next: unknown) => unknown }[] } };

function route(path: string) {
  const layer = (catalogueRouter as unknown as { stack: Layer[] }).stack.find((l) => l.route?.path === path && l.route.methods.get);
  if (!layer?.route) throw new Error(`no GET ${path}`);
  return layer.route;
}

async function call(req: Record<string, unknown> = {}) {
  let body: unknown;
  await route("/public/network-stats").stack.at(-1)!.handle(
    { headers: {}, get: () => undefined, ...req },
    { json: (b: unknown) => void (body = b) },
    (e: unknown) => {
      if (e) throw e;
    },
  );
  return body as Record<string, unknown>;
}

beforeEach(() => {
  limit.mockClear();
  read.mockClear();
});

describe("GET /public/network-stats", () => {
  it("is one handler with no login in front of it", () => {
    expect(route("/public/network-stats").stack).toHaveLength(1);
  });

  it("reads the configured public tenant, whatever the caller sends", async () => {
    const body = await call({ query: { tenantId: "someone_else" }, headers: { "x-tenant-id": "someone_else" } });
    expect(read).toHaveBeenCalledWith("tenant_public");
    expect(body).toMatchObject({ athletes: 3, campaignsDelivered: 1, postsVerified: 2, rewardsRedeemed: 4, tenantId: "tenant_public" });
  });

  it("rate-limits each caller at 120 an hour, before the read", async () => {
    await call();
    expect(limit).toHaveBeenCalledWith("network-stats:public", "203.0.113.9", 120, 3600);
    expect(limit.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]);
  });

  it("a refused caller never reaches the database", async () => {
    limit.mockRejectedValueOnce(new Error("rate_limited"));
    await expect(call()).rejects.toThrow("rate_limited");
    expect(read).not.toHaveBeenCalled();
  });
});

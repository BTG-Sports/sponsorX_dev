import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express, { type ErrorRequestHandler } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   GET /health/full — 2S8-OPS-01. Pinned: the same dependency checks as
   /health/ready plus backups; backups fail past the 60-minute RPO or when
   the archiver's last failure is newer than its last success; an archiver
   that never ran passes only off Railway; 503 names what failed and the body
   never carries a host or an error message; /ready is unchanged by any of it.

   Mocked at the boundary integration-health.test.ts uses (db client, redis,
   storage). No database rows, so nothing here can collide with a parallel
   file.
   -------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  env: { RAILWAY_ENVIRONMENT_NAME: undefined as string | undefined },
  db: true,
  redis: true,
  storage: true,
  archiver: { archivedAgoSeconds: 5 * 60 as number | null, failing: false as boolean | null } as
    | { archivedAgoSeconds: number | null; failing: boolean | null }
    | "throws",
  statements: [] as string[],
  hits: 0,
}));

vi.mock("../src/config/env", () => ({ env: state.env }));
vi.mock("../src/lib/redis", () => ({
  redisReachable: async () => state.redis,
  redis: {
    incr: async () => ++state.hits,
    expire: async () => 1,
    ttl: async () => 42,
  },
}));
vi.mock("../src/lib/storage", () => ({ storageReachable: async () => state.storage }));

const SECRET_HOST = "postgres.railway.internal";
vi.mock("../src/db/client", () => {
  const fail = () => Promise.reject(new Error(`connect ECONNREFUSED ${SECRET_HOST}:5432`));
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray) => {
      state.statements.push(strings.join("?"));
      return 0;
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      state.statements.push(strings.join("?"));
      if (state.archiver === "throws") throw new Error(`archiver read failed on ${SECRET_HOST}`);
      return [state.archiver];
    },
  };
  return {
    prisma: {
      $queryRaw: async () => (state.db ? [{ "?column?": 1 }] : fail()),
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => (state.db ? fn(tx) : fail()),
    },
  };
});

const { healthRouter } = await import("../src/routes/health");
const { errorBody } = await import("../src/lib/error-body");
const { evaluateBackups, BACKUP_RPO_MINUTES } = await import("../src/domain/system-health");

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use("/health", healthRouter);
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const { status, body, headers } = errorBody(err);
    res.set(headers).status(status).json(body);
  };
  app.use(onError);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r)); // a host makes the bind async
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  state.env.RAILWAY_ENVIRONMENT_NAME = "production";
  state.db = true;
  state.redis = true;
  state.storage = true;
  state.archiver = { archivedAgoSeconds: 5 * 60, failing: false };
  state.statements = [];
  state.hits = 0;
});

async function full() {
  const res = await fetch(`${base}/health/full`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

describe("GET /health/full", () => {
  it("all healthy: 200 ok, every check named, backups' age in minutes", async () => {
    const { status, body, headers } = await full();
    expect(status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      checks: {
        db: true,
        redis: true,
        storage: true,
        backups: { ok: true, configured: true, minutesSinceArchive: 5, failing: false },
      },
    });
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("reads the archiver under a short statement timeout", async () => {
    await full();
    expect(state.statements[0]).toMatch(/SET LOCAL statement_timeout = '2s'/);
    expect(state.statements[1]).toMatch(/FROM pg_stat_archiver/);
  });

  it("stale — 61 minutes since the last archive breaks the 60-minute RPO: 503 degraded, backups named", async () => {
    state.archiver = { archivedAgoSeconds: 61 * 60, failing: false };
    const { status, body } = await full();
    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.failed).toEqual(["backups"]);
    expect((body.checks as Record<string, unknown>).backups).toEqual({ ok: false, configured: true, minutesSinceArchive: 61, failing: false });
  });

  it("the archiver failing since its last success: 503, even though the last archive is recent", async () => {
    state.archiver = { archivedAgoSeconds: 2 * 60, failing: true };
    const { status, body } = await full();
    expect(status).toBe(503);
    expect(body.failed).toEqual(["backups"]);
    expect((body.checks as Record<string, { failing: boolean }>).backups.failing).toBe(true);
  });

  it("archiving not configured, off Railway (local, CI): ok, reported as configured:false", async () => {
    state.env.RAILWAY_ENVIRONMENT_NAME = undefined;
    state.archiver = { archivedAgoSeconds: null, failing: false };
    const { status, body } = await full();
    expect(status).toBe(200);
    expect((body.checks as Record<string, unknown>).backups).toEqual({ ok: true, configured: false, minutesSinceArchive: null, failing: false });
  });

  it("archiving not configured, on Railway: a failure", async () => {
    state.env.RAILWAY_ENVIRONMENT_NAME = "staging";
    state.archiver = { archivedAgoSeconds: null, failing: false };
    const { status, body } = await full();
    expect(status).toBe(503);
    expect(body.failed).toEqual(["backups"]);
    expect((body.checks as Record<string, unknown>).backups).toEqual({ ok: false, configured: false, minutesSinceArchive: null, failing: false });
  });

  it("a dependency down (Redis): 503 naming it; the rest still reported", async () => {
    state.redis = false;
    const { status, body } = await full();
    expect(status).toBe(503);
    expect(body.failed).toEqual(["redis"]);
    expect(body.checks).toMatchObject({ db: true, redis: false, storage: true, backups: { ok: true } });
  });

  it("the database down: db and backups both fail, and no host or error text reaches the body", async () => {
    state.db = false;
    const res = await fetch(`${base}/health/full`);
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).failed).toEqual(["db", "backups"]);
    expect(text).not.toMatch(/railway|internal|ECONNREFUSED|5432|Error/i);
  });

  it("an unreadable archiver is a failed backups check, never a leaked message", async () => {
    state.archiver = "throws";
    const res = await fetch(`${base}/health/full`);
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text).checks.backups).toEqual({ ok: false, configured: null, minutesSinceArchive: null, failing: null });
    expect(text).not.toMatch(/railway|archiver read failed/i);
  });

  it("is rate-limited like the other public routes", async () => {
    state.hits = 60;
    const res = await fetch(`${base}/health/full`);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("/health/ready is unchanged: stale backups do not make it fail", async () => {
    state.archiver = { archivedAgoSeconds: 600 * 60, failing: true };
    const res = await fetch(`${base}/health/ready`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready", checks: { db: true, redis: true, storage: true } });
  });
});

describe("evaluateBackups", () => {
  it("the RPO is the owner's one hour", () => {
    expect(BACKUP_RPO_MINUTES).toBe(60);
  });
  it("exactly 60 minutes is still inside the RPO; a second past 61 is not", () => {
    expect(evaluateBackups({ archivedAgoSeconds: 60 * 60 + 59, failing: false }, true).ok).toBe(true);
    expect(evaluateBackups({ archivedAgoSeconds: 61 * 60, failing: false }, true).ok).toBe(false);
  });
  it("a failure with no success ever is failing, on or off Railway", () => {
    for (const railway of [true, false]) {
      expect(evaluateBackups({ archivedAgoSeconds: null, failing: true }, railway)).toEqual({ ok: false, configured: true, minutesSinceArchive: null, failing: true });
    }
  });
  it("no reading at all is a failure", () => {
    expect(evaluateBackups(null, false).ok).toBe(false);
  });
});

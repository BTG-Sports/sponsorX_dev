import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import { ForbiddenError } from "../src/auth/errors";

/* --------------------------------------------------------------------------
   The review queue's read surface — P3-BE-07 follow-ups B7 and B8.

   B7: the same id answered 404 from GET /:id and 403 from the decision
   endpoints. Neither disclosed anything — both answer "not found" and "not
   yours" identically, which is the property that matters — but a client had
   to code around two statuses for one condition.

   B8: the queue took a flat 200 rows with no way to ask for the next ones.
   `PageQuery` has existed since P2-BE-07 and nothing used it.

   Handlers are called directly rather than over HTTP: supertest is not a
   dependency, and what is under test is the handler's own logic, not
   Express's routing.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let found: unknown[] = [];
let lastArgs: Record<string, unknown> = {};

vi.mock("../src/db/client", () => ({
  prisma: {
    athlete: {
      findMany: (args: Record<string, unknown>) => {
        lastArgs = args;
        const take = Number(args.take ?? 0);
        return Promise.resolve(found.slice(0, take));
      },
      findFirst: (args: Record<string, unknown>) => {
        lastArgs = args;
        return Promise.resolve(found[0] ?? null);
      },
    },
  },
}));

const { listApplications, getApplication } = await import("../src/routes/v1/applications");

const admin: Actor = { userId: "u", tenantId: "tenant_1", roles: ["BTG_ADMIN"] };

function row(id: string) {
  return {
    id,
    displayName: "SHAMMAH.27",
    legalName: "Shammah Okeke",
    sport: "Basketball",
    stateCode: "MD",
    state: "SUBMITTED",
    birthDate: new Date("2000-04-02"),
    ageBand: "18_PLUS",
    guardianId: null,
    guardian: null,
    reviewerNotes: null,
    reviewedAt: null,
    createdAt: new Date("2026-09-01"),
  };
}

/** Enough of req/res to drive a handler and capture what it answered. */
function call(handler: (req: never, res: never, next: never) => unknown, req: object) {
  let body: Record<string, unknown> | undefined;
  const res = { json: (b: Record<string, unknown>) => void (body = b), status: () => res };
  const done = Promise.resolve(
    handler({ actor: admin, query: {}, params: {}, ...req } as never, res as never, (() => {}) as never),
  );
  return { done, body: () => body };
}

beforeEach(() => {
  found = [];
  lastArgs = {};
});

describe("B7 · one condition, one status", () => {
  it("answers a miss with 403, the same as the decision endpoints", async () => {
    found = [];
    const { done } = call(getApplication, { params: { id: "ath_missing" } });
    await expect(done).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("answers a cross-tenant id identically to a nonexistent one", async () => {
    /* The scoped `where` is what makes these the same case — a row in another
       tenant never comes back, so there is nothing to distinguish. */
    found = [];
    const { done } = call(getApplication, { params: { id: "ath_other_tenant" } });
    await expect(done).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns the application when it is reachable", async () => {
    found = [row("ath_1")];
    const { done, body } = call(getApplication, { params: { id: "ath_1" } });
    await done;
    expect(body()).toMatchObject({ id: "ath_1", guardianStatus: "not-required" });
  });
});

describe("B8 · cursor pagination", () => {
  it("defaults to 25 and asks for one extra row", async () => {
    found = Array.from({ length: 40 }, (_, n) => row(`ath_${n}`));
    const { done, body } = call(listApplications, {});
    await done;

    expect(lastArgs.take).toBe(26);
    expect((body()?.applications as unknown[]).length).toBe(25);
    expect(body()?.page).toEqual({ nextCursor: "ath_24", hasMore: true });
  });

  it("reports the end of the collection honestly", async () => {
    found = Array.from({ length: 3 }, (_, n) => row(`ath_${n}`));
    const { done, body } = call(listApplications, {});
    await done;
    expect(body()?.page).toEqual({ nextCursor: null, hasMore: false });
  });

  it("accepts a limit from the query string, which arrives as text", async () => {
    found = Array.from({ length: 10 }, (_, n) => row(`ath_${n}`));
    const { done, body } = call(listApplications, { query: { limit: "5" } });
    await done;
    expect(lastArgs.take).toBe(6);
    expect((body()?.applications as unknown[]).length).toBe(5);
  });

  it("refuses a limit outside the contract rather than clamping it", async () => {
    const { done } = call(listApplications, { query: { limit: "500" } });
    await expect(done).rejects.toThrow();
  });

  it("skips the cursor row itself, so a page never repeats its predecessor", async () => {
    found = [row("ath_9")];
    const { done } = call(listApplications, { query: { cursor: "ath_8" } });
    await done;
    expect(lastArgs.cursor).toEqual({ id: "ath_8" });
    expect(lastArgs.skip).toBe(1);
  });

  it("sends no cursor at all on the first page", async () => {
    found = [row("ath_0")];
    const { done } = call(listApplications, {});
    await done;
    expect(lastArgs.cursor).toBeUndefined();
    expect(lastArgs.skip).toBeUndefined();
  });

  it("orders by createdAt then id, so the cursor walks a deterministic list", async () => {
    /* createdAt alone is not unique — an import writes a cohort in one
       millisecond — and a cursor over a non-deterministic order drops rows. */
    found = [row("ath_0")];
    const { done } = call(listApplications, {});
    await done;
    expect(lastArgs.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("still narrows by state when asked", async () => {
    found = [row("ath_0")];
    const { done } = call(listApplications, { query: { state: "SUBMITTED" } });
    await done;
    expect(lastArgs.where).toMatchObject({ state: "SUBMITTED" });
  });

  it("ignores a state that is not one of the eight", async () => {
    found = [row("ath_0")];
    const { done } = call(listApplications, { query: { state: "BANANA" } });
    await done;
    expect(lastArgs.where).not.toHaveProperty("state");
  });
});

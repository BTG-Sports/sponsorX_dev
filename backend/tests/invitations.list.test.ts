import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /invitations — P4-FE-04, §24. The inbox read: scoped by the matrix
   (own for the athlete), newest first, names flattened for the card.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let found: unknown[] = [];
let orders: unknown[] = [];
let orderArgs: Record<string, unknown> | null = null;
let lastArgs: Record<string, unknown> = {};

vi.mock("../src/db/client", () => ({
  prisma: {
    campaignOrder: {
      findMany: (args: Record<string, unknown>) => {
        orderArgs = args;
        return Promise.resolve(orders);
      },
    },
    campaignInvite: {
      findMany: (args: Record<string, unknown>) => {
        lastArgs = args;
        return Promise.resolve(found);
      },
    },
  },
}));

const { listInvitations } = await import("../src/routes/v1/campaigns");

const athlete: Actor = {
  userId: "u_1", tenantId: "t_1", roles: ["ATHLETE"],
  sponsorId: null, athleteId: "ath_1", guardianId: null, propertyId: null,
} as Actor;

function call(actor: Actor) {
  let body: Record<string, unknown> | undefined;
  const res = { json: (b: Record<string, unknown>) => void (body = b) };
  const done = Promise.resolve(
    listInvitations({ actor } as never, res as never, (() => {}) as never),
  );
  return { done, body: () => body };
}

beforeEach(() => {
  found = [];
  orders = [];
  orderArgs = null;
  lastArgs = {};
});

describe("GET /invitations", () => {
  it("scopes to the caller's own invitations and reads newest first", async () => {
    const { done } = call(athlete);
    await done;
    const where = lastArgs.where as Record<string, unknown>;
    /* whereFor returns { AND: [scope] } (P8-SEC-02) — own scope, not bare. */
    expect(where.AND).toBeDefined();
    expect(lastArgs.orderBy).toEqual({ sentAt: "desc" });
  });

  it("flattens job and campaign names and ISO-dates the timestamps", async () => {
    found = [{
      id: "inv_1", state: "INVITED", offered: 40000,
      sentAt: new Date("2026-09-25T10:00:00Z"), viewedAt: null,
      respondedAt: null, expiresAt: new Date("2026-10-02T10:00:00Z"),
      jobId: "SX-01",
      job: { name: "Story Drop" },
      campaign: { name: "Fall Launch", sponsor: { name: "Harborline Coffee Co." } },
    }];
    const { done, body } = call(athlete);
    await done;
    expect((body()?.invitations as unknown[])[0]).toEqual({
      id: "inv_1", state: "INVITED", offered: 40000,
      jobId: "SX-01", jobName: "Story Drop", campaignName: "Fall Launch",
      sponsorName: "Harborline Coffee Co.",
      sentAt: "2026-09-25T10:00:00.000Z", viewedAt: null,
      respondedAt: null, expiresAt: "2026-10-02T10:00:00.000Z",
      order: null,
    });
  });

  it("links an accepted invite to its sent order, never a DRAFT one", async () => {
    const base = {
      offered: 40000, sentAt: new Date("2026-09-25T10:00:00Z"), viewedAt: null,
      respondedAt: new Date("2026-09-26T10:00:00Z"), expiresAt: new Date("2026-10-02T10:00:00Z"),
      jobId: "SX-01", campaignId: "cmp_1", athleteId: "ath_1",
      job: { name: "Story Drop" }, campaign: { name: "Fall Launch", sponsor: { name: "H" } },
    };
    found = [{ ...base, id: "inv_a", state: "ACCEPTED" }, { ...base, id: "inv_b", state: "DECLINED", jobId: "SX-02" }];
    orders = [{ id: "ord_1", campaignId: "cmp_1", athleteId: "ath_1", jobId: "SX-01", state: "SENT" }];
    const { done, body } = call(athlete);
    await done;
    const rows = body()?.invitations as Array<{ id: string; order: unknown }>;
    expect(rows.find((r) => r.id === "inv_a")?.order).toEqual({ id: "ord_1", state: "SENT" });
    expect(rows.find((r) => r.id === "inv_b")?.order).toBeNull();
    const where = orderArgs!.where as Record<string, unknown>;
    expect(where.state).toEqual({ not: "DRAFT" });
    expect(where.AND).toBeDefined();
  });

  it("asks for no orders when nothing was accepted", async () => {
    const { done } = call(athlete);
    await done;
    expect(orderArgs).toBeNull();
  });
});

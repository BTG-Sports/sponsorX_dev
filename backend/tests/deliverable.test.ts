/**
 * P5-BE-03 — the deliverable set is created INSIDE the acceptance
 * transaction — and P5-BE-08's approval chain.
 *
 * The first half is the clause that is easy to half-meet: a set created by a
 * second call after acceptance would pass any test that only checks the rows
 * exist. So the test here asserts the transaction boundary directly — if
 * creating the deliverables fails, the order must not be left ACCEPTED.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

let order: Record<string, unknown> | null;
let committedWrites: string[] = [];
let deliverableCreateThrows: Error | null = null;
let createdDeliverables: Record<string, unknown>[] = [];
let existingDeliverables = 0;

/* `domain/deliverable` pulls in `lib/storage` for P5-BE-06's presigner, and
   storage builds its S3 client at import time. No network happens in this
   file — the client is constructed and never called — but it needs the
   config to exist. Same shape as storage.grants.test.ts. */
vi.mock("../src/config/env", () => ({
  env: {
    APP_URL: "https://sponsorx.example",
    S3_ENDPOINT: "https://example.invalid",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_BUCKET_PUBLIC: "sponsorx-public",
    S3_BUCKET_PRIVATE: "sponsorx-private",
  },
}));

vi.mock("../src/domain/agreement", () => ({
  acceptAgreementIn: () =>
    Promise.resolve({ acceptanceId: "acc_1", acceptedAt: new Date(), guardianId: null }),
}));

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: string[] = [];
      const tx = {
        campaign: { findFirst: () => Promise.resolve({ id: "cmp_1", budget: 100000 }) },
        athlete: { findFirst: () => Promise.resolve({ tier: "PREMIUM" }) },
        campaignOrder: {
          findFirst: () => Promise.resolve(order),
          aggregate: () => Promise.resolve({ _sum: { compensation: 0 } }),
          update: ({ data }: { data: Record<string, unknown> }) => {
            writes.push("order.update");
            return Promise.resolve({ id: "ord_1", state: data.state });
          },
        },
        deliverable: {
          count: () => Promise.resolve(existingDeliverables),
          createMany: ({ data }: { data: Record<string, unknown>[] }) => {
            if (deliverableCreateThrows) throw deliverableCreateThrows;
            createdDeliverables = data;
            writes.push("deliverable.createMany");
            return Promise.resolve({ count: data.length });
          },
        },
        /* P7-BE-01 puts earning creation inside the same acceptance
           transaction, so the fake tx carries the model too. */
        earning: {
          findUnique: () => Promise.resolve(null),
          create: ({ data }: { data: Record<string, unknown> }) => {
            writes.push("earning.create");
            return Promise.resolve({ id: "ern_1", state: data.state });
          },
        },
        auditLog: {
          create: () => { writes.push("audit"); return Promise.resolve({ id: "a" }); },
        },
        outboxJob: {
          create: () => { writes.push("outbox"); return Promise.resolve({ id: "j" }); },
        },
      };
      /* A throw inside fn discards `writes` — exactly as a real transaction
         discards its statements. That is what makes the boundary testable. */
      const out = await fn(tx);
      committedWrites = [...committedWrites, ...writes];
      return out;
    },
  },
}));

const { acceptOrder } = await import("../src/domain/campaign-order");

const actor = (roles: Role[] = ["CAMPAIGN_MGR"]): Actor =>
  ({ userId: "u", tenantId: "t1", roles, sponsorId: null, athleteId: "ath_1", guardianId: null });

const evidence = {
  agreementId: "agr_1", bodyHashShown: "h", ip: "1.1.1.1", userAgent: "ua",
};

beforeEach(() => {
  order = {
    id: "ord_1", state: "SENT",
    /* Read by createEarningForOrder in the same transaction. */
    athleteId: "ath_1", compensation: 10000,
    tenantId: "t1", jobId: "SX-07", dueDate: new Date("2026-11-01T00:00:00.000Z"),
    athlete: {
      birthDate: new Date("1999-01-01"), ageBand: "18_PLUS",
      guardianId: null, guardian: null,
    },
  };
  committedWrites = [];
  createdDeliverables = [];
  deliverableCreateThrows = null;
  existingDeliverables = 0;
});

describe("P5-BE-03 · accepting an order creates its deliverable set", () => {
  it("creates the set derived from the SX job", async () => {
    await acceptOrder(actor(), "ord_1", evidence);

    /* SX-07 is four weekly ambassador posts. */
    expect(createdDeliverables).toHaveLength(4);
    expect(createdDeliverables.map((d) => d.title)).toEqual([
      "Ambassador post — week 1", "Ambassador post — week 2",
      "Ambassador post — week 3", "Ambassador post — week 4",
    ]);
  });

  it("derives the due dates from the order, ending on its due date", async () => {
    await acceptOrder(actor(), "ord_1", evidence);
    const dates = createdDeliverables.map((d) =>
      (d.dueDate as Date).toISOString().slice(0, 10),
    );
    expect(dates).toEqual(["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"]);
  });

  it("starts every deliverable at NOT_STARTED", async () => {
    await acceptOrder(actor(), "ord_1", evidence);
    expect(createdDeliverables.every((d) => d.state === "NOT_STARTED")).toBe(true);
  });

  it("carries the order's tenant onto every row", async () => {
    await acceptOrder(actor(), "ord_1", evidence);
    expect(createdDeliverables.every((d) => d.tenantId === "t1")).toBe(true);
  });

  /* THE CLAUSE THAT MATTERS: "inside the same transaction as acceptance". */
  it("leaves the order unaccepted if the deliverables cannot be written", async () => {
    deliverableCreateThrows = new Error("deliverable write failed");

    await expect(acceptOrder(actor(), "ord_1", evidence)).rejects.toThrow(
      "deliverable write failed",
    );

    /* Nothing committed — not the order update, not the audit row. An order
       ACCEPTED with no deliverables is an athlete who owes nothing. */
    expect(committedWrites).toEqual([]);
  });

  it("refuses to create the set twice rather than doubling what is owed", async () => {
    existingDeliverables = 4;
    await expect(acceptOrder(actor(), "ord_1", evidence)).rejects.toThrow(
      /already has 4 deliverables/,
    );
    expect(committedWrites).toEqual([]);
  });

  it("writes the order update and the deliverables in one commit", async () => {
    await acceptOrder(actor(), "ord_1", evidence);
    expect(committedWrites).toContain("order.update");
    expect(committedWrites).toContain("deliverable.createMany");
  });
});

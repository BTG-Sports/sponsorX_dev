/**
 * P7-BE-03 — the money — and P7-BE-02 — automatic eligibility.
 *
 * P7-BE-03's acceptance: "Gross compensation, adjustments and BTG margin
 * computed from the agreed athlete rate and the sponsor price; a line below
 * athlete cost x 1.4 cannot exist, because P3-BE-12 blocks it at creation."
 *
 * The arithmetic is pure and tested as such. The second half is a statement
 * about somewhere else, so what is tested here is that this module REPORTS
 * the floor rather than re-enforcing it — a second copy of the rule is a
 * second thing to drift.
 *
 * P7-BE-02's acceptance: "Closing an accepted deliverable makes the
 * associated earning ELIGIBLE; the transition is audited." See the note on
 * `maybeMakeEligible` for the one place this implementation deliberately
 * diverges from that sentence, and why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let outstanding = 0;
let earning: Record<string, unknown> | null;
let updates: Record<string, unknown>[] = [];
let auditRows: Record<string, unknown>[] = [];

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

vi.mock("../src/db/client", () => {
  const tx = {
    deliverable: { count: () => Promise.resolve(outstanding) },
    earning: {
      findUnique: () => Promise.resolve(earning),
      findFirst: () => Promise.resolve(earning),
      create: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({ id: "ern_1", state: data.state });
      },
      update: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({ id: "ern_1", state: data.state, ...data });
      },
    },
    auditLog: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        auditRows.push(data);
        return Promise.resolve({ id: "a" });
      },
    },
  };
  return {
    prisma: { ...tx, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) },
  };
});

const {
  breakdown, clearsFloor, createEarningForOrder, maybeMakeEligible,
  OrderNotEarningEligibleError,
} = await import("../src/domain/earning");

const actor = { userId: "u", tenantId: "t1" };

beforeEach(() => {
  outstanding = 0;
  earning = { id: "ern_1", state: "PENDING" };
  updates = [];
  auditRows = [];
});

describe("P7-BE-03 · gross, adjustments and BTG margin", () => {
  it("splits a clean line three ways", () => {
    const b = breakdown({ compensation: 10000, sellPrice: 20000 });
    expect(b).toMatchObject({
      gross: 10000, adjustment: 0, net: 10000, sellPrice: 20000, margin: 10000,
    });
    expect(b.marginRate).toBe(0.5);
  });

  /* A correction is money BTG pays or claws back; the sponsor already paid
     and is not re-invoiced, so the adjustment comes out of the margin. */
  it("takes a positive adjustment out of BTG's margin", () => {
    const b = breakdown({ compensation: 10000, sellPrice: 20000, adjustment: 2000 });
    expect(b.net).toBe(12000);
    expect(b.margin).toBe(8000);
    expect(b.sellPrice).toBe(20000);
  });

  it("returns a clawback to the margin", () => {
    const b = breakdown({ compensation: 10000, sellPrice: 20000, adjustment: -2500 });
    expect(b.net).toBe(7500);
    expect(b.margin).toBe(12500);
  });

  it("keeps everything in whole cents", () => {
    const b = breakdown({ compensation: 3333, sellPrice: 9999, adjustment: 1 });
    expect(Number.isInteger(b.net)).toBe(true);
    expect(Number.isInteger(b.margin)).toBe(true);
  });

  it("rounds the margin rate to four places rather than trailing floats", () => {
    const b = breakdown({ compensation: 1000, sellPrice: 3000 });
    expect(b.marginRate).toBe(0.6667);
  });

  it("does not divide by zero on a free line", () => {
    expect(breakdown({ compensation: 0, sellPrice: 0 }).marginRate).toBe(0);
  });

  describe("the floor is reported, never re-enforced", () => {
    /* 1.4x exactly is the floor, so it clears. */
    it("accepts a line exactly on the floor", () => {
      expect(clearsFloor(breakdown({ compensation: 10000, sellPrice: 14000 }))).toBe(true);
    });

    it("flags a line below the floor rather than throwing", () => {
      const b = breakdown({ compensation: 10000, sellPrice: 13999 });
      expect(clearsFloor(b)).toBe(false);
      /* The point: it still COMPUTES. An underwater line that only ever threw
         would be invisible in a total rather than visibly wrong in a row. */
      expect(b.margin).toBe(3999);
    });

    /* An adjustment can push a line under the floor after the fact — which is
       exactly why the check is against `net`, not `gross`. */
    it("measures against net, so a top-up can breach the floor", () => {
      const b = breakdown({ compensation: 10000, sellPrice: 14000, adjustment: 1000 });
      expect(b.net).toBe(11000);
      expect(clearsFloor(b)).toBe(false);
    });
  });
});

describe("P7-BE-01 · the earning is raised with the contract", () => {
  it("dates the tax year from the work, not the payment", async () => {
    const tx = {
      earning: {
        findUnique: () => Promise.resolve(null),
        create: ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return Promise.resolve({ id: "ern_1", state: data.state });
        },
      },
      auditLog: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          auditRows.push(data); return Promise.resolve({ id: "a" });
        },
      },
    };
    await createEarningForOrder(tx as never, actor, {
      id: "ord_1", tenantId: "t1", athleteId: "ath_1",
      compensation: 10000, dueDate: new Date("2026-12-20T00:00:00.000Z"),
    });
    expect(updates[0]).toMatchObject({ taxYear: 2026, gross: 10000, state: "PENDING" });
  });

  it("refuses to raise a second earning for one order", async () => {
    const tx = { earning: { findUnique: () => Promise.resolve({ id: "ern_1" }) } };
    await expect(
      createEarningForOrder(tx as never, actor, {
        id: "ord_1", tenantId: "t1", athleteId: "ath_1",
        compensation: 10000, dueDate: new Date(),
      }),
    ).rejects.toThrow(OrderNotEarningEligibleError);
  });
});

describe("P7-BE-02 · eligibility from completed work", () => {
  const tx = () => ({
    deliverable: { count: () => Promise.resolve(outstanding) },
    earning: {
      findUnique: () => Promise.resolve(earning),
      update: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({ id: "ern_1", state: data.state });
      },
    },
    auditLog: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        auditRows.push(data); return Promise.resolve({ id: "a" });
      },
    },
  });

  /* THE DIVERGENCE, TESTED. The task says "closing an accepted deliverable
     makes the earning ELIGIBLE". An Earning is per ORDER and an order can owe
     four posts, so firing on the first would owe an athlete the whole fee for
     a quarter of the work. It fires on the LAST. */
  it("does nothing while deliverables are outstanding", async () => {
    outstanding = 3;
    const out = await maybeMakeEligible(tx() as never, actor, "ord_1");
    expect(out).toBeNull();
    expect(updates).toEqual([]);
    expect(auditRows).toEqual([]);
  });

  it("releases the earning when the last one is verified", async () => {
    outstanding = 0;
    const out = await maybeMakeEligible(tx() as never, actor, "ord_1");
    expect(out).toMatchObject({ state: "ELIGIBLE" });
    expect(updates[0]).toMatchObject({ state: "ELIGIBLE" });
  });

  it("audits the transition with its reason", async () => {
    await maybeMakeEligible(tx() as never, actor, "ord_1");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: "earning.markEligible", entity: "Earning" });
    expect(auditRows[0]!.before).toEqual({ state: "PENDING" });
    expect(auditRows[0]!.after).toMatchObject({
      state: "ELIGIBLE", reason: "all deliverables verified", orderId: "ord_1",
    });
  });

  /* A human put it there. The last deliverable landing must not quietly
     undo a Finance decision. */
  it.each(["HELD", "DISPUTED", "APPROVED_FOR_PAYOUT", "PAID", "ELIGIBLE"])(
    "leaves an earning that is already %s alone",
    async (state) => {
      earning = { id: "ern_1", state };
      const out = await maybeMakeEligible(tx() as never, actor, "ord_1");
      expect(out).toBeNull();
      expect(updates).toEqual([]);
    },
  );

  it("is silent when the order has no earning", async () => {
    earning = null;
    await expect(maybeMakeEligible(tx() as never, actor, "ord_1")).resolves.toBeNull();
  });
});

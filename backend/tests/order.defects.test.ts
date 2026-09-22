import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";
import {
  assertBudgetCarriesLine, lineFloor, CampaignBudgetFloorError,
 } from "../src/domain/margin-floor";

/* --------------------------------------------------------------------------
   The six defects found reviewing P3-BE-09…P5-BE-01, each pinned so it
   cannot come back.

   Five of the six were the same kind of mistake: a rule that exists and is
   tested, with nothing forcing the system to use it. A test that exercises
   the rule directly passes either way — so each of these goes through the
   PATH a real caller takes.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://x" } }));

let order: Record<string, unknown> | null = null;
let campaign: Record<string, unknown> | null = null;
let committed = 0;
let created: Record<string, unknown> | null = null;
let acceptCalls = 0;
let acceptThrows: Error | null = null;
let committedWrites: string[] = [];

vi.mock("../src/domain/agreement", async () => {
  const actual = await vi.importActual<typeof import("../src/domain/agreement")>(
    "../src/domain/agreement");
  return {
    ...actual,
    acceptAgreementIn: () => {
      acceptCalls += 1;
      if (acceptThrows) return Promise.reject(acceptThrows);
      return Promise.resolve({
        acceptanceId: "acc_1", acceptedAt: new Date(), guardianId: null,
      });
    },
  };
});

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: string[] = [];
      const tx = {
        campaign: { findFirst: () => Promise.resolve(campaign) },
        athlete: { findFirst: () => Promise.resolve({ tier: "PREMIUM" }) },
        campaignOrder: {
          findFirst: () => Promise.resolve(order),
          aggregate: () => Promise.resolve({ _sum: { compensation: committed } }),
          create: ({ data }: { data: Record<string, unknown> }) => {
            created = data; writes.push("order.create");
            return Promise.resolve({ id: "ord_1", state: "DRAFT" });
          },
          update: ({ data }: { data: Record<string, unknown> }) => {
            writes.push("order.update");
            /* A terms update does not touch state, so fall back to the row's
               current one rather than returning undefined. */
            return Promise.resolve({
              id: "ord_1",
              state: data.state ?? (order as { state: string } | null)?.state,
            });
          },
        },
        auditLog: { create: () => { writes.push("audit"); return Promise.resolve({ id: "a" }); } },
        outboxJob: { create: () => { writes.push("outbox"); return Promise.resolve({ id: "j" }); } },
      };
      const out = await fn(tx);       // throws => writes discarded
      committedWrites = [...committedWrites, ...writes];
      return out;
    },
  },
}));

const {
  createOrder, acceptOrder, transitionOrder, updateOrderTerms,
  AcceptanceNeedsEvidenceError, GuardianRequiredForOrderError,
  OrderNotSentError, TermsFrozenError,
} = await import("../src/domain/campaign-order");

const actor = (roles: Role[] = ["CAMPAIGN_MGR"]): Actor =>
  ({ userId: "u", tenantId: "t1", roles, sponsorId: null, athleteId: "ath_1", guardianId: null });

const adult = {
  birthDate: new Date("1999-01-01"), ageBand: "18_PLUS",
  guardianId: null, guardian: null,
};
const minorUnverified = {
  birthDate: new Date(Date.now() - 15 * 3.156e10), ageBand: "UNDER_16",
  guardianId: "g1", guardian: { verifiedAt: null },
};
const terms = {
  athleteId: "ath_1", jobId: "SX-02", compensation: 10000,
  usageRights: "Organic social, 90 days", dueDate: new Date("2026-11-01"),
};

beforeEach(() => {
  campaign = { id: "cmp_1", budget: 100000 };
  order = { id: "ord_1", state: "SENT", athlete: { ...adult } };
  committed = 0; created = null; acceptCalls = 0; acceptThrows = null;
  committedWrites = [];
});

describe("1 · the margin floor is actually invoked", () => {
  it("refuses a line the budget cannot carry at the floor", async () => {
    campaign = { id: "cmp_1", budget: 10000 };  // floor for 10000 is 14000
    await expect(createOrder(actor(), terms)).rejects.toBeInstanceOf(CampaignBudgetFloorError);
    expect(created).toBeNull();
  });

  it("accounts for lines already on the campaign", async () => {
    campaign = { id: "cmp_1", budget: 30000 };
    committed = 10000;                          // 14000 committed
    /* 14000 + 14000 = 28000, inside 30000 */
    await expect(createOrder(actor(), terms)).resolves.toMatchObject({ state: "DRAFT" });

    committed = 12000;                          // 16800 committed
    /* 16800 + 14000 = 30800, over */
    await expect(createOrder(actor(), terms)).rejects.toBeInstanceOf(CampaignBudgetFloorError);
  });

  it("names the job, the floor, what is committed and the gap", () => {
    try {
      assertBudgetCarriesLine("SX-07", "PREMIUM", 50000, 60000, 100000);
      throw new Error("should have refused");
    } catch (e) {
      const err = e as CampaignBudgetFloorError;
      expect(err.jobId).toBe("SX-07");
      expect(err.lineFloor).toBe(lineFloor(50000));
      expect(err.shortfall).toBeGreaterThan(0);
    }
  });
});

describe("2 · ACCEPTED cannot be reached without evidence", () => {
  it("refuses a bare state change to ACCEPTED, whoever asks", async () => {
    /* This was the hole: no body hash, no signer, no IP, no guardian check. */
    for (const role of ["ATHLETE", "CAMPAIGN_MGR", "SUPER_ADMIN"] as const) {
      await expect(transitionOrder(actor([role]), "ord_1", "ACCEPTED"))
        .rejects.toBeInstanceOf(AcceptanceNeedsEvidenceError);
    }
  });

  it("still lets an athlete decline, which needs no evidence", async () => {
    await expect(transitionOrder(actor(["ATHLETE"]), "ord_1", "REJECTED"))
      .resolves.toMatchObject({ state: "REJECTED" });
  });

  it("does not let an athlete send or cancel", async () => {
    order = { id: "ord_1", state: "DRAFT", athlete: { ...adult } };
    await expect(transitionOrder(actor(["ATHLETE"]), "ord_1", "SENT")).rejects.toThrow();
  });
});

describe("3 · acceptance and the order commit together", () => {
  it("accepts in one transaction", async () => {
    await expect(acceptOrder(actor(["ATHLETE"]), "ord_1", {
      agreementId: "agr_1", bodyHashShown: "h", ip: "1.2.3.4", userAgent: "ua",
    })).resolves.toMatchObject({ state: "ACCEPTED", acceptanceId: "acc_1" });
    expect(committedWrites).toContain("order.update");
  });

  it("writes NOTHING when the acceptance fails", async () => {
    /* The old shape wrote the acceptance in its own transaction. If the order
       update then failed, the order stayed SENT and every retry hit
       AlreadyAcceptedError — the order could never be accepted again. */
    acceptThrows = new Error("agreement text changed");
    await expect(acceptOrder(actor(["ATHLETE"]), "ord_1", {
      agreementId: "agr_1", bodyHashShown: "stale", ip: "1", userAgent: "ua",
    })).rejects.toThrow("agreement text changed");
    expect(committedWrites).toEqual([]);
  });

  it("checks the guardian before writing an acceptance at all", async () => {
    order = { id: "ord_1", state: "SENT", athlete: { ...minorUnverified } };
    await expect(acceptOrder(actor(["ATHLETE"]), "ord_1", {
      agreementId: "agr_1", bodyHashShown: "h", ip: "1", userAgent: "ua",
    })).rejects.toBeInstanceOf(GuardianRequiredForOrderError);
    expect(acceptCalls).toBe(0);
    expect(committedWrites).toEqual([]);
  });

  it("refuses an order that was never sent", async () => {
    order = { id: "ord_1", state: "DRAFT", athlete: { ...adult } };
    await expect(acceptOrder(actor(["ATHLETE"]), "ord_1", {
      agreementId: "agr_1", bodyHashShown: "h", ip: "1", userAgent: "ua",
    })).rejects.toBeInstanceOf(OrderNotSentError);
    expect(acceptCalls).toBe(0);
  });
});

describe("6 · no job is enqueued that nothing owns", () => {
  it("queues nothing on acceptance", async () => {
    /* notify.campaignLive was enqueued here and no handler exists or is
       planned for it — "campaign live" is not what happened, one order was
       accepted. P5-INT-01 owns order notifications. */
    await acceptOrder(actor(["ATHLETE"]), "ord_1", {
      agreementId: "agr_1", bodyHashShown: "h", ip: "1", userAgent: "ua",
    });
    expect(committedWrites).not.toContain("outbox");
  });
});

describe("acceptance clauses that were still unmet after the first fix", () => {
  it("P3-BE-12 · the refusal names the athlete's tier", async () => {
    /* The acceptance asks for job, TIER, floor and shortfall. The error that
       is actually thrown carried every one but the tier — so the message said
       a price was too low without saying why this athlete made it so. */
    campaign = { id: "cmp_1", budget: 1000 };
    try {
      await createOrder(actor(), terms);
      throw new Error("should have refused");
    } catch (e) {
      const err = e as CampaignBudgetFloorError;
      expect(err).toBeInstanceOf(CampaignBudgetFloorError);
      expect(err.tier).toBe("PREMIUM");
      expect(err.message).toContain("PREMIUM");
      expect(err.jobId).toBe("SX-02");
      expect(err.shortfall).toBeGreaterThan(0);
    }
  });

  it("P5-BE-02 · terms cannot be changed once the order is sent", async () => {
    order = { id: "ord_1", state: "DRAFT", compensation: 10000, athlete: { ...adult } };
    await expect(updateOrderTerms(actor(), "ord_1", { compensation: 12000 }))
      .resolves.toMatchObject({ state: "DRAFT" });

    for (const state of ["SENT", "ACCEPTED", "ACTIVE", "COMPLETED"]) {
      order = { id: "ord_1", state, compensation: 10000, athlete: { ...adult } };
      await expect(updateOrderTerms(actor(), "ord_1", { compensation: 12000 }))
        .rejects.toBeInstanceOf(TermsFrozenError);
    }
  });
});

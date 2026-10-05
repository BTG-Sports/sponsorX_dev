/**
 * P5-BE-04 — launchCampaign.
 *
 * Acceptance: "Campaign → ACTIVE, accepted orders → ACTIVE,
 * zoho.pushCampaign and notify.campaignLive enqueued, audit written — all in
 * one transaction."
 *
 * Five clauses, and the last one is the one a reading cannot check. The test
 * that matters is the failure case: if any single write fails, none of the
 * others may commit.
 *
 * The second half of this file guards the way the acceptance was previously
 * half-met — `transitionCampaign` could reach ACTIVE while doing only two of
 * the five things. A guard on one path means nothing while a second path
 * reaches the same state around it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

let campaign: Record<string, unknown> | null;
let committedWrites: string[] = [];
let enqueued: { name: string; payload: Record<string, unknown> }[] = [];
let auditRows: Record<string, unknown>[] = [];
let orderUpdateWhere: Record<string, unknown> | null = null;
let orderUpdateThrows: Error | null = null;
let activatedCount = 2;

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

vi.mock("../src/db/client", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const writes: string[] = [];
      const localEnqueued: typeof enqueued = [];
      const localAudit: typeof auditRows = [];
      const tx = {
        /* P4-BE-09 — every stage change takes the campaign's row lock first
           and decides on the state read under it. */
        $queryRaw: () => Promise.resolve(campaign ? [{ state: campaign.state }] : []),
        campaign: {
          findFirst: () => Promise.resolve(campaign),
          /* …and claims the row on that state. */
          updateMany: ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            if (where.state !== campaign?.state) return Promise.resolve({ count: 0 });
            writes.push("campaign.update");
            void data;
            return Promise.resolve({ count: 1 });
          },
        },
        /* P6-BE-09 — the launch puts the campaign's complete draft rewards live. */
        reward: { findMany: () => Promise.resolve([]) },
        /* P4-BE-09 — reaching APPROVAL emails the campaign managers (none here). */
        user: { findMany: () => Promise.resolve([]) },
        campaignOrder: {
          updateMany: ({ where }: { where: Record<string, unknown> }) => {
            if (orderUpdateThrows) throw orderUpdateThrows;
            orderUpdateWhere = where;
            writes.push("order.updateMany");
            return Promise.resolve({ count: activatedCount });
          },
        },
        auditLog: {
          count: () => Promise.resolve(1),
          create: ({ data }: { data: Record<string, unknown> }) => {
            writes.push("audit");
            localAudit.push(data);
            return Promise.resolve({ id: "a" });
          },
        },
        syncTask: {
          findUnique: () => Promise.resolve(null),
          create: ({ data }: { data: Record<string, unknown> }) => {
            writes.push("syncTask.create");
            return Promise.resolve({ id: `task_${String(data.kind)}` });
          },
        },
        outboxJob: {
          create: ({ data }: { data: Record<string, unknown> }) => {
            writes.push("outbox");
            localEnqueued.push({
              name: data.name as string,
              payload: data.payload as Record<string, unknown>,
            });
            return Promise.resolve({ id: "j" });
          },
        },
      };
      /* A throw discards everything the callback did, exactly as the real
         transaction discards its statements. */
      const out = await fn(tx);
      committedWrites = [...committedWrites, ...writes];
      enqueued = [...enqueued, ...localEnqueued];
      auditRows = [...auditRows, ...localAudit];
      return out;
    },
  },
}));

const { launchCampaign, transitionCampaign, LaunchNeedsFullTransitionError } =
  await import("../src/domain/campaign");

const actor = (roles: Role[] = ["CAMPAIGN_MGR"]): Actor =>
  ({ userId: "u", tenantId: "t1", roles, sponsorId: null, athleteId: null, guardianId: null });

beforeEach(() => {
  campaign = { id: "cmp_1", state: "APPROVAL", tenantId: "t1" };
  committedWrites = [];
  enqueued = [];
  auditRows = [];
  orderUpdateWhere = null;
  orderUpdateThrows = null;
  activatedCount = 2;
});

describe("P5-BE-04 · launching a campaign does all five things", () => {
  it("moves the campaign to ACTIVE", async () => {
    const out = await launchCampaign(actor(), "cmp_1");
    expect(out.state).toBe("ACTIVE");
  });

  it("activates the accepted orders and says how many", async () => {
    const out = await launchCampaign(actor(), "cmp_1");
    expect(out.ordersActivated).toBe(2);
    expect(committedWrites).toContain("order.updateMany");
  });

  /* Only ACCEPTED. A DRAFT or SENT order is an offer nobody signed, and
     sweeping it to ACTIVE would manufacture a contract. */
  it("activates ONLY the accepted orders", async () => {
    await launchCampaign(actor(), "cmp_1");
    /* 2S8-QA-07 — the campaign's own tenant, in the write itself. */
    expect(orderUpdateWhere).toEqual({ campaignId: "cmp_1", tenantId: "t1", state: "ACCEPTED" });
  });

  it("queues both jobs — the Zoho push and the launch notification", async () => {
    await launchCampaign(actor(), "cmp_1");
    expect(enqueued.map((j) => j.name).sort()).toEqual([
      "notify.campaignLive", "zoho.pushDeal",
    ]);
    expect(enqueued.every((j) => j.payload.campaignId === "cmp_1")).toBe(true);
  });

  it("writes the audit row with before and after", async () => {
    await launchCampaign(actor(), "cmp_1");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.action).toBe("campaign.launch");
    expect(auditRows[0]!.entity).toBe("Campaign");
    expect(auditRows[0]!.before).toEqual({ state: "APPROVAL" });
    expect(auditRows[0]!.after).toEqual({ state: "ACTIVE", ordersActivated: 2 });
  });

  /* THE CLAUSE A READING CANNOT CHECK: all in one transaction. */
  it("commits nothing if activating the orders fails", async () => {
    orderUpdateThrows = new Error("order activation failed");

    await expect(launchCampaign(actor(), "cmp_1")).rejects.toThrow(
      "order activation failed",
    );

    expect(committedWrites).toEqual([]);
    expect(enqueued).toEqual([]);
    expect(auditRows).toEqual([]);
  });

  it("refuses to launch from a state that cannot reach ACTIVE", async () => {
    campaign = { id: "cmp_1", state: "DRAFT", tenantId: "t1" };
    await expect(launchCampaign(actor(), "cmp_1")).rejects.toThrow(/DRAFT to ACTIVE/);
    expect(committedWrites).toEqual([]);
  });

  it("refuses a role without campaign.approve", async () => {
    await expect(launchCampaign(actor(["ATHLETE"]), "cmp_1")).rejects.toThrow();
    expect(committedWrites).toEqual([]);
  });
});

describe("the generic transition cannot reach ACTIVE around the launch", () => {
  it("refuses, naming launchCampaign", async () => {
    await expect(transitionCampaign(actor(), "cmp_1", "ACTIVE")).rejects.toThrow(
      LaunchNeedsFullTransitionError,
    );
  });

  it("writes nothing when it refuses", async () => {
    await expect(transitionCampaign(actor(), "cmp_1", "ACTIVE")).rejects.toThrow();
    expect(committedWrites).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it("still moves a campaign to a state that is not ACTIVE", async () => {
    campaign = {
      id: "cmp_1", state: "STAFFING", tenantId: "t1", name: "Fall Push", sponsorId: "sp_1", sponsor: { name: "Rosa's" },
      _count: { orders: 1, adSlots: 0 },
    };
    const out = await transitionCampaign(actor(), "cmp_1", "APPROVAL");
    expect(out.state).toBe("APPROVAL");
    /* P8-INT-01: submitting for approval raises the CRM approval task, in
       the same transaction. Nothing else is queued. */
    expect(enqueued.map((j) => j.name)).toEqual(["zoho.pushTask"]);
    expect(enqueued[0]!.payload).toEqual({ taskId: "task_APPROVAL" });
  });
});

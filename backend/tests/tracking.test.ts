/**
 * P6-BE-01 — the redirect path — and P6-BE-07 — per-athlete codes.
 *
 * P6-BE-01's acceptance: "A 302 redirect fires immediately; the LinkEvent
 * write happens after the response — the fan never waits on our write."
 *
 * The 302 itself is the route handler's, but the half that can silently
 * regress is this one: `resolveCode` must perform NO WRITE. If a future edit
 * slips an event insert into the resolve path, the redirect starts waiting on
 * the database again and nothing about the response would look different. So
 * the test counts writes during resolution and requires zero.
 *
 * P6-BE-07's acceptance: "Each athlete on a campaign gets a distinct code, so
 * relative performance is measurable."
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

let link: Record<string, unknown> | null;
let campaign: Record<string, unknown> | null;
let links: Record<string, unknown>[] = [];
let writes: string[] = [];
let enqueued: { name: string; payload: Record<string, unknown> }[] = [];

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

vi.mock("../src/db/client", () => {
  const tx = {
    trackingLink: {
      findUnique: () => Promise.resolve(link),
      findFirst: () => Promise.resolve(link),
      findMany: () => Promise.resolve(links),
      create: ({ data }: { data: Record<string, unknown> }) => {
        writes.push("trackingLink.create");
        return Promise.resolve({ id: "lnk_1", code: data.code });
      },
    },
    deliverable: { findFirst: () => Promise.resolve({ id: "dlv_1", tenantId: "t1" }) },
    campaign: { findFirst: () => Promise.resolve(campaign) },
    linkEvent: {
      create: () => {
        writes.push("linkEvent.create");
        return Promise.resolve({ id: "lev_1" });
      },
    },
    auditLog: {
      create: () => { writes.push("audit"); return Promise.resolve({ id: "a" }); },
    },
    outboxJob: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        writes.push("outbox");
        enqueued.push({
          name: data.name as string,
          payload: data.payload as Record<string, unknown>,
        });
        return Promise.resolve({ id: "j" });
      },
    },
  };
  return {
    prisma: { ...tx, $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx) },
  };
});

const {
  resolveCode, recordClick, createTrackingLink, codesForCampaign, generateCode,
  UnknownTrackingCodeError, DeliverableAlreadyLinkedError,
} = await import("../src/domain/tracking");

const actor = (roles: Role[] = ["CAMPAIGN_MGR"]): Actor =>
  ({ userId: "u", tenantId: "t1", roles, sponsorId: null, athleteId: null, guardianId: null });

beforeEach(() => {
  link = { id: "lnk_1", tenantId: "t1", destinationUrl: "https://brand.example/x" };
  campaign = { id: "cmp_1" };
  links = [];
  writes = [];
  enqueued = [];
});

describe("P6-BE-01 · the fan never waits on our write", () => {
  /* THE CLAUSE. Resolution is the only thing on the path to the 302. */
  it("resolveCode performs no write at all", async () => {
    await resolveCode("abc");
    expect(writes).toEqual([]);
  });

  it("returns the destination and what the click needs, nothing more", async () => {
    const out = await resolveCode("abc");
    expect(out.destinationUrl).toBe("https://brand.example/x");
    expect(Object.keys(out).sort()).toEqual(["destinationUrl", "linkId", "tenantId"]);
  });

  it("refuses an unknown code", async () => {
    link = null;
    await expect(resolveCode("nope")).rejects.toThrow(UnknownTrackingCodeError);
    expect(writes).toEqual([]);
  });

  it("recordClick is a separate call — there is no combined one to misuse", async () => {
    const mod = await import("../src/domain/tracking");
    const exported = Object.keys(mod);
    expect(exported).toContain("resolveCode");
    expect(exported).toContain("recordClick");
    /* Nothing that both resolves and records: the ordering cannot be got
       wrong because no single function does both. */
    expect(exported.some((n) => /resolveAndRecord|trackAndRedirect/i.test(n))).toBe(false);
  });

  it("writes the LinkEvent when the click is recorded", async () => {
    await recordClick("lnk_1", "t1", "203.0.113.4");
    expect(writes).toContain("linkEvent.create");
  });

  it("queues geo resolution with the IP, in the same transaction", async () => {
    await recordClick("lnk_1", "t1", "203.0.113.4");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.name).toBe("tracking.resolveGeo");
    expect(enqueued[0]!.payload).toMatchObject({
      linkEventId: "lev_1",
      clientIp: "203.0.113.4",
    });
  });

  it("records the click even with no IP — geo is optional, the click is not", async () => {
    await recordClick("lnk_1", "t1", null);
    expect(writes).toContain("linkEvent.create");
    expect(enqueued).toEqual([]);
  });
});

describe("P6-BE-07 · a distinct code per athlete", () => {
  it("generates opaque codes, never sequential", () => {
    const codes = Array.from({ length: 200 }, () => generateCode());
    expect(new Set(codes).size).toBe(200);
    /* URL-safe and short enough for a bio link. */
    for (const c of codes.slice(0, 20)) expect(c).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("creates one link for a deliverable", async () => {
    link = null; // no existing link for this deliverable
    const out = await createTrackingLink(actor(), "dlv_1", "https://brand.example/x");
    expect(out.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(writes).toContain("trackingLink.create");
    expect(writes).toContain("audit");
  });

  /* One deliverable, one link — which is what makes a click attributable to
     exactly one athlete's piece of work. */
  it("refuses a second link on the same deliverable", async () => {
    link = { id: "existing" };
    await expect(
      createTrackingLink(actor(), "dlv_1", "https://brand.example/x"),
    ).rejects.toThrow(DeliverableAlreadyLinkedError);
    expect(writes).not.toContain("trackingLink.create");
  });

  /* THE CLAUSE: two athletes on one campaign, two different codes, and the
     counts are comparable. */
  it("gives every athlete on a campaign their own code and click count", async () => {
    links = [
      {
        code: "AAAAAAAAAAAA", deliverableId: "dlv_a",
        deliverable: { order: { athleteId: "ath_1" } }, _count: { events: 12 },
      },
      {
        code: "BBBBBBBBBBBB", deliverableId: "dlv_b",
        deliverable: { order: { athleteId: "ath_2" } }, _count: { events: 3 },
      },
    ];

    const rows = await codesForCampaign(actor(), "cmp_1");

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.code)).size).toBe(2);
    expect(new Set(rows.map((r) => r.athleteId)).size).toBe(2);
    expect(rows.find((r) => r.athleteId === "ath_1")!.clicks).toBe(12);
    expect(rows.find((r) => r.athleteId === "ath_2")!.clicks).toBe(3);
  });

  it("refuses a campaign the actor cannot reach", async () => {
    campaign = null;
    await expect(codesForCampaign(actor(), "cmp_1")).rejects.toThrow();
  });

  it("refuses a role without tenant-wide trackingLink write", async () => {
    await expect(
      createTrackingLink(actor(["ATHLETE"]), "dlv_1", "https://brand.example/x"),
    ).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});

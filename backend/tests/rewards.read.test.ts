import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   Reward reads — P6-FE-01 / P6-FE-03.
   Pinned: funnel counts are four separate event kinds summed per reward
   across its tokens (never one counter) and only for callers who read
   events; a token's string — the fan's claim link — only reaches roles that
   write rewards; the QR grant is audited and refused until the PNG exists.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let rewards: unknown[] = [];
let groups: unknown[] = [];
let groupArgs: Record<string, unknown> = {};
let token: unknown = null;
const grants: string[] = [];

vi.mock("../src/db/client", () => ({
  prisma: {
    reward: {
      findMany: () => Promise.resolve(rewards),
      findFirst: () => Promise.resolve(rewards[0] ?? null),
    },
    rewardEvent: { groupBy: (a: Record<string, unknown>) => ((groupArgs = a), Promise.resolve(groups)) },
    rewardToken: { findFirst: () => Promise.resolve(token) },
  },
}));
vi.mock("../src/lib/storage", () => ({
  presignPrivateDownload: (_a: unknown, key: string) => (grants.push(key), Promise.resolve(`https://signed/${key}`)),
}));

const { listRewards, readReward, tokenQrUrl } = await import("../src/routes/v1/rewards");

const base = { userId: "u", tenantId: "t", guardianId: null, propertyId: null };
const admin = { ...base, roles: ["BTG_ADMIN"], athleteId: null, sponsorId: null } as unknown as Actor;
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], athleteId: null, sponsorId: "spn" } as unknown as Actor;
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "a1", sponsorId: null } as unknown as Actor;

const REWARD = {
  id: "rw_1", offerText: "Free drink", terms: "One per fan", singleUse: true,
  expiresAt: new Date("2026-12-01T00:00:00Z"), state: "ACTIVE",
  campaign: { id: "cmp_1", name: "Fall", endDate: new Date("2026-11-30T00:00:00Z"), sponsor: { name: "Bowie" } },
  tokens: [
    { id: "tk_1", token: "secret-a", qrKey: "t/t/qr/tk_1.png", athlete: { id: "a1", displayName: "JORDAN" } },
    { id: "tk_2", token: "secret-b", qrKey: null, athlete: { id: "a2", displayName: "SAM" } },
  ],
};

async function run(h: unknown, actor: Actor, req: Record<string, unknown> = {}) {
  let body: Record<string, unknown> | undefined;
  await (h as (q: unknown, r: unknown, n: unknown) => Promise<void>)(
    { actor, query: {}, params: {}, ...req },
    { json: (b: Record<string, unknown>) => void (body = b) },
    () => {},
  );
  return body!;
}

beforeEach(() => {
  rewards = [REWARD];
  groups = [
    { tokenId: "tk_1", type: "SCAN", _count: { _all: 10 } },
    { tokenId: "tk_2", type: "SCAN", _count: { _all: 5 } },
    { tokenId: "tk_1", type: "CLAIM", _count: { _all: 3 } },
    { tokenId: "tk_2", type: "REDEEM", _count: { _all: 1 } },
  ];
  token = null;
  grants.length = 0;
});

describe("GET /rewards", () => {
  it("sums the four event kinds per reward across its tokens", async () => {
    const r = ((await run(listRewards, admin)).rewards as Record<string, unknown>[])[0];
    expect(r.funnel).toEqual({ SCAN: 15, LANDING: 0, CLAIM: 3, REDEEM: 1 });
    expect(r).toMatchObject({ athletes: 2, tokenCount: 2 });
  });
  it("carries the central consent line, not a per-reward one", async () => {
    const b = await run(listRewards, admin);
    expect((b.consent as { version: string }).version).toBe("2026-09-01");
  });
  it("never lists token strings", async () => {
    expect(JSON.stringify(await run(listRewards, admin))).not.toContain("secret-a");
  });
  it("counts only events in the caller's own event scope", async () => {
    await run(listRewards, athlete);
    expect((groupArgs.where as Record<string, unknown>).AND).toBeDefined();
  });
});

describe("GET /rewards/:id", () => {
  it("BTG gets token strings to print, and QR readiness", async () => {
    const b = await run(readReward, admin, { params: { id: "rw_1" } });
    expect(b.tokens).toEqual([
      { id: "tk_1", athlete: { id: "a1", displayName: "JORDAN" }, qrReady: true, token: "secret-a" },
      { id: "tk_2", athlete: { id: "a2", displayName: "SAM" }, qrReady: false, token: "secret-b" },
    ]);
  });
  it("a sponsor sees tokens but never their strings", async () => {
    const b = await run(readReward, sponsor, { params: { id: "rw_1" } });
    expect(JSON.stringify(b)).not.toContain("secret-");
    expect((b.tokens as unknown[]).length).toBe(2);
  });
});

describe("GET /reward-tokens/:id/qr-url", () => {
  it("issues an audited grant once the PNG exists", async () => {
    token = { id: "tk_1", qrKey: "t/t/qr/tk_1.png" };
    expect((await run(tokenQrUrl, admin, { params: { id: "tk_1" } })).url).toBe("https://signed/t/t/qr/tk_1.png");
    expect(grants).toEqual(["t/t/qr/tk_1.png"]);
  });
  it("refuses before the worker has made it, and for a non-writer", async () => {
    token = { id: "tk_2", qrKey: null };
    await expect(run(tokenQrUrl, admin, { params: { id: "tk_2" } })).rejects.toThrow();
    token = { id: "tk_1", qrKey: "k" };
    await expect(run(tokenQrUrl, sponsor, { params: { id: "tk_1" } })).rejects.toThrow();
    expect(grants).toEqual([]);
  });
});

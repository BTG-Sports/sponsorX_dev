/**
 * P6-BE-03 — four-event separation — and P6-BE-04 — race-safe redemption.
 *
 * P6-BE-03's acceptance: "SCAN on QR resolution, LANDING on page render,
 * CLAIM on offer acceptance, REDEEM on validation — four rows, never one
 * counter." So the test asserts the SHAPE of what is written: four separate
 * inserts carrying four distinct types, and no update of a running total
 * anywhere.
 *
 * P6-BE-04's acceptance: "Concurrent redemption attempts on one token produce
 * exactly one REDEEM — enforced by the partial unique index, caught as a
 * unique violation." The index itself is `reward_single_redeem`, created by
 * P2-BE-03's migration; what this file proves is that the domain ATTEMPTS the
 * insert and translates the violation, rather than checking first and losing
 * the race.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let token: Record<string, unknown> | null;
let writes: { model: string; data: Record<string, unknown> }[] = [];
let transactions = 0;

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example", INTAKE_TOKEN_SECRET: "test-secret" } }));

vi.mock("../src/db/client", () => {
  const tx = {
    rewardToken: { findUnique: () => Promise.resolve(token) },
    outboxJob: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ model: "outbox", data });
        return Promise.resolve({ id: "j" });
      },
    },
    rewardEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        /* THE MOCK IS THE INDEX. `reward_single_redeem` is a partial unique
           index on (tokenId) WHERE type = 'REDEEM', so a second REDEEM for
           the same token is rejected by the database no matter how many
           callers race. Reproducing that here — rather than toggling a flag
           from the test — is what makes the concurrency case meaningful:
           the domain has to survive a rejection it did not ask for. */
        if (
          data.type === "REDEEM" &&
          writes.some((w) => w.data.type === "REDEEM" && w.data.tokenId === data.tokenId)
        ) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        writes.push({ model: "rewardEvent", data });
        return Promise.resolve({ id: `ev_${writes.length}`, type: data.type });
      },
      /* P6-INT-02 enqueues the fan's voucher email inside the same
         transaction, so the fake tx carries an outbox. */
      update: ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ model: "rewardEvent.update", data });
        return Promise.resolve({});
      },
      updateMany: () => Promise.resolve({ count: 0 }),
      /* QA pass 6 — a claim first looks for an earlier REDEEM (a used code
         is refused) or CLAIM (a repeat answers with it) on its token. */
      findFirst: ({ where }: { where: { tokenId: string; type: string } }) =>
        Promise.resolve(writes.find((w) => w.model === "rewardEvent" && w.data.tokenId === where.tokenId && w.data.type === where.type) ? { id: "ev_prior" } : null),
    },
    /* …and serialises on the token's row (lock_timeout, FOR NO KEY UPDATE). */
    $queryRaw: () => Promise.resolve([]),
    /* P6-BE-08 — the redemption cap's conditional UPDATE. These rewards are
       uncapped, so it always takes a unit; the cap itself is proven against
       a real database in tests/reward-eligibility-cap.test.ts. */
    $executeRawUnsafe: () => Promise.resolve(1),
  };
  /* Since QA pass 5 a redeem (and a capped claim's reservation) is ONE
     database call — `reward_redeem` / `reward_reserve`. This stands in for
     the function the way `rewardEvent.create` above stands in for the index:
     the usability checks, then an ATTEMPTED insert that the index may
     reject. Uncapped fixtures only, so reserve answers UNCAPPED. */
  const $queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    const now = new Date(String(values[1]));
    const r = token?.reward as { state: string; expiresAt: Date } | undefined;
    const refuse = !token ? "UNKNOWN" : r!.state !== "ACTIVE" ? "NOT_LIVE" : r!.expiresAt <= now ? "EXPIRED" : null;
    if (sql.includes("reward_reserve")) {
      return [{ outcome: refuse ?? "UNCAPPED", held_until: null, reward_state: r?.state ?? null }];
    }
    if (refuse) return [{ outcome: refuse, event_id: null, reward_state: r?.state ?? null }];
    const ev = await tx.rewardEvent.create({ data: { tenantId: token!.tenantId, tokenId: token!.id, type: "REDEEM" } });
    return [{ outcome: "OK", event_id: ev.id, reward_state: "ACTIVE" }];
  };
  return {
    prisma: {
      ...tx,
      $queryRaw,
      $transaction: (fn: (t: unknown) => Promise<unknown>) => { transactions += 1; return fn(tx); },
    },
  };
});

const {
  recordScan, recordLanding, recordClaim, redeemToken,
  AlreadyRedeemedError, RewardExpiredError, RewardNotLiveError, UnknownTokenError,
} = await import("../src/domain/reward");

const FUTURE = new Date("2027-01-01T00:00:00.000Z");
const NOW = new Date("2026-09-23T00:00:00.000Z");

const live = (over: Record<string, unknown> = {}) => {
  token = {
    id: "tok_1",
    tenantId: "t1",
    reward: { state: "ACTIVE", expiresAt: FUTURE, singleUse: true, ...over },
  };
};

beforeEach(() => {
  live();
  writes = [];
  transactions = 0;
});

describe("P6-BE-03 · four rows, never one counter", () => {
  it("SCAN writes one row of type SCAN", async () => {
    const out = await recordScan("tk", NOW);
    expect(out.type).toBe("SCAN");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.data.type).toBe("SCAN");
  });

  it("LANDING is its own row, not the same one as SCAN", async () => {
    await recordScan("tk", NOW);
    await recordLanding("tk", NOW);
    expect(writes.map((w) => w.data.type)).toEqual(["SCAN", "LANDING"]);
  });

  /* P6-SEC-01 — an address may only be stored WITH consent, so the consent
     travels with it here. The refusal path is in fan-consent.test.ts. */
  it("CLAIM carries the fan's email when given with consent", async () => {
    await recordClaim("tk", "fan@example.com", NOW, {
      version: "2026-09-01", purpose: "reward-delivery",
    });
    expect(writes[0]!.data).toMatchObject({
      type: "CLAIM",
      fanEmail: "fan@example.com",
      consentVersion: "2026-09-01",
      consentPurpose: "reward-delivery",
    });
  });

  it("CLAIM works without an email — §16's page has no login", async () => {
    await recordClaim("tk", null, NOW);
    expect(writes[0]!.data).toMatchObject({ type: "CLAIM", fanEmail: null });
  });

  /* THE CLAUSE: four moments produce four rows of four distinct types. */
  it("a full journey produces four distinct rows", async () => {
    await recordScan("tk", NOW);
    await recordLanding("tk", NOW);
    await recordClaim("tk", null, NOW);
    await redeemToken("tk", NOW);

    expect(writes).toHaveLength(4);
    expect(writes.map((w) => w.data.type)).toEqual([
      "SCAN", "LANDING", "CLAIM", "REDEEM",
    ]);
    expect(new Set(writes.map((w) => w.data.type)).size).toBe(4);
  });

  /* A counter implementation would show up as an update instead of inserts. */
  it("never updates a running total", async () => {
    await recordScan("tk", NOW);
    await recordScan("tk", NOW);
    expect(writes.every((w) => w.model === "rewardEvent")).toBe(true);
    expect(writes).toHaveLength(2);
  });

  it("every row carries the token's tenant", async () => {
    await recordScan("tk", NOW);
    expect(writes[0]!.data.tenantId).toBe("t1");
  });
});

describe("a token is only usable while its reward is live", () => {
  it.each(["DRAFT", "PAUSED", "EXPIRED", "ARCHIVED"])("refuses when %s", async (state) => {
    live({ state });
    await expect(recordScan("tk", NOW)).rejects.toThrow(RewardNotLiveError);
    expect(writes).toEqual([]);
  });

  it("refuses a reward past its expiry", async () => {
    live({ expiresAt: new Date("2026-01-01T00:00:00.000Z") });
    await expect(recordClaim("tk", null, NOW)).rejects.toThrow(RewardExpiredError);
    expect(writes).toEqual([]);
  });

  it("refuses an unknown token without saying whether it ever existed", async () => {
    token = null;
    await expect(recordScan("tk", NOW)).rejects.toThrow(UnknownTokenError);
    await expect(recordScan("tk", NOW)).rejects.toThrow(/not valid/);
  });
});

describe("P6-BE-04 · exactly one REDEEM", () => {
  it("redeems once", async () => {
    const out = await redeemToken("tk", NOW);
    expect(out.type).toBe("REDEEM");
  });

  /* The second attempt is what the partial unique index rejects. The domain
     must translate that into a clear 409, not leak a raw P2002 as a 500. */
  it("turns the index's unique violation into AlreadyRedeemedError", async () => {
    await redeemToken("tk", NOW);
    await expect(redeemToken("tk", NOW)).rejects.toThrow(AlreadyRedeemedError);
  });

  it("reports 409, not 500 — a used code is an answer, not a crash", async () => {
    await redeemToken("tk", NOW);
    await expect(redeemToken("tk", NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("writes no second row when it loses the race", async () => {
    await redeemToken("tk", NOW);
    await expect(redeemToken("tk", NOW)).rejects.toThrow();
    expect(writes.filter((w) => w.data.type === "REDEEM")).toHaveLength(1);
  });

  /* THE CLAUSE: two callers racing on one token. Whichever the index rejects
     gets the error, and exactly one REDEEM row exists afterwards. */
  it("ten concurrent redemptions produce exactly one REDEEM", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => redeemToken("tk", NOW)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(9);
    expect(writes.filter((w) => w.data.type === "REDEEM")).toHaveLength(1);

    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(AlreadyRedeemedError);
      }
    }
  });

  it("is one database call, not an interactive transaction (QA-01)", async () => {
    /* An interactive transaction holds a pooled connection across client
       round trips; under a burst on one capped reward that exhausted the
       pool. The whole decision is `reward_redeem`, called once. */
    await redeemToken("tk", NOW);
    expect(transactions).toBe(0);
    expect(writes.filter((w) => w.model === "rewardEvent")).toHaveLength(1);
  });

  it("still refuses an expired reward before the index is reached", async () => {
    live({ expiresAt: new Date("2026-01-01T00:00:00.000Z") });
    await expect(redeemToken("tk", NOW)).rejects.toThrow(RewardExpiredError);
  });
});

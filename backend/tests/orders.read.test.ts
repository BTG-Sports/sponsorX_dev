import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";
import { hashAgreementBody } from "../src/domain/agreement-hash";

/* --------------------------------------------------------------------------
   GET /orders/:id — P5-FE-01, §12, §24.

   The page renders the body this route serves, and the acceptance hashes what
   the page rendered — so the one thing this route must never do is serve text
   whose fingerprint differs from the issued version. Also pinned: athlete pay
   and sponsor price ride only for the roles §7.1 allows, and guardian
   readiness is the same rule acceptOrder enforces.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

const FILE = new URL("../agreements/CAMPAIGN_ORDER.v1.txt", import.meta.url);
const REAL_HASH = hashAgreementBody(readFileSync(FILE, "utf8"));

let order: Record<string, unknown> | null = null;
let agreement: Record<string, unknown> | null = null;
vi.mock("../src/db/client", () => ({
  prisma: {
    campaignOrder: { findFirst: () => Promise.resolve(order) },
    agreement: { findFirst: () => Promise.resolve(agreement) },
  },
}));

const { readOrder } = await import("../src/routes/v1/campaigns");

const base = { userId: "u_1", tenantId: "t_1", guardianId: null, propertyId: null };
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "ath_1", sponsorId: null } as unknown as Actor;
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], athleteId: null, sponsorId: "spn_1" } as unknown as Actor;

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: "ord_1", state: "SENT", compensation: 40_000, sellPrice: 60_000,
    usageRights: "Organic, 90 days", exclusivity: null,
    dueDate: new Date("2026-10-20T00:00:00Z"), acceptedAt: null, jobId: "SX-01", tenantId: "t_1",
    job: { name: "Story Drop" },
    campaign: {
      id: "cmp_1", name: "Fall Push", startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-11-30T00:00:00Z"), sponsor: { name: "Bowie Auto Group" },
    },
    athlete: { id: "ath_1", displayName: "JORDAN", birthDate: new Date("1999-01-01"), ageBand: null, guardianId: null, guardian: null },
    acceptance: null,
    ...over,
  };
}

async function call(actor: Actor) {
  let body: Record<string, unknown> | undefined;
  await readOrder({ actor, params: { id: "ord_1" } } as never, { json: (b: Record<string, unknown>) => void (body = b) } as never, (() => {}) as never);
  return body!;
}

beforeEach(() => {
  order = orderRow();
  agreement = { id: "agr_1", kind: "CAMPAIGN_ORDER", version: 1, bodyHash: REAL_HASH };
});

describe("GET /orders/:id", () => {
  it("serves the agreement body when the file matches its issued hash", async () => {
    const b = await call(athlete);
    const a = b.agreement as Record<string, unknown>;
    expect(a.version).toBe(1);
    expect(typeof a.body).toBe("string");
    expect(hashAgreementBody(a.body as string)).toBe(REAL_HASH);
  });

  it("serves NO body when the file no longer matches — it would be refused", async () => {
    agreement = { ...agreement!, bodyHash: "sha256:" + "0".repeat(64) };
    const a = (await call(athlete)).agreement as Record<string, unknown>;
    expect(a.body).toBeNull();
  });

  it("answers agreement: null when no version is issued", async () => {
    agreement = null;
    expect((await call(athlete)).agreement).toBeNull();
  });

  it("gives the athlete their pay, never the sponsor price", async () => {
    const b = await call(athlete);
    expect(b.compensation).toBe(40_000);
    expect("sellPrice" in b).toBe(false);
  });

  it("gives the sponsor the price, never the athlete's pay", async () => {
    const b = await call(sponsor);
    expect(b.sellPrice).toBe(60_000);
    expect("compensation" in b).toBe(false);
  });

  it("reports a minor's unverified guardian by the acceptOrder rule", async () => {
    order = orderRow({
      athlete: {
        id: "ath_1", displayName: "SAM", birthDate: new Date("2011-05-01"), ageBand: null,
        guardianId: "g_1", guardian: { legalName: "Pat Ellis", verifiedAt: null },
      },
    });
    const g = (await call(athlete)).guardian as Record<string, unknown>;
    expect(g).toEqual({ status: "unverified", name: "Pat Ellis" });
  });

  it("refuses an order outside the caller's scope", async () => {
    order = null;
    await expect(call(athlete)).rejects.toThrow();
  });
});
